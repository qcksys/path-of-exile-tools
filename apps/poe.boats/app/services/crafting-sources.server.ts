import { z } from "zod";
import type { TDatabase } from "~/db/client";
import { findCraftingCommodityPrices } from "~/db/queries/crafting-commodities.queries";
import { findCraftingExchangePrices } from "~/db/queries/crafting-exchange.queries";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { craftingCommodityIdentity, craftingSourceRecipe } from "~/lib/crafting-sources";
import { craftingVendorUpgrade } from "~/lib/crafting-vendor-upgrades";
import {
    isYellowBeastIdentity,
    yellowBeastId,
    yellowBeastPolicy,
    yellowBeastPool,
} from "~/lib/crafting-yellow-beasts";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import {
    type CraftingSourceOptions,
    type CraftingSourceResult,
    craftingSourceQuoteSchema,
} from "~/schemas/crafting-sources";

const feedSchema = z.object({ lines: z.array(z.unknown()) });
const lineSchema = z.object({
    detailsId: z.string(),
    name: z.string(),
    chaosValue: z.number().nonnegative().optional(),
    divineValue: z.number().nonnegative().optional(),
    exaltedValue: z.number().nonnegative().optional(),
    listingCount: z.number().int().nonnegative(),
});
type Feed = { lines: z.infer<typeof lineSchema>[]; fetchedAt: string; sourceUrl: string };
const cache = new Map<string, { feed: Feed; etag: string | null; expires: number }>();
async function loadFeed(league: string, category: "Beast" | "IncursionTemple"): Promise<Feed> {
    const url = new URL("https://poe.ninja/poe1/api/economy/stash/current/item/overview");
    url.search = new URLSearchParams({ league, type: category }).toString();
    const key = url.href;
    const existing = cache.get(key);
    if (existing && existing.expires > Date.now()) return existing.feed;
    const headers = new Headers({ "User-Agent": "poe.boats crafting economy (https://poe.boats)" });
    if (existing?.etag) headers.set("If-None-Match", existing.etag);
    const response = await fetch(key, { headers, signal: AbortSignal.timeout(10_000) });
    if (!response.ok && response.status !== 304)
        throw new Error(`poe.ninja ${category} source returned ${response.status}.`);
    const maxAge = Number(
        response.headers.get("Cache-Control")?.match(/(?:^|[,\s])max-age=(\d+)/i)?.[1] ?? 300,
    );
    const age = Number(response.headers.get("Age") ?? 0);
    const expires = Date.now() + Math.max(0, maxAge - age) * 1000;
    let feed: Feed;
    if (response.status === 304 && existing) feed = existing.feed;
    else {
        const data = feedSchema.parse(await readFeedJson(response));
        feed = {
            sourceUrl: key,
            fetchedAt: new Date().toISOString(),
            lines: data.lines.flatMap((line) => {
                const parsed = lineSchema.safeParse(line);
                return parsed.success ? [parsed.data] : [];
            }),
        };
    }
    if (cache.size >= 100 && !cache.has(key)) cache.delete(cache.keys().next().value!);
    cache.set(key, { feed, expires, etag: response.headers.get("ETag") ?? existing?.etag ?? null });
    return feed;
}

async function readFeedJson(response: Response): Promise<unknown> {
    if (!response.body) throw new Error("Empty price source response.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let text = "";
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > 2 * 1024 * 1024) {
                await reader.cancel();
                throw new Error("Price source exceeded the response limit.");
            }
            text += decoder.decode(chunk.value, { stream: true });
        }
        return JSON.parse(text + decoder.decode());
    } finally {
        reader.releaseLock();
    }
}

export async function findCraftingSourcePrices(
    graph: CraftingGraph,
    engine: CraftingEngine,
    options: CraftingSourceOptions,
    db?: TDatabase,
): Promise<CraftingSourceResult> {
    const result: CraftingSourceResult = { quotes: {}, missing: {} };
    const feeds = new Map<string, Feed | Error>();
    const commodities: Array<{ id: string; baseType: string }> = [];
    for (const id of new Set(options.ids)) {
        try {
            if (options.realm !== "pc" || graph.game !== "poe1")
                throw new Error("These crafting price sources support PoE 1 PC only.");
            if (!graph.league) throw new Error("Choose a league before looking up prices.");
            const currency = z.enum(["chaos", "divine", "exalted"]).parse(graph.currency);
            if (options.vendorUpgrade) {
                if (!db) throw new Error("Captured ingredient exchange prices are unavailable.");
                const path = craftingVendorUpgrade(engine, id, options.vendorUpgrade.inputId);
                const prices = await findCraftingExchangePrices(db, {
                    game: "poe1",
                    realm: "pc",
                    league: graph.league,
                    currency,
                    itemIds: [path.inputId],
                    at: options.at,
                    conversion: options.vendorUpgrade.conversion,
                });
                const ingredient = prices.quotes[path.inputId];
                if (!ingredient)
                    throw new Error(
                        prices.missing[path.inputId] ??
                            "The selected vendor ingredient is unpriced.",
                    );
                result.quotes[id] = craftingSourceQuoteSchema.parse({
                    source: "vendor-upgrade",
                    game: "poe1",
                    realm: "pc",
                    league: graph.league,
                    currency,
                    id,
                    path,
                    ingredient,
                    conversion: options.vendorUpgrade.conversion,
                    amount: path.quantity * ingredient.amount,
                });
                continue;
            }
            const commodity = craftingCommodityIdentity(engine, id);
            if (commodity) {
                if (!db) throw new Error("Captured commodity prices are unavailable.");
                commodities.push(commodity);
                continue;
            }
            if (options.at !== undefined)
                throw new Error(
                    "poe.ninja current listing estimates have no captured historical source; enter a manual assumption for history.",
                );
            const recipe = craftingSourceRecipe(engine, id, options.assumption);
            let feed = feeds.get(recipe.category);
            if (!feed) {
                try {
                    feed = await loadFeed(graph.league, recipe.category);
                } catch (error) {
                    feed = error instanceof Error ? error : new Error("Price source unavailable.");
                }
                feeds.set(recipe.category, feed);
            }
            if (feed instanceof Error) throw feed;
            const components = recipe.components.map((component) => {
                if (component.detailsId === yellowBeastId) {
                    const eligible = feed.lines.filter((line) =>
                        isYellowBeastIdentity(line.detailsId, line.name),
                    );
                    if (new Set(eligible.map((line) => line.detailsId)).size !== eligible.length)
                        throw new Error(
                            "Ambiguous Yellow Beast species in the feed; the whole recipe remains unpriced.",
                        );
                    const species = eligible.flatMap((line) => {
                        const unitPrice = line[`${currency}Value`];
                        return unitPrice && line.listingCount
                            ? [
                                  {
                                      detailsId: line.detailsId,
                                      name: line.name,
                                      unitPrice,
                                      listingCount: line.listingCount,
                                  },
                              ]
                            : [];
                    });
                    if (!species.length)
                        throw new Error(
                            `No positive ${currency} Yellow Beast pool; the whole recipe remains unpriced.`,
                        );
                    return {
                        ...component,
                        name: "Yellow Beast",
                        ...yellowBeastPool(species),
                        sourceUrl: feed.sourceUrl,
                        pool: { estimator: yellowBeastPolicy, species },
                    };
                }
                const matches = feed.lines.filter((line) => line.detailsId === component.detailsId);
                const line = matches.length === 1 ? matches[0] : undefined;
                const unitPrice = line?.[`${currency}Value`];
                if (!line || !unitPrice || !line.listingCount)
                    throw new Error(
                        `No positive ${currency} listing estimate for ${component.detailsId}; the whole recipe remains unpriced.`,
                    );
                return {
                    ...component,
                    name: line.name,
                    unitPrice,
                    listingCount: line.listingCount,
                    sourceUrl: feed.sourceUrl,
                };
            });
            result.quotes[id] = craftingSourceQuoteSchema.parse({
                source: "poe.ninja",
                game: "poe1",
                realm: "pc",
                league: graph.league,
                currency,
                id,
                yellowBeasts: recipe.category === "Beast" ? yellowBeastPolicy : undefined,
                amount: components.reduce(
                    (sum, entry) => sum + entry.quantity * entry.unitPrice,
                    0,
                ),
                fetchedAt: feed.fetchedAt,
                components,
            });
        } catch (error) {
            result.missing[id] =
                error instanceof Error ? error.message : "Price source unavailable.";
        }
    }
    if (commodities.length && db) {
        const captured = await findCraftingCommodityPrices(
            db,
            graph,
            commodities,
            options.at,
            options.conversion,
        );
        Object.assign(result.quotes, captured.quotes);
        Object.assign(result.missing, captured.missing);
    }
    return result;
}

import { z } from "zod";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { craftingSourceRecipe } from "~/lib/crafting-sources";
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
    chaosValue: z.number().nonnegative(),
    divineValue: z.number().nonnegative(),
    exaltedValue: z.number().nonnegative(),
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
): Promise<CraftingSourceResult> {
    const result: CraftingSourceResult = { quotes: {}, missing: {} };
    const feeds = new Map<string, Feed | Error>();
    for (const id of new Set(options.ids)) {
        try {
            if (options.realm !== "pc" || graph.game !== "poe1")
                throw new Error("Beast and temple price sources support PoE 1 PC only.");
            if (!graph.league) throw new Error("Choose a league before looking up prices.");
            const currency = z.enum(["chaos", "divine", "exalted"]).parse(graph.currency);
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
                assumption: recipe.category === "Beast" ? options.assumption : undefined,
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
    return result;
}

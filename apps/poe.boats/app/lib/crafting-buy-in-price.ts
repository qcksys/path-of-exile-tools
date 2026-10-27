import { apiItemSchema, type ItemQuery, itemRarity } from "@poe-tools/item-query";
import type { StageDecision, TradeListing, TradeSale } from "@poe-tools/trade-bridge";
import type { BuyInRates, BuyInStage, CheckedListing } from "~/schemas/crafting-buy-in";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import type { CraftingEngine } from "./crafting-engine";
import { createCraftingItemQuery } from "./crafting-item-query";
import { importCraftingItemText } from "./crafting-item-text";

/** Listings fetched per trade request, and the most fetches made for one search. */
const FETCH_SIZE = 10;
const MAX_FETCHES = 2;
/** In-person listings looked at for the median, and the share of it below which a listing is bait. */
const IN_PERSON_SAMPLE = 5;
const BAIT_SHARE = 0.5;
/** Matching listings within this share above the stage price count towards depth. */
const NEAR_PRICE = 1.2;

const influenceNames: Record<string, string> = {
    shaper: "Shaper",
    elder: "Elder",
    crusader: "Crusader",
    redeemer: "Redeemer",
    hunter: "Hunter",
    warlord: "Warlord",
};

type ModDetail = { name?: unknown; tier?: unknown };
type ModKind = "fractured" | "explicit" | "crafted";

const strings = (value: unknown) =>
    Array.isArray(value) ? value.filter((line): line is string => typeof line === "string") : [];

function modifierBlock(item: Record<string, unknown>, kind: ModKind): string[] {
    const lines = strings(item[`${kind}Mods`]);
    if (!lines.length) return [];
    const flag = kind === "explicit" ? "" : ` (${kind})`;
    const extended = (item.extended ?? {}) as {
        mods?: Record<string, ModDetail[] | undefined>;
        hashes?: Record<string, unknown[] | undefined>;
    };
    const mods = extended.mods?.[kind] ?? [];
    const hashes = extended.hashes?.[kind] ?? [];
    const owners = hashes.map((entry) =>
        Array.isArray(entry) && Array.isArray(entry[1]) && entry[1].length === 1
            ? Number(entry[1][0])
            : null,
    );
    const headed =
        owners.length === lines.length &&
        owners.every(
            (owner) =>
                owner !== null &&
                Number.isInteger(owner) &&
                typeof mods[owner]?.name === "string" &&
                !String(mods[owner]?.name).includes('"'),
        );
    if (!headed) return lines.map((line) => `${line}${flag}`);
    const result: string[] = [];
    for (const [index, mod] of mods.entries()) {
        const own = lines.filter((_, line) => owners[line] === index);
        if (!own.length) continue;
        const tier = /^([PS])(\d+)$/.exec(String(mod.tier ?? ""));
        const side = tier?.[1] === "P" ? "Prefix " : tier?.[1] === "S" ? "Suffix " : "";
        const origin =
            kind === "fractured" ? "Fractured " : kind === "crafted" ? "Master Crafted " : "";
        result.push(
            `{ ${origin}${side}Modifier "${mod.name}"${tier ? ` (Tier: ${tier[2]})` : ""} }`,
            ...own.map((line) => `${line}${flag}`),
        );
    }
    return result;
}

/**
 * Write a trade listing's item as English item text with advanced modifier headers, the format
 * `importCraftingItemText` reads. Enchantments and socketed runes are left out.
 */
export function tradeItemText(input: Record<string, unknown>): string {
    const item = apiItemSchema.parse(input);
    const rarity = itemRarity(item);
    if (rarity !== "Normal" && rarity !== "Magic" && rarity !== "Rare")
        throw new Error("Only normal, magic and rare listings can be checked.");
    const base = item.baseType;
    const lines = [`Rarity: ${rarity}`];
    if (rarity === "Rare") lines.push(item.identified === false ? base : (item.name ?? ""), base);
    else lines.push(item.typeLine ?? base);
    lines.push("--------");
    const quality = (Array.isArray(input.properties) ? input.properties : []).find(
        (property) => (property as { name?: unknown })?.name === "Quality",
    ) as { values?: [string, number][] } | undefined;
    const qualityValue = quality?.values?.[0]?.[0];
    if (typeof qualityValue === "string" && /^\+?\d+%$/.test(qualityValue))
        lines.push(`Quality: ${qualityValue}`);
    const sockets = item.sockets ?? [];
    const colours = sockets.map((socket) => socket.sColour ?? (socket.type ? "S" : "?"));
    if (colours.length && colours.every((colour) => colour === "S"))
        lines.push(`Sockets: ${colours.join(" ")}`);
    else if (colours.length && colours.every((colour) => /^[RGBW]$/.test(colour))) {
        const links = colours.map((colour, index) =>
            index === 0
                ? colour
                : `${sockets[index - 1]!.group === sockets[index]!.group ? "-" : " "}${colour}`,
        );
        lines.push(`Sockets: ${links.join("")}`);
    }
    lines.push(`Item Level: ${item.ilvl ?? item.itemLevel ?? 1}`, "--------");
    const implicits = strings(input.implicitMods);
    if (implicits.length) lines.push(...implicits.map((line) => `${line} (implicit)`), "--------");
    if (item.identified === false) lines.push("Unidentified");
    else
        lines.push(
            ...modifierBlock(input, "fractured"),
            ...modifierBlock(input, "explicit"),
            ...modifierBlock(input, "crafted"),
        );
    lines.push("--------");
    for (const [name, value] of Object.entries(item.influences ?? {}))
        if (value && influenceNames[name]) lines.push(`${influenceNames[name]} Item`);
    if (item.fractured) lines.push("Fractured Item");
    if (item.split) lines.push("Split");
    if (item.sanctified) lines.push("Sanctified");
    if (item.duplicated) lines.push("Mirrored");
    if (item.corrupted) lines.push("Corrupted");
    return lines.join("\n");
}

/**
 * Check one listing against a stage's output query with the graph's catalog. A listing matches
 * only when every interpretation of its item text matches; anything else cannot price the stage.
 */
export function checkTradeListing(
    engine: CraftingEngine,
    query: ItemQuery,
    listing: TradeListing,
    rates: BuyInRates,
): CheckedListing {
    const rate = rates[listing.price.currency];
    const amount = rate ? listing.price.amount * rate : null;
    let interpretations: ReturnType<typeof importCraftingItemText>;
    try {
        interpretations = importCraftingItemText(engine, tradeItemText(listing.item));
    } catch {
        return { listing, status: "unreadable", amount, item: null };
    }
    if (!interpretations.length) return { listing, status: "unreadable", amount, item: null };
    const queries = createCraftingItemQuery(engine);
    const results = interpretations.map(({ item }) => queries.matches(item, query));
    if (results.every((result) => result === "match"))
        return { listing, status: "match", amount, item: interpretations[0]!.item };
    return {
        listing,
        status: results.every((result) => result === "no-match") ? "no-match" : "unreadable",
        amount,
        item: null,
    };
}

export type CheckedSearch = {
    sale: TradeSale;
    /** Listings the trade site reported for the search. */
    results: number;
    /** Listing IDs the search returned, so further fetches are possible up to this count. */
    available: number;
    fetches: number;
    checks: CheckedListing[];
};

const usable = (checks: readonly CheckedListing[]) =>
    checks
        .filter((check) => check.status === "match" && check.amount !== null)
        .sort((a, b) => a.amount! - b.amount!);

/** What the pricing run should do after a fetch for one stage. */
export function stageDecision(search: CheckedSearch, includeInPerson: boolean): StageDecision {
    const matching = usable(search.checks).length;
    const more = search.fetches < MAX_FETCHES && search.available > search.fetches * FETCH_SIZE;
    if (search.sale === "instant") {
        if (matching) return "done";
        if (more) return "more";
        return includeInPerson ? "in-person" : "done";
    }
    return matching < IN_PERSON_SAMPLE && more ? "more" : "done";
}

function counts(search: CheckedSearch, matching: number, nearPrice: number, bait: number) {
    const checks = search.checks;
    return {
        results: search.results,
        fetched: checks.length,
        matching,
        nearPrice,
        notMatching: checks.filter((check) => check.status === "no-match").length,
        unreadable: checks.filter((check) => check.status === "unreadable").length,
        unconverted: checks.filter((check) => check.status === "match" && check.amount === null)
            .length,
        bait,
    };
}

function median(values: number[]) {
    const middle = Math.floor(values.length / 2);
    return values.length % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2;
}

export type ListingSearch = Omit<CheckedSearch, "checks"> & { listings: TradeListing[] };

/**
 * Check a stage's listings and price it. Used by the browser after a pricing run and by the HTTP
 * and MCP operation for listings a caller collected itself.
 */
export function priceBuyInStage(
    engine: CraftingEngine,
    graph: CraftingGraph,
    stageId: string,
    instant: ListingSearch,
    inPerson: ListingSearch | null,
    rates: BuyInRates,
) {
    const node = graph.nodes.find((entry) => entry.id === stageId);
    if (node?.kind !== "craft") throw new Error("Choose a craft step to price.");
    const check = ({ listings, ...search }: ListingSearch): CheckedSearch => ({
        ...search,
        checks: listings.map((listing) => checkTradeListing(engine, node.output, listing, rates)),
    });
    const checkedInstant = check(instant);
    const checkedInPerson = inPerson && graph.buyIn?.includeInPerson ? check(inPerson) : null;
    return {
        stage: priceStageListings(checkedInstant, checkedInPerson, graph.currency),
        instant: checkedInstant,
        inPerson: checkedInPerson,
    };
}

/**
 * Price a stage from its checked listings. Instant-buyout listings price the stage at the
 * cheapest match, with high confidence. In-person listings are used only when given, which the
 * run does only for stages without an instant-buyout match.
 */
export function priceStageListings(
    instant: CheckedSearch,
    inPerson: CheckedSearch | null,
    currency: string,
): Omit<BuyInStage, "key" | "observedAt"> {
    const instantMatches = usable(instant.checks);
    if (instantMatches.length) {
        const cheapest = instantMatches[0]!;
        const amount = cheapest.amount!;
        return {
            status: "priced",
            price: { amount, currency },
            sale: "instant",
            confidence: "high",
            counts: counts(
                instant,
                instantMatches.length,
                instantMatches.filter((check) => check.amount! <= amount * NEAR_PRICE).length,
                0,
            ),
            item: cheapest.item,
        };
    }
    const matches = inPerson ? usable(inPerson.checks) : [];
    if (!inPerson || !matches.length)
        return {
            status: "no-listings",
            price: null,
            sale: null,
            confidence: null,
            counts: counts(inPerson ?? instant, 0, 0, 0),
            item: null,
        };
    const typical = median(matches.slice(0, IN_PERSON_SAMPLE).map((check) => check.amount!));
    const kept = matches.filter((check) => check.amount! >= typical * BAIT_SHARE);
    const cheapest = kept[0]!;
    const amount = cheapest.amount!;
    return {
        status: "priced",
        price: { amount, currency },
        sale: "in-person",
        confidence: matches.length >= 3 ? "medium" : "low",
        counts: counts(
            inPerson,
            matches.length,
            kept.filter((check) => check.amount! <= amount * NEAR_PRICE).length,
            matches.length - kept.length,
        ),
        item: cheapest.item,
    };
}

import { z } from "zod";
import type { MarketFilters, MarketOrder } from "../schemas/market";
import {
    MARKET_BASE_CATEGORIES,
    MARKET_CLUSTER_BASE_CATEGORY,
    type MarketCategory,
} from "./market-categories";
import { marketListingPrices, marketMostListedPrice } from "./market-listing-prices";

/** Crafting base cohorts from this item level up are listed on the market. */
export const MARKET_BASE_MIN_LEVEL = 74;
export const MARKET_BASE_ATTRIBUTES = ["str", "dex", "int"] as const;
/** Attribute requirement combinations of armour bases, as the `attributes` filter names them. */
export const MARKET_BASE_ATTRIBUTE_SETS = {
    str: "Strength",
    dex: "Dexterity",
    int: "Intelligence",
    "str-dex": "Str/Dex",
    "str-int": "Str/Int",
    "dex-int": "Dex/Int",
    "str-dex-int": "Str/Dex/Int",
} as const;
export type MarketBaseAttributeSet = keyof typeof MARKET_BASE_ATTRIBUTE_SETS;
/** Item classes of each crafting base category. */
export const MARKET_BASE_CLASSES = {
    "accessory-bases": ["Amulet", "Belt", "Ring"],
    "armour-bases": ["Body Armour", "Boots", "Gloves", "Helmet", "Shield"],
    "weapon-bases": [
        "Bow",
        "Claw",
        "Dagger",
        "One Hand Axe",
        "One Hand Mace",
        "One Hand Sword",
        "Quiver",
        "Rune Dagger",
        "Sceptre",
        "Staff",
        "Thrusting One Hand Sword",
        "Two Hand Axe",
        "Two Hand Mace",
        "Two Hand Sword",
        "Wand",
        "Warstaff",
    ],
    "flask-bases": ["Life Flask", "Mana Flask", "Hybrid Flask", "Utility Flask"],
    [MARKET_CLUSTER_BASE_CATEGORY]: [
        "Small Cluster Jewel",
        "Medium Cluster Jewel",
        "Large Cluster Jewel",
    ],
} as const satisfies Partial<Record<MarketCategory, string[]>>;
type MarketBaseClass = (typeof MARKET_BASE_CLASSES)[keyof typeof MARKET_BASE_CLASSES][number];
/** Item classes that can have six sockets, whose crafting bases split by links. */
export const MARKET_BASE_LINK_CLASSES: readonly MarketBaseClass[] = [
    "Body Armour",
    "Bow",
    "Staff",
    "Warstaff",
    "Two Hand Axe",
    "Two Hand Mace",
    "Two Hand Sword",
];
export const MARKET_BASE_CLASS_NAMES = Object.values(MARKET_BASE_CLASSES).flat() as [
    MarketBaseClass,
    ...MarketBaseClass[],
];

/** A game data item class as the market names it: the data spells flask classes as "LifeFlask". */
export function marketBaseClass(itemClass: string) {
    return itemClass.replace(/(?<=\w)Flask$/, " Flask");
}
/** Each equipment base type's item class and attribute set ("" for none), by base type name. */
export const marketBaseTypesSchema = z.record(
    z.string(),
    z.strictObject({
        itemClass: z.enum(MARKET_BASE_CLASS_NAMES),
        attributes: z.enum([
            "",
            ...(Object.keys(MARKET_BASE_ATTRIBUTE_SETS) as MarketBaseAttributeSet[]),
        ]),
    }),
);
/** Cluster Jewel item level bands, as poe.ninja splits them. */
export const MARKET_CLUSTER_LEVEL_BANDS = [
    { min: 1, max: 49 },
    { min: 50, max: 67 },
    { min: 68, max: 74 },
    { min: 75, max: 83 },
    { min: 84, max: 100 },
] as const;
/** Item levels the `ilvl` filter offers equipment: a base matches when its band includes the level. */
export const MARKET_BASE_LEVELS = [
    "74",
    "75",
    "76",
    "77",
    "78",
    "79",
    "80",
    "81",
    "82",
    "83",
    "84",
    "85",
    "86",
] as const;

export const marketBaseSchema = z.strictObject({
    id: z.string().min(1).max(128),
    baseType: z.string().min(1).max(255),
    category: z.enum([
        ...(Object.values(MARKET_BASE_CATEGORIES) as MarketCategory[]),
        MARKET_CLUSTER_BASE_CATEGORY,
    ]),
    itemClass: z
        .enum(MARKET_BASE_CLASS_NAMES)
        .describe("The item class; a Cluster Jewel's size, e.g. Large Cluster Jewel"),
    attributes: z
        .array(z.enum(MARKET_BASE_ATTRIBUTES))
        .describe("Attributes the base requires: str, dex and int"),
    level: z.number().int().nullable().describe("Character level required; null for jewels"),
    ilvl: z.strictObject({ min: z.number().int(), max: z.number().int() }),
    links: z.enum(["1-5", "6"]).nullable().describe("Linked sockets; null means any"),
    quality: z.number().int().nullable().describe("Minimum quality; null means any"),
    cluster: z
        .strictObject({ skill: z.string().min(1).max(255), passives: z.number().int() })
        .optional()
        .describe("A Cluster Jewel's added small passive skill and passive count"),
});
export type MarketBase = z.infer<typeof marketBaseSchema>;

export const marketBasesSchema = z.strictObject({
    revision: z.string().min(1).max(100),
    bases: z.array(marketBaseSchema),
});

export const marketBaseRowSchema = marketBaseSchema.extend({
    hour: z.number(),
    listingCount: z.number(),
    uniqueSellers: z.number(),
    unknownCount: z
        .number()
        .describe("Listings on the base that could not be told apart from this cohort"),
    prices: z.record(
        z.string(),
        z.object({ count: z.number(), min: z.number(), median: z.number(), max: z.number() }),
    ),
});
export type MarketBaseRow = z.infer<typeof marketBaseRowSchema>;

function variantName(base: MarketBaseRow) {
    return `${base.baseType} ${marketBaseVariant(base)}`;
}

/** The most listed currency's asking price in chaos, as the price column shows it. */
function chaosPrice(base: MarketBaseRow, chaosRates: Record<string, number>) {
    return marketMostListedPrice(marketListingPrices(base.prices, chaosRates))?.chaos;
}

/**
 * One page of base rows with the market list's search, column ranges and order. Cohorts have no
 * likely-sale estimates, so the sales orders fall back to listings and sales ranges match none.
 * Prices compare in chaos and their ranges are in the display currency.
 */
export function rankMarketBases(
    rows: MarketBaseRow[],
    filters: MarketFilters,
    chaosRates: Record<string, number>,
    pageSize: number,
) {
    // Base cohorts only hold uncorrupted items.
    if (filters.corruption === "true") return { rows: [], hasMore: false };
    const query = filters.q.toLowerCase();
    const display = filters.currency === "chaos" ? 1 : chaosRates[filters.currency];
    const within = (value: number | undefined, min?: number, max?: number) =>
        (min === undefined && max === undefined) ||
        (value !== undefined && value >= (min ?? -Infinity) && value <= (max ?? Infinity));
    const priced = rows.map((row) => ({ row, chaos: chaosPrice(row, chaosRates) }));
    const level = Number(filters.ilvl);
    const matching = priced.filter(
        ({ row, chaos }) =>
            variantName(row).toLowerCase().includes(query) &&
            (!filters.baseClass || row.itemClass === filters.baseClass) &&
            (!filters.attributes || row.attributes.join("-") === filters.attributes) &&
            (!filters.ilvl || (row.ilvl.min <= level && level <= row.ilvl.max)) &&
            (!filters.baseLinks || row.links === filters.baseLinks) &&
            (!filters.quality || String(row.quality) === filters.quality) &&
            within(
                chaos !== undefined && display ? chaos / display : undefined,
                filters.priceMin,
                filters.priceMax,
            ) &&
            within(row.listingCount, filters.listingsMin, filters.listingsMax) &&
            within(row.uniqueSellers, filters.sellersMin, filters.sellersMax) &&
            within(0, filters.salesMin, filters.salesMax),
    );
    const byName = (a: (typeof priced)[number], b: (typeof priced)[number]) =>
        a.row.baseType.localeCompare(b.row.baseType) ||
        a.row.ilvl.min - b.row.ilvl.min ||
        (a.row.links ?? "").localeCompare(b.row.links ?? "") ||
        (a.row.quality ?? 0) - (b.row.quality ?? 0);
    const priceOrder = (a: number | undefined, b: number | undefined) =>
        a === undefined ? (b === undefined ? 0 : 1) : b === undefined ? -1 : a - b;
    const orders: Record<
        MarketOrder,
        (a: (typeof priced)[number], b: (typeof priced)[number]) => number
    > = {
        sales: (a, b) => b.row.listingCount - a.row.listingCount,
        "sales-asc": (a, b) => a.row.listingCount - b.row.listingCount,
        "listings-desc": (a, b) => b.row.listingCount - a.row.listingCount,
        "listings-asc": (a, b) => a.row.listingCount - b.row.listingCount,
        "sellers-desc": (a, b) => b.row.uniqueSellers - a.row.uniqueSellers,
        "sellers-asc": (a, b) => a.row.uniqueSellers - b.row.uniqueSellers,
        "price-asc": (a, b) => priceOrder(a.chaos, b.chaos),
        "price-desc": (a, b) =>
            a.chaos === undefined || b.chaos === undefined
                ? priceOrder(a.chaos, b.chaos)
                : b.chaos - a.chaos,
        newest: (a, b) => b.row.hour - a.row.hour,
        oldest: (a, b) => a.row.hour - b.row.hour,
        "name-asc": byName,
        "name-desc": (a, b) => byName(b, a),
    };
    const sorted = matching.sort((a, b) => orders[filters.order](a, b) || byName(a, b));
    const start = (filters.page - 1) * pageSize;
    return {
        rows: sorted.slice(start, start + pageSize).map(({ row }) => row),
        hasMore: sorted.length > start + pageSize,
    };
}

/**
 * The base's item class, the attributes it requires and its level requirement, e.g.
 * "Body Armour · Str/Int · Level 68".
 */
export function marketBaseDescription(
    base: Pick<MarketBase, "itemClass" | "attributes"> & Partial<Pick<MarketBase, "level">>,
) {
    const attributes = base.attributes
        .map((attribute) => attribute[0]!.toUpperCase() + attribute.slice(1))
        .join("/");
    return [base.itemClass, attributes, base.level ? `Level ${base.level}` : ""]
        .filter(Boolean)
        .join(" · ");
}

/** The variant and, unless the base type already names it, the item class and attributes. */
export function marketBaseDetails(base: MarketBase) {
    const description = marketBaseDescription(base);
    return description === base.baseType
        ? marketBaseVariant(base)
        : `${marketBaseVariant(base)} · ${description}`;
}

export function marketBaseVariant(
    base: Pick<MarketBase, "ilvl" | "links" | "quality" | "cluster">,
) {
    return [
        ...(base.cluster ? [base.cluster.skill, `${base.cluster.passives} passives`] : []),
        `ilvl ${base.ilvl.min}–${base.ilvl.max}`,
        ...(base.links ? [`${base.links === "6" ? "6" : "1–5"} links`] : []),
        ...(base.quality ? [`${base.quality}%+ quality`] : []),
    ].join(" · ");
}

import { z } from "zod";
import { MARKET_CLUSTER_BASE_CATEGORY, type MarketCategory } from "./market-categories";

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

/** What a crafting base market counts. */
export const MARKET_BASE_NOTE =
    "Normal, magic and rare items together, identified or not; uncorrupted, unfractured, uninfluenced and not intangible.";

/**
 * The base's item class, the attributes it requires and its level requirement, e.g.
 * "Body Armour · Str/Int · Level 68".
 */
export function marketBaseDescription(base: {
    itemClass: string;
    attributes: readonly string[];
    level?: number | null;
}) {
    const attributes = base.attributes
        .map((attribute) => attribute[0]!.toUpperCase() + attribute.slice(1))
        .join("/");
    return [base.itemClass, attributes, base.level ? `Level ${base.level}` : ""]
        .filter(Boolean)
        .join(" · ");
}

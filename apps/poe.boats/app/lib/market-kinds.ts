import {
    GEM_LEVEL_BANDS,
    GEM_LEVEL_LABELS,
    GEM_QUALITY_BANDS,
    GEM_QUALITY_LABELS,
    MAP_DELIRIUM_BANDS,
    MAP_DELIRIUM_LABELS,
    MAP_INFLUENCE_BAND_LABELS,
    MAP_INFLUENCE_BANDS,
    MAP_MOD_BANDS,
    MAP_MOD_LABELS,
    MAP_QUANTITY_BANDS,
    MAP_QUANTITY_LABELS,
    parseGemBandFilter,
} from "@poe-tools/market";
import { z } from "zod";
import {
    MARKET_BASE_ATTRIBUTE_SETS,
    MARKET_BASE_CLASS_NAMES,
    MARKET_BASE_CLASSES,
    MARKET_BASE_LEVELS,
    MARKET_BASE_LINK_CLASSES,
    MARKET_CLUSTER_LEVEL_BANDS,
    type MarketBaseAttributeSet,
} from "./market-bases";
import type { MarketCategory } from "./market-categories";

type SelectOption = [value: string, text: string];

function gemBands(
    legend: string,
    bands: readonly string[],
    labels: readonly string[],
    axis: string,
) {
    return {
        control: "bands",
        legend,
        bands,
        labels,
        empty: "",
        schema: z
            .string()
            .max(40)
            .default("")
            .refine(
                (value) => parseGemBandFilter(value, bands) !== null,
                `Unknown gem ${axis} band`,
            )
            .describe(
                `Skill gem ${axis} bands (${bands.join(", ")}) to include, comma-separated; prefix one with - to exclude it. Set, only gem markets are listed`,
            ),
    } as const;
}

function mapBands(
    legend: string,
    bands: readonly string[],
    labels: readonly string[],
    axis: string,
    note = "",
) {
    return {
        control: "bands",
        legend,
        bands,
        labels,
        empty: "",
        schema: z
            .string()
            .max(60)
            .default("")
            .refine(
                (value) => parseGemBandFilter(value, bands) !== null,
                `Unknown map ${axis} band`,
            )
            .describe(
                `Map ${axis} bands (${bands.join(", ")}) to include, comma-separated; prefix one with - to exclude it. Set, only tier and Nightmare map markets are listed${note}`,
            ),
    } as const;
}

function flag(legend: string, label: string, description: string) {
    return {
        control: "flag",
        legend,
        label,
        empty: "all",
        schema: z.enum(["all", "true", "false"]).default("all").describe(description),
    } as const;
}

function ilvlOptions({ ilvlBands }: Pick<MarketSettings, "ilvlBands">): SelectOption[] {
    return [
        ["", "Any item level"],
        ...(ilvlBands === "cluster"
            ? MARKET_CLUSTER_LEVEL_BANDS.map(
                  ({ min, max }): SelectOption => [
                      String(min),
                      max === 100 ? `ilvl ${min}+` : `ilvl ${min}–${max}`,
                  ],
              )
            : MARKET_BASE_LEVELS.map(
                  (level): SelectOption => [level, level === "86" ? "ilvl 86+" : `ilvl ${level}`],
              )),
    ];
}

/**
 * Every way a market list splits beyond its category: one definition of each filter's URL
 * parameter and validation, its control, and the value meaning no filter.
 */
export const MARKET_AXES = {
    /** A normal gem's level bands; for exceptional and awakened gems, below, at and above max level. */
    gemLevel: gemBands("Gem level", GEM_LEVEL_BANDS, GEM_LEVEL_LABELS, "level"),
    gemQuality: gemBands("Gem quality", GEM_QUALITY_BANDS, GEM_QUALITY_LABELS, "quality"),
    gemTransfigured: flag(
        "Transfigured",
        "Transfigured",
        "Only transfigured skill gems (true) or only other gems (false); either lists only gem markets",
    ),
    gemVaal: flag(
        "Vaal",
        "Vaal",
        "Only Vaal skill gems (true) or only other gems (false); either lists only gem markets",
    ),
    mapMods: mapBands(
        "Mods",
        MAP_MOD_BANDS,
        MAP_MOD_LABELS,
        "mod count",
        "; unidentified maps have no mod count",
    ),
    mapQuantity: {
        ...mapBands(
            "Item quantity",
            MAP_QUANTITY_BANDS,
            MAP_QUANTITY_LABELS,
            "item quantity %",
            "; only identified tier 16 and Nightmare maps have a quantity band",
        ),
        hint: "Tier 16 and Nightmare maps only",
    },
    mapDelirium: mapBands("Delirium", MAP_DELIRIUM_BANDS, MAP_DELIRIUM_LABELS, "delirium %"),
    mapInfluence: mapBands(
        "Influence",
        MAP_INFLUENCE_BANDS,
        MAP_INFLUENCE_BAND_LABELS,
        "influence",
        "; `none` is an uninfluenced map, and `elder-guardian` an Elder map occupied by any guardian",
    ),
    baseClass: {
        control: "select",
        label: "Type",
        empty: "",
        options: ({ baseClasses }: Pick<MarketSettings, "baseClasses">): SelectOption[] => [
            ["", "Any type"],
            ...baseClasses.map((name): SelectOption => [name, name]),
        ],
        schema: z
            .enum(["", ...MARKET_BASE_CLASS_NAMES])
            .default("")
            .describe("The item class of a crafting base, or of a unique's base type"),
    },
    attributes: {
        control: "select",
        label: "Attributes",
        empty: "",
        options: (): SelectOption[] => [
            ["", "Any attributes"],
            ...Object.entries(MARKET_BASE_ATTRIBUTE_SETS),
        ],
        schema: z
            .enum(["", ...(Object.keys(MARKET_BASE_ATTRIBUTE_SETS) as MarketBaseAttributeSet[])])
            .default("")
            .describe(
                "The attributes a crafting base, or a unique's base type, requires, e.g. `str-int`",
            ),
    },
    ilvl: {
        control: "select",
        label: "Item level",
        empty: "",
        options: ilvlOptions,
        schema: z
            // Cluster Jewel bands start at 1, 50, 68, 75 and 84; equipment bands from 74.
            .enum(["", "1", "50", "68", ...MARKET_BASE_LEVELS])
            .default("")
            .describe("Crafting bases whose item level band includes this level"),
    },
    baseLinks: {
        control: "select",
        label: "Links",
        empty: "",
        options: (): SelectOption[] => [
            ["", "Any links"],
            ["1-5", "1–5 links"],
            ["6", "6 links"],
        ],
        /** Only some item classes split by links. */
        applies: ({ baseClass }: { baseClass: string }) =>
            !baseClass || (MARKET_BASE_LINK_CLASSES as readonly string[]).includes(baseClass),
        schema: z.enum(["", "1-5", "6"]).default(""),
    },
    quality: {
        control: "select",
        label: "Quality",
        empty: "",
        options: (): SelectOption[] => [
            ["", "Any quality"],
            ["25", "25%+ quality"],
            ["30", "30%+ quality"],
        ],
        schema: z
            .enum(["", "25", "30"])
            .default("")
            .describe("Crafting base cohorts split at this minimum quality"),
    },
} as const;

export type MarketAxisParam = keyof typeof MARKET_AXES;
type MarketAxes = typeof MARKET_AXES;

/** Each axis's validation, for the filters schema. */
export const MARKET_AXIS_SCHEMAS = Object.fromEntries(
    Object.entries(MARKET_AXES).map(([param, axis]) => [param, axis.schema]),
) as { [Param in MarketAxisParam]: MarketAxes[Param]["schema"] };

/** Every axis cleared, which category navigation applies. */
export const MARKET_AXIS_DEFAULTS = Object.fromEntries(
    Object.entries(MARKET_AXES).map(([param, axis]) => [param, axis.empty]),
) as { [Param in MarketAxisParam]: MarketAxes[Param]["empty"] };

export const MARKET_GEM_AXES = [
    "gemLevel",
    "gemQuality",
    "gemTransfigured",
    "gemVaal",
] as const satisfies readonly MarketAxisParam[];
export const MARKET_MAP_AXES = [
    "mapMods",
    "mapQuantity",
    "mapDelirium",
    "mapInfluence",
] as const satisfies readonly MarketAxisParam[];

/** What a category's list offers and how it shows its markets. */
export type MarketSettings = {
    kind: "stackable" | "listed" | "unique" | "gem" | "map" | "forbidden" | "base";
    /** Its markets split by identification, so the list can filter by it. */
    identification: boolean;
    /** How the list filters by corruption, when its markets split by it. */
    corruption: "select" | "toggle" | null;
    /** The corruption searched without a choice. */
    defaultCorruption: "all" | "false";
    axes: readonly MarketAxisParam[];
    /** The options of the `baseClass` axis. */
    baseClasses: readonly string[];
    /** The options of the `ilvl` axis. */
    ilvlBands: "equipment" | "cluster";
    /** One table of rows, or Forbidden jewels paired by notable. */
    layout: "table" | "pairs";
};

const STACKABLE: MarketSettings = {
    kind: "stackable",
    identification: false,
    corruption: null,
    defaultCorruption: "all",
    axes: [],
    baseClasses: [],
    ilvlBands: "equipment",
    layout: "table",
};
const LISTED: MarketSettings = {
    ...STACKABLE,
    kind: "listed",
    identification: true,
    corruption: "select",
};
const unique = (
    baseClasses: readonly string[],
    axes: readonly MarketAxisParam[] = ["baseClass"],
): MarketSettings => ({
    ...LISTED,
    kind: "unique",
    defaultCorruption: "false",
    axes,
    baseClasses,
});
const base = (
    baseClasses: readonly string[],
    axes: readonly MarketAxisParam[],
    ilvlBands: MarketSettings["ilvlBands"] = "equipment",
): MarketSettings => ({ ...STACKABLE, kind: "base", axes, baseClasses, ilvlBands });

const CATEGORY_SETTINGS: Partial<Record<MarketCategory | "all", MarketSettings>> = {
    all: LISTED,
    jewels: LISTED,
    tinctures: LISTED,
    relics: LISTED,
    other: LISTED,
    weapons: unique(MARKET_BASE_CLASSES["weapon-bases"]),
    armour: unique(MARKET_BASE_CLASSES["armour-bases"], ["baseClass", "attributes"]),
    accessories: unique(MARKET_BASE_CLASSES["accessory-bases"]),
    flasks: unique(MARKET_BASE_CLASSES["flask-bases"]),
    forbidden: { ...LISTED, kind: "forbidden", layout: "pairs" },
    gems: { ...STACKABLE, kind: "gem", corruption: "toggle", axes: MARKET_GEM_AXES },
    maps: { ...LISTED, kind: "map", axes: MARKET_MAP_AXES },
    "armour-bases": base(MARKET_BASE_CLASSES["armour-bases"], [
        "baseClass",
        "attributes",
        "ilvl",
        "baseLinks",
        "quality",
    ]),
    "weapon-bases": base(MARKET_BASE_CLASSES["weapon-bases"], ["baseClass", "ilvl", "baseLinks"]),
    "accessory-bases": base(MARKET_BASE_CLASSES["accessory-bases"], ["baseClass", "ilvl"]),
    "flask-bases": base(MARKET_BASE_CLASSES["flask-bases"], ["baseClass", "ilvl"]),
    "cluster-jewel-bases": base(
        MARKET_BASE_CLASSES["cluster-jewel-bases"],
        ["baseClass", "ilvl"],
        "cluster",
    ),
};

/** A category's settings; categories without their own list stackable items. */
export function marketSettings(category: MarketCategory | "all"): MarketSettings {
    return CATEGORY_SETTINGS[category] ?? STACKABLE;
}

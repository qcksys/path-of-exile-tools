export const IDOL_BASES = {
    minor: {
        name: "Minor Idol",
        width: 1,
        height: 1,
        implicit: 2,
        image: "/images/AtlasRelic1x1.webp",
        uniqueImage: "/images/3UniqueAtlasRelic1x1.webp",
    },
    kamasan: {
        name: "Kamasan Idol",
        width: 1,
        height: 2,
        implicit: 4,
        image: "/images/AtlasRelic1x2.webp",
        uniqueImage: undefined,
    },
    totemic: {
        name: "Totemic Idol",
        width: 1,
        height: 3,
        implicit: 6,
        image: "/images/AtlasRelic1x3.webp",
        uniqueImage: undefined,
    },
    noble: {
        name: "Noble Idol",
        width: 2,
        height: 1,
        implicit: 4,
        image: "/images/AtlasRelic2x1.webp",
        uniqueImage: undefined,
    },
    burial: {
        name: "Burial Idol",
        width: 3,
        height: 1,
        implicit: 6,
        image: "/images/AtlasRelic3x1.webp",
        uniqueImage: undefined,
    },
    conqueror: {
        name: "Conqueror Idol",
        width: 2,
        height: 2,
        implicit: 8,
        image: "/images/AtlasRelic2x2.webp",
        uniqueImage: undefined,
    },
} as const;

export type IdolBaseKey = keyof typeof IDOL_BASES;
export type IdolBase = (typeof IDOL_BASES)[IdolBaseKey];

export const IDOL_BASE_KEYS = Object.keys(IDOL_BASES) as IdolBaseKey[];

const IDOL_BASE_KEY_SET = new Set<string>(IDOL_BASE_KEYS);

export function isIdolBaseKey(value: unknown): value is IdolBaseKey {
    return typeof value === "string" && IDOL_BASE_KEY_SET.has(value);
}

export function getIdolBaseOrDefault(key: string): IdolBase | undefined {
    if (isIdolBaseKey(key)) {
        return IDOL_BASES[key];
    }
    return undefined;
}

export const RARITY_TYPES = ["normal", "magic", "rare", "unique"] as const;
export type Rarity = (typeof RARITY_TYPES)[number];

export const LEAGUE_MECHANICS = [
    "abyss",
    "anarchy",
    "ascendancy",
    "bestiary",
    "betrayal",
    "beyond",
    "blight",
    "breach",
    "cleansing",
    "conqueror",
    "delirium",
    "delve",
    "elder",
    "essence",
    "expedition",
    "fortune",
    "generic",
    "harbinger",
    "harvest",
    "heist",
    "incursion",
    "legion",
    "map",
    "maven",
    "ritual",
    "scarab",
    "scouting",
    "settlers",
    "shaper",
    "shrine",
    "strongbox",
    "synthesis",
    "tangle",
    "torment",
    "ultimatum",
    "vaal",
    "zana",
] as const;

export type LeagueMechanic = (typeof LEAGUE_MECHANICS)[number];

export function getIdolBase(key: IdolBaseKey): IdolBase {
    return IDOL_BASES[key];
}

export function getIdolSize(key: IdolBaseKey): {
    width: number;
    height: number;
} {
    const base = IDOL_BASES[key];
    return { width: base.width, height: base.height };
}

import mapLists from "../data/maps-poe1.json" with { type: "json" };
import { parseGemBandFilter } from "./gem-variants.ts";

/**
 * PoE 1 map markets: one per map base (`Map (Tier 16)`, `Nightmare Map`), corruption state,
 * identification, mod count band, delirium, influence (Shaper, Elder, an Elder Guardian or the
 * Originator's Memories) and, on tier 16 and Nightmare maps, item quantity band.
 * Blighted and Blight-ravaged maps share the tier's base type and are not tracked.
 */
export const MAP_MOD_BANDS = ["1-6", "8"] as const;
export const MAP_MOD_LABELS = ["1–6 mods", "8 mods"] as const;
export const MAP_QUANTITY_BANDS = [
    "0-59",
    "60-79",
    "80-99",
    "100-119",
    "120-139",
    "140-159",
    "160-179",
    "180-199",
    "200",
] as const;
export const MAP_QUANTITY_LABELS = [
    "0–59%",
    "60–79%",
    "80–99%",
    "100–119%",
    "120–139%",
    "140–159%",
    "160–179%",
    "180–199%",
    "200%+",
] as const;
/** Each Delirium Orb makes a map's players 20% Delirious, up to 100%. */
export const MAP_DELIRIUM_BANDS = ["0", "20", "40", "60", "80", "100"] as const;
export const MAP_DELIRIUM_LABELS = ["0%", "20%", "40%", "60%", "80%", "100%"] as const;
export type MapModBand = (typeof MAP_MOD_BANDS)[number];
export type MapQuantityBand = (typeof MAP_QUANTITY_BANDS)[number];
export type MapDeliriumBand = (typeof MAP_DELIRIUM_BANDS)[number];

export const NIGHTMARE_MAP = "Nightmare Map";
const TIER_MAP = /^Map \(Tier (\d+)\)$/;

/** Generic map bases: `Map (Tier 1)` to `Map (Tier 16)`, and the Nightmare Map. */
export function isMapMarketBase(baseType: string) {
    return TIER_MAP.test(baseType) || baseType === NIGHTMARE_MAP;
}

/** A blighted map's type line names the blight; its base type is the tier's. */
export function isBlightedMap(typeLine: string) {
    return /\bBlight(?:ed|-ravaged) /.test(typeLine);
}

/** Only tier 16 and Nightmare maps trade by item quantity. */
export function mapHasQuantityBands(baseType: string) {
    return baseType === NIGHTMARE_MAP || TIER_MAP.exec(baseType)?.[1] === "16";
}

/** Normal maps (no mods) trade with magic and rare ones up to 6 mods; 7 mods trade as 8. */
export function mapModBand(mods: number): MapModBand {
    return mods <= 6 ? "1-6" : "8";
}

export function mapQuantityBand(quantity: number): MapQuantityBand {
    if (quantity < 60) return "0-59";
    return MAP_QUANTITY_BANDS[Math.min(Math.floor((quantity - 40) / 20), 8)]!;
}

export function mapDeliriumBand(delirious: number): MapDeliriumBand {
    return MAP_DELIRIUM_BANDS[Math.min(Math.max(Math.round(delirious / 20), 0), 5)]!;
}

/**
 * A mod line as its template: every number or roll range (`-(25-15)`, `+40`) becomes `#`, so an
 * item's `Players have -12% to all maximum Resistances` matches the game data's
 * `Players have -(25-15)% to all maximum Resistances`.
 */
export function mapModLineTemplate(line: string) {
    return line.replace(/[+-]?(?:\(\d+(?:\.\d+)?-\d+(?:\.\d+)?\)|\d+(?:\.\d+)?)/g, "#");
}

/**
 * Lines a map mod adds to the item's properties (Item Quantity, Item Rarity, Monster Pack Size,
 * More Maps/Scarabs/Currency) rather than to its mod list.
 */
export function isHiddenMapModLine(line: string) {
    return /(?:Quantity|Rarity) of Items found in this Area$|increased Pack size$|more (?:Maps|Scarabs|Currency) found in Area$/.test(
        line,
    );
}

/** Templates of the map mods that show more than one line, from `vp run game-data:maps`. */
const multiLineMods = new Map<string, string[][]>();
for (const lines of mapLists.multiLineMods)
    for (const line of new Set(lines))
        multiLineMods.set(line, [...(multiLineMods.get(line) ?? []), lines]);

/**
 * How many mods a map's explicit lines come from. Several map mods show two or more lines (a
 * Power Charge mod shows its maximum charges and its charge on hit), so lines are matched to the
 * multi-line mods of the game data, taking the fewest mods that explain every line; any other line
 * is one mod. Two single-line mods that happen to match one multi-line mod count as one.
 */
export function mapModCount(explicitMods: readonly string[]) {
    const lines = explicitMods.flatMap((mod) => mod.split("\n")).map(mapModLineTemplate);
    const memo = new Map<string, number>();
    const count = (remaining: readonly string[]): number => {
        const [first, ...rest] = remaining;
        if (first === undefined) return 0;
        const key = remaining.join("\n");
        const known = memo.get(key);
        if (known !== undefined) return known;
        let best = 1 + count(rest);
        for (const template of multiLineMods.get(first) ?? []) {
            const left = [...remaining];
            if (template.every((line) => left.includes(line) && left.splice(left.indexOf(line), 1)))
                best = Math.min(best, 1 + count(left));
        }
        memo.set(key, best);
        return best;
    };
    return count(lines.sort());
}

export const MAP_INFLUENCES = ["shaper", "elder", "elder-guardian", "memory"] as const;
export const MAP_INFLUENCE_LABELS = ["Shaper", "Elder", "Elder Guardian", "Memory"] as const;
export type MapInfluence = (typeof MAP_INFLUENCES)[number];
/** The influence filter's bands: each influence, and `none` for uninfluenced maps. */
export const MAP_INFLUENCE_BANDS = ["none", ...MAP_INFLUENCES] as const;
export const MAP_INFLUENCE_BAND_LABELS = ["None", ...MAP_INFLUENCE_LABELS] as const;
export type MapInfluenceBand = (typeof MAP_INFLUENCE_BANDS)[number];

/** The implicit naming each map influence, which shows whether or not the map is identified. */
const MAP_INFLUENCE_IMPLICITS: Record<string, MapInfluence> = {
    "Area is influenced by The Shaper": "shaper",
    "Area is influenced by The Elder": "elder",
    "Area is Influenced by the Originator's Memories": "memory",
};
/** Elder maps occupied by a guardian trade as one market: a Blessed Orb rerolls the guardian. */
const ELDER_GUARDIAN = /^Map is occupied by The (?:Enslaver|Eradicator|Constrictor|Purifier)$/;

export function mapInfluence(implicitMods: readonly string[]): MapInfluence | undefined {
    if (implicitMods.some((mod) => ELDER_GUARDIAN.test(mod))) return "elder-guardian";
    return implicitMods.map((mod) => MAP_INFLUENCE_IMPLICITS[mod]).find(Boolean);
}

/**
 * The market's `signatureValue`, e.g. `8 mods · Quantity 100–119% · Delirium 40%`,
 * `Unidentified · Delirium 0%` (an unidentified map shows neither its mods nor its quantity), or
 * `1–6 mods · Delirium 0% · Memory` for an influenced map.
 */
export function mapVariantValue(variant: {
    identified: boolean;
    mods?: MapModBand;
    quantity?: MapQuantityBand;
    delirium: MapDeliriumBand;
    influence?: MapInfluence;
}) {
    const { identified, mods, quantity, delirium, influence } = variant;
    return [
        identified && mods ? MAP_MOD_LABELS[MAP_MOD_BANDS.indexOf(mods)] : "Unidentified",
        identified && quantity
            ? [`Quantity ${MAP_QUANTITY_LABELS[MAP_QUANTITY_BANDS.indexOf(quantity)]}`]
            : [],
        `Delirium ${MAP_DELIRIUM_LABELS[MAP_DELIRIUM_BANDS.indexOf(delirium)]}`,
        influence ? [MAP_INFLUENCE_LABELS[MAP_INFLUENCES.indexOf(influence)]] : [],
    ]
        .flat()
        .join(" · ");
}

/** The fields of a `mapVariantValue`, or undefined when `value` is not one. */
export function parseMapVariantValue(value: string) {
    const parts = value.split(" · ");
    const after = (prefix: string) =>
        parts.find((part) => part.startsWith(prefix))?.slice(prefix.length) ?? "";
    const band = <Band>(bands: readonly Band[], labels: readonly string[], label = "") =>
        bands[labels.indexOf(label)];
    const delirium = band(MAP_DELIRIUM_BANDS, MAP_DELIRIUM_LABELS, after("Delirium "));
    if (!delirium) return undefined;
    const variant = {
        identified: parts[0] !== "Unidentified",
        mods: band(MAP_MOD_BANDS, MAP_MOD_LABELS, parts[0]),
        quantity: band(MAP_QUANTITY_BANDS, MAP_QUANTITY_LABELS, after("Quantity ")),
        delirium,
        influence: band(MAP_INFLUENCES, MAP_INFLUENCE_LABELS, parts.at(-1)),
    };
    return mapVariantValue(variant) === value ? variant : undefined;
}

/** Bands passing a filter: the included ones (every band when none are), less the excluded ones. */
function allowedBands<Band extends string>(value: string, bands: readonly Band[]) {
    const filter = parseGemBandFilter(value, bands);
    if (!filter) return [];
    return bands.filter(
        (name) => (!filter.include.size || filter.include.has(name)) && !filter.exclude.has(name),
    );
}

/**
 * Every map `signatureValue` passing mod count, quantity, delirium and influence band filters, or
 * undefined when none is set. Mod count and quantity filters drop unidentified maps, which show
 * neither; a quantity filter also drops maps below tier 16, which have no quantity band.
 */
export function mapVariantValues(filters: {
    mapMods: string;
    mapQuantity: string;
    mapDelirium: string;
    mapInfluence: string;
}) {
    if (!filters.mapMods && !filters.mapQuantity && !filters.mapDelirium && !filters.mapInfluence)
        return undefined;
    const deliria = allowedBands(filters.mapDelirium, MAP_DELIRIUM_BANDS);
    const influences = allowedBands(filters.mapInfluence, MAP_INFLUENCE_BANDS).map((band) =>
        band === "none" ? undefined : band,
    );
    const quantities = [
        ...allowedBands(filters.mapQuantity, MAP_QUANTITY_BANDS),
        ...(filters.mapQuantity ? [] : [undefined]),
    ];
    const identified = allowedBands(filters.mapMods, MAP_MOD_BANDS).flatMap((mods) =>
        quantities.map((quantity) => ({ identified: true, mods, quantity })),
    );
    const unidentified = !filters.mapMods && !filters.mapQuantity;
    const variants = [
        ...identified,
        ...(unidentified ? [{ identified: false, mods: undefined, quantity: undefined }] : []),
    ];
    return variants.flatMap((variant) =>
        deliria.flatMap((delirium) =>
            influences.map((influence) => mapVariantValue({ ...variant, delirium, influence })),
        ),
    );
}

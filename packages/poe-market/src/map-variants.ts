import mapLists from "../data/maps-poe1.json" with { type: "json" };
import { parseGemBandFilter } from "./gem-variants.ts";

/**
 * PoE 1 map markets: one per map base (`Map (Tier 16)`, `Nightmare Map`), corruption state,
 * identification, mod count band, delirium, league content suffixes, influence (Shaper, Elder, an
 * Elder Guardian or the Originator's Memories, and apart from it a Conqueror's Citadel) and, on
 * tier 16 and Nightmare maps, Atlas Drops band. Blighted and Blight-ravaged maps share the tier's
 * base type and are not tracked.
 */
export const MAP_MOD_BANDS = ["1-6", "8"] as const;
export const MAP_MOD_LABELS = ["1–6 mods", "8 mods"] as const;
/** Atlas Drops replaced Item Quantity in 3.30: rare tier 16 maps show about 50–90%. */
export const MAP_ATLAS_DROPS_BANDS = ["0-39", "40-59", "60-79", "80-99", "100-119", "120"] as const;
export const MAP_ATLAS_DROPS_LABELS = [
    "0–39%",
    "40–59%",
    "60–79%",
    "80–99%",
    "100–119%",
    "120%+",
] as const;
/** How Delirious a Delirium Orb makes a map's players, to the nearest 20%, up to 100%. */
export const MAP_DELIRIUM_BANDS = ["0", "20", "40", "60", "80", "100"] as const;
export const MAP_DELIRIUM_LABELS = ["0%", "20%", "40%", "60%", "80%", "100%"] as const;
export type MapModBand = (typeof MAP_MOD_BANDS)[number];
export type MapAtlasDropsBand = (typeof MAP_ATLAS_DROPS_BANDS)[number];
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

/** Only tier 16 and Nightmare maps trade by Atlas Drops. */
export function mapHasAtlasDropsBands(baseType: string) {
    return baseType === NIGHTMARE_MAP || TIER_MAP.exec(baseType)?.[1] === "16";
}

/** Normal maps (no mods) trade with magic and rare ones up to 6 mods; 7 or more trade as 8. */
export function mapModBand(mods: number): MapModBand {
    return mods <= 6 ? "1-6" : "8";
}

export function mapAtlasDropsBand(atlasDrops: number): MapAtlasDropsBand {
    if (atlasDrops < 40) return "0-39";
    return MAP_ATLAS_DROPS_BANDS[Math.min(Math.floor((atlasDrops - 20) / 20), 5)]!;
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
 * Lines a map mod adds to the item's properties (Item Quantity, Atlas Drops, Item Rarity, Monster
 * Pack Size, More Maps/Scarabs/Threads/Currency) rather than to its mod list.
 */
export function isHiddenMapModLine(line: string) {
    return /(?:Quantity|Rarity) of Items found in this Area$|Atlas Drops\] in this Area$|increased Pack size$|more (?:Maps|Scarabs|\[Thread\|Threads\]|Currency) found in Area$/.test(
        line,
    );
}

/** Templates of the map mods that show more than one line, from `vp run game-data:maps`. */
const multiLineMods = new Map<string, string[][]>();
for (const lines of mapLists.multiLineMods)
    for (const line of new Set(lines))
        multiLineMods.set(line, [...(multiLineMods.get(line) ?? []), lines]);

/**
 * How many mods a map's explicit lines come from, for maps whose affix count the API does not give.
 * Several map mods show two or more lines (a Power Charge mod shows its maximum charges and its
 * charge on hit), so lines are matched to the multi-line mods of the game data, taking the fewest
 * mods that explain every line; any other line is one mod. Two single-line mods that happen to
 * match one multi-line mod count as one.
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

/** League content a rare map's suffixes can add since 3.30, in the order a value names them. */
export const MAP_CONTENTS = [
    "delirium-mirror",
    "mirage",
    "wildwood",
    "apex-sentinel",
    "pandemonium-sentinel",
    "stalker-sentinel",
    "evocator-beidat",
    "evocator-ktash",
    "evocator-ghorr",
] as const;
export const MAP_CONTENT_LABELS = [
    "Mirror of Delirium",
    "Mirage",
    "Viridian Wildwood",
    "Apex Sentinel",
    "Pandemonium Sentinel",
    "Stalker Sentinel",
    "Evocator of Beidat",
    "Evocator of K'Tash",
    "Evocator of Ghorr",
] as const;
export type MapContent = (typeof MAP_CONTENTS)[number];
/** The content filter's bands: each content, and `none` for maps without any. */
export const MAP_CONTENT_BANDS = ["none", ...MAP_CONTENTS] as const;
export const MAP_CONTENT_BAND_LABELS = ["None", ...MAP_CONTENT_LABELS] as const;
export type MapContentBand = (typeof MAP_CONTENT_BANDS)[number];

/** The suffix adding each content, without its markup (`[Mirage]` shows as `Mirage`). */
const MAP_CONTENT_MODS: Record<string, MapContent> = {
    "Area contains a Mirror of Delirium": "delirium-mirror",
    "Area contains a Mirage": "mirage",
    "Area contains the Viridian Wildwood": "wildwood",
    "Area contains a buried Apex Sentinel": "apex-sentinel",
    "Area contains a buried Pandemonium Sentinel": "pandemonium-sentinel",
    "Area contains a buried Stalker Sentinel": "stalker-sentinel",
    "Area contains an Evocator of Beidat": "evocator-beidat",
    "Area contains an Evocator of K'Tash": "evocator-ktash",
    "Area contains an Evocator of Ghorr": "evocator-ghorr",
};

/** Game text markup: `[EvocatorKTash|Evocator of K'Tash]` shows as `Evocator of K'Tash`. */
function withoutMarkup(line: string) {
    return line.replace(/\[(?:[^\]|]*\|)?([^\]]*)\]/g, "$1");
}

/** The league content a map's explicit mods add, in `MAP_CONTENTS` order. */
export function mapContents(explicitMods: readonly string[]): MapContent[] {
    const found = new Set(explicitMods.map((mod) => MAP_CONTENT_MODS[withoutMarkup(mod)]));
    return MAP_CONTENTS.filter((content) => found.has(content));
}

/** A map's influences, in the order a value names them. */
export const MAP_INFLUENCES = ["shaper", "elder", "elder-guardian", "memory", "citadel"] as const;
export const MAP_INFLUENCE_LABELS = [
    "Shaper",
    "Elder",
    "Elder Guardian",
    "Memory",
    "Citadel",
] as const;
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
/** Maps holding any Conqueror's Citadel trade as one market, apart from their other influence. */
const CONQUEROR_CITADEL = /^Map contains (?:Al-Hezmin|Baran|Drox|Veritania)'s Citadel$/;

/**
 * A map's influences, in `MAP_INFLUENCES` order: at most one of Shaper, Elder, Elder Guardian or
 * Memory, and Citadel alongside it, so `Memory`, `Citadel` and `Memory · Citadel` are three markets.
 */
export function mapInfluences(implicitMods: readonly string[]): MapInfluence[] {
    const influence = implicitMods.some((mod) => ELDER_GUARDIAN.test(mod))
        ? "elder-guardian"
        : implicitMods.map((mod) => MAP_INFLUENCE_IMPLICITS[mod]).find(Boolean);
    const citadel = implicitMods.some((mod) => CONQUEROR_CITADEL.test(mod));
    return [...(influence ? [influence] : []), ...(citadel ? ["citadel" as const] : [])];
}

export type MapVariant = {
    identified: boolean;
    mods?: MapModBand;
    atlasDrops?: MapAtlasDropsBand;
    delirium: MapDeliriumBand;
    contents?: readonly MapContent[];
    influences?: readonly MapInfluence[];
};

/** Between a map value's parts; the SQL filter wraps a value in it to test whole parts. */
export const MAP_VALUE_SEPARATOR = " · ";
const label = <Band extends string>(
    bands: readonly Band[],
    labels: readonly string[],
    band: Band,
) => labels[bands.indexOf(band)]!;

/**
 * The market's `signatureValue`, e.g. `8 mods · Atlas Drops 100–119% · Delirium 40%`,
 * `Unidentified · Delirium 0%` (an unidentified map shows neither its mods nor its Atlas Drops),
 * `1–6 mods · Delirium 0% · Mirage · Apex Sentinel` for a map with league content, or
 * `1–6 mods · Delirium 0% · Memory · Citadel` for an influenced map. Each part stands alone
 * between separators, so a filter can test for one.
 */
export function mapVariantValue(variant: MapVariant) {
    const { identified, mods, atlasDrops, delirium, contents = [], influences = [] } = variant;
    return [
        identified && mods ? label(MAP_MOD_BANDS, MAP_MOD_LABELS, mods) : "Unidentified",
        identified && atlasDrops
            ? [`Atlas Drops ${label(MAP_ATLAS_DROPS_BANDS, MAP_ATLAS_DROPS_LABELS, atlasDrops)}`]
            : [],
        `Delirium ${label(MAP_DELIRIUM_BANDS, MAP_DELIRIUM_LABELS, delirium)}`,
        MAP_CONTENTS.filter((content) => contents.includes(content)).map((content) =>
            label(MAP_CONTENTS, MAP_CONTENT_LABELS, content),
        ),
        MAP_INFLUENCES.filter((influence) => influences.includes(influence)).map((influence) =>
            label(MAP_INFLUENCES, MAP_INFLUENCE_LABELS, influence),
        ),
    ]
        .flat()
        .join(MAP_VALUE_SEPARATOR);
}

/** The fields of a `mapVariantValue`, or undefined when `value` is not one. */
export function parseMapVariantValue(value: string) {
    const parts = value.split(MAP_VALUE_SEPARATOR);
    const after = (prefix: string) =>
        parts.find((part) => part.startsWith(prefix))?.slice(prefix.length) ?? "";
    const band = <Band extends string>(
        bands: readonly Band[],
        labels: readonly string[],
        text = "",
    ) => bands[labels.indexOf(text)];
    const delirium = band(MAP_DELIRIUM_BANDS, MAP_DELIRIUM_LABELS, after("Delirium "));
    if (!delirium) return undefined;
    const variant = {
        identified: parts[0] !== "Unidentified",
        mods: band(MAP_MOD_BANDS, MAP_MOD_LABELS, parts[0]),
        atlasDrops: band(MAP_ATLAS_DROPS_BANDS, MAP_ATLAS_DROPS_LABELS, after("Atlas Drops ")),
        delirium,
        contents: MAP_CONTENTS.filter((_, index) => parts.includes(MAP_CONTENT_LABELS[index]!)),
        influences: MAP_INFLUENCES.filter((_, index) =>
            parts.includes(MAP_INFLUENCE_LABELS[index]!),
        ),
    };
    return mapVariantValue(variant) === value ? variant : undefined;
}

export type MapFilters = {
    mapMods: string;
    mapAtlasDrops: string;
    mapDelirium: string;
    mapContent: string;
    mapInfluence: string;
};

/**
 * A test of a map value's parts: it passes when the value shows one of `anyOf`, or, with
 * `noneOf`, when it shows none of those.
 */
export type MapValueCondition = { anyOf: readonly string[]; noneOf?: readonly string[] };

/**
 * A single-valued part's condition: the value shows the part of an allowed band, the included
 * bands (every band when none are) less the excluded ones.
 */
function bandCondition<Band extends string>(
    value: string,
    bands: readonly Band[],
    parts: readonly string[],
): MapValueCondition[] {
    if (!value) return [];
    const filter = parseGemBandFilter(value, bands);
    const allowed = filter
        ? bands.filter(
              (band) =>
                  (!filter.include.size || filter.include.has(band)) && !filter.exclude.has(band),
          )
        : [];
    return [{ anyOf: allowed.map((band) => parts[bands.indexOf(band)]!) }];
}

/**
 * A part a map can show several of (content, influence): the map shows any of the included ones
 * (`none`: none at all) and none of the excluded ones (`none`: at least one).
 */
function setConditions<Name extends string>(
    value: string,
    names: readonly Name[],
    labels: readonly string[],
): MapValueCondition[] {
    if (!value) return [];
    const filter = parseGemBandFilter(value, ["none", ...names] as const);
    if (!filter) return [{ anyOf: [] }];
    const parts = (bands: ReadonlySet<string>) =>
        names.filter((name) => bands.has(name)).map((name) => label(names, labels, name));
    const excluded = parts(filter.exclude);
    return [
        ...(filter.include.size
            ? [
                  {
                      anyOf: parts(filter.include),
                      ...(filter.include.has("none") ? { noneOf: labels } : {}),
                  },
              ]
            : []),
        ...(filter.exclude.has("none") ? [{ anyOf: labels }] : []),
        ...(excluded.length ? [{ anyOf: [], noneOf: excluded }] : []),
    ];
}

/**
 * What mod count, Atlas Drops, delirium, content and influence band filters ask of a map's
 * `signatureValue`, or undefined when none is set; a value passes when it meets every condition.
 * Mod count and Atlas Drops filters drop unidentified maps, which show neither; an Atlas Drops
 * filter also drops maps below tier 16, which have no Atlas Drops band.
 */
export function mapVariantConditions(filters: MapFilters): MapValueCondition[] | undefined {
    const { mapMods, mapAtlasDrops, mapDelirium, mapContent, mapInfluence } = filters;
    if (!mapMods && !mapAtlasDrops && !mapDelirium && !mapContent && !mapInfluence)
        return undefined;
    const prefixed = (prefix: string, labels: readonly string[]) =>
        labels.map((text) => `${prefix}${text}`);
    return [
        ...bandCondition(filters.mapMods, MAP_MOD_BANDS, MAP_MOD_LABELS),
        ...bandCondition(
            filters.mapAtlasDrops,
            MAP_ATLAS_DROPS_BANDS,
            prefixed("Atlas Drops ", MAP_ATLAS_DROPS_LABELS),
        ),
        ...bandCondition(
            filters.mapDelirium,
            MAP_DELIRIUM_BANDS,
            prefixed("Delirium ", MAP_DELIRIUM_LABELS),
        ),
        ...setConditions(filters.mapContent, MAP_CONTENTS, MAP_CONTENT_LABELS),
        ...setConditions(filters.mapInfluence, MAP_INFLUENCES, MAP_INFLUENCE_LABELS),
    ];
}

/** Whether a map `signatureValue` meets every condition of `mapVariantConditions`. */
export function mapValueMeets(value: string, conditions: readonly MapValueCondition[]) {
    const parts = new Set(value.split(MAP_VALUE_SEPARATOR));
    return conditions.every(
        ({ anyOf, noneOf }) =>
            anyOf.some((part) => parts.has(part)) ||
            (noneOf !== undefined && !noneOf.some((part) => parts.has(part))),
    );
}

import transfiguredGems from "../data/transfigured-gems-poe1.json" with { type: "json" };

/**
 * PoE 1 skill gem markets: one per gem, level band, quality band and corruption state. A gem's
 * level bands are below its maximum level, its maximum, and above it (corrupted); band tokens are
 * named after a normal gem's levels.
 */
export const GEM_LEVEL_BANDS = ["1-19", "20", "21"] as const;
export const GEM_QUALITY_BANDS = ["0-19", "20", "21-23"] as const;
export type GemLevelBand = (typeof GEM_LEVEL_BANDS)[number];
export type GemQualityBand = (typeof GEM_QUALITY_BANDS)[number];

export const GEM_TIERS = {
    normal: { label: "Normal", maxLevel: 20, levels: ["1–19", "20", "21"] },
    exceptional: { label: "Exceptional", maxLevel: 3, levels: ["1–2", "3", "4"] },
    /** Awakened Empower, Enhance and Enlighten. */
    "awakened-exceptional": {
        label: "Awakened exceptional",
        maxLevel: 4,
        levels: ["1–3", "4", "5"],
    },
    awakened: { label: "Awakened", maxLevel: 5, levels: ["1–4", "5", "6"] },
} as const;
export type GemTier = keyof typeof GEM_TIERS;

export const GEM_QUALITY_LABELS = ["0–19%", "20%", "21–23%"] as const;

/**
 * Transfigured gems' market keys, from the trade site (`vp run game-data:transfigured-gems`):
 * `Kinetic Bolt of Fragmentation`, or `Vaal Arc (Arc of Surging)` for a Vaal gem whose skill is
 * transfigured. Regenerate when a league adds transfigured gems.
 */
export const TRANSFIGURED_GEMS: readonly string[] = Object.keys(transfiguredGems.gems);
const transfigured = new Set(TRANSFIGURED_GEMS);

/**
 * A gem's market key: its type line, which names a transfigured gem apart from its base gem, or
 * for a Vaal gem whose skill is transfigured, the type line with that skill as the trade site
 * names it, since the Vaal gem's type line is its base gem's.
 */
export function gemMarketKey(gem: { typeLine: string; hybridName?: string }) {
    const vaal = gem.hybridName ? `${gem.typeLine} (${gem.hybridName})` : undefined;
    return vaal && transfigured.has(vaal) ? vaal : gem.typeLine;
}

/** Exceptional gems carry the Exceptional gem tag; awakened gems are named for it. */
export function gemTier(gem: { name: string; tags: readonly string[] }): GemTier {
    const exceptional = gem.tags.includes("Exceptional");
    if (gem.name.startsWith("Awakened ")) return exceptional ? "awakened-exceptional" : "awakened";
    return exceptional ? "exceptional" : "normal";
}

function band(value: number, max: number) {
    return value < max ? 0 : value === max ? 1 : 2;
}

export function gemLevelBand(level: number, tier: GemTier): GemLevelBand {
    return GEM_LEVEL_BANDS[band(level, GEM_TIERS[tier].maxLevel)];
}

export function gemQualityBand(quality: number): GemQualityBand {
    return GEM_QUALITY_BANDS[band(quality, 20)];
}

/**
 * The market's `signatureValue`, e.g. `Level 1–19 · Quality 20%`, or `Level 3 (max) · …` for an
 * exceptional gem. Marking the max band keeps each tier's bands apart: an exceptional gem's
 * corrupted level 4 is not an awakened exceptional gem's max level 4.
 */
export function gemVariantValue(tier: GemTier, level: GemLevelBand, quality: GemQualityBand) {
    const levelLabel = GEM_TIERS[tier].levels[GEM_LEVEL_BANDS.indexOf(level)];
    const max = level === "20" ? " (max)" : "";
    return `Level ${levelLabel}${max} · Quality ${GEM_QUALITY_LABELS[GEM_QUALITY_BANDS.indexOf(quality)]}`;
}

export type GemBandState = "include" | "exclude";

/**
 * A tri-state band filter in a URL: comma-separated band tokens to include, each prefixed with `-`
 * to exclude instead, e.g. `20,-21`. Unlisted bands are neither.
 */
export function parseGemBandFilter<Band extends string>(value: string, bands: readonly Band[]) {
    const include = new Set<Band>();
    const exclude = new Set<Band>();
    for (const token of value.split(",").filter(Boolean)) {
        const excluded = token.startsWith("-");
        const name = (excluded ? token.slice(1) : token) as Band;
        if (!bands.includes(name)) return null;
        (excluded ? exclude : include).add(name);
    }
    return { include, exclude };
}

export function formatGemBandFilter<Band extends string>(
    states: Partial<Record<Band, GemBandState>>,
) {
    return Object.entries(states)
        .flatMap(([name, state]) =>
            state === "include" ? [name] : state === "exclude" ? [`-${name}`] : [],
        )
        .join(",");
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
 * Every gem `signatureValue` passing level and quality band filters, across gem tiers, or
 * undefined when neither filter is set.
 */
export function gemVariantValues(filters: { gemLevel: string; gemQuality: string }) {
    if (!filters.gemLevel && !filters.gemQuality) return undefined;
    const levels = allowedBands(filters.gemLevel, GEM_LEVEL_BANDS);
    const qualities = allowedBands(filters.gemQuality, GEM_QUALITY_BANDS);
    return (Object.keys(GEM_TIERS) as GemTier[]).flatMap((tier) =>
        levels.flatMap((level) =>
            qualities.map((quality) => gemVariantValue(tier, level, quality)),
        ),
    );
}

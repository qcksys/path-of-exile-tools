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
    normal: { maxLevel: 20, levels: ["1–19", "20", "21"] },
    exceptional: { maxLevel: 3, levels: ["1–2", "3", "4"] },
    awakened: { maxLevel: 5, levels: ["1–4", "5", "6"] },
} as const;
export type GemTier = keyof typeof GEM_TIERS;

export const GEM_QUALITY_LABELS = ["0–19%", "20%", "21–23%"] as const;
const EXCEPTIONAL = new Set(["Empower Support", "Enlighten Support", "Enhance Support"]);

export function gemTier(name: string): GemTier {
    if (name.startsWith("Awakened ")) return "awakened";
    return EXCEPTIONAL.has(name) ? "exceptional" : "normal";
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

/** The market's `signatureValue`, e.g. `Level 1–19 · Quality 20%`, or `Level 3 · …` for Empower. */
export function gemVariantValue(tier: GemTier, level: GemLevelBand, quality: GemQualityBand) {
    const levelLabel = GEM_TIERS[tier].levels[GEM_LEVEL_BANDS.indexOf(level)];
    return `Level ${levelLabel} · Quality ${GEM_QUALITY_LABELS[GEM_QUALITY_BANDS.indexOf(quality)]}`;
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

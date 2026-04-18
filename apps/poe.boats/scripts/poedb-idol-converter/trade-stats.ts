import type { ModifierData, UniqueIdol } from "./types.ts";

const TRADE_STATS_API_URL = "https://www.pathofexile.com/api/trade/data/stats";

interface TradeStatEntry {
    id: string;
    text: string;
    type: string;
}

interface TradeStatCategory {
    id: string;
    label: string;
    entries: TradeStatEntry[];
}

interface TradeStatsData {
    result: TradeStatCategory[];
}

interface TradeStatMapping {
    normalizedText: string;
    statId: string;
    originalText: string;
}

export interface TradeStatResult {
    matchedCount: number;
    unmatchedCount: number;
    unmatchedModifiers: string[];
}

const DIRECTION_CANONICALIZATION: [RegExp, string][] = [
    [/\breduced\b/gi, "increased"],
    [/\bless\b/gi, "more"],
    [/\bslower\b/gi, "faster"],
    [/\bfewer\b/gi, "additional"],
];

// Manual text overrides for mods where idol text differs from trade API text
// Format: [idol pattern after normalization, trade API pattern to search for]
const TEXT_OVERRIDES: [RegExp, string][] = [
    // "# additional Strongbox" -> "# additional Strongboxes" (trade API uses # plural)
    [/^Your Maps contain # additional Strongbox$/i, "Your Maps contain # additional Strongboxes"],
    // "# additional Shrine" -> "an additional Shrine" (trade API uses singular)
    [/^Your Maps contain # additional Shrine$/i, "Your Maps contain an additional Shrine"],
    // "# additional Harbinger" -> "an additional Harbinger" (trade API uses singular)
    [/^Your Maps contain # additional Harbinger$/i, "Your Maps contain an additional Harbinger"],
    // "# additional Imprisoned Monster" -> "an additional Imprisoned Monster" (trade API uses singular)
    [
        /^Your Maps contain # additional Imprisoned Monster$/i,
        "Your Maps contain an additional Imprisoned Monster",
    ],
    // "# additional Tormented Spirit" -> "an additional Tormented Spirit" (trade API uses singular)
    [
        /^Your Maps are haunted by # additional Tormented Spirit$/i,
        "Your Maps are haunted by an additional Tormented Spirit",
    ],
    // Plural vs singular: "Sergeants" -> "Sergeant"
    [
        /^Legion Encounters in your Maps contain # additional Sergeants$/i,
        "Legion Encounters in your Maps contain # additional Sergeant",
    ],
    // Blight Chests: "# Blight Chests in your Maps" -> "# Blight Chests" (no "in your Maps" for range version)
    [
        /^Varieties of Items contained in # Blight Chests in your Maps are Lucky$/i,
        "Varieties of Items contained in # Blight Chests are Lucky",
    ],
    // Guaranteed vs chance: "contains Doomed Spirits" -> "#% chance to contain Doomed Spirits"
    [
        /^Voltaxic Sulphite Veins and Chests found in your Maps contains Doomed Spirits$/i,
        "Voltaxic Sulphite Veins and Chests found in your Maps have #% chance to contain Doomed Spirits",
    ],
    // Unique: Maven guaranteed -> chance (idol has comma "Stakes,", trade API doesn't)
    // Use trade API format with newlines - normalizeModText will handle conversion
    [
        /^The Maven casts Up the Stakes,? summoning/i,
        "The Maven has a 100% chance to cast Up the Stakes summoning 1 to 3 additional Atlas Bosses\nwhen Witnessing Map Bosses\nThe number of additional Bosses summoned is higher if there\nare fewer monsters remaining in the Map\nModifiers to the Final Map Boss in each Map also apply to these summoned Bosses",
    ],
    // Chance-based mods -> guaranteed versions (trade API only has guaranteed)
    [
        /^Essences found in your Maps have #% chance to be a tier higher$/i,
        "Essences found in your Maps are a tier higher",
    ],
    [
        /^#% chance for Ore Deposits in your Maps to be replaced by Lost Shipments$/i,
        "Ore Deposits in your Maps are replaced by Lost Shipments",
    ],
    // "increased chance" -> "+#% chance" (different wording, same stat)
    [
        /^Your Maps have #% increased chance to contain Ore Deposits$/i,
        "Your Maps have +#% chance to contain Ore Deposits",
    ],
];

export function normalizeModText(text: string): string {
    let normalized = text
        .replace(/(\+)?(\(?[\d.]+(?:—[\d.]+)?\)?)(%)?/g, (_match, plus, _num, percent) => {
            return `${plus || ""}#${percent || ""}`;
        })
        .replace(/\s+/g, " ")
        .replace(/\n/g, " ")
        .trim();

    for (const [pattern, replacement] of DIRECTION_CANONICALIZATION) {
        normalized = normalized.replace(pattern, replacement);
    }

    return normalized;
}

async function fetchTradeStats(): Promise<TradeStatsData | null> {
    console.log(`  Fetching trade stats from POE API...`);
    try {
        const response = await fetch(TRADE_STATS_API_URL, {
            headers: {
                "User-Agent": "poe-idol-planner/1.0",
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            console.warn(
                `  Failed to fetch trade stats: ${response.status} ${response.statusText}`,
            );
            return null;
        }

        const data = (await response.json()) as TradeStatsData;
        console.log(`  Fetched ${data.result.length} stat categories`);
        return data;
    } catch (error) {
        console.warn(
            `  Error fetching trade stats:`,
            error instanceof Error ? error.message : error,
        );
        return null;
    }
}

// Unique idol mods that should use implicit stat IDs instead of explicit
// "increased Maps found in Area" is a base implicit on all idols (2% per cell)
// The prefix mod with the same text is explicit, so this only applies to unique idols
const UNIQUE_IMPLICIT_OVERRIDES = ["#% increased Maps found in Area"];

function buildTradeStatIndex(
    data: TradeStatsData,
    forUniqueIdols = false,
): Map<string, TradeStatMapping> {
    const index = new Map<string, TradeStatMapping>();
    const implicitOverrides = new Map<string, TradeStatMapping>();

    for (const category of data.result) {
        if (category.id !== "explicit" && category.id !== "implicit") {
            continue;
        }

        for (const entry of category.entries) {
            const normalized = normalizeModText(entry.text);

            // For unique idols, collect implicit overrides
            if (forUniqueIdols && category.id === "implicit") {
                for (const pattern of UNIQUE_IMPLICIT_OVERRIDES) {
                    if (normalizeModText(pattern) === normalized) {
                        implicitOverrides.set(normalized, {
                            normalizedText: normalized,
                            statId: entry.id,
                            originalText: entry.text,
                        });
                    }
                }
            }

            if (!index.has(normalized)) {
                index.set(normalized, {
                    normalizedText: normalized,
                    statId: entry.id,
                    originalText: entry.text,
                });
            }
        }
    }

    // Apply overrides only for unique idol index
    if (forUniqueIdols) {
        // Apply implicit overrides
        for (const [key, mapping] of implicitOverrides) {
            index.set(key, mapping);
        }
    }

    return index;
}

function applyTextOverrides(normalized: string): string {
    for (const [pattern, replacement] of TEXT_OVERRIDES) {
        if (pattern.test(normalized)) {
            return normalizeModText(replacement);
        }
    }
    return normalized;
}

function findBestMatch(
    modText: string,
    index: Map<string, TradeStatMapping>,
): TradeStatMapping | null {
    const normalized = normalizeModText(modText);

    // Check for exact match first
    if (index.has(normalized)) {
        return index.get(normalized) || null;
    }

    // Try text overrides for known mismatches
    const overridden = applyTextOverrides(normalized);
    if (overridden !== normalized && index.has(overridden)) {
        return index.get(overridden) || null;
    }

    // Fuzzy word matching as fallback
    const modWords = normalized.toLowerCase().split(" ");
    let bestMatch: TradeStatMapping | null = null;
    let bestScore = 0;

    for (const [key, mapping] of index) {
        const keyWords = key.toLowerCase().split(" ");

        let matchCount = 0;
        for (const word of modWords) {
            if (word.length > 2 && keyWords.includes(word)) {
                matchCount++;
            }
        }

        const score = matchCount / Math.max(modWords.length, keyWords.length);

        if (score > bestScore && score > 0.7) {
            bestScore = score;
            bestMatch = mapping;
        }
    }

    return bestMatch;
}

export interface UniqueStatResult {
    matchedCount: number;
    unmatchedCount: number;
    unmatchedMods: string[];
}

export async function applyTradeStatMappings(
    modifiers: ModifierData[],
    uniqueIdols: UniqueIdol[],
): Promise<{ regular: TradeStatResult; unique: UniqueStatResult }> {
    const tradeStats = await fetchTradeStats();
    if (!tradeStats) {
        return {
            regular: {
                matchedCount: 0,
                unmatchedCount: 0,
                unmatchedModifiers: [],
            },
            unique: { matchedCount: 0, unmatchedCount: 0, unmatchedMods: [] },
        };
    }

    console.log("  Building trade stat indices...");
    const regularIndex = buildTradeStatIndex(tradeStats, false);
    const uniqueIndex = buildTradeStatIndex(tradeStats, true);
    console.log(`  Regular mod index size: ${regularIndex.size} entries`);
    console.log(`  Unique idol index size: ${uniqueIndex.size} entries`);

    // Map regular modifiers (use explicit stats)
    const unmatchedModifiers: string[] = [];
    let matchedCount = 0;
    let unmatchedCount = 0;
    const seenTexts = new Set<string>();

    for (const mod of modifiers) {
        for (const tier of mod.tiers) {
            const englishText = tier.text.en;
            if (!englishText) continue;

            const match = findBestMatch(englishText, regularIndex);

            if (match) {
                tier.tradeStatId = match.statId;
                if (!seenTexts.has(englishText)) {
                    matchedCount++;
                    seenTexts.add(englishText);
                }
            } else {
                if (!seenTexts.has(englishText)) {
                    unmatchedModifiers.push(englishText);
                    unmatchedCount++;
                    seenTexts.add(englishText);
                }
            }
        }
    }

    console.log(`  Matched modifiers: ${matchedCount}`);
    console.log(`  Unmatched modifiers: ${unmatchedCount}`);

    // Map unique idol modifiers (with implicit overrides for base stats)
    console.log("  Mapping unique idol modifiers...");
    const unmatchedUniqueMods: string[] = [];
    let uniqueMatchedCount = 0;
    let uniqueUnmatchedCount = 0;
    const seenUniqueMods = new Set<string>();

    for (const idol of uniqueIdols) {
        for (const mod of idol.modifiers) {
            const englishText = mod.text.en;
            if (!englishText) continue;

            const match = findBestMatch(englishText, uniqueIndex);

            if (match) {
                mod.tradeStatId = match.statId;
                if (!seenUniqueMods.has(englishText)) {
                    uniqueMatchedCount++;
                    seenUniqueMods.add(englishText);
                }
            } else {
                if (!seenUniqueMods.has(englishText)) {
                    unmatchedUniqueMods.push(englishText);
                    uniqueUnmatchedCount++;
                    seenUniqueMods.add(englishText);
                }
            }
        }
    }

    console.log(`  Matched unique mods: ${uniqueMatchedCount}`);
    console.log(`  Unmatched unique mods: ${uniqueUnmatchedCount}`);

    return {
        regular: {
            matchedCount,
            unmatchedCount,
            unmatchedModifiers:
                unmatchedModifiers.length > 10
                    ? [
                          ...unmatchedModifiers.slice(0, 10),
                          `... and ${unmatchedModifiers.length - 10} more`,
                      ]
                    : unmatchedModifiers,
        },
        unique: {
            matchedCount: uniqueMatchedCount,
            unmatchedCount: uniqueUnmatchedCount,
            unmatchedMods:
                unmatchedUniqueMods.length > 10
                    ? [
                          ...unmatchedUniqueMods.slice(0, 10),
                          `... and ${unmatchedUniqueMods.length - 10} more`,
                      ]
                    : unmatchedUniqueMods,
        },
    };
}

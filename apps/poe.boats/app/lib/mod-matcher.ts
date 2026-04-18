import type { IdolBaseKey, LeagueMechanic } from "~/data/idol-bases";
import idolModifiers from "~/data/idol-modifiers.json";

export interface ModifierMatch {
    modId: string;
    tier: number;
    mechanic: LeagueMechanic;
    type: "prefix" | "suffix";
    confidence: number;
    valueRange?: { min: number; max: number };
}

interface ModifierDefinition {
    id: string;
    type: "prefix" | "suffix";
    name: { en: string };
    tiers: {
        tier: number;
        levelReq: number;
        text: { en: string };
        values: { min: number; max: number }[];
    }[];
    mechanic: string;
    applicableIdols: string[];
}

interface NormalizedModifier {
    modId: string;
    type: "prefix" | "suffix";
    mechanic: string;
    applicableIdols: string[];
    tiers: {
        tier: number;
        normalizedText: string;
        originalText: string;
        values: { min: number; max: number }[];
    }[];
}

let normalizedModifiersCache: NormalizedModifier[] | null = null;

/**
 * Normalizes modifier text by replacing numeric values with # placeholders.
 * This allows matching between imported text (with concrete values) and
 * modifier definitions (with range patterns).
 *
 * Strategy: Replace numbers but preserve surrounding context like +, -, %
 */
export function normalizeModText(text: string): string {
    return (
        text
            // Handle value with range: 65(45-70) or 65(45—70) -> #
            .replace(/\d+\s*\(\d+[-–—]\d+\)/g, "#")
            // Handle range only in parens: (45-70) or (45—70) -> #
            .replace(/\(\d+[-–—]\d+\)/g, "#")
            // Handle decimal numbers: 1.5 -> # (but keep surrounding +/-/%)
            .replace(/(\d+\.\d+)/g, "#")
            // Handle integers: 65 -> # (but keep surrounding +/-/%)
            .replace(/(\d+)/g, "#")
            // Normalize whitespace
            .replace(/\s+/g, " ")
            .trim()
    );
}

/**
 * Pre-processes all modifier definitions for efficient matching.
 * Called once and cached.
 */
function getNormalizedModifiers(): NormalizedModifier[] {
    if (normalizedModifiersCache) {
        return normalizedModifiersCache;
    }

    normalizedModifiersCache = (idolModifiers as ModifierDefinition[]).map((mod) => ({
        modId: mod.id,
        type: mod.type as "prefix" | "suffix",
        mechanic: mod.mechanic,
        applicableIdols: mod.applicableIdols,
        tiers: mod.tiers.map((tier) => ({
            tier: tier.tier,
            normalizedText: normalizeModText(tier.text.en || ""),
            originalText: tier.text.en || "",
            values: tier.values || [],
        })),
    }));

    return normalizedModifiersCache;
}

/**
 * Finds the best tier match based on the rolled value.
 */
function findBestTierByValue(
    tiers: NormalizedModifier["tiers"],
    rolledValue: number,
): { tier: number; values: { min: number; max: number }[] } | null {
    // First, try to find a tier where the value fits within the range
    for (const tier of tiers) {
        if (tier.values.length > 0) {
            const range = tier.values[0];
            if (rolledValue >= range.min && rolledValue <= range.max) {
                return { tier: tier.tier, values: tier.values };
            }
        }
    }

    // If no exact match, find the closest tier
    let closestTier = tiers[0];
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const tier of tiers) {
        if (tier.values.length > 0) {
            const range = tier.values[0];
            const midpoint = (range.min + range.max) / 2;
            const distance = Math.abs(rolledValue - midpoint);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestTier = tier;
            }
        }
    }

    return closestTier ? { tier: closestTier.tier, values: closestTier.values } : null;
}

/**
 * Matches parsed modifier text against known modifier definitions.
 *
 * @param parsedText - The modifier text from the imported idol
 * @param rolledValue - The numeric value extracted from the modifier
 * @param type - Optional prefix/suffix hint (from advanced format)
 * @param idolType - Optional idol type for filtering applicable modifiers
 * @returns The best matching modifier definition, or null if no match found
 */
export function matchModifierToDefinition(
    parsedText: string,
    rolledValue: number,
    type?: "prefix" | "suffix",
    idolType?: IdolBaseKey,
): ModifierMatch | null {
    const normalizedInput = normalizeModText(parsedText);
    const normalizedModifiers = getNormalizedModifiers();

    // Convert idol type to the format used in applicableIdols (e.g., "minor" -> "Minor")
    const idolTypeName = idolType ? idolType.charAt(0).toUpperCase() + idolType.slice(1) : null;

    let bestMatch: ModifierMatch | null = null;
    let bestScore = 0;

    for (const mod of normalizedModifiers) {
        // Filter by type if specified
        if (type && mod.type !== type) {
            continue;
        }

        // Check if any tier matches the normalized text
        for (const tier of mod.tiers) {
            if (tier.normalizedText === normalizedInput) {
                // Calculate match score
                let score = 100; // Base score for exact text match

                // Bonus for matching idol type
                if (idolTypeName && mod.applicableIdols.includes(idolTypeName)) {
                    score += 50;
                } else if (idolTypeName) {
                    // Penalty for non-matching idol type
                    score -= 25;
                }

                // Bonus for value within tier range
                if (tier.values.length > 0) {
                    const range = tier.values[0];
                    if (rolledValue >= range.min && rolledValue <= range.max) {
                        score += 25;
                    }
                }

                if (score > bestScore) {
                    bestScore = score;

                    // Find the best tier based on rolled value
                    const bestTier = findBestTierByValue(mod.tiers, rolledValue);

                    bestMatch = {
                        modId: mod.modId,
                        tier: bestTier?.tier ?? tier.tier,
                        mechanic: mod.mechanic as LeagueMechanic,
                        type: mod.type,
                        confidence: Math.min(score / 175, 1), // Normalize to 0-1
                        valueRange: bestTier?.values[0] ?? tier.values[0],
                    };
                }
            }
        }
    }

    return bestMatch;
}

/**
 * Clears the normalized modifiers cache.
 * Useful for testing or when modifier data changes.
 */
export function clearModifierCache(): void {
    normalizedModifiersCache = null;
}

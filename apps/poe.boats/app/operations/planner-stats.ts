import { IDOL_BASES, LEAGUE_MECHANICS } from "~/data/idol-bases";
import type { SupportedLocale } from "~/i18n/types";
import { getModMechanic, resolveModTextWithRange } from "~/lib/mod-text-resolver";
import type { IdolBaseKey, IdolModifier, LeagueMechanic } from "~/schemas/idol";
import type { IdolPlacement } from "~/schemas/idol-set";
import type { InventoryIdol } from "~/schemas/inventory";

interface IdolContribution {
    baseType: IdolBaseKey;
}

interface AggregatedStat {
    template: string;
    totalValue: number;
    mechanic: LeagueMechanic | undefined;
    hasPercent: boolean;
    contributions: IdolContribution[];
}

type IdolSizeGroup = "minor" | "small" | "medium" | "large";

function getIdolSizeGroup(baseType: IdolBaseKey): IdolSizeGroup {
    const base = IDOL_BASES[baseType];
    const cells = base.width * base.height;
    if (cells === 1) return "minor";
    if (cells === 2) return "small";
    if (cells === 3) return "medium";
    return "large";
}

type SizeGroupNameKey = "sizeGroupMinor" | "sizeGroupSmall" | "sizeGroupMedium" | "sizeGroupLarge";

const SIZE_GROUP_NAME_KEYS: Record<IdolSizeGroup, SizeGroupNameKey> = {
    minor: "sizeGroupMinor",
    small: "sizeGroupSmall",
    medium: "sizeGroupMedium",
    large: "sizeGroupLarge",
};

const SIZE_GROUP_FALLBACKS: Record<IdolSizeGroup, string> = {
    minor: "Minor",
    small: "Kamasan/Noble",
    medium: "Totemic/Burial",
    large: "Conqueror",
};

export function formatContributions(
    contributions: IdolContribution[],
    idolTranslations?: Record<string, string>,
): string {
    const counts: Record<IdolSizeGroup, number> = {
        minor: 0,
        small: 0,
        medium: 0,
        large: 0,
    };

    for (const c of contributions) {
        counts[getIdolSizeGroup(c.baseType)]++;
    }

    const parts: string[] = [];
    for (const [group, count] of Object.entries(counts)) {
        if (count > 0) {
            const key = SIZE_GROUP_NAME_KEYS[group as IdolSizeGroup];
            const name = idolTranslations?.[key] || SIZE_GROUP_FALLBACKS[group as IdolSizeGroup];
            parts.push(`${count}x ${name}`);
        }
    }

    return parts.join(", ");
}

export interface StatsByMechanic {
    mechanic: LeagueMechanic;
    stats: AggregatedStat[];
}

export interface UniqueIdolStat {
    text: string;
    baseType: IdolBaseKey;
}

// Create a template by replacing the rolled value with a placeholder
function createTemplate(
    text: string,
    rolledValue: number,
): {
    template: string;
    hasPercent: boolean;
} {
    // First, try to match range format like (10—8)% or (15—25)% (using em-dash or regular dash)
    // The range format is (min—max) where rolled value falls within
    const rangePattern = /\((\d+(?:\.\d+)?)[—\-–](\d+(?:\.\d+)?)\)(%?)/g;
    let rangeMatch: RegExpExecArray | null;
    let bestRangeMatch: {
        match: string;
        index: number;
        hasPercent: boolean;
    } | null = null;

    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec pattern
    while ((rangeMatch = rangePattern.exec(text)) !== null) {
        const num1 = Number.parseFloat(rangeMatch[1]);
        const num2 = Number.parseFloat(rangeMatch[2]);
        const min = Math.min(num1, num2);
        const max = Math.max(num1, num2);
        // Check if rolled value is within or close to this range
        if (rolledValue >= min - 1 && rolledValue <= max + 1) {
            bestRangeMatch = {
                match: rangeMatch[0],
                index: rangeMatch.index,
                hasPercent: rangeMatch[3] === "%",
            };
            break;
        }
    }

    if (bestRangeMatch) {
        const template =
            text.substring(0, bestRangeMatch.index) +
            "{value}" +
            (bestRangeMatch.hasPercent ? "" : "") +
            text.substring(bestRangeMatch.index + bestRangeMatch.match.length);
        return { template, hasPercent: bestRangeMatch.hasPercent };
    }

    // Try to match the specific rolled value (with optional % suffix)
    const valueStr = Number.isInteger(rolledValue) ? String(rolledValue) : rolledValue.toFixed(1);

    // Try to match the exact value with optional %
    const exactPattern = new RegExp(`(${valueStr.replace(".", "\\.")}%?)`);
    const exactMatch = text.match(exactPattern);

    if (exactMatch) {
        const hasPercent = exactMatch[1].includes("%");
        const template = text.replace(exactPattern, "{value}");
        return { template, hasPercent };
    }

    // Fallback: find the first number that could be the value
    // Look for numbers that are close to the rolled value (within the value range)
    const numberPattern = /(\d+(?:\.\d+)?%?)/g;
    let match: RegExpExecArray | null;
    let bestMatch: { match: string; index: number } | null = null;

    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec pattern
    while ((match = numberPattern.exec(text)) !== null) {
        const numStr = match[1].replace("%", "");
        const num = Number.parseFloat(numStr);
        // If this number is close to the rolled value, it's likely the right one
        if (Math.abs(num - rolledValue) <= Math.max(rolledValue * 0.5, 5)) {
            bestMatch = { match: match[1], index: match.index };
            break;
        }
    }

    if (bestMatch) {
        const hasPercent = bestMatch.match.includes("%");
        const template =
            text.substring(0, bestMatch.index) +
            "{value}" +
            text.substring(bestMatch.index + bestMatch.match.length);
        return { template, hasPercent };
    }

    // Last resort: just use the first number
    const firstMatch = text.match(/(\d+(?:\.\d+)?%?)/);
    const hasPercent = firstMatch ? firstMatch[1].includes("%") : false;
    const template = text.replace(/(\d+(?:\.\d+)?%?)/, "{value}");
    return { template, hasPercent };
}

// Replace the placeholder with the actual summed value
export function formatStatText(template: string, value: number, hasPercent: boolean): string {
    const formattedValue = Number.isInteger(value) ? value.toString() : value.toFixed(1);
    const displayValue = hasPercent ? `${formattedValue}%` : formattedValue;
    return template.replace("{value}", displayValue);
}

function getModTextForAggregation(mod: IdolModifier, locale: SupportedLocale): string {
    return resolveModTextWithRange(mod, locale);
}

interface AggregatedStatsResult {
    statsByMechanic: StatsByMechanic[];
    uniqueStats: UniqueIdolStat[];
    baseImplicit: number;
}

export function aggregateStats(
    placements: IdolPlacement[],
    inventory: InventoryIdol[],
    locale: SupportedLocale,
): AggregatedStatsResult {
    const statMap = new Map<string, AggregatedStat>();
    const uniqueStats: UniqueIdolStat[] = [];
    let baseImplicit = 0;

    for (const placement of placements) {
        const inventoryIdol = inventory.find((i) => i.id === placement.inventoryIdolId);
        if (!inventoryIdol) continue;

        const idol = inventoryIdol.idol;
        const base = IDOL_BASES[idol.baseType];
        baseImplicit += base.implicit;

        const allMods = [...idol.prefixes, ...idol.suffixes];
        const contribution: IdolContribution = {
            baseType: idol.baseType,
        };

        for (const mod of allMods) {
            // Unique mods are handled separately since they don't aggregate
            if (mod.type === "unique") {
                const modText = resolveModTextWithRange(mod, locale);
                uniqueStats.push({
                    text: modText,
                    baseType: idol.baseType,
                });
                continue;
            }

            const modText = getModTextForAggregation(mod, locale);
            const { template, hasPercent } = createTemplate(modText, mod.rolledValue);
            const mechanic = getModMechanic(mod.modId);
            const key = `${mechanic}:${template}`;
            const existing = statMap.get(key);
            if (existing) {
                existing.totalValue += mod.rolledValue;
                existing.contributions.push(contribution);
            } else {
                statMap.set(key, {
                    template,
                    totalValue: mod.rolledValue,
                    mechanic,
                    hasPercent,
                    contributions: [contribution],
                });
            }
        }
    }

    const statsByMechanic: StatsByMechanic[] = [];
    for (const mechanic of LEAGUE_MECHANICS) {
        const stats = Array.from(statMap.values()).filter((s) => s.mechanic === mechanic);
        if (stats.length > 0) {
            statsByMechanic.push({ mechanic, stats });
        }
    }

    return { statsByMechanic, uniqueStats, baseImplicit };
}

import type { IdolBaseType, Locale, ModifierData, ValueRange } from "./types.ts";
import { LOCALES } from "./types.ts";

/**
 * Configuration for modifiers that need value ranges injected.
 * poedb.tw often shows these as static text (e.g., "contain an additional Strongbox")
 * but in-game they can roll different values based on idol size.
 */
interface ValueOverrideConfig {
    /** Pattern to match the English text */
    pattern: RegExp;
    /** Value ranges per idol type */
    valuesByIdol: Partial<Record<IdolBaseType, ValueRange>>;
}

function formatValueRange(range: ValueRange): string {
    return `(${range.min}—${range.max})`;
}

/**
 * Generic text replacements per locale.
 * Simply replaces "an/a/1/一個" etc with the value range.
 * Grammar may be incorrect but logic is more robust to text changes.
 */
const TEXT_REPLACEMENTS: Record<Locale, { search: RegExp; replace: string }> = {
    en: { search: /\ban\b/, replace: "{value}" },
    "zh-TW": { search: /一個|1 個|1個/, replace: "{value} 個" },
    "zh-CN": { search: /一个|1 个|1个/, replace: "{value} 个" },
    ko: { search: /1개|1명|1마리/, replace: "{value}개" },
    ja: { search: /1個|1体/, replace: "{value}個" },
    ru: { search: /дополнительн\w+/, replace: "{value} дополнительных" },
    "pt-BR": { search: /\bum\b|\buma\b/, replace: "{value}" },
    de: { search: /\beinen\b|\beine\b|\bein\b/, replace: "{value}" },
    fr: { search: /\bun\b|\bune\b/, replace: "{value}" },
    es: { search: /\bun\b|\buna\b/, replace: "{value}" },
};

/**
 * Modifiers that need value ranges injected.
 * These are "guaranteed spawn" modifiers that can roll higher values on larger idols.
 */
const VALUE_OVERRIDES: ValueOverrideConfig[] = [
    {
        pattern: /^Your Maps contain an additional Strongbox$/i,
        valuesByIdol: {
            Burial: { min: 1, max: 1 },
            Totemic: { min: 1, max: 1 },
            Conqueror: { min: 1, max: 2 },
        },
    },
    {
        pattern: /^Your Maps contain an additional Shrine$/i,
        valuesByIdol: {
            Burial: { min: 1, max: 1 },
            Totemic: { min: 1, max: 1 },
            Conqueror: { min: 1, max: 2 },
        },
    },
    {
        pattern: /^Your Maps contain an additional Harbinger$/i,
        valuesByIdol: {
            Burial: { min: 1, max: 1 },
            Totemic: { min: 1, max: 1 },
            Conqueror: { min: 1, max: 2 },
        },
    },
    {
        pattern: /^Your Maps contain an additional Imprisoned Monster$/i,
        valuesByIdol: {
            Burial: { min: 1, max: 1 },
            Totemic: { min: 1, max: 1 },
            Conqueror: { min: 1, max: 2 },
        },
    },
    {
        pattern: /^Your Maps are haunted by an additional Tormented Spirit$/i,
        valuesByIdol: {
            Burial: { min: 1, max: 1 },
            Totemic: { min: 1, max: 1 },
            Conqueror: { min: 1, max: 2 },
        },
    },
    {
        pattern:
            /^Crimson Iron Ore Deposits in your Maps are guarded by an additional Corrupted Growth$/i,
        valuesByIdol: {
            Burial: { min: 1, max: 2 },
            Totemic: { min: 1, max: 2 },
        },
    },
];

/**
 * Apply value overrides to modifiers that need them.
 * This adds value ranges AND updates the text to include the range.
 */
export function applyValueOverrides(modifiers: ModifierData[]): {
    modifiedCount: number;
    modifications: string[];
} {
    const modifications: string[] = [];
    let modifiedCount = 0;

    for (const modifier of modifiers) {
        for (const tier of modifier.tiers) {
            const englishText = tier.text.en;
            if (!englishText) continue;

            for (const override of VALUE_OVERRIDES) {
                if (!override.pattern.test(englishText)) continue;

                for (const idolType of modifier.applicableIdols) {
                    const valueRange = override.valuesByIdol[idolType];
                    if (!valueRange) continue;

                    // Skip if values already set (from poedb data)
                    if (tier.values.length > 0) continue;

                    // Apply the value range
                    tier.values = [valueRange];

                    // Apply text replacements for each locale
                    const formattedValue = formatValueRange(valueRange);
                    for (const locale of LOCALES) {
                        const replacement = TEXT_REPLACEMENTS[locale];
                        if (replacement && tier.text[locale]) {
                            const newText = tier.text[locale].replace(
                                replacement.search,
                                replacement.replace.replace("{value}", formattedValue),
                            );
                            tier.text[locale] = newText;
                        }
                    }

                    modifications.push(
                        `${modifier.id}: Applied value range (${valueRange.min}—${valueRange.max}) for ${idolType}`,
                    );
                    modifiedCount++;
                }
            }
        }
    }

    return { modifiedCount, modifications };
}

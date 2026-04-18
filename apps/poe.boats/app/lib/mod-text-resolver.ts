import type { LeagueMechanic } from "~/data/idol-bases";
import idolModifiers from "~/data/idol-modifiers.json";
import uniqueIdols from "~/data/unique-idols.json";
import type { SupportedLocale } from "~/i18n/types";
import type { IdolModifier } from "~/schemas/idol";

interface ModifierTier {
    tier: number;
    levelReq: number;
    text: Record<string, string>;
    values: { min: number; max: number }[];
    weight?: number;
}

interface ModifierDefinition {
    id: string;
    type: "prefix" | "suffix";
    name: Record<string, string>;
    tiers: ModifierTier[];
    mechanic: string;
    applicableIdols: string[];
}

interface UniqueIdolMod {
    text: Record<string, string>;
    values: { min: number; max: number }[];
}

interface UniqueIdol {
    id: string;
    name: Record<string, string>;
    baseType: string;
    modifiers: UniqueIdolMod[];
}

const modifierMap = new Map<string, ModifierDefinition>();
for (const mod of idolModifiers as ModifierDefinition[]) {
    modifierMap.set(mod.id, mod);
}

const uniqueIdolMap = new Map<string, UniqueIdol>();
for (const idol of uniqueIdols as UniqueIdol[]) {
    uniqueIdolMap.set(idol.id, idol);
}

export function getModifierDefinition(modId: string): ModifierDefinition | undefined {
    return modifierMap.get(modId);
}

export function getModTier(modId: string, tier: number | null): ModifierTier | undefined {
    const mod = modifierMap.get(modId);
    if (!mod) return undefined;

    if (tier === null) {
        return mod.tiers[0];
    }

    return mod.tiers.find((t) => t.tier === tier) ?? mod.tiers[0];
}

export function getModText(
    modId: string,
    tier: number | null,
    locale: SupportedLocale,
): string | undefined {
    if (modId.startsWith("unique_")) {
        return getUniqueModText(modId, locale);
    }

    const tierData = getModTier(modId, tier);
    if (!tierData) return undefined;

    return tierData.text[locale] ?? tierData.text.en;
}

function getUniqueModText(modId: string, locale: SupportedLocale): string | undefined {
    const parts = modId.split("_");
    if (parts.length < 3) return undefined;

    const idolId = parts.slice(1, -1).join("_");
    const modIndex = Number.parseInt(parts[parts.length - 1], 10);

    const idol = uniqueIdolMap.get(idolId);
    if (!idol || Number.isNaN(modIndex)) return undefined;

    const mod = idol.modifiers[modIndex];
    if (!mod) return undefined;

    return mod.text[locale] ?? mod.text.en;
}

export function substituteModValue(
    text: string,
    rolledValue: number,
    valueRange?: { min: number; max: number },
): string {
    if (!valueRange) return text;

    const rangePattern = /\((\d+(?:\.\d+)?)[—\-–](\d+(?:\.\d+)?)\)/g;
    let result = text;
    let replaced = false;

    result = result.replace(rangePattern, (match, min, max) => {
        const minNum = Number.parseFloat(min);
        const maxNum = Number.parseFloat(max);

        if (Math.abs(minNum - valueRange.min) < 0.01 && Math.abs(maxNum - valueRange.max) < 0.01) {
            if (!replaced) {
                replaced = true;
                const formattedValue = Number.isInteger(rolledValue)
                    ? String(rolledValue)
                    : rolledValue.toFixed(1);
                return formattedValue;
            }
        }
        return match;
    });

    return result;
}

export function resolveModText(mod: IdolModifier, locale: SupportedLocale): string {
    const definitionText = getModText(mod.modId, mod.tier, locale);

    if (definitionText) {
        const valueRange = getModValueRange(mod.modId, mod.tier);
        return substituteModValue(definitionText, mod.rolledValue, valueRange);
    }

    if (mod.text) {
        return mod.text;
    }

    return `Unknown modifier: ${mod.modId}`;
}

export function resolveModTextWithRange(mod: IdolModifier, locale: SupportedLocale): string {
    const definitionText = getModText(mod.modId, mod.tier, locale);

    if (definitionText) {
        return definitionText;
    }

    if (mod.text) {
        return mod.text;
    }

    return `Unknown modifier: ${mod.modId}`;
}

export function getModMechanic(modId: string): LeagueMechanic | undefined {
    if (modId.startsWith("unique_")) {
        return undefined;
    }

    const mod = modifierMap.get(modId);
    return mod?.mechanic as LeagueMechanic | undefined;
}

export function getModValueRange(
    modId: string,
    tier: number | null,
): { min: number; max: number } | undefined {
    if (modId.startsWith("unique_")) {
        return getUniqueModValueRange(modId);
    }

    const tierData = getModTier(modId, tier);
    return tierData?.values[0];
}

function getUniqueModValueRange(modId: string): { min: number; max: number } | undefined {
    const parts = modId.split("_");
    if (parts.length < 3) return undefined;

    const idolId = parts.slice(1, -1).join("_");
    const modIndex = Number.parseInt(parts[parts.length - 1], 10);

    const idol = uniqueIdolMap.get(idolId);
    if (!idol || Number.isNaN(modIndex)) return undefined;

    const mod = idol.modifiers[modIndex];
    return mod?.values[0];
}

export function getModWeight(modId: string, tier: number | null): number | undefined {
    if (modId.startsWith("unique_")) {
        return undefined;
    }

    const tierData = getModTier(modId, tier);
    return tierData?.weight;
}

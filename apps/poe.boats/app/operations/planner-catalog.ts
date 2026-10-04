import { z } from "zod";
import type { LeagueMechanic } from "~/data/idol-bases";
import idolModifiers from "~/data/idol-modifiers.json";
import type { SupportedLocale } from "~/i18n/types";
import { IdolBaseKeySchema, LeagueMechanicSchema } from "~/schemas/idol";

export const ModifierFiltersSchema = z.object({
    query: z.string().max(200).default(""),
    type: z.enum(["all", "prefix", "suffix"]).default("all"),
    mechanics: z.array(LeagueMechanicSchema).default([]),
    bases: z.array(IdolBaseKeySchema).default([]),
    favorites: z.array(z.string()).default([]),
    favoriteFilter: z.enum(["all", "favorites", "non-favorites"]).default("all"),
});

export function filterIdolModifiers(
    modifiers: ModifierOption[],
    input: z.input<typeof ModifierFiltersSchema>,
) {
    const filters = ModifierFiltersSchema.parse(input);
    const query = filters.query.toLowerCase();
    const bases = filters.bases.map((key) => key.charAt(0).toUpperCase() + key.slice(1));
    return modifiers.filter((mod) => {
        if (filters.type !== "all" && mod.type !== filters.type) return false;
        if (filters.mechanics.length && !filters.mechanics.includes(mod.mechanic)) return false;
        if (bases.length && !mod.applicableIdols.some((base) => bases.includes(base))) return false;
        if (filters.favoriteFilter === "favorites" && !filters.favorites.includes(mod.id))
            return false;
        if (filters.favoriteFilter === "non-favorites" && filters.favorites.includes(mod.id))
            return false;
        return (
            !query ||
            mod.name.toLowerCase().includes(query) ||
            (mod.tiers[0]?.text.toLowerCase() ?? "").includes(query)
        );
    });
}

export interface ModifierOption {
    id: string;
    type: "prefix" | "suffix";
    name: string;
    mechanic: LeagueMechanic;
    applicableIdols: string[];
    tiers: {
        tier: number;
        levelReq: number;
        text: string;
        values: { min: number; max: number }[];
        weight: number;
    }[];
}

function getLocalizedText(textObj: Record<string, string>, locale: SupportedLocale): string {
    return textObj[locale] || textObj.en || "";
}

// Module-level cache for modifier options per locale
const modifierOptionsCache = new Map<SupportedLocale, ModifierOption[]>();

export function getModifierOptions(locale: SupportedLocale = "en"): ModifierOption[] {
    // Return cached result if available
    const cached = modifierOptionsCache.get(locale);
    if (cached) {
        return cached;
    }

    // Dedupe mods by tier text, merging applicableIdols for identical mods
    const modsByText = new Map<string, ModifierOption>();

    for (const mod of idolModifiers) {
        const tierText = getLocalizedText(mod.tiers[0]?.text || {}, locale);
        const key = `${mod.type}:${mod.mechanic}:${mod.tiers[0]?.text?.en || ""}`;

        const existing = modsByText.get(key);
        if (existing) {
            // Merge applicableIdols from duplicate
            const newIdols = mod.applicableIdols.filter(
                (idol) => !existing.applicableIdols.includes(idol),
            );
            existing.applicableIdols.push(...newIdols);
        } else {
            modsByText.set(key, {
                id: mod.id,
                type: mod.type as "prefix" | "suffix",
                name: getLocalizedText(mod.name, locale) || tierText || mod.id,
                mechanic: mod.mechanic as LeagueMechanic,
                applicableIdols: [...mod.applicableIdols],
                tiers: mod.tiers.map((tier) => ({
                    tier: tier.tier,
                    levelReq: tier.levelReq,
                    text: getLocalizedText(tier.text, locale),
                    values: tier.values || [],
                    weight: tier.weight ?? 0,
                })),
            });
        }
    }

    const result = Array.from(modsByText.values());
    modifierOptionsCache.set(locale, result);
    return result;
}

import {
    formatStatNumber,
    matchesCondition,
    numericHandler,
    specificity,
    translationStatId,
} from "../../../../packages/poe-game-data/src/translation-formats";
import type { CraftingCatalog, CraftingItem, RolledMod } from "../schemas/crafting";
import { heistModifierEffect } from "./crafting-heist";
import { grantedPassive, grantedPassiveStat } from "./crafting-passives";
import { catalystEffect } from "./crafting-quality";

export function cleanModText(text: string) {
    return text.replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1");
}

export const modifierEffectStats = {
    prefix: [
        "local_explicit_mod_effect_+%",
        "local_prefix_mod_effect_+%",
        "local_non_unique_item_explicit_prefix_mod_magnitudes_+%",
    ],
    suffix: [
        "local_explicit_mod_effect_+%",
        "local_suffix_mod_effect_+%",
        "local_non_unique_item_explicit_suffix_mod_magnitudes_+%",
    ],
};

export function modifierEffect(catalog: CraftingCatalog, item: CraftingItem, id: string) {
    const mod = catalog.mods[id]!;
    const quality = catalystEffect(catalog, item, id);
    const side = mod.generation_type;
    const explicit = side === "prefix" || side === "suffix";
    const effectStats = new Set([
        ...(explicit ? modifierEffectStats[side] : []),
        ...catalog.crafting.taggedModifierEffects
            .filter(
                (rule) =>
                    (explicit ? rule.explicit : rule.implicit) &&
                    (!(rule.prefix || rule.suffix) ||
                        (side === "prefix" ? rule.prefix : rule.suffix)) &&
                    rule.tags.some((tag) => mod.implicit_tags.includes(tag)),
            )
            .map((rule) => rule.stat),
    ]);
    return (
        quality +
        heistModifierEffect(catalog, item, mod) +
        [...item.implicits, ...item.mods].reduce(
            (sum, entry) =>
                sum +
                catalog.mods[entry.id]!.stats.reduce(
                    (sum, stat, index) =>
                        sum +
                        (effectStats.has(stat.id)
                            ? Math.round(
                                  (entry.values[index]! *
                                      (entry.sanctification ?? entry.corruptionScale ?? 100)) /
                                      100,
                              )
                            : 0),
                    0,
                ),
            0,
        )
    );
}

export function rolledModText(
    catalog: CraftingCatalog,
    rolled: RolledMod,
    item?: CraftingItem,
): string | null {
    const references = catalog.crafting.modDescriptions[rolled.id];
    const mod = catalog.mods[rolled.id];
    if (!references || !mod || rolled.values.length !== mod.stats.length) return null;
    const values = scaledModValues(catalog, rolled, item);
    if (rolled.grantedPassive) {
        const index = mod.stats.findIndex((stat) => stat.id === grantedPassiveStat);
        if (index >= 0) values[index] = grantedPassive(catalog, rolled.grantedPassive).hash;
    }
    const stats = new Map(
        mod.stats.map((stat, index) => [translationStatId(stat.id), values[index]!]),
    );
    return renderStatText(catalog, references, stats);
}

export function renderStatText(
    catalog: CraftingCatalog,
    references: number[],
    stats: Map<string, number>,
): string | null {
    const lines: string[] = [];
    for (const index of references) {
        const description = catalog.crafting.statDescriptions[index];
        if (!description) return null;
        const input = description.ids.map((id) => stats.get(id) ?? 0);
        if (input.every((value) => value === 0)) continue;
        const rule = description.rules
            .filter((rule) =>
                rule.conditions.every((condition, index) =>
                    matchesCondition(condition, input[index] ?? 0),
                ),
            )
            .sort((a, b) => specificity(b) - specificity(a))[0];
        if (!rule) continue;
        const values: (string | number)[] = [...input];
        const formats = new Map<number, string>();
        for (let handler = 0; handler < rule.handlers.length; handler++) {
            const name = rule.handlers[handler]!;
            if (name === "canonical_line") continue;
            const argument = rule.handlers[++handler];
            if (["reminderstring", "canonical_stat"].includes(name)) continue;
            const index = Number(argument) - 1;
            const value = values[index];
            if (typeof value !== "number") return null;
            const numeric = numericHandler(name, value);
            if (numeric !== undefined) {
                values[index] = numeric;
                formats.set(index, name);
            } else {
                const text = catalog.crafting.statLookups[name]?.[String(value)];
                if (text === undefined) return null;
                values[index] = text;
            }
        }
        let sequential = 0;
        let missing = false;
        const text = rule.text.replace(
            /\{(\d*)(?::([^}]*))?\}/g,
            (_match, rawIndex: string, format: string | undefined) => {
                const index = rawIndex ? Number(rawIndex) : sequential++;
                const value = values[index];
                if (value === undefined) {
                    missing = true;
                    return "";
                }
                if (typeof value === "string") return value;
                const sign = value < 0 ? "-" : format?.includes("+") ? "+" : "";
                return sign + formatStatNumber(Math.abs(value), formats.get(index) ?? "");
            },
        );
        if (missing) return null;
        lines.push(text);
    }
    return lines.join("\n");
}

export function scaledModValues(catalog: CraftingCatalog, rolled: RolledMod, item?: CraftingItem) {
    const effect = item ? modifierEffect(catalog, item, rolled.id) : 0;
    return catalog.mods[rolled.id]!.stats.map((stat, index) => {
        const value = Math.round(
            (rolled.values[index]! * (rolled.sanctification ?? rolled.corruptionScale ?? 100)) /
                100,
        );
        return effect && catalog.crafting.scalableStats.includes(stat.id)
            ? Math.trunc((value * (100 + effect)) / 100)
            : value;
    });
}

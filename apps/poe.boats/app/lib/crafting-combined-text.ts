import {
    numericHandler,
    translationStatId,
} from "../../../../packages/poe-game-data/src/translation-formats";
import type { CraftingCatalog, CraftingItem } from "../schemas/crafting";
import { cleanModText, renderStatText, rolledModText, scaledModValues } from "./crafting-text";

type Line = { key: string; text: string; fractured: boolean };

function additiveDescription(catalog: CraftingCatalog, reference: number) {
    return catalog.crafting.statDescriptions[reference]?.rules.every(({ handlers }) => {
        for (let index = 0; index < handlers.length; index++) {
            const name = handlers[index]!;
            if (name === "canonical_line") continue;
            index++;
            if (["reminderstring", "canonical_stat"].includes(name)) continue;
            // Lookup identifiers and offset conversions cannot be summed as numeric stats.
            if (numericHandler(name, 0) !== 0) return false;
        }
        return true;
    });
}

export function combinedExplicitText(catalog: CraftingCatalog, item: CraftingItem): Line[] {
    const separate: Line[] = [];
    const groups = new Map<
        string,
        { reference: number; fractured: boolean; contributions: Map<string, number>[] }
    >();
    for (const [index, rolled] of item.mods.entries()) {
        const mod = catalog.mods[rolled.id]!;
        const references = catalog.crafting.modDescriptions[rolled.id];
        const text = rolledModText(catalog, rolled, item);
        const ids = mod.stats.map((stat) => translationStatId(stat.id));
        if (
            ["veiled", "unveiled", "desecrated"].includes(mod.domain) ||
            mod.implicit_tags.includes("unveiled_mod") ||
            rolled.desecrated ||
            rolled.grantedPassive ||
            !references?.length ||
            text === null ||
            new Set(ids).size !== ids.length ||
            references.some((reference) => !additiveDescription(catalog, reference))
        ) {
            separate.push({
                key: `modifier:${index}:${rolled.id}`,
                text:
                    mod.domain === "veiled"
                        ? `Unrevealed ${mod.generation_type}`
                        : cleanModText(text ?? mod.text ?? mod.name) || "No displayed stats",
                fractured: rolled.fractured,
            });
            continue;
        }
        const values = scaledModValues(catalog, rolled, item);
        const stats = new Map(ids.map((id, index) => [id, values[index]!]));
        for (const reference of new Set(references)) {
            const key = `stat:${rolled.fractured}:${reference}`;
            const group = groups.get(key) ?? {
                reference,
                fractured: rolled.fractured,
                contributions: [],
            };
            group.contributions.push(stats);
            groups.set(key, group);
        }
    }
    const combined: Line[] = [];
    for (const [key, { reference, fractured, contributions }] of groups) {
        const ids = catalog.crafting.statDescriptions[reference]!.ids;
        const stats = new Map(
            ids.map((id) => [
                id,
                contributions.reduce((sum, contribution) => sum + (contribution.get(id) ?? 0), 0),
            ]),
        );
        const text = renderStatText(catalog, [reference], stats);
        if (text) combined.push({ key, text: cleanModText(text), fractured });
        else if ([...stats.values()].some((value) => value !== 0)) {
            // Keep the original lines when their sum has no valid extracted display rule.
            for (const [index, contribution] of contributions.entries()) {
                const text = renderStatText(catalog, [reference], contribution);
                if (text)
                    combined.push({ key: `${key}:${index}`, text: cleanModText(text), fractured });
            }
        }
    }
    return [...combined.sort((a, b) => a.text.localeCompare(b.text)), ...separate];
}

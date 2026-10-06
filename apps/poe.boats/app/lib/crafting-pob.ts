import { z } from "zod";
import { translationStatId } from "../../../../packages/poe-game-data/src/translation-formats";
import type { CraftingCatalog, CraftingItem, RolledMod } from "../schemas/crafting";
import { cleanModText, renderStatText, rolledModText } from "./crafting-text";
import { matchRolledMod } from "./crafting-text-match";

export const rollFractionSchema = z
    .string()
    .trim()
    .regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i)
    .pipe(z.coerce.number<string>().min(0).max(1));
const antonyms: Record<string, string> = {
    increased: "reduced",
    reduced: "increased",
    more: "less",
    less: "more",
};
type BlueprintAffix = { id: string; fractured: boolean; range?: number | number[] };
type SummaryLine = {
    text: string;
    side?: string;
    modId?: string;
    fractured: boolean;
    crafted: boolean;
    domain?: string;
    conversion?: RolledMod["conversion"];
    origin?: RolledMod["origin"];
    grantedPassive?: string;
};

export function expandRollRanges(text: string, range?: number | number[]) {
    let count = 0;
    const expanded = text.replace(
        /([+-]?)\(([+-]?\d+(?:\.\d+)?)-([+-]?\d+(?:\.\d+)?)\)(% (increased|reduced|more|less))?/g,
        (value, sign: string, from: string, to: string, _suffix: string, word: string) => {
            if (range === undefined)
                throw new Error(
                    "Ranged modifiers need an explicit {range:...} fraction between 0 and 1.",
                );
            const fraction = typeof range === "number" ? range : (range[count] ?? 0.5);
            count++;
            const direction = sign === "-" ? -1 : 1;
            const selected = (Number(from) + fraction * (Number(to) - Number(from))) * direction;
            if (word && selected < 0)
                return `{range:${fraction}}(${-direction * Number(from)}-${-direction * Number(to)})% ${antonyms[word]}`;
            return `{range:${fraction}}${value}`;
        },
    );
    return { text: expanded, count };
}

export function readItemBlueprint(catalog: CraftingCatalog, lines: string[]) {
    const records = lines.filter((line) => /^(Prefix|Suffix):/.test(line));
    if (!records.length) return;
    const affixes: BlueprintAffix[] = [];
    for (const line of records) {
        const match = /^(Prefix|Suffix):\s*(\{fractured\})?(?:\{range:([^}]+)\})?([^\s{}]+)$/.exec(
            line,
        );
        if (!match) throw new Error("Malformed PoB Prefix/Suffix blueprint record.");
        const [, side, fractured, range, id] = match;
        if (id === "None") {
            if (fractured || range)
                throw new Error("An empty blueprint slot cannot have a roll or fracture.");
            continue;
        }
        const mod = catalog.mods[id!];
        if (!mod || mod.generation_type !== side!.toLowerCase())
            throw new Error(`Blueprint ${side} does not match an extracted modifier: ${id}.`);
        const fractions =
            range === undefined
                ? undefined
                : rollFractionSchema.array().safeParse(range.split(","));
        if (fractions && !fractions.success)
            throw new Error("Blueprint range fractions must be between 0 and 1.");
        affixes.push({
            id: id!,
            fractured: Boolean(fractured),
            range: fractions?.success
                ? range!.includes(",")
                    ? fractions.data
                    : fractions.data[0]
                : undefined,
        });
    }
    return affixes;
}

export function resolveItemBlueprint(
    catalog: CraftingCatalog,
    affixes: BlueprintAffix[],
    item: CraftingItem,
) {
    let ambiguous = false;
    const mods = affixes.map(({ id, fractured, range }) => {
        const definition = catalog.mods[id]!;
        if (!definition.text?.trim())
            throw new Error(`Blueprint modifier has no complete extracted text: ${id}.`);
        const text = cleanModText(definition.text)
            .split("\n")
            .map((line) => expandRollRanges(line, range).text)
            .join("\n");
        const match = matchRolledMod(catalog, id, text, item, true, fractured);
        if (!match)
            throw new Error(`Could not resolve blueprint rolls from the extracted build: ${id}.`);
        ambiguous ||= match.ambiguous;
        return { ...match.mod, fractured };
    });
    return { mods, ambiguous };
}

export function verifyBlueprintSummary(
    catalog: CraftingCatalog,
    mods: RolledMod[],
    lines: SummaryLine[],
) {
    if (!lines.length) return;
    const shape = (line: string) =>
        cleanModText(line)
            .replace(/[+-]?\d+(?:\.\d+)?/g, "#")
            .replace(/\s+/g, " ")
            .trim();
    for (const line of lines) {
        if (line.conversion || line.origin || line.grantedPassive)
            throw new Error(
                "Blueprint summaries cannot replace crafting provenance. Use explicit modifier lines for this item.",
            );
        if (
            !mods.some(
                (mod) =>
                    (!line.modId || !catalog.mods[line.modId] || line.modId === mod.id) &&
                    (!line.fractured || mod.fractured) &&
                    (!line.crafted || mod.crafted) &&
                    (!line.side || catalog.mods[mod.id]!.generation_type === line.side) &&
                    (!line.domain || catalog.mods[mod.id]!.domain === line.domain) &&
                    rolledModText(catalog, mod)
                        ?.split("\n")
                        .some((text) => shape(text) === shape(line.text)),
            )
        )
            throw new Error(
                "The explicit modifier summary annotations do not match the PoB blueprint.",
            );
    }
    const normalized = (lines: string[]) =>
        lines
            .map((line) => cleanModText(line).replace(/\s+/g, " ").trim())
            .filter(Boolean)
            .sort()
            .join("\n");
    const individual = mods.flatMap((mod) => rolledModText(catalog, mod)?.split("\n") ?? []);
    const expected = normalized(lines.map((line) => line.text));
    if (expected === normalized(individual)) return;
    const stats = new Map<string, number>();
    for (const mod of mods)
        for (const [index, stat] of catalog.mods[mod.id]!.stats.entries()) {
            const id = translationStatId(stat.id);
            stats.set(id, (stats.get(id) ?? 0) + mod.values[index]!);
        }
    const references = [
        ...new Set(mods.flatMap((mod) => catalog.crafting.modDescriptions[mod.id] ?? [])),
    ];
    const merged = renderStatText(catalog, references, stats);
    if (merged !== null && expected === normalized(merged.split("\n"))) return;
    throw new Error(
        "The explicit modifier summary does not match the PoB blueprint. Check its roll positions and modifiers.",
    );
}

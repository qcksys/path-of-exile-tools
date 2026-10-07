import { z } from "zod";
import type { ItemRecord } from "./schema.ts";

export const modifierIdentitySchema = z.strictObject({
    id: z.string().min(1).max(500),
    name: z.string().min(1).max(300),
    side: z.enum(["prefix", "suffix"]),
    level: z.number().int().nonnegative(),
    text: z.string().max(5000).nullable(),
});
export type ModifierIdentity = z.infer<typeof modifierIdentitySchema>;

const normalizeText = (text: string) => text.trim().replace(/\s+/g, " ");
const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compileLine(text: string) {
    const ranges: Array<[number, number]> = [];
    let expression = "";
    let offset = 0;
    const normalized = normalizeText(text);
    for (const match of normalized.matchAll(/\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)/g)) {
        expression += `${escapePattern(normalized.slice(offset, match.index))}(-?\\d+(?:\\.\\d+)?)`;
        ranges.push([Number(match[1]), Number(match[2])]);
        offset = match.index + match[0].length;
    }
    const pattern = new RegExp(`^${expression}${escapePattern(normalized.slice(offset))}$`);
    return (line: string) => {
        const values = pattern.exec(normalizeText(line));
        return (
            !!values &&
            ranges.every(([min, max], index) => {
                const value = Number(values[index + 1]);
                return value >= min && value <= max;
            })
        );
    };
}

function matchesLines(patterns: ReturnType<typeof compileLine>[], lines: string[]): boolean {
    if (patterns.length !== lines.length) return false;
    if (!patterns.length) return true;
    return lines.some(
        (line, index) =>
            patterns[0]!(line) &&
            matchesLines(
                patterns.slice(1),
                lines.filter((_, other) => other !== index),
            ),
    );
}

/** Source tiers remain source tiers; only complete, unambiguous text identifies a catalog mod. */
export function compileModifierIdentities(definitions: ModifierIdentity[]) {
    const byName = new Map<
        string,
        Array<{ definition: ModifierIdentity; lines: ReturnType<typeof compileLine>[] | null }>
    >();
    for (const input of definitions) {
        const definition = modifierIdentitySchema.parse(input);
        const key = JSON.stringify([definition.name, definition.side, definition.level]);
        const candidates = byName.get(key) ?? [];
        candidates.push({
            definition,
            lines:
                definition.text?.trim() && definition.text.split("\n").length <= 8
                    ? definition.text.split("\n").map(compileLine)
                    : null,
        });
        byName.set(key, candidates);
    }
    return (record: ItemRecord): ItemRecord => {
        if (!record.item.identified || !["stash", "trade"].includes(record.source)) return record;
        const groups = new Map<
            string,
            { name: string; side: string; level: number; lines: string[] }
        >();
        for (const line of record.item.explicitMods ?? []) {
            if (typeof line === "string" || line.mods?.length !== 1) continue;
            const mod = line.mods[0]!;
            const tier = /^([PS])(\d+)$/.exec(mod.tier);
            if (!tier || mod.level === undefined) continue;
            const key = JSON.stringify([
                mod.name,
                Number(tier[2]),
                tier[1] === "P" ? "prefix" : "suffix",
            ]);
            const previous = groups.get(key);
            // Inconsistent metadata cannot establish an identity.
            const level = previous && previous.level !== mod.level ? -1 : mod.level;
            groups.set(key, {
                name: mod.name,
                side: tier[1] === "P" ? "prefix" : "suffix",
                level,
                lines: [...(previous?.lines ?? []), ...line.description.split("\n")],
            });
        }
        const modifiers = record.facts.modifiers.map((mod) => {
            if (mod.id) return mod;
            const source = groups.get(JSON.stringify([mod.name, mod.tier, mod.side]));
            if (!source) return mod;
            const lines = [...new Set(source.lines.map(normalizeText))];
            const candidates = (
                byName.get(JSON.stringify([source.name, source.side, source.level])) ?? []
            ).filter(
                (candidate) => candidate.lines === null || matchesLines(candidate.lines, lines),
            );
            if (candidates.length !== 1 || candidates[0]!.lines === null) return mod;
            return { ...mod, id: candidates[0]!.definition.id };
        });
        return {
            ...record,
            facts: {
                ...record.facts,
                modifiers,
                prefixes:
                    record.item.extended?.prefixes ??
                    (modifiers.some((mod) => mod.side === "prefix" && !mod.id)
                        ? undefined
                        : record.facts.prefixes),
                suffixes:
                    record.item.extended?.suffixes ??
                    (modifiers.some((mod) => mod.side === "suffix" && !mod.id)
                        ? undefined
                        : record.facts.suffixes),
            },
        };
    };
}

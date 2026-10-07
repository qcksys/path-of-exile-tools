import { z } from "zod";
import {
    modifierScalingSchema,
    modifierTranslationsSchema,
    scaledModifierTexts,
} from "./modifier-ranges.ts";
import { itemRarity } from "./normalize.ts";
import type { ItemRecord, ModifierFact } from "./schema.ts";

const identifier = z.string().min(1).max(500);
export const modifierTextModelSchema = z.strictObject({
    format: z.literal(1),
    identityFamilies: z.array(z.array(identifier).min(2).max(100)).max(1000).optional(),
    unsupportedImplicitTexts: z.array(z.string().max(5000)).max(1000).optional(),
    translations: modifierTranslationsSchema.optional(),
    catalysts: z
        .array(z.strictObject({ name: z.string(), maximum: z.number().int().min(0).max(100) }))
        .max(100)
        .optional(),
    modifiers: z
        .array(
            z.strictObject({
                id: identifier,
                name: z.string(),
                side: z.enum(["prefix", "suffix"]),
                groups: z.array(identifier),
                crafted: z.boolean(),
                text: z.string().max(5000).nullable(),
                unsupported: z.boolean().optional(),
                scaling: modifierScalingSchema.nullable().optional(),
                catalysts: z.array(z.string()).max(100).optional(),
            }),
        )
        .max(20_000),
    bases: z
        .array(
            z.strictObject({
                baseType: identifier,
                modifiers: z
                    .array(
                        z.strictObject({
                            id: identifier,
                            tier: z.number().int().nonnegative().optional(),
                        }),
                    )
                    .max(20_000)
                    .optional(),
                tiers: z.record(identifier, z.number().int().nonnegative()).optional(),
                catalystProperties: z.array(z.string()).max(100).optional(),
                unsupported: z.boolean().optional(),
                magnitude: z
                    .strictObject({
                        prefix: z.number().int().min(0).max(1000),
                        suffix: z.number().int().min(0).max(1000),
                        texts: z.array(z.string()).max(32),
                    })
                    .optional(),
            }),
        )
        .max(2000),
});
export type ModifierTextModel = z.infer<typeof modifierTextModelSchema>;
type Interval = { min: number; max: number };
type Line = { key: string; values: Interval[] };

function parseLine(text: string, template: boolean): Line | null {
    const normalized = text
        .replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2")
        .replace(/\[([^\]]+)\]/g, "$1")
        .trim()
        .replace(/\s+/g, " ");
    if (!normalized || normalized.includes("{") || normalized.includes("}")) return null;
    const values: Interval[] = [];
    const key = normalized.replace(
        /([+-]?)\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)|[+-]?\d+(?:\.\d+)?/g,
        (match, sign: string | undefined, low: string | undefined, high: string | undefined) => {
            const from = low === undefined ? Number(match) : Number(low) * (sign === "-" ? -1 : 1);
            const to = high === undefined ? from : Number(high) * (sign === "-" ? -1 : 1);
            values.push({
                min: Math.min(from, to),
                max: !template && low !== undefined ? Number.NaN : Math.max(from, to),
            });
            return "#";
        },
    );
    if (values.some(({ min, max }) => !Number.isFinite(max) || min > max)) return null;
    // Literal, non-numeric lines still consume one displayed occurrence.
    return { key, values: values.length ? values : [{ min: 1, max: 1 }] };
}

function lines(text: string, template: boolean) {
    if (template && text === "") return [];
    const result = text.split("\n").map((line) => parseLine(line, template));
    return result.some((line) => line === null) ? null : (result as Line[]);
}

function variants(texts: string[] | null) {
    const parsed = texts?.map((text) => lines(text, true));
    return !parsed || parsed.some((entry) => entry === null) ? null : (parsed as Line[][]);
}

type Candidate = {
    fact: ModifierFact;
    groups: string[];
    side: "prefix" | "suffix";
    contributions: Array<{ index: number; min: number; max: number }>;
    unsupported: boolean;
};

/** Interval sums deliberately over-approximate correlated rolls; uncertainty never picks a tier. */
export function compileModifierTextModel(input: ModifierTextModel, visitLimit = 20_000) {
    const model = modifierTextModelSchema.parse(input);
    const definitions = new Map(
        model.modifiers.map((mod) => [
            mod.id,
            {
                ...mod,
                variants: variants(mod.text === null ? null : [mod.text]),
            },
        ]),
    );
    if (definitions.size !== model.modifiers.length) throw new Error("Duplicate modifier text ID.");
    const families = new Map<string, string[]>();
    for (const input of model.identityFamilies ?? []) {
        const family = [...input].sort();
        let signature: string | undefined;
        for (const id of family) {
            const mod = definitions.get(id);
            if (!mod || families.has(id))
                throw new Error("Invalid or overlapping modifier identity family.");
            const next = JSON.stringify([
                mod.name,
                mod.side,
                [...mod.groups].sort(),
                mod.crafted,
                mod.text,
                mod.unsupported,
                mod.scaling,
                mod.catalysts,
            ]);
            if (signature !== undefined && signature !== next)
                throw new Error(
                    "Modifier identity families must have identical displayed affixes.",
                );
            signature = next;
            families.set(id, family);
        }
    }
    const bases = new Map(model.bases.map((base) => [base.baseType, base]));
    if (bases.size !== model.bases.length) throw new Error("Duplicate modifier text base.");
    for (const base of bases.values()) {
        if (
            base.modifiers &&
            new Set(base.modifiers.map((mod) => mod.id)).size !== base.modifiers.length
        )
            throw new Error("Duplicate base modifier text ID.");
        if (base.modifiers?.some((mod) => !definitions.has(mod.id)))
            throw new Error("Missing modifier text definition.");
    }
    function indexed(entries: typeof definitions) {
        const byRequiredLine = new Map<string, Set<string>>();
        const withoutRequiredLine = new Set<string>();
        for (const mod of entries.values()) {
            for (const variant of mod.variants ?? [null]) {
                const required = variant?.find((line) =>
                    line.values.some((range) => range.min > 0 || range.max < 0),
                );
                if (required) {
                    const ids = byRequiredLine.get(required.key) ?? new Set<string>();
                    ids.add(mod.id);
                    byRequiredLine.set(required.key, ids);
                } else withoutRequiredLine.add(mod.id);
            }
        }
        return { definitions: entries, byRequiredLine, withoutRequiredLine };
    }
    const baseline = indexed(definitions);
    const contexts = new Map<string, typeof baseline>();
    function context(prefix: number, suffix: number, catalyst?: { name: string; quality: number }) {
        if (!prefix && !suffix && !catalyst?.quality) return baseline;
        const key = JSON.stringify([prefix, suffix, catalyst]);
        const previous = contexts.get(key);
        if (previous) return previous;
        const result = indexed(
            new Map(
                [...definitions].map(([id, mod]) => {
                    const effect =
                        (mod.side === "prefix" ? prefix : suffix) +
                        (catalyst && mod.catalysts?.includes(catalyst.name) ? catalyst.quality : 0);
                    if (!effect || mod.scaling === undefined) return [id, mod];
                    return [
                        id,
                        {
                            ...mod,
                            variants: variants(
                                mod.scaling && model.translations
                                    ? scaledModifierTexts(model.translations, mod.scaling, effect)
                                    : null,
                            ),
                        },
                    ];
                }),
            ),
        );
        if (contexts.size >= 8) contexts.delete(contexts.keys().next().value!);
        contexts.set(key, result);
        return result;
    }
    const unsupportedImplicitKeys = new Set(
        (model.unsupportedImplicitTexts ?? []).flatMap(
            (text) => lines(text, true)?.map((line) => line.key) ?? [],
        ),
    );
    return (record: ItemRecord): ItemRecord => {
        const { item } = record;
        const base = bases.get(item.baseType);
        const prefixes = item.extended?.prefixes;
        const suffixes = item.extended?.suffixes;
        if (
            record.game !== "poe1" ||
            !["stash", "trade"].includes(record.source) ||
            !item.identified ||
            !["Magic", "Rare"].includes(itemRarity(item) ?? "") ||
            !base ||
            base.unsupported ||
            prefixes === undefined ||
            suffixes === undefined ||
            prefixes + suffixes > 12 ||
            record.facts.modifiers.length ||
            item.sanctified ||
            item.mutated === true ||
            item.memoryItem === true ||
            item.corrupted ||
            item.duplicated ||
            item.synthesised ||
            Object.values(item.influences ?? {}).some(Boolean) ||
            [item.enchantMods, item.scourgeMods, item.crucibleMods].some(
                (mods) => Array.isArray(mods) && mods.length > 0,
            ) ||
            item.craftedMods?.length ||
            item.fracturedMods?.length
        )
            return record;
        let catalyst: { name: string; quality: number } | undefined;
        if (base.catalystProperties?.length && item.properties !== undefined) {
            if (!Array.isArray(item.properties)) return record;
            for (const property of item.properties) {
                if (
                    typeof property !== "object" ||
                    property === null ||
                    Array.isArray(property) ||
                    typeof property.name !== "string"
                )
                    return record;
                if (
                    property.type !== 6 &&
                    !property.name.toLowerCase().includes("quality") &&
                    !base.catalystProperties.includes(property.name)
                )
                    continue;
                const recipe = model.catalysts?.find((entry) => entry.name === property.name);
                const values = property.values;
                if (
                    !recipe ||
                    catalyst ||
                    !base.catalystProperties.includes(recipe.name) ||
                    !Array.isArray(values) ||
                    values.length !== 1 ||
                    !Array.isArray(values[0]) ||
                    typeof values[0][0] !== "string"
                )
                    return record;
                const match = /^\+?(\d+)%$/.exec(values[0][0]);
                if (!match || Number(match[1]) > recipe.maximum) return record;
                catalyst = { name: recipe.name, quality: Number(match[1]) };
            }
        }
        const implicitLines = (item.implicitMods ?? []).flatMap(
            (row) => lines(typeof row === "string" ? row : row.description, false) ?? [],
        );
        const expected = base.magnitude?.texts.flatMap((text) => lines(text, false) ?? []) ?? [];
        if (
            base.magnitude &&
            (!expected.length ||
                expected.some(
                    (line) =>
                        !implicitLines.some(
                            (actual) => JSON.stringify(actual) === JSON.stringify(line),
                        ),
                ))
        )
            return record;
        if (
            implicitLines.some(
                (line) =>
                    unsupportedImplicitKeys.has(line.key) &&
                    !expected.some((actual) => JSON.stringify(actual) === JSON.stringify(line)),
            )
        )
            return record;
        const {
            definitions: activeDefinitions,
            byRequiredLine,
            withoutRequiredLine,
        } = context(base.magnitude?.prefix ?? 0, base.magnitude?.suffix ?? 0, catalyst);
        const targets: number[] = [];
        const dimensions = new Map<string, number>();
        const observedLines = new Set<string>();
        const flags = new Map<string, { fractured: boolean; crafted: boolean }>();
        for (const row of item.explicitMods ?? []) {
            if (
                typeof row === "string" ||
                row.mods?.length ||
                Object.entries(row.flags ?? {}).some(
                    ([key, value]) => !["fractured", "crafted"].includes(key) && value !== false,
                )
            )
                return record;
            const flag = {
                fractured: row.flags?.fractured === true,
                crafted: row.flags?.crafted === true,
            };
            const flagKey = JSON.stringify(flag);
            flags.set(flagKey, flag);
            const parsed = lines(row.description, false);
            if (!parsed) return record;
            for (const line of parsed) {
                if (unsupportedImplicitKeys.has(line.key)) return record;
                observedLines.add(line.key);
                for (const [position, value] of line.values.entries()) {
                    const key = JSON.stringify([flagKey, line.key, position]);
                    let index = dimensions.get(key);
                    if (index === undefined) {
                        index = targets.length;
                        dimensions.set(key, index);
                        targets.push(0);
                    }
                    targets[index]! += value.min;
                }
            }
        }
        if (!targets.length || targets.length > 64) return record;
        const candidates: Candidate[] = [];
        const entries =
            base.modifiers ??
            [
                ...new Set([
                    ...withoutRequiredLine,
                    ...[...observedLines].flatMap((key) => [...(byRequiredLine.get(key) ?? [])]),
                ]),
            ].map((id) => ({ id, tier: undefined }));
        for (const entry of entries) {
            const mod = activeDefinitions.get(entry.id)!;
            // Missing translations could be an alternative to any apparent match.
            if (!mod.variants) return record;
            for (const variant of mod.variants) {
                for (const [flagKey, flag] of flags) {
                    if (mod.crafted !== flag.crafted) continue;
                    const contributions = new Map<number, Interval>();
                    let possible = true;
                    for (const line of variant)
                        for (const [position, range] of line.values.entries()) {
                            const index = dimensions.get(
                                JSON.stringify([flagKey, line.key, position]),
                            );
                            if (index === undefined) {
                                if (range.min > 0 || range.max < 0) possible = false;
                                continue;
                            }
                            const previous = contributions.get(index) ?? { min: 0, max: 0 };
                            contributions.set(index, {
                                min: previous.min + range.min,
                                max: previous.max + range.max,
                            });
                        }
                    if (!possible) continue;
                    candidates.push({
                        fact: {
                            id: mod.id,
                            name: mod.name,
                            side: mod.side,
                            tier: entry.tier ?? base.tiers?.[mod.id],
                            ...flag,
                        },
                        groups: mod.groups,
                        side: mod.side,
                        contributions: [...contributions].map(([index, range]) => ({
                            index,
                            ...range,
                        })),
                        unsupported: mod.unsupported === true,
                    });
                }
            }
        }
        const frequency = targets.map(() => 0);
        for (const candidate of candidates)
            for (const part of candidate.contributions) frequency[part.index]!++;
        const rank = (candidate: Candidate) =>
            Math.min(Infinity, ...candidate.contributions.map((part) => frequency[part.index]!));
        candidates.sort(
            (a, b) => rank(a) - rank(b) || b.contributions.length - a.contributions.length,
        );
        const lower = targets.map(() => 0);
        const upper = targets.map(() => 0);
        const bounds = Array.from({ length: candidates.length + 1 }, () => ({
            prefixMin: targets.map(() => 0),
            prefixMax: targets.map(() => 0),
            suffixMin: targets.map(() => 0),
            suffixMax: targets.map(() => 0),
        }));
        for (let index = candidates.length - 1; index >= 0; index--) {
            const next = bounds[index + 1]!;
            const current = bounds[index]!;
            for (const key of ["prefixMin", "prefixMax", "suffixMin", "suffixMax"] as const)
                current[key] = [...next[key]];
            const candidate = candidates[index]!;
            for (const part of candidate.contributions) {
                const min = candidate.side === "prefix" ? current.prefixMin : current.suffixMin;
                const max = candidate.side === "prefix" ? current.prefixMax : current.suffixMax;
                min[part.index] = Math.min(min[part.index]!, part.min);
                max[part.index] = Math.max(max[part.index]!, part.max);
            }
        }
        const chosen: Candidate[] = [];
        const groups = new Set<string>();
        const ids = new Set<string>();
        let common: Map<string, ModifierFact> | undefined;
        let visits = 0;
        let exhausted = false;
        let unsupported = false;
        const keyOf = (fact: ModifierFact) => JSON.stringify(fact);
        function familyFact(fact: ModifierFact): ModifierFact {
            const family = families.get(fact.id!);
            if (!family) return fact;
            const tier = family.every((id) => base!.tiers?.[id] === fact.tier)
                ? fact.tier
                : undefined;
            return {
                possibleIds: family,
                name: fact.name,
                side: fact.side,
                tier,
                fractured: fact.fractured,
                crafted: fact.crafted,
            };
        }
        function search(start: number, p: number, s: number) {
            if (exhausted || unsupported) return;
            if (++visits > visitLimit) {
                exhausted = true;
                return;
            }
            const remaining = bounds[start]!;
            const pLeft = prefixes! - p;
            const sLeft = suffixes! - s;
            if (
                targets.some(
                    (value, index) =>
                        value <
                            lower[index]! +
                                pLeft * remaining.prefixMin[index]! +
                                sLeft * remaining.suffixMin[index]! -
                                1e-8 ||
                        value >
                            upper[index]! +
                                pLeft * remaining.prefixMax[index]! +
                                sLeft * remaining.suffixMax[index]! +
                                1e-8,
                )
            )
                return;
            if (p === prefixes && s === suffixes) {
                if (
                    targets.some(
                        (value, index) =>
                            value < lower[index]! - 1e-8 || value > upper[index]! + 1e-8,
                    )
                )
                    return;
                if (chosen.some((candidate) => candidate.unsupported)) {
                    unsupported = true;
                    return;
                }
                const facts = new Map(
                    chosen.map((candidate) => {
                        const fact = familyFact(candidate.fact);
                        return [keyOf(fact), fact];
                    }),
                );
                common =
                    common === undefined
                        ? facts
                        : new Map([...common].filter(([key]) => facts.has(key)));
                return;
            }
            for (let index = start; index < candidates.length; index++) {
                const candidate = candidates[index]!;
                if (
                    (candidate.side === "prefix" ? p === prefixes : s === suffixes) ||
                    ids.has(candidate.fact.id!) ||
                    candidate.groups.some((group) => groups.has(group))
                )
                    continue;
                chosen.push(candidate);
                ids.add(candidate.fact.id!);
                for (const group of candidate.groups) groups.add(group);
                for (const part of candidate.contributions) {
                    lower[part.index]! += part.min;
                    upper[part.index]! += part.max;
                }
                search(
                    index + 1,
                    p + Number(candidate.side === "prefix"),
                    s + Number(candidate.side === "suffix"),
                );
                for (const part of candidate.contributions) {
                    lower[part.index]! -= part.min;
                    upper[part.index]! -= part.max;
                }
                for (const group of candidate.groups) groups.delete(group);
                ids.delete(candidate.fact.id!);
                chosen.pop();
                if (exhausted || unsupported) return;
            }
        }
        search(0, 0, 0);
        if (exhausted || unsupported || !common?.size) return record;
        return {
            ...record,
            facts: { ...record.facts, modifiers: [...common.values()], modifiersComplete: false },
        };
    };
}

import { z } from "zod";
import { compileFracturedModifierTextModel, type ModifierTextModel } from "./modifier-text.ts";
import { itemRarity } from "./normalize.ts";
import {
    type ApiItem,
    type ItemRecord,
    itemFactsSchema,
    type SourcePreparationProfile,
    sourcePreparationProfileSchema,
} from "./schema.ts";

export const sourcePreparationModelSchema = z.strictObject({
    format: z.literal(1),
    bases: z
        .array(
            z.strictObject({
                id: z.string().min(1).max(500),
                baseType: z.string().min(1).max(500),
                itemClass: z.enum(["Body Armour", "Helmet", "Gloves", "Boots", "Shield"]),
                scourImplicits: z
                    .strictObject({
                        ids: z.array(z.string().min(1).max(500)).max(8),
                        texts: z
                            .array(z.array(z.string().min(1).max(5000)).max(32))
                            .min(1)
                            .max(256),
                    })
                    .optional(),
            }),
        )
        .max(2000),
});
export type SourcePreparationModel = z.infer<typeof sourcePreparationModelSchema>;
export type SourcePreparationResult =
    | { status: "match"; record: ItemRecord }
    | { status: "no-match" | "unknown" };

type ModLine = Exclude<NonNullable<ApiItem["explicitMods"]>[number], string>;

// These zero-stat placeholders belong to Energy Blade's temporary weapon replacement.
// This armour-only projection does not change the ordinary model's ambiguity rules.
const weaponPlaceholders = new Set([
    "StormBladeExplicitLocalIncreasedCriticalStrikeChance",
    "StormBladeExplicitShockChance",
    "StormBladeExplicitAttackLightningConvertToChaos",
]);

function descriptions(value: unknown): ModLine[] | null {
    if (value === undefined) return [];
    if (!Array.isArray(value)) return null;
    const result: ModLine[] = [];
    for (const entry of value) {
        if (typeof entry === "string") result.push({ description: entry });
        else if (
            typeof entry === "object" &&
            entry !== null &&
            typeof entry.description === "string"
        )
            result.push(entry);
        else return null;
    }
    return result.every((entry) => entry.description.trim().length > 0) ? result : null;
}

function implicitSignature(texts: string[]) {
    return JSON.stringify(
        texts
            .flatMap((text) => text.split("\n"))
            .map((text) =>
                text
                    .replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2")
                    .replace(/\[([^\]]+)\]/g, "$1")
                    .trim()
                    .replace(/\s+/g, " "),
            )
            .sort(),
    );
}

/** The result is an input to an explicit paid preparation, never a replacement for ordinary facts. */
export function compileSourcePreparation(
    modifierModel: ModifierTextModel,
    input: SourcePreparationModel,
    visitLimit = 20_000,
) {
    const model = sourcePreparationModelSchema.parse(input);
    const ids = new Set<string>();
    const bases = new Map<string, SourcePreparationModel["bases"]>();
    for (const base of model.bases) {
        if (ids.has(base.id)) throw new Error("Duplicate source preparation base ID.");
        ids.add(base.id);
        bases.set(base.baseType, [...(bases.get(base.baseType) ?? []), base]);
    }
    const resolve = compileFracturedModifierTextModel(
        {
            ...modifierModel,
            modifiers: modifierModel.modifiers.filter((mod) => !weaponPlaceholders.has(mod.id)),
            bases: modifierModel.bases.map((base) => ({
                ...base,
                ...(base.modifiers
                    ? { modifiers: base.modifiers.filter((mod) => !weaponPlaceholders.has(mod.id)) }
                    : {}),
            })),
        },
        visitLimit,
    );
    return (record: ItemRecord, inputPolicy: SourcePreparationProfile): SourcePreparationResult => {
        const policy = sourcePreparationProfileSchema.parse(inputPolicy);
        const scour = policy.kind === "scour-v1";
        const { item, facts } = record;
        const variants = bases.get(item.baseType) ?? [];
        const base = facts.baseId
            ? variants.find((entry) => entry.id === facts.baseId)
            : variants.length === 1
              ? variants[0]
              : undefined;
        const rarity = itemRarity(item);
        if (
            record.game !== "poe1" ||
            !["stash", "trade"].includes(record.source) ||
            !variants.length ||
            (facts.baseId !== undefined && !base) ||
            (rarity !== undefined && !(scour ? ["Magic", "Rare"] : ["Rare"]).includes(rarity)) ||
            item.identified === false ||
            (!scour && (item.fractured === false || base?.itemClass === "Shield")) ||
            (scour && (item.searing === true || item.tangled === true)) ||
            facts.destroyed ||
            [
                item.corrupted,
                item.duplicated,
                item.synthesised,
                item.sanctified,
                item.mutated,
                item.memoryItem,
                item.allflameCrafted,
            ].some((value) => value === true) ||
            (!scour && Object.values(item.influences ?? {}).some(Boolean)) ||
            (facts.memoryStrands ?? 0) > 0 ||
            (facts.memoryStrandsSpent ?? 0) > 0
        )
            return { status: "no-match" };
        if (
            !base ||
            (scour && !base.scourImplicits) ||
            (scour &&
                ((facts.baseTypeAmbiguous && !facts.baseId) ||
                    (facts.itemClass !== undefined && facts.itemClass !== base.itemClass) ||
                    (item.frameType !== undefined &&
                        item.frameType !== (rarity === "Magic" ? 1 : 2)))) ||
            modifierModel.format < 4 ||
            rarity === undefined ||
            item.identified !== true ||
            Object.entries(item).some(
                ([key, value]) =>
                    value === true &&
                    ![
                        "identified",
                        "fractured",
                        "split",
                        "verified",
                        "searing",
                        "tangled",
                    ].includes(key),
            ) ||
            ["intangibility", "memoryStrands", "memoryStrandsSpent"].some(
                (key) => item[key] !== undefined && item[key] !== 0,
            ) ||
            ["mutated", "memoryItem", "allflameCrafted"].some(
                (key) => item[key] !== undefined && item[key] !== false,
            ) ||
            (scour &&
                (["searing", "tangled"].some(
                    (key) => item[key] !== undefined && item[key] !== false,
                ) ||
                    Object.entries(item.influences ?? {}).some(
                        ([key, value]) =>
                            value &&
                            ![
                                "shaper",
                                "elder",
                                "crusader",
                                "redeemer",
                                "hunter",
                                "warlord",
                            ].includes(key),
                    ))) ||
            [
                item.scourgeMods,
                item.crucibleMods,
                item.veiledMods,
                item.runeMods,
                item.mutatedMods,
                item.allflameMods,
            ].some((value) => value !== undefined && (!Array.isArray(value) || value.length > 0)) ||
            ["prefixes", "suffixes"].some((side) => {
                const field = side as "prefixes" | "suffixes";
                const count = item.extended?.[field];
                const maximum = scour && rarity === "Magic" ? 1 : 3;
                return (
                    (count !== undefined && count > maximum) ||
                    (facts[field] !== undefined && facts[field]! > maximum) ||
                    (count !== undefined && facts[field] !== undefined && count !== facts[field])
                );
            })
        )
            return { status: "unknown" };
        const explicit = descriptions(item.explicitMods);
        const separateFractures = descriptions(item.fracturedMods);
        const separateCrafts = descriptions(item.craftedMods);
        const enchants = descriptions(item.enchantMods);
        const implicits = descriptions(item.implicitMods);
        if (!explicit || !separateFractures || !separateCrafts || !enchants || !implicits)
            return { status: "unknown" };
        if (
            [...explicit, ...separateFractures, ...separateCrafts, ...implicits, ...enchants].some(
                (row) =>
                    Object.entries(row.flags ?? {}).some(
                        ([key, value]) =>
                            !["fractured", "crafted"].includes(key) && value !== false,
                    ) || /\b(?:veiled prefix|veiled suffix|unrevealed)\b/i.test(row.description),
            )
        )
            return { status: "unknown" };
        if ([...implicits, ...enchants].some((row) => Object.values(row.flags ?? {}).some(Boolean)))
            return { status: "unknown" };
        const inlineFractures = explicit.filter((row) => row.flags?.fractured === true);
        const inlineCrafts = explicit.filter((row) => row.flags?.crafted === true);
        if (
            (inlineFractures.length && separateFractures.length) ||
            (inlineCrafts.length && separateCrafts.length) ||
            [...inlineFractures, ...separateFractures].some((row) => row.flags?.crafted === true) ||
            separateCrafts.some((row) => row.flags?.fractured === true)
        )
            return { status: "unknown" };
        const fractures = [...inlineFractures, ...separateFractures];
        if (!scour && !fractures.length)
            return { status: item.fractured === true ? "unknown" : "no-match" };
        if (
            policy.crafted !== Boolean(inlineCrafts.length || separateCrafts.length) ||
            policy.enchanted !== Boolean(enchants.length)
        )
            return { status: "no-match" };
        if (
            explicit.some(
                (row) =>
                    row.flags?.crafted !== true &&
                    (/^(?:Prefixes Cannot Be Changed|Suffixes Cannot Be Changed|Cannot roll Attack Modifiers|Cannot roll Caster Modifiers)$/i.test(
                        row.description.trim(),
                    ) ||
                        (scour &&
                            /^Can have up to \d+ Crafted Modifiers$/i.test(
                                row.description.trim(),
                            ))),
            )
        )
            return { status: "unknown" };
        if (!policy.crafted && facts.modifiers.some((mod) => mod.crafted))
            return { status: "unknown" };
        if (scour) {
            if (fractures.length || facts.modifiers.some((mod) => mod.fractured))
                return { status: item.fractured === false ? "unknown" : "no-match" };
            if (item.fractured === true) return { status: "no-match" };
            const native = base.scourImplicits!;
            const knownImplicits = facts.modifiers.filter((mod) => mod.side === "implicit");
            if (
                knownImplicits.some(
                    (mod) =>
                        mod.crafted ||
                        mod.fractured ||
                        (mod.id !== undefined && !native.ids.includes(mod.id)) ||
                        mod.possibleIds?.some((id) => !native.ids.includes(id)),
                ) ||
                new Set(knownImplicits.map((mod) => mod.id)).size !== knownImplicits.length ||
                (facts.modifiersComplete && knownImplicits.length !== native.ids.length)
            )
                return { status: "unknown" };
            if (
                !native.texts.some(
                    (texts) =>
                        implicitSignature(texts) ===
                        implicitSignature(implicits.map((row) => row.description)),
                )
            )
                return { status: "unknown" };
            return {
                status: "match",
                record: {
                    ...record,
                    item: {
                        ...item,
                        rarity: "Normal",
                        frameType: 0,
                        explicitMods: [],
                        fracturedMods: [],
                        craftedMods: [],
                        enchantMods: [],
                        fractured: false,
                        extended: { ...item.extended, prefixes: 0, suffixes: 0 },
                    },
                    facts: {
                        ...facts,
                        baseId: base.id,
                        itemClass: base.itemClass,
                        prefixes: 0,
                        suffixes: 0,
                        modifiers: native.ids.map((id) => ({
                            id,
                            side: "implicit",
                            fractured: false,
                            crafted: false,
                        })),
                        modifiersComplete: true,
                        stats: { explicit: {}, implicit: {}, total: {} },
                        statsComplete: false,
                    },
                },
            };
        }
        if (
            facts.modifiers.some(
                (mod) =>
                    mod.fractured &&
                    (mod.crafted ||
                        (mod.id !== undefined && mod.id !== policy.fractureId) ||
                        (mod.possibleIds !== undefined &&
                            !mod.possibleIds.includes(policy.fractureId))),
            )
        )
            return { status: "no-match" };
        const protectedLines = fractures.map((row) => ({
            description: row.description,
            flags: { fractured: true },
        }));
        const isolated: ItemRecord = {
            ...record,
            item: {
                baseType: item.baseType,
                rarity: "Rare",
                identified: true,
                influences: {},
                explicitMods: protectedLines,
                // Magnitude-changing enchantments must not identify a false numeric tier.
                implicitMods: [...implicits, ...enchants],
                ...(item.properties !== undefined ? { properties: item.properties } : {}),
            },
            facts: itemFactsSchema.parse({}),
        };
        const resolved = resolve(isolated);
        const fracture = resolved.facts.modifiers[0];
        if (
            resolved === isolated ||
            resolved.facts.modifiers.length !== 1 ||
            !fracture?.fractured ||
            fracture.crafted ||
            !["prefix", "suffix"].includes(fracture.side ?? "")
        )
            return { status: "unknown" };
        if (fracture.id !== policy.fractureId) return { status: "no-match" };
        const prefixes = Number(fracture.side === "prefix");
        const suffixes = Number(fracture.side === "suffix");
        if (
            (item.extended?.prefixes ?? facts.prefixes ?? 3) < prefixes ||
            (item.extended?.suffixes ?? facts.suffixes ?? 3) < suffixes
        )
            return { status: "unknown" };
        return {
            status: "match",
            record: {
                ...record,
                item: {
                    ...item,
                    explicitMods: protectedLines,
                    fracturedMods: [],
                    craftedMods: [],
                    enchantMods: [],
                    implicitMods: [],
                    fractured: true,
                    extended: { ...item.extended, prefixes, suffixes },
                },
                facts: {
                    ...facts,
                    baseId: base.id,
                    itemClass: base.itemClass,
                    prefixes,
                    suffixes,
                    modifiers: [fracture],
                    modifiersComplete: false,
                    stats: { explicit: {}, implicit: {}, total: {} },
                    statsComplete: false,
                },
            },
        };
    };
}

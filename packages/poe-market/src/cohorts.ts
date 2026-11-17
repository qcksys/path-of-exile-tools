import {
    baseIdentitySchema,
    compileBaseIdentities,
    compileModifierIdentities,
    compileModifierTextModel,
    compileSourcePreparation,
    type ItemRecord,
    itemQuerySchema,
    matchItem,
    matchItemCondition,
    modifierIdentitySchema,
    modifierTextModelSchema,
    type SourcePreparationResult,
    sourcePreparationModelSchema,
} from "@poe-tools/item-query";
import { z } from "zod";

export const marketCohortSchema = z.strictObject({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(300),
    purpose: z.enum(["base", "fracture", "isolated-modifier", "transfer-donor"]),
    query: itemQuerySchema,
});
export const marketCohortManifestSchema = z
    .strictObject({
        format: z.literal(1),
        game: z.literal("poe1"),
        revision: z.string().min(1).max(100),
        catalogHash: z.string().regex(/^[a-f0-9]{64}$/),
        cohorts: z.array(marketCohortSchema).max(100_000),
        modifierIdentities: z.array(modifierIdentitySchema).max(20_000).optional(),
        baseIdentities: z.array(baseIdentitySchema).max(2000).optional(),
        modifierTextModel: modifierTextModelSchema.optional(),
        sourcePreparationModel: sourcePreparationModelSchema.optional(),
    })
    .superRefine((manifest, context) => {
        const ids = new Set<string>();
        for (const [index, cohort] of manifest.cohorts.entries()) {
            if (ids.has(cohort.id))
                context.addIssue({
                    code: "custom",
                    path: ["cohorts", index, "id"],
                    message: "Duplicate market cohort ID.",
                });
            if (cohort.query.game !== manifest.game)
                context.addIssue({
                    code: "custom",
                    path: ["cohorts", index, "query"],
                    message: "Cohort and manifest games differ.",
                });
            ids.add(cohort.id);
        }
    });
export type MarketCohort = z.infer<typeof marketCohortSchema>;
export type MarketCohortManifest = z.infer<typeof marketCohortManifestSchema>;
export const marketCohortDefinitionSchema = marketCohortSchema.extend({
    revision: z.string().min(1).max(100),
    catalogHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type MarketCohortDefinition = z.infer<typeof marketCohortDefinitionSchema>;

export function compileMarketCohorts(input: MarketCohortManifest) {
    const manifest = marketCohortManifestSchema.parse(input);
    const resolve = compileModifierIdentities(manifest.modifierIdentities ?? []);
    const resolveBase = compileBaseIdentities(manifest.baseIdentities ?? []);
    const resolveText = manifest.modifierTextModel
        ? compileModifierTextModel(manifest.modifierTextModel)
        : (record: ItemRecord) => record;
    const resolveSource =
        manifest.modifierTextModel && manifest.sourcePreparationModel
            ? compileSourcePreparation(manifest.modifierTextModel, manifest.sourcePreparationModel)
            : (): SourcePreparationResult => ({ status: "unknown" });
    // Split once here: every item is tested against each cohort of its base.
    const entries = manifest.cohorts.map((cohort) => {
        const { sourcePreparation, ...query } = cohort.query;
        return {
            id: cohort.id,
            query,
            sourcePreparation,
            sourceKey: sourcePreparation && JSON.stringify(sourcePreparation),
        };
    });
    type Entry = (typeof entries)[number];
    const byBase = new Map<string, Entry[]>();
    const general: Entry[] = [];
    const definitions = new Map(
        manifest.cohorts.map((cohort) => [
            cohort.id,
            {
                ...cohort,
                revision: manifest.revision,
                catalogHash: manifest.catalogHash,
            },
        ]),
    );
    for (const [index, cohort] of manifest.cohorts.entries()) {
        const base = cohort.query.groups
            .flatMap((group) => (group.type === "and" ? group.filters : []))
            .find((condition) => condition.kind === "base" && condition.field === "baseType");
        if (base?.kind === "base") {
            for (const name of new Set(base.values)) {
                const list = byBase.get(name) ?? [];
                list.push(entries[index]!);
                byBase.set(name, list);
            }
        } else general.push(entries[index]!);
    }
    // In the order classify always used: general cohorts, then the base's own.
    const candidates = new Map([...byBase].map(([name, own]) => [name, [...general, ...own]]));
    return {
        manifest,
        definition: (id: string) => definitions.get(id),
        acceptsBase: (baseType: string) => general.length > 0 || byBase.has(baseType),
        classify(record: ItemRecord) {
            const matches: string[] = [];
            const unknown: string[] = [];
            if (record.game !== manifest.game) return { matches, unknown };
            const identified = resolve(resolveBase(record));
            const resolved = resolveText(identified);
            const sources = new Map<string, SourcePreparationResult>();
            for (const { id, query, sourcePreparation, sourceKey } of candidates.get(
                record.item.baseType,
            ) ?? general) {
                let match: ReturnType<typeof matchItem>;
                if (sourcePreparation) {
                    // Preparation preserves item level, unlike rarity and affix counts.
                    if (
                        (manifest.sourcePreparationModel?.format ?? 1) >= 2 &&
                        query.groups.some(
                            (group) =>
                                group.type === "and" &&
                                group.filters.some(
                                    (filter) =>
                                        filter.kind === "range" &&
                                        filter.field === "ilvl" &&
                                        matchItemCondition(identified, filter) === "no-match",
                                ),
                        )
                    )
                        continue;
                    // Resolved facts hold across all assignments; missing identities prove nothing.
                    if (
                        (manifest.sourcePreparationModel?.format ?? 1) >= 3 &&
                        sourcePreparation.kind === "fractured-fossil-v1" &&
                        resolved.facts.modifiers.some(
                            (mod) =>
                                mod.fractured === true &&
                                mod.id !== undefined &&
                                mod.id !== sourcePreparation.fractureId,
                        )
                    )
                        continue;
                    if (!sources.has(sourceKey!))
                        sources.set(sourceKey!, resolveSource(identified, sourcePreparation));
                    const source = sources.get(sourceKey!)!;
                    match =
                        source.status === "match" ? matchItem(source.record, query) : source.status;
                } else match = matchItem(resolved, query);
                if (match === "match") matches.push(id);
                if (match === "unknown") unknown.push(id);
            }
            return { matches, unknown };
        },
    };
}

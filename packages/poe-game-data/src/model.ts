import { z } from "zod";

const integer = z.number().int();
const optionalInteger = integer.nullable().default(null);
const optionalString = z.string().nullable().default(null);
export const rangeSchema = z
    .strictObject({ min: integer, max: integer })
    .refine((range) => range.min <= range.max, "Invalid range");
export const statValueSchema = rangeSchema.safeExtend({ id: z.string() });
export const weightSchema = z.strictObject({ tag: z.string(), weight: integer.nonnegative() });
export const modSchema = z.strictObject({
    adds_tags: z.array(z.string()),
    domain: z.string(),
    generation_type: z.string(),
    generation_weights: z.array(weightSchema),
    grants_effects: z.array(z.strictObject({ granted_effect_id: z.string(), level: integer })),
    groups: z.array(z.string()),
    implicit_tags: z.array(z.string()),
    is_essence_only: z.boolean(),
    name: z.string(),
    required_level: integer,
    maximum_level: integer,
    spawn_weights: z.array(weightSchema),
    stats: z.array(statValueSchema),
    text: z.string().nullable(),
    type: z.string(),
    gold_value: optionalInteger,
});
export const propertiesSchema = z.strictObject({
    armour: rangeSchema.nullable().default(null),
    energy_shield: rangeSchema.nullable().default(null),
    evasion: rangeSchema.nullable().default(null),
    ward: rangeSchema.nullable().default(null),
    movement_speed: optionalInteger,
    block: optionalInteger,
    description: optionalString,
    directions: optionalString,
    stack_size: optionalInteger,
    stack_size_currency_tab: optionalInteger,
    full_stack_turns_into: optionalString,
    charges_max: optionalInteger,
    charges_per_use: optionalInteger,
    duration: optionalInteger,
    life_per_use: optionalInteger,
    mana_per_use: optionalInteger,
    attack_time: optionalInteger,
    critical_strike_chance: optionalInteger,
    physical_damage_max: optionalInteger,
    physical_damage_min: optionalInteger,
    range: optionalInteger,
    mana_burn_ms: optionalInteger,
    cooldown_ms: optionalInteger,
    monster_id: optionalString,
    monster_ability_text: optionalString,
    monster_category: optionalString,
});
export const baseSchema = z.strictObject({
    domain: z.string(),
    drop_level: integer,
    implicits: z.array(z.string()),
    inventory_height: integer,
    inventory_width: integer,
    inherits_from: optionalString,
    item_class: z.string(),
    name: z.string(),
    properties: propertiesSchema,
    release_state: z.enum(["released", "unique_only", "unreleased", "legacy"]),
    tags: z.array(z.string()),
    visual_identity: z.strictObject({ dds_file: z.string(), id: z.string() }),
    requirements: z
        .strictObject({
            strength: integer,
            dexterity: integer,
            intelligence: integer,
            level: integer,
        })
        .nullable()
        .default(null),
    grants_buff: z
        .strictObject({ id: z.string(), stats: z.record(z.string(), integer) })
        .nullable()
        .default(null),
    skills_granted: z.array(z.string()).nullable().default(null),
});
export const statSchema = z.strictObject({
    alias: z.strictObject({ when_in_main_hand: optionalString, when_in_off_hand: optionalString }),
    is_aliased: z.boolean(),
    is_local: z.boolean(),
});
export const itemClassSchema = z.strictObject({
    name: z.string(),
    category: optionalString,
    category_id: optionalString,
    influence_tags: z.array(z.string()).nullable().default(null),
});
const nonemptyRecord = <T extends z.ZodType>(schema: T) =>
    z.record(z.string(), schema).refine((value) => Object.keys(value).length > 0, "Empty dataset");
export const datasetSchema = z.strictObject({
    base_items: nonemptyRecord(baseSchema),
    mods: nonemptyRecord(modSchema),
    stats: nonemptyRecord(statSchema),
    tags: z.array(z.string()).min(1),
    item_classes: nonemptyRecord(itemClassSchema),
});
export type Dataset = z.infer<typeof datasetSchema>;
export type Mod = z.infer<typeof modSchema>;
export type Base = z.infer<typeof baseSchema>;
export type StatValue = z.infer<typeof statValueSchema>;

export function validateDataset(input: unknown): Dataset {
    const data = datasetSchema.parse(input);
    const tags = new Set(data.tags);
    for (const [id, base] of Object.entries(data.base_items)) {
        if (!Object.hasOwn(data.item_classes, base.item_class))
            throw new Error(`${id}: unresolved item class ${base.item_class}`);
        for (const mod of base.implicits)
            if (!Object.hasOwn(data.mods, mod))
                throw new Error(`${id}: unresolved implicit ${mod}`);
    }
    for (const [id, mod] of Object.entries(data.mods)) {
        for (const stat of mod.stats)
            if (!Object.hasOwn(data.stats, stat.id))
                throw new Error(`${id}: unresolved stat ${stat.id}`);
        for (const rule of [...mod.spawn_weights, ...mod.generation_weights])
            if (!tags.has(rule.tag)) throw new Error(`${id}: unresolved weight tag ${rule.tag}`);
    }
    return data;
}

export function modPool(
    base: Base,
    mods: Record<string, Mod>,
    itemLevel: number,
    existing: string[] = [],
) {
    z.number().int().min(1).max(100).parse(itemLevel);
    if (new Set(existing).size !== existing.length)
        throw new Error("Existing modifier IDs must be unique");
    const tags = new Set(base.tags);
    const groups = new Set<string>();
    for (const id of existing) {
        const mod = mods[id];
        if (!mod) throw new Error(`Unknown existing modifier: ${id}`);
        for (const tag of mod.adds_tags) tags.add(tag);
        for (const group of mod.groups) groups.add(group);
    }
    return Object.entries(mods)
        .flatMap(([id, mod]) => {
            if (
                !["prefix", "suffix"].includes(mod.generation_type) ||
                existing.includes(id) ||
                mod.domain !== base.domain ||
                mod.is_essence_only ||
                mod.required_level > itemLevel ||
                (mod.maximum_level > 0 && mod.maximum_level < itemLevel) ||
                mod.groups.some((group) => groups.has(group))
            )
                return [];
            const spawn = mod.spawn_weights.find((rule) => tags.has(rule.tag))?.weight ?? 0;
            const generation =
                mod.generation_weights.find((rule) => tags.has(rule.tag))?.weight ?? 100;
            const effective = (spawn * generation) / 100;
            return effective > 0
                ? [
                      {
                          id,
                          text: mod.text,
                          stats: mod.stats,
                          affix: mod.generation_type,
                          spawn_weight: spawn,
                          generation_percent: generation,
                          effective_weight: effective,
                      },
                  ]
                : [];
        })
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

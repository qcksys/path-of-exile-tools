import { z } from "zod";

export const gameSchema = z.enum(["poe1", "poe2"]);
export const raritySchema = z.enum([
    "Normal",
    "Magic",
    "Rare",
    "Unique",
    "Currency",
    "Gem",
    "Relic",
]);
const id = z.string().min(1).max(500);
const count = z.number().int().nonnegative();
// An explicit JSON type union keeps OpenAPI generators from expanding z.json's recursive definition.
const jsonValue = z
    .json()
    .meta({ type: ["string", "number", "boolean", "null", "array", "object"] });
export const rangeSchema = z
    .strictObject({
        min: z.number().optional(),
        max: z.number().optional(),
    })
    .refine(
        (value) => value.min === undefined || value.max === undefined || value.min <= value.max,
        "Minimum must not exceed maximum.",
    );
const modFlags = z
    .object({
        fractured: z.boolean().optional(),
        crafted: z.boolean().optional(),
        desecrated: z.boolean().optional(),
        mutated: z.boolean().optional(),
        vestigial: z.boolean().optional(),
    })
    .catchall(jsonValue);
const apiModSchema = z.union([
    z.string(),
    z
        .object({
            description: z.string(),
            flags: modFlags.optional(),
            mods: z
                .array(
                    z
                        .object({
                            name: z.string(),
                            tier: z.string(),
                            level: count.optional(),
                        })
                        .catchall(jsonValue),
                )
                .optional(),
        })
        .catchall(jsonValue),
]);

export const apiItemSchema = z
    .object({
        id: z.string().optional(),
        name: z.string().optional(),
        typeLine: z.string().optional(),
        baseType: id,
        ilvl: count.optional(),
        itemLevel: count.optional(),
        rarity: raritySchema.optional(),
        frameType: count.optional(),
        frameTypeId: z.string().optional(),
        identified: z.boolean().optional(),
        corrupted: z.boolean().optional(),
        duplicated: z.boolean().optional(),
        fractured: z.boolean().optional(),
        split: z.boolean().optional(),
        synthesised: z.boolean().optional(),
        sanctified: z.boolean().optional(),
        influences: z.record(z.string(), z.boolean()).optional(),
        sockets: z
            .array(
                z
                    .object({
                        group: count,
                        attr: z.string().optional(),
                        sColour: z.string().optional(),
                        type: z.string().optional(),
                        item: z.string().optional(),
                    })
                    .catchall(jsonValue),
            )
            .optional(),
        explicitMods: z.array(apiModSchema).optional(),
        implicitMods: z.array(apiModSchema).optional(),
        craftedMods: z.array(z.string()).optional(),
        fracturedMods: z.array(z.string()).optional(),
        extended: z
            .object({
                prefixes: count.optional(),
                suffixes: count.optional(),
            })
            .catchall(jsonValue)
            .optional(),
    })
    .catchall(jsonValue);

export const modifierFactSchema = z
    .strictObject({
        id: id.optional(),
        possibleIds: z
            .array(id)
            .min(2)
            .max(100)
            .refine(
                (ids) => new Set(ids).size === ids.length,
                "Possible identities must be distinct.",
            )
            .optional(),
        name: z.string().optional(),
        side: z.enum(["prefix", "suffix", "implicit"]).optional(),
        tier: count.optional(),
        fractured: z.boolean().optional(),
        crafted: z.boolean().optional(),
    })
    .refine(
        (mod) => mod.id === undefined || mod.possibleIds === undefined,
        "Use an exact identity or possible identities, not both.",
    );
export const itemFactsSchema = z.strictObject({
    baseId: id.optional(),
    itemClass: id.optional(),
    qualityType: id.optional(),
    catalystId: id.optional(),
    quality: count.optional(),
    catalystQuality: count.optional(),
    modifiers: z.array(modifierFactSchema).max(100).default([]),
    modifiersComplete: z.boolean().default(false),
    prefixes: count.optional(),
    suffixes: count.optional(),
    prefixLimit: count.optional(),
    memoryStrands: count.optional(),
    memoryStrandsSpent: count.optional(),
    suffixLimit: count.optional(),
    socketCount: count.optional(),
    linkedSockets: z
        .strictObject({ min: count, max: count })
        .refine((range) => range.min <= range.max)
        .optional(),
    stats: z
        .object({
            explicit: z.record(z.string(), z.number()).default({}),
            implicit: z.record(z.string(), z.number()).default({}),
            total: z.record(z.string(), z.number()).default({}),
        })
        .prefault({}),
    statsComplete: z.boolean().default(false),
    destroyed: z.boolean().default(false),
});

export const itemRecordSchema = z.strictObject({
    game: gameSchema,
    source: z.enum(["stash", "trade", "paste", "craft"]),
    item: apiItemSchema,
    facts: itemFactsSchema.prefault({}),
});

export const itemConditionSchema = z.discriminatedUnion("kind", [
    z.strictObject({
        kind: z.literal("base"),
        field: z.enum(["baseType", "baseId", "itemClass", "qualityType", "catalystId"]),
        values: z.array(id).min(1).max(100),
    }),
    z.strictObject({ kind: z.literal("rarity"), values: z.array(raritySchema).min(1).max(7) }),
    z.strictObject({
        kind: z.literal("range"),
        field: z.enum([
            "ilvl",
            "sockets",
            "links",
            "prefixes",
            "suffixes",
            "openPrefixes",
            "openSuffixes",
            "memoryStrands",
            "memoryStrandsSpent",
            "quality",
            "catalystQuality",
        ]),
        value: rangeSchema,
    }),
    z.strictObject({
        kind: z.literal("flag"),
        field: z.enum([
            "identified",
            "corrupted",
            "mirrored",
            "fractured",
            "split",
            "synthesised",
            "sanctified",
            "influenced",
            "destroyed",
        ]),
        value: z.boolean(),
    }),
    z.strictObject({ kind: z.literal("influence"), values: z.array(id).min(1).max(10) }),
    z.strictObject({
        kind: z.literal("mod"),
        ids: z.array(id).min(1).max(100).optional(),
        names: z.array(id).min(1).max(100).optional(),
        tier: rangeSchema.optional(),
        side: modifierFactSchema.shape.side,
        fractured: z.boolean().optional(),
        crafted: z.boolean().optional(),
        count: rangeSchema.default({ min: 1 }),
    }),
    z.strictObject({
        kind: z.literal("stat"),
        id,
        scope: z.enum(["explicit", "implicit", "total"]).default("total"),
        value: rangeSchema,
    }),
]);

export const itemQueryGroupSchema = z
    .strictObject({
        type: z.enum(["and", "or", "not", "count"]),
        filters: z.array(itemConditionSchema).min(1).max(64),
        value: rangeSchema.optional(),
    })
    .refine(
        (group) => group.type !== "count" || group.value !== undefined,
        "Count groups need a count range.",
    );

export const itemQuerySchema = z
    .strictObject({
        format: z.literal(1).default(1),
        game: gameSchema,
        groups: z.array(itemQueryGroupSchema).max(16).default([]),
    })
    .refine(
        (query) => query.groups.reduce((sum, group) => sum + group.filters.length, 0) <= 128,
        "A query may contain at most 128 conditions.",
    );

export type ApiItem = z.infer<typeof apiItemSchema>;
export type ItemRecord = z.infer<typeof itemRecordSchema>;
export type ItemFacts = z.infer<typeof itemFactsSchema>;
export type ModifierFact = z.infer<typeof modifierFactSchema>;
export type ItemCondition = z.infer<typeof itemConditionSchema>;
export type ItemQuery = z.infer<typeof itemQuerySchema>;
export type ItemQueryGroup = z.infer<typeof itemQueryGroupSchema>;
export type NumericRange = z.infer<typeof rangeSchema>;

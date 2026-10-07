/** biome-ignore-all lint/style/useNamingConvention: The derived schemas retain canonical extracted field names. */
import { z } from "zod";
import { craftingDataSchema } from "../../../../packages/poe-game-data/src/crafting-data-model";
import {
    baseSchema,
    modSchema,
    propertiesSchema,
    rangeSchema,
} from "../../../../packages/poe-game-data/src/model";
import { jewelCorruptionRange } from "../lib/crafting-corruption";

export const craftingDefenceRangesSchema = propertiesSchema
    .pick({
        armour: true,
        evasion: true,
        energy_shield: true,
        ward: true,
    })
    .strip();
export const craftingDefenceKeySchema = craftingDefenceRangesSchema.keyof();
export const craftingBaseDefencesSchema = z.partialRecord(
    craftingDefenceKeySchema,
    rangeSchema.shape.min.nonnegative(),
);
export const craftingCombatPropertiesSchema = propertiesSchema
    .pick({
        attack_time: true,
        reload_time: true,
        critical_strike_chance: true,
        physical_damage_min: true,
        physical_damage_max: true,
        block: true,
    })
    .strip();
export const craftingFlaskPropertiesSchema = propertiesSchema
    .pick({
        charges_max: true,
        charges_per_use: true,
        duration: true,
        life_per_use: true,
        mana_per_use: true,
    })
    .strip();
export const craftingAggregatePropertyKeySchema = z.enum([
    "elementalResistance",
    "totalResistance",
    "flatLife",
]);
export const craftingPropertyKeySchema = z.enum([
    "armour",
    "evasion",
    "energy_shield",
    "ward",
    "physicalDps",
    "elementalDps",
    "chaosDps",
    "totalDps",
    "attacksPerSecond",
    "reloadTime",
    "criticalStrikeChance",
    "blockChance",
    "requiredLevel",
    "strengthRequirement",
    "dexterityRequirement",
    "intelligenceRequirement",
    "lifeRecovery",
    "manaRecovery",
    "flaskDuration",
    "maximumCharges",
    "chargesPerUse",
    ...craftingAggregatePropertyKeySchema.options,
]);

export const craftingBaseSchema = baseSchema
    .pick({
        name: true,
        domain: true,
        item_class: true,
        tags: true,
        implicits: true,
        drop_level: true,
        inventory_width: true,
        inventory_height: true,
        requirements: true,
    })
    .strip()
    .extend({
        strongbox: z.literal(true).optional(),
        levelRules: z
            .object({
                inventory_type: z.string().nullable().default(null),
                no_level_requirement: z.enum(["true", "false"]).default("false"),
            })
            .prefault({}),
        defences: craftingDefenceRangesSchema,
        combat: craftingCombatPropertiesSchema.prefault({}),
        flask: craftingFlaskPropertiesSchema.prefault({}),
        rarities: z.array(z.enum(["normal", "magic", "rare"])),
        corrupted: z.boolean(),
        initialSockets: craftingDataSchema.shape.baseRules.valueType.shape.initialSockets,
        socketInfo: z
            .array(
                z.object({
                    count: z.number().int().min(0).max(6),
                    level: z.number().int().nonnegative(),
                    weight: z.number().int().nonnegative(),
                }),
            )
            .default([]),
    });
export const craftingModSchema = modSchema.omit({ grants_effects: true, gold_value: true }).strip();
export const craftingCatalogSchema = z.object({
    format: z.literal(1),
    game: z.enum(["poe1", "poe2"]),
    patch: z.string(),
    manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
    craftingSha256: z.string().regex(/^[a-f0-9]{64}$/),
    bases: z.record(z.string(), craftingBaseSchema),
    mods: z.record(z.string(), craftingModSchema),
    crafting: craftingDataSchema,
});

const id = z.string().min(1);
const itemLevel = z.number().int().min(1).max(100);
const catalystQuality = z.number().int().min(0).max(200);
const memoryStrands = z.number().int().min(0).max(100);
const memoryMapSchema = z.object({ intentions: z.number().int().nonnegative() });
const baseQuality = z.number().int().min(0).max(200);
const catalystSchema = z.object({ id, quality: catalystQuality });
const influencesSchema = z
    .array(z.number().int().min(0).max(5))
    .max(6)
    .refine((values) => new Set(values).size === values.length, "Influences must be unique.");
export const rolledModSchema = z
    .object({
        id,
        essence: z.literal(true).optional(),
        values: z.array(z.number().int()),
        fractured: z.boolean().default(false),
        crafted: z.boolean().default(false),
        desecrated: z.literal(true).optional(),
        sanctification: z.number().int().positive().optional(),
        corruptionScale: z
            .number()
            .int()
            .min(jewelCorruptionRange.min)
            .max(jewelCorruptionRange.max)
            .optional(),
        grantedPassive: id.optional(),
        attributeSource: id.optional(),
        conversion: z
            .object({
                source: id,
                steps: z
                    .array(
                        z.object({
                            socket: z.number().int().min(0).max(6),
                            order: z.number().int().min(0).max(6),
                        }),
                    )
                    .min(1)
                    .max(7),
            })
            .optional(),
        origin: z
            .discriminatedUnion("kind", [
                z.object({ kind: z.literal("awakener"), level: itemLevel }),
                z.object({ kind: z.literal("recombine"), level: itemLevel }),
                z.object({ kind: z.literal("beast"), level: itemLevel, recipe: id }),
            ])
            .optional(),
    })
    .meta({ id: "CraftingRolledModifier" });
const craftingItemFieldsSchema = z.object({
    baseId: id,
    level: itemLevel,
    rarity: z.enum(["normal", "magic", "rare"]),
    unidentified: z.literal(true).optional(),
    influences: influencesSchema.max(2).default([]),
    mods: z.array(rolledModSchema).max(9),
    implicits: z.array(rolledModSchema).max(6),
    implicitCraft: z
        .object({ currency: id, level: itemLevel, removed: z.array(id).max(6) })
        .optional(),
    anointments: z.array(id).max(9).optional(),
    blight: id.optional(),
    cluster: z
        .object({
            passive: id,
            nodes: z.number().int().positive().optional(),
            jewelSockets: z.number().int().nonnegative().optional(),
        })
        .optional(),
    enchantments: z.array(rolledModSchema).max(1).optional(),
    corrupted: z.boolean().default(false),
    corruptedBy: id.optional(),
    destroyed: z.literal(true).optional(),
    destroyedBy: id.optional(),
    twiceCorrupted: z.literal(true).optional(),
    mirrored: z.boolean().default(false),
    split: z.boolean().optional(),
    sanctified: z.boolean().optional(),
    putrefied: z.literal(true).optional(),
    quality: baseQuality.default(0),
    baseDefences: craftingBaseDefencesSchema.optional(),
    mapQuality: id.optional(),
    sockets: z.number().int().min(0).max(7).optional(),
    socketLinks: z.array(z.boolean().nullable()).min(1).max(5).optional(),
    augments: z.array(id).max(7).optional(),
    jewelSocket: id.optional(),
    catalyst: catalystSchema.optional(),
    memoryStrands: memoryStrands.optional(),
    intangibility: craftingDataSchema.shape.allflame
        .unwrap()
        .shape.currencies.element.shape.intangibility.shape.max.optional(),
    allflameCrafted: z.literal(true).optional(),
    memoryMap: memoryMapSchema.optional(),
});
export const craftingRevealContextSchema = craftingItemFieldsSchema.extend({
    socketedJewel: craftingItemFieldsSchema.strict().optional(),
});
const craftingItemCoreSchema = craftingItemFieldsSchema
    .extend({
        reveal: z
            .object({
                mod: id,
                source: id,
                mark: id.optional(),
                index: z.number().int().min(0).max(5).optional(),
                choices: z.array(id).max(3),
                offeredOn: craftingRevealContextSchema.optional(),
                omens: z.array(id).max(4).optional(),
                echoes: z
                    .object({ omen: id, remaining: z.union([z.literal(0), z.literal(1)]) })
                    .optional(),
            })
            .optional(),
    })
    .meta({ id: "CraftingItemCore" });
export const craftingItemStateSchema = craftingItemCoreSchema
    .extend({
        socketedJewel: craftingItemCoreSchema.strict().optional(),
    })
    .meta({ id: "CraftingItemState" });
export const craftingFlagSchema = craftingItemCoreSchema
    .pick({ corrupted: true, mirrored: true, split: true, sanctified: true })
    .keyof();
export const craftingItemSchema = craftingItemStateSchema
    .extend({
        imprint: craftingItemStateSchema.optional(),
        allflameCopies: z.array(craftingItemStateSchema).min(1).max(4).optional(),
        allflameCost: craftingDataSchema.shape.bench.element.shape.cost.min(1).optional(),
    })
    .meta({ id: "CraftingItem" });
const inventoryTabNameSchema = z
    .string()
    .trim()
    .min(1)
    .max(60)
    .refine((name) => name !== "Unfiled", "Unfiled is reserved for items without a tab.");
export const craftingInventoryEntrySchema = z.object({
    id,
    name: z.string().min(1).max(100),
    item: craftingItemSchema,
    tab: inventoryTabNameSchema.optional(),
});
export const fossilMethodSchema = z.object({
    kind: z.literal("fossils"),
    allflame: z.literal(true).optional(),
    tangled: id.optional(),
    ids: z.array(id).min(1).max(4),
    resonator: id,
    logic: z.enum(["additive", "multiplicative"]).default("additive"),
});
const craftingMethodOptionsSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("genesis"),
        id: z.literal("genesis"),
        nodes: z.array(id).max(100).default([]),
    }),
    z.object({
        kind: z.literal("generate"),
        id: craftingItemStateSchema.shape.rarity,
        breachRings: z
            .union([
                z.literal("legacy"),
                z.record(
                    z.enum(["Xoph", "Tul", "Esh", "Uul-Netol", "Chayula"]),
                    z.number().int().min(0).max(60),
                ),
            ])
            .optional(),
    }),
    z.object({
        kind: z.literal("socket_jewel"),
        id: z.literal("socket_jewel"),
        jewel: craftingInventoryEntrySchema.optional(),
    }),
    z.object({ kind: z.literal("remove_jewel"), id: z.literal("remove_jewel") }),
    z.object({
        kind: z.literal("recombine"),
        id: z.literal("recombine"),
        donor: craftingInventoryEntrySchema.optional(),
    }),
    z.object({
        kind: z.literal("currency"),
        id,
        allflame: z.literal(true).optional(),
        omens: z.array(id).max(4).optional(),
        donor: craftingInventoryEntrySchema.optional(),
    }),
    z.object({
        kind: z.literal("essence"),
        id,
        omens: z.array(id).max(4).optional(),
        allflame: z.literal(true).optional(),
    }),
    z.object({ kind: z.literal("bench"), id, skipOnConflict: z.boolean().optional() }),
    z.object({
        kind: z.literal("augment"),
        id,
        replace: z.number().int().min(0).max(6).optional(),
    }),
    z.object({
        kind: z.literal("upgrade_augment"),
        id,
        socket: z.number().int().min(0).max(6).default(0),
    }),
    z.object({ kind: z.literal("locus"), id }),
    z.object({
        kind: z.literal("anoint"),
        id,
        additional: z.array(id).max(8).optional(),
        oils: z.array(id).max(2).optional(),
    }),
    fossilMethodSchema,
    z.object({ kind: z.literal("harvest"), id }),
    z.object({ kind: z.literal("beast"), id, level: itemLevel.optional() }),
    z.object({
        kind: z.literal("reveal"),
        preferred: z.array(id).max(100).default([]),
        skipOnMiss: z.boolean().optional(),
        omens: z.array(id).max(4).optional(),
    }),
]);
export const craftingMethodSchema = z
    .preprocess((input, context) => {
        if (
            input &&
            typeof input === "object" &&
            "allflame" in input &&
            input.allflame !== undefined &&
            (!("kind" in input) || !["currency", "essence", "fossils"].includes(String(input.kind)))
        ) {
            context.issues.push({
                code: "custom",
                message: "Allflame requires an eligible itemized currency, essence or resonator.",
                input,
            });
            return z.NEVER;
        }
        return input;
    }, craftingMethodOptionsSchema)
    .meta({ id: "CraftingMethod" });
const affixCountRangeSchema = z
    .object({
        min: z.number().int().min(0).max(9),
        max: z.number().int().min(0).max(9),
    })
    .refine((range) => range.min <= range.max, "Minimum affix count exceeds maximum.");
const ordinaryAffixCountRangeSchema = affixCountRangeSchema.refine(
    (range) => range.max <= 6,
    "Maximum affix count exceeds six.",
);
const statTargetSchema = z
    .object({
        id,
        scope: z.enum(["all", "explicit", "implicit"]).default("all"),
        min: z.number().int().optional(),
        max: z.number().int().optional(),
    })
    .refine(
        (stat) => stat.min !== undefined || stat.max !== undefined,
        "Choose a minimum or maximum stat value.",
    )
    .refine(
        (stat) => stat.min === undefined || stat.max === undefined || stat.min <= stat.max,
        "Minimum stat value exceeds maximum.",
    );
const craftingTargetFieldsSchema = z.object({
    groups: z
        .array(
            z.object({
                mods: z.array(id).min(1).max(100),
                minimum: z.number().int().min(1).max(9).default(1),
                fractured: z.boolean().optional(),
                negated: z.boolean().optional(),
            }),
        )
        .max(12),
    minimumGroups: z.number().int().min(0).max(12).default(0),
    openPrefixes: z.number().int().min(0).max(6).default(0),
    openSuffixes: z.number().int().min(0).max(6).default(0),
    openAffixes: z.number().int().min(0).max(9).optional(),
    rarity: craftingItemStateSchema.shape.rarity.optional(),
    corrupted: craftingItemStateSchema.shape.corrupted.unwrap().optional(),
    mirrored: craftingItemStateSchema.shape.mirrored.unwrap().optional(),
    split: craftingItemStateSchema.shape.split,
    sanctified: craftingItemStateSchema.shape.sanctified,
    jewelSocket: z.boolean().optional(),
    socketedJewel: z.boolean().optional(),
    baseDefences: z
        .partialRecord(
            craftingDefenceKeySchema,
            rangeSchema.refine(
                (range) => range.min >= 0,
                "Base defence requirements cannot be negative.",
            ),
        )
        .optional(),
    properties: z
        .partialRecord(
            craftingPropertyKeySchema,
            z
                .object({
                    min: z.number().finite().optional(),
                    max: z.number().finite().optional(),
                })
                .refine(
                    (range) => range.min !== undefined || range.max !== undefined,
                    "Choose a minimum or maximum item property value.",
                )
                .refine(
                    (range) =>
                        range.min === undefined ||
                        range.max === undefined ||
                        range.min <= range.max,
                    "Minimum item property value exceeds maximum.",
                ),
        )
        .refine(
            (properties) =>
                Object.entries(properties).every(
                    ([key, range]) =>
                        craftingAggregatePropertyKeySchema.options.some((name) => name === key) ||
                        ((range.min === undefined || range.min >= 0) &&
                            (range.max === undefined || range.max >= 0)),
                ),
            "Only resistance and flat-life requirements can be negative.",
        )
        .optional(),
    mapTier: z
        .object({
            min: craftingDataSchema.shape.maps.element.shape.tier.positive(),
            max: craftingDataSchema.shape.maps.element.shape.tier.positive(),
        })
        .refine((range) => range.min <= range.max, "Minimum map tier exceeds maximum.")
        .optional(),
    waystoneTier: z
        .object({
            min: craftingDataSchema.shape.waystones.element.shape.tier,
            max: craftingDataSchema.shape.waystones.element.shape.tier,
        })
        .refine((range) => range.min <= range.max, "Minimum Waystone tier exceeds maximum.")
        .optional(),
    sockets: z
        .object({
            min: craftingItemStateSchema.shape.sockets.unwrap(),
            max: craftingItemStateSchema.shape.sockets.unwrap(),
        })
        .refine((range) => range.min <= range.max, "Minimum socket count exceeds maximum.")
        .optional(),
    linkedSockets: z
        .object({
            min: craftingItemStateSchema.shape.sockets.unwrap().max(6),
            max: craftingItemStateSchema.shape.sockets.unwrap().max(6),
        })
        .refine((range) => range.min <= range.max, "Minimum linked sockets exceeds maximum.")
        .optional(),
    quality: z
        .object({
            min: baseQuality,
            max: baseQuality,
            mapType: craftingItemStateSchema.shape.mapQuality,
        })
        .refine((range) => range.min <= range.max, "Minimum base quality exceeds maximum.")
        .optional(),
    memoryStrands: z
        .object({ min: memoryStrands, max: memoryStrands })
        .refine((range) => range.min <= range.max, "Minimum memory strands exceeds maximum.")
        .optional(),
    intangibility: z
        .object({
            min: craftingItemStateSchema.shape.intangibility.unwrap(),
            max: craftingItemStateSchema.shape.intangibility.unwrap(),
        })
        .refine((range) => range.min <= range.max, "Minimum intangibility exceeds maximum.")
        .optional(),
    intentions: z
        .object({ min: memoryMapSchema.shape.intentions, max: memoryMapSchema.shape.intentions })
        .refine((range) => range.min <= range.max, "Minimum Intention uses exceeds maximum.")
        .optional(),
    catalyst: catalystSchema
        .pick({ id: true })
        .partial()
        .extend({ min: catalystQuality, max: catalystQuality })
        .refine((range) => range.min <= range.max, "Minimum catalyst quality exceeds maximum.")
        .optional(),
    influences: influencesSchema.optional(),
    affixCount: affixCountRangeSchema.optional(),
    prefixCount: ordinaryAffixCountRangeSchema.optional(),
    suffixCount: ordinaryAffixCountRangeSchema.optional(),
    unrevealedCount: ordinaryAffixCountRangeSchema.optional(),
    anointments: z.array(id).max(9).optional(),
    enchantments: z.array(id).max(1).optional(),
    grantedPassives: z.array(id).max(1).optional(),
    stats: z
        .array(statTargetSchema)
        .max(12)
        .refine(
            (stats) => new Set(stats.map((stat) => stat.id)).size === stats.length,
            "Choose each target stat only once.",
        )
        .optional(),
});
export type CraftingTarget = z.infer<typeof craftingTargetFieldsSchema> & {
    expression?: {
        operator: "and" | "or";
        negated?: boolean;
        operands: CraftingTarget[];
    };
};
export const maximumConditionDepth = 8;
export const maximumConditionNodes = 64;

function nestedTargetSchema(depth: number): z.ZodType<CraftingTarget> {
    return craftingTargetFieldsSchema.extend({
        expression: depth
            ? z
                  .object({
                      operator: z.enum(["and", "or"]),
                      negated: z.boolean().optional(),
                      operands: z
                          .array(nestedTargetSchema(depth - 1))
                          .min(1)
                          .max(12),
                  })
                  .optional()
            : z
                  .never({ error: "Requirements exceed the maximum nesting depth." })
                  // OpenAPI's converter needs a type override; not:{} still rejects every value.
                  .meta({ type: "object", not: {} })
                  .optional(),
    });
}

export const craftingTargetSchema = nestedTargetSchema(maximumConditionDepth).refine((target) => {
    const pending = [target];
    for (let index = 0; index < pending.length; index++) {
        if (pending.length > maximumConditionNodes) return false;
        pending.push(...(pending[index]!.expression?.operands ?? []));
    }
    return true;
}, `Requirements cannot exceed ${maximumConditionNodes} condition nodes.`);

export const craftingBranchSchema = z.object({
    id: id.refine((value) => value !== "fail", "The fallback route ID is reserved."),
    condition: craftingTargetSchema,
    destination: id,
});

export const craftingStepSchema = z.object({
    id,
    name: z.string().max(120).optional(),
    description: z.string().max(1000).optional(),
    position: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
    method: craftingMethodSchema.optional(),
    condition: craftingTargetSchema,
    onSuccess: z.string().default("success"),
    onFailure: z.string().default("failure"),
    branches: z
        .array(craftingBranchSchema)
        .max(12)
        .refine(
            (branches) => new Set(branches.map((branch) => branch.id)).size === branches.length,
            "Route IDs must be unique within a step.",
        )
        .optional(),
});
export const craftingProjectSchema = z.object({
    format: z.literal(1),
    game: z.enum(["poe1", "poe2"]),
    patch: z.string(),
    item: craftingItemSchema,
    inventory: z.array(craftingInventoryEntrySchema).max(100).default([]),
    inventoryTabs: z
        .array(inventoryTabNameSchema)
        .max(20)
        .refine((tabs) => new Set(tabs).size === tabs.length, "Inventory tab names must be unique.")
        .optional(),
    target: craftingTargetSchema,
    method: craftingMethodSchema,
    steps: z.array(craftingStepSchema).max(50),
    useProcess: z.boolean().default(false),
    baseCost: z.number().finite().nonnegative().optional(),
    prices: z.record(z.string(), z.number().finite().nonnegative()),
    seed: z.number().int().min(0).max(4294967295),
    iterations: z.number().int().min(1).max(1000000),
    simulationLimit: z
        .discriminatedUnion("kind", [
            z.object({
                kind: z.enum(["successes", "actions"]),
                count: z.number().int().min(1).max(1000000),
            }),
            z.object({ kind: z.literal("manual") }),
        ])
        .optional(),
    sampleStorage: z
        .object({
            mode: z.enum(["all", "successes", "none"]),
            limit: z.number().int().min(1).max(1000),
        })
        .optional(),
    successDistribution: z.boolean().optional(),
    maxActions: z.number().int().min(1).max(10000),
});

export const craftingLibrarySchema = craftingProjectSchema.pick({
    format: true,
    game: true,
    patch: true,
    inventory: true,
    inventoryTabs: true,
});

export type CraftingCatalog = z.infer<typeof craftingCatalogSchema>;
export type CraftingBase = z.infer<typeof craftingBaseSchema>;
export type CraftingMod = z.infer<typeof craftingModSchema>;
export type CraftingItem = z.infer<typeof craftingItemSchema>;
export type RolledMod = z.infer<typeof rolledModSchema>;
export type CraftingMethod = z.infer<typeof craftingMethodSchema>;
export type CraftingStep = z.infer<typeof craftingStepSchema>;
export type CraftingBranch = z.infer<typeof craftingBranchSchema>;
export type CraftingProject = z.infer<typeof craftingProjectSchema>;
export type CraftingLibrary = z.infer<typeof craftingLibrarySchema>;

import { z } from "zod";
import { genesisEffect, genesisItemClasses } from "./crafting-genesis.ts";
import {
    resolveBaseQuality,
    resolveBeastAugmentation,
    resolveBeastLinks,
    resolveBeastMapCorruption,
    resolveBeastMetamods,
    resolveBeastSockets,
    resolveBlightedMaps,
    resolveCatalystMaximumQuality,
    resolveFlaskEnchantments,
    resolveMemoryMaps,
    resolveQualityClasses,
    resolveQualityInfusers,
    resolveSanctification,
    resolveTaintedCatalysts,
    resolveTalismanCraft,
} from "./crafting-keywords.ts";
import { type Dataset, statValueSchema } from "./model.ts";

const id = z.string().min(1);
const integer = z.number().int();
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export function randomFossilOutcomeIds(ids: string[]) {
    return ids.filter((id) => /^Metadata\/Items\/Currency\/RandomFossilOutcome\d+$/.test(id));
}
const qualityCurrencySchema = z.object({
    id,
    itemClasses: z.array(id).min(1),
    maximumQuality: integer.positive().max(200),
});
export const craftingCostSchema = z.object({ id, name: id, amount: integer.positive() });
export const currencySchema = z.object({
    id,
    name: z.string(),
    action: z.string(),
    description: z.string(),
    directions: z.string(),
});
export const strongboxSchema = z.object({
    id,
    name: id,
    inheritsFrom: id,
    baseItem: id.nullable(),
    tags: z.array(id),
    mods: z.array(id),
    minimumLevel: integer.nonnegative(),
    maximumLevel: integer.nonnegative(),
    spawnWeight: integer.nonnegative(),
    spawnWeightIncreaseStat: id.nullable(),
    spawnWeightHardmode: integer.nonnegative(),
    basicSpawnChanceStat: id.nullable(),
    requiredSpawnStats: z.array(id),
    blockingSpawnStats: z.array(id),
});
const passiveSchema = z.object({
    name: id,
    hash: integer.nonnegative(),
    notable: z.boolean(),
    stats: z.array(statValueSchema),
    text: z.string().nullable(),
});
export const allflameSchema = z.object({
    sulphur: id,
    description: id,
    intangibilityDescription: id,
    ghostlyCopyDescription: id,
    classes: z
        .array(
            z.object({ itemClass: id, costPercent: integer.positive(), levelScaling: z.boolean() }),
        )
        .min(1),
    levels: z
        .array(z.object({ level: integer.min(1).max(100), costIncreasePercent: integer.min(-99) }))
        .min(1),
    currencies: z
        .array(
            z.object({
                id,
                currency: id,
                tier: integer.nonnegative(),
                outcomes: z.object({ min: integer.positive(), max: integer.positive() }),
                sulphurCost: integer.nonnegative(),
                intangibility: z.object({
                    min: integer.min(0).max(100),
                    max: integer.min(0).max(100),
                }),
            }),
        )
        .min(1),
});
export const craftingDataSchema = z.object({
    format: z.literal(1),
    game: z.enum(["poe1", "poe2"]),
    patch: id,
    source: z.object({
        basesSha256: sha,
        modsSha256: sha,
        schemaSha256: sha,
        tables: z.record(id, sha),
    }),
    currencies: z.array(currencySchema),
    allflame: allflameSchema.nullable(),
    genesis: z
        .object({
            name: id,
            fruit: id,
            asset: id,
            itemClasses: z.array(id).min(1),
            passives: z.record(id, passiveSchema),
        })
        .nullable(),
    strongboxes: z.array(strongboxSchema),
    clusterJewels: z
        .object({
            bases: z.record(
                id,
                z.object({
                    size: id,
                    minNodes: integer.positive(),
                    maxNodes: integer.positive(),
                    socketIndices: z.array(integer.nonnegative()),
                }),
            ),
            skills: z.record(id, passiveSchema.extend({ size: id, tag: id })),
            passives: z.record(id, passiveSchema.extend({ id })),
        })
        .nullable(),
    augmentTags: z.record(id, id),
    taggedModifierEffects: z.array(
        z.object({
            stat: id,
            tags: z.array(id).min(1),
            explicit: z.boolean(),
            implicit: z.boolean(),
            prefix: z.boolean(),
            suffix: z.boolean(),
        }),
    ),
    augments: z.array(
        z.object({
            id,
            name: id,
            requiredLevel: integer.nonnegative(),
            type: z.object({ id, name: id, effectStat: id.nullable(), socketedStat: id }),
            limit: z.object({ id, amount: integer.positive(), text: z.string() }).nullable(),
            higherTier: id.nullable(),
            socketBound: z.boolean(),
            martialArtist: z.boolean(),
            unique: z.boolean(),
            jewellery: z.boolean(),
            corruptedSanctified: z.boolean(),
            description: z.string().nullable(),
            extraDescription: z.string().nullable(),
            rules: z.array(
                z.object({
                    category: id,
                    display: z.string(),
                    itemClasses: z.array(id).min(1),
                    scope: z.enum(["classes", "martial", "armour", "all"]),
                    stats: z.array(statValueSchema),
                    bondedStats: z.array(statValueSchema),
                    text: z.string().nullable(),
                    bondedText: z.string().nullable(),
                    statDescriptions: z.array(integer.nonnegative()),
                    bondedDescriptions: z.array(integer.nonnegative()),
                }),
            ),
        }),
    ),
    locus: z.object({ id, name: id, tier: integer.positive(), description: id }).nullable(),
    templeCorruption: z
        .object({
            currencies: z.array(z.object({ id, itemClasses: z.array(id).min(1) })).min(1),
            twiceCorruptedText: id,
            alreadyTwiceCorruptedText: id,
        })
        .nullable(),
    maps: z.array(
        z.object({
            id,
            tier: integer.nonnegative(),
            generation: integer.nonnegative(),
            upgrade: id.nullable(),
            areaLevel: integer.positive(),
        }),
    ),
    waystones: z.array(
        z.object({
            id,
            tier: integer.positive(),
            series: integer.nonnegative(),
            areaLevel: integer.positive(),
        }),
    ),
    baseQuality: z.array(qualityCurrencySchema.extend({ corrupted: z.boolean() })),
    taintedCatalysts: z.array(qualityCurrencySchema),
    mapQuality: z.array(
        qualityCurrencySchema.extend({
            qualityType: id,
            description: id,
            stats: z.array(id).min(1),
        }),
    ),
    qualityInfusers: z.array(
        z.object({
            id,
            itemClasses: z.array(id).min(1),
            qualityType: z.enum(["base", "catalyst"]),
            extraMaximumQuality: integer.positive().max(200),
        }),
    ),
    memoryStrandCosts: z.record(id, integer.positive()),
    memoryMaps: z
        .object({
            currency: id,
            maximumUses: integer.positive(),
            influenceMod: id,
            enchantmentMod: id,
        })
        .nullable(),
    keywords: z.record(id, z.object({ term: id, definition: id })),
    sanctification: z.object({ min: integer.positive(), max: integer.positive() }).nullable(),
    recombinableClasses: z
        .array(id)
        .refine(
            (classes) => new Set(classes).size === classes.length,
            "Duplicate recombinable item class.",
        ),
    craftableModTypes: z.array(id),
    passiveTree: z
        .object({
            asset: id,
            notables: z.record(
                id,
                passiveSchema.extend({
                    ascendancy: id.nullable(),
                    visibleForAscendancy: id.nullable(),
                }),
            ),
        })
        .nullable(),
    anointing: z.object({
        maps: z.array(
            z.object({
                mod: id,
                maximumAnointments: integer.positive().max(9),
                ravaged: z.boolean(),
            }),
        ),
        items: z.array(
            z.object({ id, useType: integer.nonnegative(), tier: integer.nonnegative() }),
        ),
        recipes: z.array(
            z.object({
                id,
                type: id.nullable(),
                items: z.array(id).min(1),
                mod: id.nullable(),
                passive: id.nullable(),
            }),
        ),
        passives: z.record(id, passiveSchema),
    }),
    liquidEmotions: z.array(
        z.object({
            id,
            rules: z.array(z.object({ base: id, mods: z.array(id).min(1) })).min(1),
        }),
    ),
    scalableStats: z.array(id),
    catalysts: z.array(
        z.object({
            id,
            qualityType: id,
            description: id,
            maximumQuality: integer.positive().max(200),
            itemClasses: z.array(id).min(1),
            tags: z.array(id),
            explicit: z.boolean(),
            implicit: z.boolean(),
            prefix: z.boolean(),
            suffix: z.boolean(),
        }),
    ),
    modEquivalencies: z.array(z.object({ id, mods: z.array(id) })),
    elementalConversions: z.array(
        z.object({
            id,
            resistance: z.boolean(),
            mods: z.object({
                fire: id.nullable(),
                cold: id.nullable(),
                lightning: id.nullable(),
                chaos: id.nullable(),
            }),
        }),
    ),
    desecration: z.array(
        z.object({
            id,
            itemClasses: z.array(id),
            maximumItemLevel: integer.nonnegative(),
            minimumModLevel: integer.nonnegative(),
            tag: id.nullable(),
        }),
    ),
    baseRules: z.record(
        id,
        z.object({
            corrupted: z.boolean(),
            unmodifiable: z.boolean(),
            initialSockets: integer.min(0).max(6),
        }),
    ),
    tieredCurrency: z.array(
        z.object({ id, tier: integer, minimumModLevel: integer.nonnegative() }),
    ),
    poe2Essences: z.array(
        z.object({
            id,
            name: z.string(),
            tier: integer,
            perfect: z.boolean(),
            replacement: z.array(id),
            rules: z.array(
                z.object({
                    itemClasses: z.array(id),
                    mod: id.nullable(),
                    text: z.string(),
                    outcomes: z.array(
                        z.object({ mod: id, weight: integer.nonnegative().nullable() }),
                    ),
                }),
            ),
        }),
    ),
    rarities: z.record(
        id,
        z.object({
            min: integer.nonnegative(),
            max: integer.nonnegative(),
            prefixes: integer.nonnegative(),
            suffixes: integer.nonnegative(),
        }),
    ),
    classes: z.record(
        id,
        z.object({
            influence: z.boolean(),
            fracture: z.boolean(),
            veiled: z.boolean(),
            corrupt: z.boolean(),
            doubleCorrupt: z.boolean(),
            aspects: z.boolean(),
            upgrade: z.boolean(),
            unmodifiable: z.boolean(),
        }),
    ),
    influences: z.array(
        z.object({ itemClass: id, influence: integer.min(0).max(5), tag: id, name: id }),
    ),
    influenceUpgrades: z.array(z.object({ mod: id, upgraded: id, highestTier: z.boolean() })),
    modRules: z.record(
        id,
        z.object({
            itemClasses: z.array(id),
            influence: integer.min(0).max(5).nullable(),
            spawnLevel: integer.nullable(),
            gameMode: integer.nullable(),
        }),
    ),
    statDescriptions: z.array(
        z.object({
            ids: z.array(id),
            rules: z.array(
                z.object({
                    conditions: z.array(z.string()),
                    text: z.string(),
                    handlers: z.array(z.string()),
                }),
            ),
        }),
    ),
    modDescriptions: z.record(id, z.array(integer.nonnegative())),
    modTexts: z.record(id, id),
    statLookups: z.record(id, z.record(z.string(), z.string())),
    essences: z.array(
        z.object({
            id,
            name: z.string(),
            level: integer,
            itemLevelLimit: integer.nonnegative(),
            corrupted: z.boolean(),
            mods: z.record(id, id),
        }),
    ),
    flaskEnchantments: z.array(
        z.object({ id, itemClasses: z.array(id).min(1), mods: z.array(id).min(1) }),
    ),
    bench: z.array(
        z.object({
            id,
            name: z.string(),
            mod: id.nullable(),
            itemClasses: z.array(id),
            cost: z.array(craftingCostSchema),
            level: integer.nonnegative(),
            action: integer.nullable(),
            socketCount: integer.min(1).max(6).nullable(),
            linkCount: integer.min(2).max(6).nullable(),
            enchantment: z.object({ mod: id, itemClasses: z.array(id).min(1) }).nullable(),
        }),
    ),
    fossils: z.array(
        z.object({
            id,
            name: z.string(),
            positive: z.array(z.object({ tag: id, weight: integer.nonnegative() })),
            negative: z.array(z.object({ tag: id, weight: integer.nonnegative() })),
            added: z.array(id),
            forced: z.array(id),
            allowed: z.array(z.object({ tag: id.nullable(), itemClass: z.string() })),
            forbidden: z.array(z.object({ tag: id.nullable(), itemClass: z.string() })),
            descriptions: z.array(z.string()),
            effects: z.array(id),
            randomOutcomes: z.array(id),
            lucky: z.boolean(),
            quality: z.boolean(),
            mirrored: z.boolean(),
            whiteSockets: z.boolean(),
            corruptedEssenceChance: integer.min(0).max(100),
        }),
    ),
    harvest: z.array(
        z.object({
            id,
            name: z.string(),
            command: z.string(),
            parameters: z.string(),
            enchantment: z.object({ mod: id, itemClasses: z.array(id).min(1) }).nullable(),
            affinityMultiplier: z.number().finite().positive().nullable(),
            influenceRerollClasses: z.array(id).min(1).nullable(),
            lifeforceType: integer,
            lifeforce: integer.nonnegative(),
            sacred: integer.nonnegative(),
            gameMode: integer.nullable(),
        }),
    ),
    beasts: z.array(
        z.object({
            id,
            category: z.string(),
            description: z.string(),
            notes: z.string(),
            components: z.array(z.object({ id, level: integer })),
            mod: id.nullable(),
            aspectMod: id.nullable(),
            metamods: z.array(id),
            augmentation: z
                .union([
                    z.object({ influence: integer.min(0).max(5) }),
                    z.object({ itemClass: id }),
                ])
                .nullable(),
            mapCorruption: z.enum(["implicit", "twice"]).nullable(),
            maximumSockets: z.boolean(),
            maximumLinks: z.boolean(),
            talismanCraft: z
                .union([
                    z.literal("imprint"),
                    z.object({ fractures: integer.min(1).max(2), minimumMods: integer.positive() }),
                ])
                .nullable(),
            gameMode: integer.nullable(),
        }),
    ),
});

export type CraftingData = z.infer<typeof craftingDataSchema>;

export function validateCraftingData(
    input: unknown,
    expected: Pick<CraftingData, "game" | "patch"> & Omit<CraftingData["source"], "tables">,
    data: Pick<Dataset, "base_items" | "mods" | "item_classes" | "tags">,
) {
    const crafting = craftingDataSchema.parse(input);
    const sanctification = resolveSanctification(crafting.keywords.Sanctified?.definition);
    if (
        crafting.sanctification?.min !== sanctification?.min ||
        crafting.sanctification?.max !== sanctification?.max ||
        (crafting.game === "poe1" && sanctification !== null)
    )
        throw new Error("Sanctification does not match the extracted keyword definition.");
    if (
        crafting.currencies.some((entry) => entry.id.endsWith("/OmenOnDivineSanctify")) &&
        !sanctification
    )
        throw new Error("Missing Sanctified keyword definition for the extracted omen.");
    if (
        crafting.game !== expected.game ||
        crafting.patch !== expected.patch ||
        crafting.source.basesSha256 !== expected.basesSha256 ||
        crafting.source.modsSha256 !== expected.modsSha256 ||
        crafting.source.schemaSha256 !== expected.schemaSha256
    )
        throw new Error("Crafting data does not match the extracted client build and schema.");
    if (!Object.keys(crafting.source.tables).length)
        throw new Error("Crafting data has no raw table provenance.");
    if (crafting.passiveTree) {
        if (crafting.game !== "poe2" || !crafting.source.tables[crafting.passiveTree.asset])
            throw new Error("Passive tree has no matching client asset provenance.");
        const hashes = new Set<number>();
        for (const passive of Object.values(crafting.passiveTree.notables)) {
            if (!passive.notable || hashes.has(passive.hash))
                throw new Error("Invalid or duplicate passive tree notable.");
            hashes.add(passive.hash);
        }
    }
    const ref = (kind: string, id: string, records: object) => {
        if (!Object.hasOwn(records, id)) throw new Error(`Unresolved crafting ${kind}: ${id}`);
    };
    const mod = (id: string) => ref("modifier", id, data.mods);
    const base = (id: string) => ref("base", id, data.base_items);
    const itemClass = (id: string) => ref("item class", id, data.item_classes);
    if (crafting.clusterJewels) {
        if (crafting.game !== "poe1") throw new Error("Cluster Jewels require PoE 1 records.");
        for (const table of [
            "PassiveTreeExpansionJewels",
            "PassiveTreeExpansionJewelSizes",
            "PassiveTreeExpansionSkills",
            "PassiveTreeExpansionSpecialSkills",
            "PassiveSkills",
            "Stats",
            "Tags",
        ])
            if (!crafting.source.tables[`Data/${table}.datc64`])
                throw new Error(`Cluster Jewels have no matching table provenance: ${table}`);
        const { bases, skills, passives } = crafting.clusterJewels;
        if (!Object.keys(bases).length || !Object.keys(skills).length)
            throw new Error("Missing Cluster Jewel bases or passive skills.");
        for (const [id, item] of Object.entries(data.base_items))
            if (item.domain === "affliction_jewel" && !bases[id])
                throw new Error(`Missing Cluster Jewel base: ${id}`);
        for (const [id, rule] of Object.entries(bases)) {
            base(id);
            if (
                data.base_items[id]!.domain !== "affliction_jewel" ||
                rule.minNodes > rule.maxNodes ||
                new Set(rule.socketIndices).size !== rule.socketIndices.length ||
                !Object.values(skills).some((skill) => skill.size === rule.size)
            )
                throw new Error(`Invalid Cluster Jewel base: ${id}`);
        }
        for (const [id, skill] of Object.entries(skills)) {
            if (
                !Object.values(bases).some((base) => base.size === skill.size) ||
                !data.tags.includes(skill.tag) ||
                skill.notable ||
                !skill.text ||
                !skill.stats.length ||
                skill.stats.some((stat) => stat.min !== stat.max)
            )
                throw new Error(`Invalid Cluster Jewel passive: ${id}`);
        }
        if (!Object.keys(passives).length)
            throw new Error("Missing Cluster Jewel granted passives.");
        const passiveIds = new Set<string>();
        const passiveHashes = new Set<number>();
        for (const [stat, passive] of Object.entries(passives)) {
            if (
                passiveIds.has(passive.id) ||
                passiveHashes.has(passive.hash) ||
                !passive.name ||
                !passive.stats.length ||
                passive.stats.some((entry) => entry.min !== entry.max) ||
                !passive.text
            )
                throw new Error(`Invalid Cluster Jewel granted passive: ${stat}`);
            passiveIds.add(passive.id);
            passiveHashes.add(passive.hash);
        }
        for (const [id, modifier] of Object.entries(data.mods))
            if (
                modifier.domain === "affliction_jewel" &&
                modifier.adds_tags.includes("has_affliction_notable") &&
                !modifier.stats.some((stat) => passives[stat.id]?.notable)
            )
                throw new Error(`Missing Cluster Jewel notable effect: ${id}`);
    } else if (
        crafting.game === "poe1" &&
        Object.values(data.base_items).some((base) => base.domain === "affliction_jewel")
    )
        throw new Error("Missing Cluster Jewel records.");
    if (crafting.genesis) {
        const genesis = crafting.genesis;
        if (
            crafting.game !== "poe1" ||
            ![
                genesis.asset,
                "Data/PassiveSkills.datc64",
                "Data/PassiveSkillTrees.datc64",
                "Data/BrequelPassiveSubTrees.datc64",
                "Data/Stats.datc64",
            ].every((asset) => crafting.source.tables[asset])
        )
            throw new Error("Genesis tree has no matching client asset provenance.");
        base(genesis.fruit);
        const passives = Object.values(genesis.passives);
        if (
            JSON.stringify(genesis.itemClasses) !==
            JSON.stringify(genesisItemClasses(passives, Object.keys(data.item_classes)))
        )
            throw new Error("Genesis item classes differ from the active tree.");
        const hashes = new Set<number>();
        for (const passive of passives) {
            if (
                hashes.has(passive.hash) ||
                passive.stats.some((stat) => stat.min !== stat.max || !Number.isInteger(stat.min))
            )
                throw new Error("Invalid or duplicate Genesis passive.");
            hashes.add(passive.hash);
            for (const stat of passive.stats) {
                const effect = genesisEffect(stat);
                if (
                    effect &&
                    (!passive.text ||
                        (effect.kind === "tier"
                            ? effect.value <= 0
                            : !effect.value || !data.tags.includes(effect.tag)))
                )
                    throw new Error("Invalid Genesis modifier effect.");
            }
        }
        if (!passives.some((passive) => passive.stats.some((stat) => genesisEffect(stat))))
            throw new Error("Genesis tree has no modifier effects.");
    } else if (crafting.game === "poe1" && data.base_items["Metadata/Items/Chayula/EquipmentFruit"])
        throw new Error("Missing Genesis equipment tree.");
    if (
        (crafting.allflame !== null && crafting.game !== "poe1") ||
        (crafting.allflame === null &&
            crafting.source.tables["Data/DeepwaterCraftingCurrencies.datc64"])
    )
        throw new Error("Allflame requires the PoE 1 client records.");
    if (crafting.allflame) {
        const allflame = crafting.allflame;
        for (const table of [
            "DeepwaterCraftingClasses",
            "DeepwaterCraftingCurrencies",
            "DeepwaterBalancePerLevel",
            "CurrencyItems",
            "BaseItemTypes",
            "ItemClasses",
            "ClientStrings",
            "KeywordPopups",
            "KeywordPopupItemReference",
        ])
            if (!crafting.source.tables[`Data/${table}.datc64`])
                throw new Error(`Allflame has no matching client table provenance: ${table}`);
        if (!crafting.currencies.some((entry) => entry.id === allflame.sulphur))
            throw new Error("Allflame sulphur is not an extracted currency.");
        const classes = new Set<string>();
        for (const entry of allflame.classes) {
            itemClass(entry.itemClass);
            if (classes.has(entry.itemClass)) throw new Error("Duplicate Allflame item class.");
            classes.add(entry.itemClass);
        }
        if (
            allflame.levels.length !== 100 ||
            new Set(allflame.levels.map((entry) => entry.level)).size !== 100
        )
            throw new Error("Allflame requires one cost factor for each item level.");
        const ids = new Set<string>();
        const tiers = new Set<string>();
        for (const entry of allflame.currencies) {
            base(entry.currency);
            const tier = `${entry.currency}:${entry.tier}`;
            if (
                ids.has(entry.id) ||
                tiers.has(tier) ||
                !crafting.currencies.some((currency) => currency.id === entry.currency) ||
                entry.outcomes.min > entry.outcomes.max ||
                entry.intangibility.min > entry.intangibility.max
            )
                throw new Error(`Invalid or duplicate Allflame currency bracket: ${entry.id}`);
            ids.add(entry.id);
            tiers.add(tier);
        }
    }
    const strongboxIds = new Set<string>();
    if (crafting.strongboxes.length)
        for (const table of ["Strongboxes", "Chests", "Mods", "Tags", "Stats"])
            if (
                !crafting.source.tables[
                    `Data/${crafting.game === "poe2" ? "Balance/" : ""}${table}.datc64`
                ]
            )
                throw new Error(`Strongboxes have no matching client table provenance: ${table}`);
    for (const chest of crafting.strongboxes) {
        if (
            strongboxIds.has(chest.id) ||
            Object.hasOwn(data.base_items, chest.id) ||
            chest.minimumLevel > chest.maximumLevel ||
            new Set(chest.tags).size !== chest.tags.length ||
            new Set(chest.mods).size !== chest.mods.length
        )
            throw new Error(`Invalid or duplicate Strongbox: ${chest.id}`);
        strongboxIds.add(chest.id);
        if (chest.baseItem) base(chest.baseItem);
        chest.mods.forEach(mod);
        for (const id of chest.tags)
            if (!data.tags.includes(id)) throw new Error(`Unresolved Strongbox tag: ${id}`);
    }
    const augmentIds = new Set(crafting.augments.map((entry) => entry.id));
    if (
        augmentIds.size !== crafting.augments.length ||
        (crafting.game === "poe1" && augmentIds.size)
    )
        throw new Error("Invalid or duplicate socketable augment.");
    if (augmentIds.size)
        for (const table of [
            "SoulCores",
            "SoulCoreStats",
            "SoulCoreLimits",
            "SoulCoreTypes",
            "SoulCoreStatCategories",
            "BaseItemTypes",
            "ItemClasses",
            "Stats",
            "ClientStrings2",
        ])
            if (!crafting.source.tables[`Data/Balance/${table}.datc64`])
                throw new Error(`Augments have no matching client table provenance: ${table}`);
    for (const augment of crafting.augments) {
        base(augment.id);
        if (data.base_items[augment.id]!.name !== augment.name)
            throw new Error(`Augment name differs from the extracted base: ${augment.id}`);
        if (augment.higherTier && !augmentIds.has(augment.higherTier))
            throw new Error(`Unresolved higher augment tier: ${augment.higherTier}`);
        if (new Set(augment.rules.map((rule) => rule.category)).size !== augment.rules.length)
            throw new Error(`Duplicate augment category: ${augment.id}`);
        for (const rule of augment.rules) {
            rule.itemClasses.forEach(itemClass);
            if (new Set(rule.itemClasses).size !== rule.itemClasses.length)
                throw new Error(`Duplicate augment item class: ${augment.id}`);
            for (const stats of [rule.stats, rule.bondedStats])
                if (
                    stats.some((stat) => stat.min !== stat.max) ||
                    new Set(stats.map((stat) => stat.id)).size !== stats.length
                )
                    throw new Error(`Invalid fixed augment stats: ${augment.id}`);
            for (const index of [...rule.statDescriptions, ...rule.bondedDescriptions])
                if (!crafting.statDescriptions[index])
                    throw new Error(`Unresolved augment stat description: ${augment.id}`);
        }
    }
    const temple = crafting.templeCorruption;
    if ((crafting.game === "poe2") !== (temple !== null))
        throw new Error("Temple corruption requires the PoE 2 client records.");
    if (temple) {
        if (
            !crafting.source.tables["Data/Balance/Incursion2CorruptionCurrencies.datc64"] ||
            !crafting.source.tables["Data/Balance/ClientStrings.datc64"]
        )
            throw new Error("Temple corruption has no matching client table provenance.");
        const ids = new Set<string>();
        for (const entry of temple.currencies) {
            if (
                ids.has(entry.id) ||
                new Set(entry.itemClasses).size !== entry.itemClasses.length ||
                !crafting.currencies.some(
                    (currency) =>
                        currency.id === entry.id &&
                        currency.action.startsWith("incursion_corrupt_"),
                )
            )
                throw new Error(`Invalid or duplicate temple corruption currency: ${entry.id}`);
            ids.add(entry.id);
            entry.itemClasses.forEach(itemClass);
        }
        if (
            crafting.currencies.some(
                (currency) =>
                    currency.action.startsWith("incursion_corrupt_") && !ids.has(currency.id),
            )
        )
            throw new Error("Missing extracted temple corruption currency.");
    }
    if (crafting.locus) {
        if (
            crafting.game !== "poe1" ||
            !crafting.source.tables["Data/IncursionRooms.datc64"] ||
            !crafting.source.tables["Data/ItemClasses.datc64"]
        )
            throw new Error("Locus of Corruption has no matching PoE 1 client table provenance.");
    }
    if (Object.values(crafting.classes).some((entry) => entry.doubleCorrupt) && !crafting.locus)
        throw new Error("Double-corruptible classes require an extracted Locus of Corruption.");
    if (crafting.maps.length) {
        if (
            crafting.game !== "poe1" ||
            !crafting.source.tables["Data/Maps.datc64"] ||
            !crafting.source.tables["Data/WorldAreas.datc64"]
        )
            throw new Error("Maps have no matching PoE 1 client table provenance.");
        const ids = new Set<string>();
        for (const entry of crafting.maps) {
            base(entry.id);
            const record = data.base_items[entry.id]!;
            if (record.item_class !== "Map" || record.domain !== "area" || ids.has(entry.id))
                throw new Error(`Invalid or duplicate map: ${entry.id}`);
            ids.add(entry.id);
        }
        for (const entry of crafting.maps)
            if (entry.upgrade && !ids.has(entry.upgrade))
                throw new Error(`Unresolved map upgrade: ${entry.upgrade}`);
    }
    if (
        crafting.game === "poe1" &&
        Object.entries(data.base_items).some(
            ([id, entry]) =>
                entry.item_class === "Map" && !crafting.maps.some((map) => map.id === id),
        )
    )
        throw new Error("Missing extracted map tier.");
    if (crafting.waystones.length) {
        if (
            crafting.game !== "poe2" ||
            !crafting.source.tables["Data/Balance/Maps.datc64"] ||
            !crafting.source.tables["Data/Balance/MapTiers.datc64"]
        )
            throw new Error("Waystones have no matching PoE 2 client table provenance.");
        const ids = new Set<string>();
        const tiers = new Set<string>();
        for (const entry of crafting.waystones) {
            base(entry.id);
            const key = `${entry.series}:${entry.tier}`;
            const record = data.base_items[entry.id]!;
            if (
                record.item_class !== "Map" ||
                record.domain !== "area" ||
                ids.has(entry.id) ||
                tiers.has(key)
            )
                throw new Error(`Invalid or duplicate Waystone tier: ${entry.id}`);
            ids.add(entry.id);
            tiers.add(key);
        }
    }
    if (
        crafting.game === "poe2" &&
        Object.entries(data.base_items).some(
            ([id, entry]) =>
                entry.item_class === "Map" &&
                !crafting.waystones.some((waystone) => waystone.id === id),
        )
    )
        throw new Error("Missing extracted Waystone tier.");
    for (const id of crafting.recombinableClasses) itemClass(id);
    const tags = new Set(data.tags);
    const stats = new Set([
        ...Object.values(data.mods).flatMap((entry) => entry.stats.map((stat) => stat.id)),
        ...crafting.augments.flatMap((entry) =>
            entry.rules.flatMap((rule) =>
                [...rule.stats, ...rule.bondedStats].map((stat) => stat.id),
            ),
        ),
    ]);
    for (const id of crafting.scalableStats)
        if (!stats.has(id)) throw new Error(`Unresolved crafting stat: ${id}`);
    const tag = (id: string) => {
        if (!tags.has(id)) throw new Error(`Unresolved crafting tag: ${id}`);
    };
    const augmentStats = new Set(
        crafting.augments.flatMap((entry) =>
            entry.rules.flatMap((rule) => rule.stats.map((stat) => stat.id)),
        ),
    );
    for (const [stat, value] of Object.entries(crafting.augmentTags)) {
        if (
            crafting.game !== "poe2" ||
            !crafting.source.tables["Data/Balance/Expedition2WarpingRuneStatToTag.datc64"] ||
            !crafting.source.tables["Data/Balance/Tags.datc64"] ||
            !augmentStats.has(stat)
        )
            throw new Error("Augment tags require matching client stats and table provenance.");
        tag(value);
    }
    for (const stat of augmentStats)
        if (stat.startsWith("warping_rune_add_item_tag_") && !crafting.augmentTags[stat])
            throw new Error(`Missing extracted augment tag: ${stat}`);
    for (const effect of crafting.taggedModifierEffects) {
        if (
            !stats.has(effect.stat) ||
            !crafting.source.tables[
                `Data/${crafting.game === "poe2" ? "Balance/" : ""}ModEffectStats.datc64`
            ]
        )
            throw new Error("Modifier effects require matching client stats and table provenance.");
        effect.tags.forEach(tag);
    }
    if (
        new Set(crafting.taggedModifierEffects.map((effect) => effect.stat)).size !==
        crafting.taggedModifierEffects.length
    )
        throw new Error("Duplicate tagged modifier effect.");
    for (const currency of crafting.currencies) base(currency.id);
    const baseQuality = resolveBaseQuality(
        crafting.currencies,
        Object.values(data.base_items),
        crafting.keywords.Quality?.definition,
    );
    if (JSON.stringify(crafting.baseQuality) !== JSON.stringify(baseQuality))
        throw new Error(
            "Base quality rules differ from extracted currency instructions or base tags.",
        );
    for (const recipe of crafting.baseQuality) recipe.itemClasses.forEach(itemClass);
    const mapQualityCurrencies =
        crafting.game === "poe1"
            ? crafting.currencies.filter((currency) => currency.action === "add_map_alt_quality")
            : [];
    if (
        crafting.mapQuality.length !== mapQualityCurrencies.length ||
        new Set(crafting.mapQuality.map((entry) => entry.id)).size !== crafting.mapQuality.length ||
        new Set(crafting.mapQuality.map((entry) => entry.qualityType)).size !==
            crafting.mapQuality.length
    )
        throw new Error("Missing or duplicate extracted map quality type.");
    for (const recipe of crafting.mapQuality) {
        const currency = mapQualityCurrencies.find((entry) => entry.id === recipe.id);
        if (
            !currency ||
            recipe.maximumQuality !== resolveCatalystMaximumQuality(currency.directions) ||
            JSON.stringify(recipe.itemClasses) !==
                JSON.stringify(resolveQualityClasses(currency, Object.values(data.base_items)))
        )
            throw new Error("Map quality rules differ from extracted currency instructions.");
        recipe.itemClasses.forEach(itemClass);
        for (const table of ["CurrencyItems", "AlternateQualityTypes", "Stats"])
            if (!crafting.source.tables[`Data/${table}.datc64`])
                throw new Error("Map quality requires matching client table provenance.");
    }
    const qualityInfusers = resolveQualityInfusers(
        crafting.currencies,
        Object.values(data.base_items),
    );
    if (JSON.stringify(crafting.qualityInfusers) !== JSON.stringify(qualityInfusers))
        throw new Error(
            "Quality Infusers differ from extracted currency instructions or base tags.",
        );
    for (const recipe of crafting.qualityInfusers) recipe.itemClasses.forEach(itemClass);
    const memoryMaps =
        crafting.game === "poe1" ? resolveMemoryMaps(crafting.currencies, data.mods) : null;
    if (JSON.stringify(crafting.memoryMaps) !== JSON.stringify(memoryMaps))
        throw new Error("Memory map crafting does not match the extracted currency and modifiers.");
    if (
        memoryMaps &&
        (!crafting.source.tables["Data/CurrencyItems.datc64"] ||
            !crafting.source.tables["Data/Mods.datc64"])
    )
        throw new Error("Memory map crafting has no client table provenance.");
    if (Object.keys(crafting.memoryStrandCosts).length) {
        if (
            crafting.game !== "poe1" ||
            !crafting.source.tables["Data/ZanaInfluenceCostPerCurrency.datc64"]
        )
            throw new Error("Memory strand costs have no matching PoE 1 client table provenance.");
        for (const action of Object.keys(crafting.memoryStrandCosts))
            if (!crafting.currencies.some((currency) => currency.action === action))
                throw new Error(`Unresolved memory strand currency action: ${action}`);
    }
    const anointingItems = new Set(crafting.anointing.items.map((entry) => entry.id));
    const blightedMaps = crafting.game === "poe1" ? resolveBlightedMaps(data.mods) : [];
    if (JSON.stringify(crafting.anointing.maps) !== JSON.stringify(blightedMaps))
        throw new Error("Blighted Map rules differ from extracted modifiers.");
    if (blightedMaps.length && !crafting.source.tables["Data/Mods.datc64"])
        throw new Error("Blighted Map rules have no client table provenance.");
    if (anointingItems.size !== crafting.anointing.items.length)
        throw new Error("Duplicate anointing ingredient.");
    for (const item of crafting.anointing.items) base(item.id);
    const anointingRecipes = new Set<string>();
    for (const recipe of crafting.anointing.recipes) {
        if (anointingRecipes.has(recipe.id))
            throw new Error(`Duplicate anointing recipe: ${recipe.id}`);
        anointingRecipes.add(recipe.id);
        for (const id of recipe.items)
            if (!anointingItems.has(id)) throw new Error(`Unresolved anointing ingredient: ${id}`);
        if (recipe.mod) mod(recipe.mod);
        if (
            recipe.type === "InfectedMap" &&
            (crafting.game !== "poe1" ||
                recipe.items.length !== 1 ||
                !recipe.mod ||
                recipe.passive ||
                data.mods[recipe.mod]!.stats.some((stat) => stat.min !== stat.max) ||
                !crafting.source.tables["Data/BlightCraftingRecipes.datc64"] ||
                !crafting.source.tables["Data/BlightCraftingResults.datc64"])
        )
            throw new Error(
                "Blighted Map anointments require fixed modifiers and recipe provenance.",
            );
        if (recipe.passive) ref("anointed passive", recipe.passive, crafting.anointing.passives);
        if (recipe.mod && recipe.passive)
            throw new Error(`Ambiguous anointing outcome: ${recipe.id}`);
    }
    for (const emotion of crafting.liquidEmotions) {
        base(emotion.id);
        if (
            !crafting.currencies.some(
                (entry) => entry.id === emotion.id && entry.action === "use_liquid_emotion",
            )
        )
            throw new Error(`Unresolved liquid emotion currency: ${emotion.id}`);
        for (const rule of emotion.rules) {
            base(rule.base);
            if (data.base_items[rule.base]!.item_class !== "Jewel")
                throw new Error(`Invalid liquid emotion jewel: ${rule.base}`);
            for (const id of rule.mods) {
                mod(id);
                if (!["prefix", "suffix"].includes(data.mods[id]!.generation_type))
                    throw new Error(`Invalid liquid emotion modifier: ${id}`);
            }
        }
        if (new Set(emotion.rules.map((rule) => rule.base)).size !== emotion.rules.length)
            throw new Error(`Duplicate liquid emotion base: ${emotion.id}`);
    }
    if (
        new Set(crafting.liquidEmotions.map((entry) => entry.id)).size !==
        crafting.liquidEmotions.length
    )
        throw new Error("Duplicate liquid emotion currency.");
    for (const catalyst of crafting.catalysts) {
        base(catalyst.id);
        const currency = crafting.currencies.find((currency) => currency.id === catalyst.id);
        if (!currency) throw new Error(`Unresolved crafting catalyst currency: ${catalyst.id}`);
        if (
            catalyst.maximumQuality !==
            resolveCatalystMaximumQuality(
                crafting.game === "poe2"
                    ? (crafting.keywords.Quality?.definition ?? "")
                    : currency.directions,
            )
        )
            throw new Error(`Catalyst maximum quality differs from client text: ${catalyst.id}`);
        catalyst.itemClasses.forEach(itemClass);
        catalyst.tags.forEach(tag);
    }
    const taintedCatalysts =
        crafting.game === "poe1"
            ? resolveTaintedCatalysts(crafting.currencies, Object.values(data.base_items))
            : [];
    if (JSON.stringify(crafting.taintedCatalysts) !== JSON.stringify(taintedCatalysts))
        throw new Error("Tainted Catalyst rules differ from extracted currency instructions.");
    if (
        taintedCatalysts.length &&
        [
            "Data/CurrencyItems.datc64",
            "Data/AlternateQualityTypes.datc64",
            "Data/ModEffectStats.datc64",
        ].some((table) => !crafting.source.tables[table])
    )
        throw new Error("Tainted Catalyst rules have no client table provenance.");
    for (const recipe of taintedCatalysts) {
        base(recipe.id);
        for (const itemClass of recipe.itemClasses)
            if (!crafting.catalysts.some((entry) => entry.itemClasses.includes(itemClass)))
                throw new Error("Tainted Catalyst has no extracted quality types for its class.");
    }
    for (const [id, rules] of Object.entries(crafting.baseRules)) {
        base(id);
        if (!rules.initialSockets) continue;
        if (
            crafting.game !== "poe2" ||
            !crafting.source.tables["Data/Balance/BaseItemTypes.datc64"]
        )
            throw new Error("Initial sockets require PoE 2 base-item table provenance.");
        if (
            !data.base_items[id]!.implicits.some((implicit) =>
                data.mods[implicit]!.stats.some(
                    (stat) =>
                        (stat.id === "local_has_X_sockets" ||
                            /^local_item_benefit_socketable_as_if_/.test(stat.id)) &&
                        stat.min === rules.initialSockets &&
                        stat.max === rules.initialSockets,
                ),
            )
        )
            throw new Error("Initial socket count has no matching extracted base implicit.");
    }
    for (const id of Object.keys(crafting.modTexts)) {
        mod(id);
        if (data.mods[id]!.domain !== "area" || data.mods[id]!.generation_type !== "corrupted")
            throw new Error("Supplemental item text requires an area corruption modifier.");
    }
    for (const [id, descriptions] of Object.entries(crafting.modDescriptions)) {
        mod(id);
        for (const index of descriptions)
            if (!crafting.statDescriptions[index])
                throw new Error(`Unresolved stat description: ${id}/${index}`);
    }
    for (const currency of crafting.tieredCurrency) base(currency.id);
    for (const equivalency of crafting.modEquivalencies) equivalency.mods.forEach(mod);
    if (
        !crafting.elementalConversions.length &&
        crafting.augments.some((entry) =>
            entry.rules.some((rule) =>
                rule.stats.some((stat) =>
                    /^dummy_display_stat_rune_(fire|cold|lightning|chaos)_convert$/.test(stat.id),
                ),
            ),
        )
    )
        throw new Error("Elemental conversion augments require extracted conversion families.");
    if (crafting.elementalConversions.length) {
        if (
            crafting.game !== "poe2" ||
            !crafting.source.tables["Data/Balance/Expedition2ElementalModConversions.datc64"]
        )
            throw new Error("Elemental conversions require matching client table provenance.");
        const ids = new Set<string>();
        const sources = new Set<string>();
        for (const conversion of crafting.elementalConversions) {
            if (ids.has(conversion.id)) throw new Error("Duplicate elemental conversion.");
            ids.add(conversion.id);
            const modifiers = Object.values(conversion.mods).filter((value) => value !== null);
            if (modifiers.length < 2 || new Set(modifiers).size !== modifiers.length)
                throw new Error(
                    "Elemental conversions require distinct source and target modifiers.",
                );
            modifiers.forEach(mod);
            if (!conversion.resistance)
                for (const element of ["fire", "cold", "lightning"] as const) {
                    const source = conversion.mods[element];
                    if (!source) continue;
                    if (sources.has(source))
                        throw new Error("Ambiguous elemental conversion source.");
                    sources.add(source);
                }
        }
    }
    for (const entry of crafting.desecration) {
        base(entry.id);
        entry.itemClasses.forEach(itemClass);
        if (entry.tag) tag(entry.tag);
    }
    for (const id of Object.keys(crafting.classes)) itemClass(id);
    const influenceNames = new Map<number, string>();
    const influenceClasses = new Set<string>();
    for (const entry of crafting.influences) {
        itemClass(entry.itemClass);
        tag(entry.tag);
        if (
            crafting.game !== "poe1" ||
            !crafting.source.tables["Data/InfluenceTags.datc64"] ||
            !crafting.source.tables["Data/ClientStrings.datc64"]
        )
            throw new Error("Influences require PoE 1 client tag and name provenance.");
        const key = `${entry.itemClass}:${entry.influence}`;
        if (
            influenceClasses.has(key) ||
            (influenceNames.has(entry.influence) &&
                influenceNames.get(entry.influence) !== entry.name)
        )
            throw new Error("Duplicate influence class or inconsistent influence name.");
        influenceClasses.add(key);
        influenceNames.set(entry.influence, entry.name);
    }
    for (const entry of crafting.influenceUpgrades) {
        mod(entry.mod);
        mod(entry.upgraded);
    }
    for (const [id, rules] of Object.entries(crafting.modRules)) {
        mod(id);
        rules.itemClasses.forEach(itemClass);
    }
    for (const essence of crafting.essences) {
        base(essence.id);
        for (const [id, modifier] of Object.entries(essence.mods)) {
            itemClass(id);
            mod(modifier);
        }
    }
    for (const essence of crafting.poe2Essences) {
        base(essence.id);
        for (const rule of essence.rules) {
            rule.itemClasses.forEach(itemClass);
            if (rule.mod) mod(rule.mod);
            for (const entry of rule.outcomes) mod(entry.mod);
        }
    }
    for (const recipe of crafting.bench) {
        if (recipe.mod) mod(recipe.mod);
        const socketRecipe = recipe.cost.some((cost) =>
            crafting.currencies.some(
                (entry) => entry.id === cost.id && entry.action === "reroll_socket_numbers",
            ),
        );
        if (
            socketRecipe !== Boolean(recipe.socketCount) ||
            (recipe.socketCount &&
                (recipe.mod ||
                    recipe.enchantment ||
                    recipe.linkCount ||
                    !recipe.itemClasses.length))
        )
            throw new Error(`Invalid bench socket count: ${recipe.id}`);
        const linkRecipe = recipe.cost.some((cost) =>
            crafting.currencies.some(
                (entry) => entry.id === cost.id && entry.action === "reroll_socket_links",
            ),
        );
        if (
            linkRecipe !== Boolean(recipe.linkCount) ||
            (recipe.linkCount &&
                (crafting.game !== "poe1" ||
                    recipe.mod ||
                    recipe.enchantment ||
                    recipe.socketCount ||
                    !recipe.itemClasses.length ||
                    !crafting.source.tables["Data/CraftingBenchOptions.datc64"]))
        )
            throw new Error(`Invalid bench linked sockets: ${recipe.id}`);
        const flaskRecipe = crafting.flaskEnchantments.find((entry) =>
            recipe.cost.some((cost) => cost.id === entry.id),
        );
        if (Boolean(flaskRecipe) !== Boolean(recipe.enchantment))
            throw new Error(`Unresolved bench enchantment: ${recipe.id}`);
        if (recipe.enchantment) {
            mod(recipe.enchantment.mod);
            recipe.enchantment.itemClasses.forEach(itemClass);
            if (
                recipe.mod ||
                !flaskRecipe!.mods.includes(recipe.enchantment.mod) ||
                recipe.enchantment.itemClasses.some(
                    (id) =>
                        !recipe.itemClasses.includes(id) || !flaskRecipe!.itemClasses.includes(id),
                )
            )
                throw new Error(`Invalid bench enchantment: ${recipe.id}`);
        }
        recipe.itemClasses.forEach(itemClass);
        for (const entry of recipe.cost) base(entry.id);
    }
    const flaskEnchantments =
        crafting.game === "poe1"
            ? resolveFlaskEnchantments(
                  crafting.currencies,
                  data.mods,
                  Object.entries(data.item_classes).map(([id, entry]) => ({
                      id,
                      name: entry.name,
                  })),
              )
            : [];
    if (JSON.stringify(crafting.flaskEnchantments) !== JSON.stringify(flaskEnchantments))
        throw new Error(
            "Flask enchantments do not match the extracted currency, classes and modifiers.",
        );
    for (const recipe of crafting.harvest) {
        if (
            (recipe.command === "reroll_influence_types") !==
            Boolean(recipe.influenceRerollClasses)
        )
            throw new Error(`Unresolved Harvest influence classes: ${recipe.id}`);
        if (recipe.influenceRerollClasses) {
            recipe.influenceRerollClasses.forEach(itemClass);
            if (
                JSON.stringify(recipe.influenceRerollClasses) !==
                JSON.stringify(
                    recipe.parameters.split(" ").map((name) => name.replaceAll("_", " ")),
                )
            )
                throw new Error(`Harvest influence classes do not match the command: ${recipe.id}`);
        }
        if (
            (recipe.command === "reroll_with_current_tags_affinity_multiplier") !==
            (recipe.affinityMultiplier !== null)
        )
            throw new Error(`Unresolved Harvest affinity multiplier: ${recipe.id}`);
        if ((recipe.command === "add_enchant_to_class") !== Boolean(recipe.enchantment))
            throw new Error(`Unresolved Harvest enchantment: ${recipe.id}`);
        if (recipe.enchantment) {
            mod(recipe.enchantment.mod);
            recipe.enchantment.itemClasses.forEach(itemClass);
        }
    }
    for (const fossil of crafting.fossils) {
        base(fossil.id);
        if (
            fossil.effects.length !== fossil.descriptions.length ||
            new Set(fossil.effects).size !== fossil.effects.length
        )
            throw new Error(`Invalid fossil effect descriptions: ${fossil.id}`);
        [...fossil.added, ...fossil.forced].forEach(mod);
        const expectedOutcomes = fossil.effects.includes("RandomModifier")
            ? randomFossilOutcomeIds(crafting.fossils.map((entry) => entry.id))
            : [];
        if (JSON.stringify(fossil.randomOutcomes) !== JSON.stringify(expectedOutcomes))
            throw new Error(
                `Random fossil outcomes differ from the extracted records: ${fossil.id}`,
            );
        if (
            expectedOutcomes.length &&
            (!crafting.source.tables["Data/DelveCraftingModifiers.datc64"] ||
                !crafting.source.tables["Data/DelveCraftingModifierDescriptions.datc64"])
        )
            throw new Error("Random fossil outcomes have no client table provenance.");
        if (
            randomFossilOutcomeIds([fossil.id]).length &&
            (fossil.name ||
                fossil.positive.length !== 1 ||
                fossil.negative.length !== 1 ||
                fossil.positive[0]!.tag === fossil.negative[0]!.tag ||
                fossil.positive[0]!.weight <= 100 ||
                fossil.negative[0]!.weight !== 0 ||
                fossil.added.length ||
                fossil.forced.length ||
                fossil.corruptedEssenceChance ||
                fossil.quality ||
                fossil.mirrored ||
                fossil.whiteSockets ||
                fossil.lucky)
        )
            throw new Error(`Invalid random fossil outcome: ${fossil.id}`);
        for (const entry of [...fossil.positive, ...fossil.negative]) tag(entry.tag);
        for (const rule of [...fossil.allowed, ...fossil.forbidden]) {
            if (rule.tag) tag(rule.tag);
            if (rule.itemClass) itemClass(rule.itemClass);
        }
    }
    for (const beast of crafting.beasts) {
        if (beast.mod) mod(beast.mod);
        if (beast.aspectMod) mod(beast.aspectMod);
        if (
            JSON.stringify(beast.metamods) !==
            JSON.stringify(resolveBeastMetamods(beast.category, beast.description, data.mods))
        )
            throw new Error("Metamod pool differs from the extracted beast recipe.");
        if (beast.metamods.length) {
            if (
                crafting.game !== "poe1" ||
                !crafting.source.tables["Data/BestiaryRecipes.datc64"] ||
                !crafting.source.tables["Data/BestiaryRecipeCategories.datc64"] ||
                !crafting.source.tables["Data/CraftingBenchOptions.datc64"]
            )
                throw new Error("Metamod beastcraft has no matching client table provenance.");
            for (const id of beast.metamods) {
                mod(id);
                if (!crafting.bench.some((entry) => entry.mod === id && entry.itemClasses.length))
                    throw new Error("Beast metamod has no extracted crafting classes.");
            }
        }
        if (
            JSON.stringify(beast.augmentation) !==
            JSON.stringify(resolveBeastAugmentation(beast.category, beast.description))
        )
            throw new Error("Augmentation differs from the extracted beast recipe.");
        const augmentation = beast.augmentation;
        if (augmentation) {
            if (
                crafting.game !== "poe1" ||
                !crafting.source.tables["Data/BestiaryRecipes.datc64"] ||
                !crafting.source.tables["Data/BestiaryRecipeCategories.datc64"]
            )
                throw new Error("Augmentation beastcraft has no matching client table provenance.");
            if ("itemClass" in augmentation) itemClass(augmentation.itemClass);
            else if (
                !crafting.influences.some((entry) => entry.influence === augmentation.influence)
            )
                throw new Error("Augmentation beastcraft has no matching extracted influence.");
        }
        if (beast.mapCorruption !== resolveBeastMapCorruption(beast.category, beast.description))
            throw new Error("Map corruption differs from the extracted beast recipe.");
        if (beast.mapCorruption) itemClass("Map");
        if (beast.maximumSockets !== resolveBeastSockets(beast.category, beast.description))
            throw new Error("Socket operation differs from the extracted beast recipe.");
        if (beast.maximumLinks !== resolveBeastLinks(beast.category, beast.description))
            throw new Error("Link operation differs from the extracted beast recipe.");
        if (
            (beast.maximumSockets || beast.maximumLinks) &&
            (crafting.game !== "poe1" ||
                !crafting.source.tables["Data/BestiaryRecipes.datc64"] ||
                !crafting.source.tables["Data/BestiaryRecipeCategories.datc64"])
        )
            throw new Error("Socket beastcraft has no matching client table provenance.");
        if (
            JSON.stringify(beast.talismanCraft) !==
            JSON.stringify(resolveTalismanCraft(beast.category, beast.description, beast.notes))
        )
            throw new Error("Talisman operation differs from the extracted beast recipe.");
        if (beast.talismanCraft) {
            tag("talisman");
            if (
                crafting.game !== "poe1" ||
                !crafting.source.tables["Data/BestiaryRecipes.datc64"] ||
                !crafting.source.tables["Data/BestiaryRecipeCategories.datc64"]
            )
                throw new Error("Talisman beastcraft has no matching client table provenance.");
        }
    }
    return crafting;
}

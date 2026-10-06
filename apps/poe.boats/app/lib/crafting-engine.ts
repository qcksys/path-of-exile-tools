import type {
    CraftingCatalog,
    CraftingItem,
    CraftingMethod,
    CraftingMod,
    CraftingTarget,
    RolledMod,
} from "../schemas/crafting";
import {
    craftingItemSchema,
    craftingItemStateSchema,
    craftingMethodSchema,
    craftingRevealContextSchema,
    craftingTargetSchema,
} from "../schemas/crafting";
import {
    allflameBracket,
    allflameDucatActions,
    allflameQuote,
    attributeEquivalencies,
    ducatPoolOptions,
    usesAllflame,
} from "./crafting-allflame";
import {
    anointingOils,
    anointingRecipes,
    anointment,
    anointmentKey,
    anointmentText,
    validateAnointments,
} from "./crafting-anointing";
import {
    augment,
    augmentStats,
    augmentSupported,
    augmentTags,
    augmentUpgrader,
    availableAugments,
    socketAugment,
    socketedStats,
    upgradeSocketedAugment,
    validateAugments,
} from "./crafting-augments";
import { clusterSkills, clusterTags, validateCluster } from "./crafting-clusters";
import {
    augmentConversion,
    conversionHistory,
    conversionSeparates,
    convertedModifier,
} from "./crafting-conversions";
import {
    corruptionStatRange,
    jewelCorruptionRange,
    supportsJewelCorruption,
    supportsLocus,
    supportsTabletCorruption,
    supportsTempleCorruption,
    tabletCorruptionUses,
} from "./crafting-corruption";
import {
    baseDefenceEntries,
    matchesBaseDefences,
    supportsSacredOrb,
    validateBaseDefences,
} from "./crafting-defences";
import { eldritchFamilyKey, eldritchTier } from "./crafting-eldritch";
import { availableEnchantments, flaskEnchantmentPool } from "./crafting-enchantments";
import { gildedImplicitId } from "./crafting-fossils";
import { genesisEffects, genesisPool, genesisSupported } from "./crafting-genesis";
import {
    type BreachRings,
    graspingMailBase,
    graspingPool,
    isBreachModifier,
} from "./crafting-grasping";
import { enchantmentStat } from "./crafting-heist";
import {
    memoryConsumption,
    memoryTierPool,
    modifierFamily,
    remainingStrandOutcomes,
    remembranceOutcomes,
    supportsMemoryMap,
    supportsMemoryStrands,
    unravellingOutcomes,
} from "./crafting-memory";
import { omenEffects } from "./crafting-omens";
import { grantedPassive, grantedPassiveStat, passiveAllocationMod } from "./crafting-passives";
import { matchesItemProperties } from "./crafting-properties";
import {
    availableBaseQuality,
    availableCatalysts,
    availableMapQuality,
    baseQualityLimit,
    baseQualityOutcomes,
    catalysingMultiplier,
    catalystEffect,
    catalystLimit,
    catalystQualityOutcomes,
    mapQualityIncrement,
    mapQualityRecipe,
    qualityInfuserState,
    retainedBaseQualityLimit,
    retainedCatalystLimit,
    taintedCatalystOutcomes,
} from "./crafting-quality";
import { recombinationOutcomes, supportsRecombination } from "./crafting-recombination";
import { revealChoiceProbabilities, revealCountWeights } from "./crafting-reveal-probabilities";
import {
    hasAbyssSockets,
    initialSockets,
    linkedSocketRange,
    matchesSocketLinks,
    retainedSocketLimit,
    setLinkedSockets,
    setSocketCount,
    socketBenchEligible,
    socketLimit,
    validateSocketLinks,
} from "./crafting-sockets";
import { strongbox, strongboxMethod } from "./crafting-strongboxes";
import { cleanModText, scaledModValues } from "./crafting-text";

export type Weighted<T> = { value: T; weight: number };
export { eldritchTier } from "./crafting-eldritch";
export type CraftingRandom = {
    pick<T>(choices: Weighted<T>[]): T;
    integer(min: number, max: number): number;
};
export type CraftingCost = { id: string; name: string; amount: number };

export class BenchCraftConflict extends Error {
    constructor(
        message: string,
        readonly item: CraftingItem,
        readonly cost: CraftingCost[],
    ) {
        super(message);
    }
}
export type PoolEntry = { id: string; mod: CraftingMod; weight: number };
type PoolOptions = {
    genesis?: string[];
    limits?: { max: number; prefixes: number; suffixes: number };
    domain?: string;
    extraTags?: string[];
    side?: string;
    tag?: string;
    anyTags?: string[];
    excludedTags?: string[];
    fossils?: string[];
    tangled?: string;
    logic?: "additive" | "multiplicative";
    ignoreMeta?: boolean;
    influence?: number | "any";
    level?: number;
    minimumLevel?: number;
    affinity?: { types: string[]; multiplier: number };
    catalysing?: boolean;
    memoryStrands?: number;
    foulborn?: boolean;
};

export function seededRandom(seed: number): CraftingRandom {
    let state = seed >>> 0;
    const next = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    return {
        pick(choices) {
            const total = choices.reduce((sum, choice) => sum + choice.weight, 0);
            if (!(total > 0)) throw new Error("No eligible outcomes for this craft.");
            let roll = next() * total;
            for (const choice of choices) {
                roll -= choice.weight;
                if (roll < 0) return choice.value;
            }
            return choices[choices.length - 1]!.value;
        },
        integer: (min, max) => min + Math.floor(next() * (max - min + 1)),
    };
}

const metaStats = {
    prefixes: "item_generation_cannot_change_prefixes",
    suffixes: "item_generation_cannot_change_suffixes",
    attack: "item_generation_cannot_roll_attack_affixes",
    caster: "item_generation_cannot_roll_caster_affixes",
    multiple: "item_generation_can_have_multiple_crafted_mods",
};
const directionalDesecrationOmen = /\/OmenOnAbyssAdd(?:Prefixes|Suffixes)$/;
export const supportedCurrencyActions = new Set([
    "identify",
    "transmute_to_magic",
    "reroll_magic",
    "add_mod_to_magic",
    "transmute_to_rare",
    "upgrade_magic_to_rare",
    "reroll",
    "add_mod_to_rare",
    "remove_random_mod",
    "convert_to_normal",
    "reroll_mod_values",
    "reroll_implicit_mod",
    "fracture_random_mod",
    "add_influence_mod_to_rare",
    "upgrade_influence_mod",
    "transfer_item_influence",
    "add_mod_to_rare_eldritch",
    "remove_random_mod_eldritch",
    "replace_rare_mod_veiled",
    "reroll_rare_veiled",
    "inital_imprint",
    "restore_imprint",
    "add_jewellery_quality",
    "add_alternate_quality",
    "add_armour_quality",
    "add_weapon_quality",
    "add_flask_quality",
    "add_flask_injector",
    "add_flask_seal",
    "add_magic_item_quality",
    "add_armour_quality_hellscape",
    "add_weapon_quality_hellscape",
    "reroll_rare_hellscape",
    "upgrade_mod_tier_hellscape",
    "reroll_socket_numbers_hellscape",
    "add_mod_to_rare_hellscape",
    "consume_zana_influence_upgrade_mods",
    "apply_zana_influence",
    "enchant_map_zana_influence_drops",
    "mutated_add_mod_to_magic",
    "mutated_upgrade_magic_to_rare",
    "mutated_add_mod_to_rare",
    "reroll_rare_eldritch",
    "conflict_orb",
    "corrupt_item",
    ...[1, 2, 3, 4].flatMap((tier) => [
        `add_cleansing_fire_implicit_${tier}`,
        `add_great_tangle_implicit_${tier}`,
    ]),
]);

export class CraftingEngine {
    private domains = new Map<string, PoolEntry[]>();
    private recipeClasses = new Map<string, Set<string>>();
    private essenceMods = new Set<string>();
    private attributes = new Map<string, string[]>();
    private weightedPools = new Map<string, PoolEntry[]>();
    private eldritchFamilies = new Map<string, PoolEntry[]>();
    private eldritchPools = new Map<string, PoolEntry[]>();
    private corruptedPools = new Map<string, PoolEntry[]>();
    private recombinations = new Map<string, Weighted<CraftingItem>[]>();
    private statIds = new Set<string>();
    private baseDomains: Set<string>;
    constructor(readonly catalog: CraftingCatalog) {
        this.baseDomains = new Set(Object.values(catalog.bases).map((base) => base.domain));
        for (const row of attributeEquivalencies(catalog))
            for (const id of row.mods)
                this.attributes.set(
                    id,
                    row.mods.filter((other) => other !== id),
                );
        for (const recipe of catalog.crafting.mapQuality)
            for (const stat of recipe.stats) this.statIds.add(stat);
        for (const entry of catalog.crafting.augments) {
            this.statIds.add(entry.type.socketedStat);
            for (const rule of entry.rules)
                for (const stat of rule.stats) this.statIds.add(stat.id);
        }
        for (const [id, mod] of Object.entries(catalog.mods)) {
            for (const stat of mod.stats) this.statIds.add(stat.id);
            if (
                ["searing_exarch_implicit", "eater_of_worlds_implicit"].includes(
                    mod.generation_type,
                ) &&
                eldritchTier(mod)
            ) {
                const key = eldritchFamilyKey(mod);
                const family = this.eldritchFamilies.get(key) ?? [];
                family.push({ id, mod, weight: 0 });
                this.eldritchFamilies.set(key, family);
            }
            if (!["prefix", "suffix"].includes(mod.generation_type)) continue;
            const entries = this.domains.get(mod.domain) ?? [];
            entries.push({ id, mod, weight: 0 });
            this.domains.set(mod.domain, entries);
        }
        const add = (id: string, itemClasses: string[]) =>
            this.recipeClasses.set(
                id,
                new Set([...(this.recipeClasses.get(id) ?? []), ...itemClasses]),
            );
        for (const recipe of catalog.crafting.bench)
            if (recipe.mod) add(recipe.mod, recipe.itemClasses);
        const aspectClasses = Object.entries(catalog.crafting.classes)
            .filter(([, rules]) => rules.aspects)
            .map(([id]) => id);
        for (const recipe of catalog.crafting.beasts)
            if (recipe.aspectMod && recipe.gameMode !== 2) add(recipe.aspectMod, aspectClasses);
        for (const essence of catalog.crafting.essences)
            for (const [itemClass, id] of Object.entries(essence.mods)) {
                add(id, [itemClass]);
                this.essenceMods.add(id);
            }
        for (const essence of catalog.crafting.poe2Essences)
            for (const rule of essence.rules) {
                if (rule.mod) {
                    add(rule.mod, rule.itemClasses);
                    this.essenceMods.add(rule.mod);
                }
                for (const outcome of rule.outcomes) {
                    add(outcome.mod, rule.itemClasses);
                    this.essenceMods.add(outcome.mod);
                }
            }
    }

    base(item: CraftingItem) {
        const base = this.catalog.bases[item.baseId];
        if (!base) throw new Error("The item base is missing from this build.");
        return base;
    }

    map(item: Pick<CraftingItem, "baseId">) {
        return this.catalog.game === "poe1"
            ? this.catalog.crafting.maps.find((entry) => entry.id === item.baseId)
            : undefined;
    }

    waystone(item: CraftingItem) {
        return this.catalog.game === "poe2"
            ? this.catalog.crafting.waystones.find((entry) => entry.id === item.baseId)
            : undefined;
    }

    mod(id: string) {
        const mod = this.catalog.mods[id];
        if (!mod) throw new Error(`Unknown modifier: ${id}`);
        return mod;
    }

    hasImplicitStat(item: CraftingItem, stat: string) {
        return item.implicits.some((mod) =>
            this.mod(mod.id).stats.some(
                (entry, index) => entry.id === stat && (mod.values[index] ?? 0) > 0,
            ),
        );
    }

    hasFixedInfluences(item: CraftingItem) {
        return this.hasImplicitStat(item, "local_item_can_roll_all_influences");
    }

    effectiveInfluences(item: CraftingItem) {
        return this.hasFixedInfluences(item)
            ? this.catalog.crafting.influences
                  .filter((rule) => rule.itemClass === this.base(item).item_class)
                  .map((rule) => rule.influence)
                  .sort((a, b) => a - b)
            : item.influences;
    }

    limits(item: CraftingItem) {
        const name = item.rarity[0]!.toUpperCase() + item.rarity.slice(1);
        let limits = this.catalog.crafting.rarities[name];
        if (!limits) throw new Error(`Missing rarity rules: ${name}`);
        const base = this.base(item);
        // Jewel affix caps are server rules; Rarity.dat contains the equipment defaults.
        if (
            item.rarity === "rare" &&
            (base.item_class === "Jewel" || base.domain === "abyss_jewel")
        )
            limits = { min: 3, max: 4, prefixes: 2, suffixes: 2 };
        if (item.rarity === "rare" && supportsTabletCorruption(this.catalog, item))
            limits = { min: 4, max: 4, prefixes: 2, suffixes: 2 };
        if (item.rarity === "normal") return limits;
        const socketStats = socketedStats(this.catalog, item);
        const adjustment = (stat: string) =>
            [...item.implicits, ...item.mods].reduce(
                (total, rolled) =>
                    total +
                    this.mod(rolled.id).stats.reduce(
                        (sum, entry, index) =>
                            sum + (entry.id === stat ? (rolled.values[index] ?? 0) : 0),
                        0,
                    ),
                socketStats.get(stat) ?? 0,
            );
        const prefixes = Math.max(
            0,
            limits.prefixes + adjustment("local_maximum_prefixes_allowed_+"),
        );
        const suffixes = Math.max(
            0,
            limits.suffixes + adjustment("local_maximum_suffixes_allowed_+"),
        );
        const counts = this.counts(item);
        const max =
            this.catalog.game === "poe2" && item.rarity === "rare" && base.item_class === "Jewel"
                ? Math.max(prefixes, counts.prefixes) + Math.max(suffixes, counts.suffixes)
                : Math.min(
                      limits.max + adjustment("local_maximum_mods_allowed_+"),
                      prefixes + suffixes,
                  );
        return { min: Math.min(limits.min, max), max, prefixes, suffixes };
    }

    craftedLimit(item: CraftingItem) {
        return (
            (this.hasStat(item, metaStats.multiple) ? 3 : 1) +
            enchantmentStat(this.catalog, item, "local_can_have_additional_crafted_mods") +
            (socketedStats(this.catalog, item).get("local_can_have_additional_crafted_mods") ?? 0)
        );
    }

    private corruptedAreaLimits(item: CraftingItem) {
        if (item.corrupted && item.rarity === "rare" && this.map(item))
            return { min: 4, max: 8, prefixes: 4, suffixes: 4 };
        if (!item.corrupted || !this.waystone(item)) return;
        const limits = this.limits(item);
        if (item.rarity === "rare" && this.counts(item).prefixes > 4) {
            const fractures = item.mods.filter(
                (entry) => entry.fractured && this.mod(entry.id).generation_type === "suffix",
            ).length;
            // The reference adds one prefix per original suffix, including retained fractures.
            return {
                ...limits,
                max: 6 + Math.min(3, fractures),
                prefixes: 6,
                suffixes: Math.min(3, fractures),
            };
        }
        return { ...limits, max: Math.min(8, limits.max + 4), prefixes: 4, suffixes: 4 };
    }

    counts(item: CraftingItem) {
        return {
            prefixes: item.mods.filter((mod) => this.mod(mod.id).generation_type === "prefix")
                .length,
            suffixes: item.mods.filter((mod) => this.mod(mod.id).generation_type === "suffix")
                .length,
        };
    }

    hasStat(item: CraftingItem, stat: string) {
        return item.mods.some((mod) =>
            this.mod(mod.id).stats.some(
                (entry, index) => entry.id === stat && (mod.values[index] ?? 0) > 0,
            ),
        );
    }

    currencySupported(action: string) {
        if (allflameDucatActions.has(action))
            return this.catalog.game === "poe1" && Boolean(this.catalog.crafting.allflame);
        if (action === "reroll_variable_defences") return this.catalog.game === "poe1";
        if (action === "add_map_alt_quality")
            return this.catalog.game === "poe1" && this.catalog.crafting.mapQuality.length > 0;
        if (action === "add_random_jewellery_quality")
            return (
                this.catalog.game === "poe1" && this.catalog.crafting.taintedCatalysts.length > 0
            );
        if (
            action.startsWith("incursion_") &&
            this.catalog.game === "poe2" &&
            this.catalog.crafting.qualityInfusers.some((recipe) =>
                this.catalog.crafting.currencies.some(
                    (entry) => entry.id === recipe.id && entry.action === action,
                ),
            )
        )
            return true;
        if (action === "incursion_corrupt_tablet") return this.catalog.game === "poe2";
        if (action === "incursion_corrupt_equipment") return this.catalog.game === "poe2";
        if (action === "add_equipment_socket") return this.catalog.game === "poe2";
        if (action === "use_liquid_emotion") return this.catalog.game === "poe2";
        if (this.catalog.game === "poe2" && action.startsWith("abyssal_bench_ticket_")) return true;
        if (!supportedCurrencyActions.has(action)) return false;
        return (
            this.catalog.game === "poe1" ||
            !/influence|eldritch|veiled|imprint|mutated|hellscape|conflict_orb|implicit_\d$/.test(
                action,
            )
        );
    }

    beastOperation(id: string) {
        const recipe = this.catalog.crafting.beasts.find(
            (entry) => entry.id === id && entry.gameMode !== 2,
        );
        if (this.catalog.game !== "poe1" || !recipe) return;
        if (recipe.talismanCraft) return "talisman";
        if (recipe.aspectMod) return "aspect";
        if (recipe.augmentation) return "augment";
        if (recipe.metamods.length) return "metamod";
        if (recipe.mapCorruption === "implicit") return "map-implicit";
        if (recipe.mapCorruption === "twice") return "map-twice";
        if (recipe.maximumSockets) return "maximum-sockets";
        if (recipe.maximumLinks) return "maximum-links";
        if (id === "EinharMasterCraft27") return "imprint";
        if (id === "EinharMasterCraft30") return "prefix-to-suffix";
        if (id === "EinharMasterCraft31") return "suffix-to-prefix";
        if (
            recipe.mod &&
            this.mod(recipe.mod).domain === "flask" &&
            this.mod(recipe.mod).generation_type === "suffix"
        )
            return "flask";
    }

    emotionRule(item: CraftingItem, id: string) {
        if (this.catalog.game !== "poe2") return;
        return this.catalog.crafting.liquidEmotions
            .find((entry) => entry.id === id)
            ?.rules.find((rule) => rule.base === item.baseId);
    }

    emotionSupported(id: string) {
        return (
            this.catalog.game === "poe2" &&
            this.catalog.crafting.liquidEmotions.some((entry) => entry.id === id)
        );
    }

    beastRequiresLevel(id: string) {
        return ["flask", "prefix-to-suffix", "suffix-to-prefix"].includes(
            this.beastOperation(id) ?? "",
        );
    }

    beastAugmentationEligible(item: CraftingItem, id: string) {
        const rule = this.catalog.crafting.beasts.find((entry) => entry.id === id)?.augmentation;
        return Boolean(
            rule &&
                ("itemClass" in rule
                    ? this.base(item).item_class === rule.itemClass
                    : this.effectiveInfluences(item).includes(rule.influence)),
        );
    }

    beastMetamodPool(item: CraftingItem, id: string): PoolEntry[] {
        const recipe = this.catalog.crafting.beasts.find((entry) => entry.id === id);
        if (this.beastOperation(id) !== "metamod" || !recipe) return [];
        const state = item.rarity === "normal" ? { ...item, rarity: "magic" as const } : item;
        const limits = this.limits(state);
        const counts = this.counts(state);
        if (state.mods.length >= limits.max) return [];
        const groups = new Set(state.mods.flatMap((entry) => this.mod(entry.id).groups));
        return this.recipePool(state, "bench")
            .filter(
                (entry) =>
                    recipe.metamods.includes(entry.id) &&
                    !entry.mod.groups.some((group) => groups.has(group)) &&
                    (entry.mod.generation_type === "prefix"
                        ? counts.prefixes < limits.prefixes
                        : counts.suffixes < limits.suffixes),
            )
            .map((entry) => ({ ...entry, weight: 1 }));
    }

    availableFossils(item: CraftingItem) {
        const base = this.base(item);
        if (base.strongbox) return [];
        return this.catalog.crafting.fossils.filter((fossil) => {
            const matches = (rule: (typeof fossil.allowed)[number]) =>
                (rule.tag && base.tags.includes(rule.tag)) || rule.itemClass === base.item_class;
            return (
                fossil.name &&
                this.fossilSupported(fossil) &&
                (!fossil.effects.includes("Fracture") || this.canFractureWithFossil(item)) &&
                (!fossil.effects.includes("CorruptedImplicit") ||
                    this.corruptedModifiers(item).length > 0) &&
                (!fossil.allowed.length || fossil.allowed.some(matches)) &&
                !fossil.forbidden.some(matches)
            );
        });
    }

    private fossilSupported(fossil: CraftingCatalog["crafting"]["fossils"][number]) {
        return (
            Boolean(fossil.name) &&
            (fossil.randomOutcomes.length > 0 ||
                !(
                    (fossil.corruptedEssenceChance !== 0 &&
                        fossil.corruptedEssenceChance !== 100) ||
                    fossil.quality ||
                    fossil.mirrored ||
                    fossil.whiteSockets ||
                    fossil.descriptions.some((text) => /Split/.test(text))
                ))
        );
    }

    private effectiveFossils(ids: string[], tangled?: string) {
        const fossils = ids.map((id) => this.fossil(id));
        const random = fossils.find((entry) => entry.randomOutcomes.length);
        if (random ? !tangled || !random.randomOutcomes.includes(tangled) : tangled !== undefined)
            throw new Error(
                "Choose a revealed Tangled Fossil effect pair only when using Tangled Fossil.",
            );
        return fossils.map((fossil) =>
            fossil.randomOutcomes.length ? this.fossil(tangled!) : fossil,
        );
    }

    gildedModifiers(item: CraftingItem): PoolEntry[] {
        if (
            this.catalog.game !== "poe1" ||
            !this.availableFossils(item).some((fossil) =>
                fossil.effects.includes("BetterSellPrice"),
            )
        )
            return [];
        return [{ id: gildedImplicitId, mod: this.mod(gildedImplicitId), weight: 0 }];
    }

    private canFractureWithFossil(item: CraftingItem) {
        return (
            this.catalog.crafting.classes[this.base(item).item_class]?.fracture &&
            !this.effectiveInfluences(item).length &&
            !item.mods.some((entry) => entry.fractured)
        );
    }

    private fossilWeight(
        mod: CraftingMod,
        weight: number,
        fossils: CraftingCatalog["crafting"]["fossils"],
        logic: PoolOptions["logic"],
        generation = 1,
    ) {
        const sanctified = fossils.some((fossil) => fossil.lucky);
        // Reference level-weight model: round before generation and tag multipliers.
        if (sanctified) weight = Math.round((weight * (60 + mod.required_level)) / 100);
        weight *= generation;
        const positive: number[] = [];
        for (const fossil of fossils) {
            if (fossil.effects.includes("NoTagless") && !mod.implicit_tags.length) return 0;
            const up = fossil.positive.find((rule) => mod.implicit_tags.includes(rule.tag));
            const down = fossil.negative.find((rule) => mod.implicit_tags.includes(rule.tag));
            if (up) positive.push(up.weight / 100);
            if (down) weight *= down.weight / 100;
        }
        if (positive.length)
            weight *=
                logic === "multiplicative"
                    ? positive.reduce((a, b) => a * b, 1)
                    : positive.reduce((a, b) => a + b, 0);
        return sanctified ? Math.round(weight) : weight;
    }

    corruptedEssencePool(
        item: CraftingItem,
        options: Pick<PoolOptions, "fossils" | "logic" | "tangled"> = {},
    ): PoolEntry[] {
        const base = this.base(item);
        const fossils = this.effectiveFossils(options.fossils ?? [], options.tangled);
        const reserved = [
            ...item.mods.map((entry) => this.mod(entry.id)),
            ...fossils.flatMap((fossil) => fossil.forced.map((id) => this.mod(id))),
        ];
        const limits = this.limits({ ...item, rarity: "rare" });
        if (reserved.length >= limits.max) return [];
        const groups = new Set(reserved.flatMap((mod) => mod.groups));
        const tags = new Set([...base.tags, ...reserved.flatMap((mod) => mod.adds_tags)]);
        const ids = new Set(
            this.catalog.crafting.essences.flatMap((essence) =>
                essence.corrupted && essence.mods[base.item_class]
                    ? [essence.mods[base.item_class]!]
                    : [],
            ),
        );
        return [...ids].flatMap((id) => {
            const mod = this.mod(id);
            const rules = this.catalog.crafting.modRules[id];
            const side = mod.generation_type;
            if (
                !["prefix", "suffix"].includes(side) ||
                mod.groups.some((group) => groups.has(group)) ||
                reserved.filter((entry) => entry.generation_type === side).length >=
                    (side === "prefix" ? limits.prefixes : limits.suffixes) ||
                rules?.gameMode === 2 ||
                (rules?.itemClasses.length && !rules.itemClasses.includes(base.item_class))
            )
                return [];
            const weight = this.fossilWeight(
                mod,
                1,
                fossils,
                options.logic,
                (mod.generation_weights.find((rule) => tags.has(rule.tag))?.weight ?? 100) / 100,
            );
            return weight > 0 ? [{ id, mod, weight }] : [];
        });
    }

    validateMethod(input: unknown): CraftingMethod {
        const method = craftingMethodSchema.parse(input);
        const data = this.catalog.crafting;
        if (usesAllflame(method)) {
            const bracket = allflameBracket(this.catalog, method);
            if (this.catalog.game !== "poe1" || !bracket)
                throw new Error("Allflame is unavailable for this crafting method.");
            if (bracket.outcomes.min !== bracket.outcomes.max)
                throw new Error("This Allflame outcome-count distribution is unavailable.");
            if (
                method.kind === "fossils" &&
                method.ids.some((id) => this.fossil(id).effects.includes("CorruptedImplicit"))
            )
                throw new Error("Allflame cannot use a fossil that corrupts the item.");
        }
        if (method.kind === "generate") {
            if (method.breachRings !== undefined) {
                if (this.catalog.game !== "poe1" || method.id !== "rare")
                    throw new Error(
                        "Breach rings apply only to rare PoE 1 Grasping Mail generation.",
                    );
                if (
                    method.breachRings !== "legacy" &&
                    Object.values(method.breachRings).reduce((sum, count) => sum + count, 0) !== 60
                )
                    throw new Error("Choose exactly 60 Breach rings.");
            }
            return method;
        }
        if (method.kind === "genesis") {
            genesisEffects(this.catalog, method.nodes);
            return method;
        }
        omenEffects(this.catalog, method);
        if (method.kind === "socket_jewel" || method.kind === "remove_jewel") {
            if (this.catalog.game !== "poe2")
                throw new Error("Equipment Jewel sockets are only available in PoE 2.");
            if (method.kind === "socket_jewel" && method.jewel)
                this.validateSocketedJewel(method.jewel.item);
        } else if (method.kind === "reveal") {
            for (const id of method.preferred) {
                const mod = this.mod(id);
                if (
                    mod.domain !== this.revealDomain() &&
                    !(
                        this.catalog.game === "poe2" &&
                        !mod.is_essence_only &&
                        ["prefix", "suffix"].includes(mod.generation_type) &&
                        this.baseDomains.has(mod.domain)
                    )
                )
                    throw new Error(
                        "Reveal preferences must be eligible explicit modifiers for this game.",
                    );
            }
        } else if (method.kind === "upgrade_augment") {
            if (!augmentUpgrader(augment(this.catalog, method.id)))
                throw new Error("This augment does not upgrade socketed Runes.");
        } else if (method.kind === "augment") {
            if (!augmentSupported(augment(this.catalog, method.id)))
                throw new Error(
                    "This augment has a special crafting effect that is not supported yet.",
                );
        } else if (method.kind === "currency") {
            const currency = data.currencies.find((entry) => entry.id === method.id);
            if (!currency || !this.currencySupported(currency.action))
                throw new Error("This currency action is not supported.");
            if (allflameDucatActions.has(currency.action) && !usesAllflame(method))
                throw new Error("This Ducat requires Allflame crafting.");
            if (
                ["add_jewellery_quality", "add_alternate_quality"].includes(currency.action) &&
                !data.catalysts.some((entry) => entry.id === method.id)
            )
                throw new Error("This currency has no extracted catalyst quality effect.");
            if (method.donor) {
                if (currency.action !== "transfer_item_influence")
                    throw new Error("This currency does not use a donor item.");
                this.validateItem(method.donor.item);
            }
        } else if (method.kind === "recombine") {
            if (this.catalog.game !== "poe1")
                throw new Error("This recombination model is available only in PoE 1.");
            if (method.donor) this.validateItem(method.donor.item);
        } else if (method.kind === "essence") {
            const essence = (this.catalog.game === "poe1" ? data.essences : data.poe2Essences).find(
                (entry) => entry.id === method.id,
            );
            if (!essence) throw new Error("Unknown essence.");
            if (this.catalog.game === "poe2" && !this.essenceSupported(method.id))
                throw new Error("This essence requires an outcome rule that is not supported yet.");
        } else if (method.kind === "anoint") {
            for (const id of anointingRecipes(method)) anointment(this.catalog, id);
            if (
                method.additional?.length &&
                anointingRecipes(method).some(
                    (id) => anointment(this.catalog, id).type !== "InfectedMap",
                )
            )
                throw new Error("Multiple oils in one craft require Blighted Map recipes.");
            if (
                new Set(method.oils).size !== (method.oils?.length ?? 0) ||
                method.oils?.some(
                    (id) =>
                        !data.anointing.items.some(
                            (entry) => entry.id === id && [1, 2].includes(entry.useType),
                        ),
                )
            )
                throw new Error("Unsupported additional anointing oil.");
        } else if (method.kind === "locus") {
            if (this.catalog.game !== "poe1" || method.id !== data.locus?.id)
                throw new Error("Choose the extracted Locus of Corruption.");
        } else if (method.kind === "bench") {
            const recipe = data.bench.find((entry) => entry.id === method.id);
            if (!recipe) throw new Error("Unknown bench recipe.");
            if (method.skipOnConflict && !recipe.mod)
                throw new Error(
                    "Skipping conflicts is available only for bench modifier additions.",
                );
            if (
                recipe.mod
                    ? !["prefix", "suffix"].includes(this.mod(recipe.mod).generation_type)
                    : !recipe.enchantment &&
                      !recipe.socketCount &&
                      !recipe.linkCount &&
                      ![0, 1, 8, 9].includes(recipe.action ?? -1)
            )
                throw new Error("This bench action is not supported.");
        } else if (method.kind === "beast") {
            const operation = this.beastOperation(method.id);
            if (!operation) throw new Error("This beastcraft is not supported.");
            if (this.beastRequiresLevel(method.id)) {
                const recipe = data.beasts.find((entry) => entry.id === method.id)!;
                const minimum = Math.max(1, ...recipe.components.map((entry) => entry.level));
                if (method.level === undefined || method.level < minimum)
                    throw new Error(`Choose a beast level of at least ${minimum}.`);
            }
        } else if (method.kind === "harvest") {
            const recipe = data.harvest.find((entry) => entry.id === method.id);
            if (!recipe || recipe.gameMode === 2)
                throw new Error("Unknown or Ruthless-only Harvest recipe.");
            if (!this.harvestSupported(recipe.id))
                throw new Error("This Harvest operation is not supported yet.");
        } else {
            if (new Set(method.ids).size !== method.ids.length)
                throw new Error("A fossil can only be used once per resonator.");
            const resonator = data.currencies.find((entry) => entry.id === method.resonator);
            if (
                !resonator ||
                !["delve_currency_upgrade", "delve_currency_reroll"].includes(resonator.action)
            )
                throw new Error("Choose an extracted resonator.");
            if (Number(resonator.id.at(-1)) !== method.ids.length)
                throw new Error("The resonator must have one socket per fossil.");
            for (const id of method.ids) {
                const fossil = this.fossil(id);
                if (!this.fossilSupported(fossil))
                    throw new Error(`${fossil.name} has special rules that are not supported yet.`);
            }
            this.effectiveFossils(method.ids, method.tangled);
        }
        return method;
    }

    implicitPool(item: CraftingItem, generation: string, tier?: number): PoolEntry[] {
        const base = this.base(item);
        return Object.entries(this.catalog.mods).flatMap(([id, mod]) => {
            if (
                mod.generation_type !== generation ||
                (tier !== undefined && eldritchTier(mod) !== tier)
            )
                return [];
            const rules = this.catalog.crafting.modRules[id];
            if (
                rules?.gameMode === 2 ||
                (rules?.itemClasses.length && !rules.itemClasses.includes(base.item_class))
            )
                return [];
            const weight =
                ((mod.spawn_weights.find((entry) => base.tags.includes(entry.tag))?.weight ?? 0) *
                    (mod.generation_weights.find((entry) => base.tags.includes(entry.tag))
                        ?.weight ?? 100)) /
                100;
            return weight > 0 ? [{ id, mod, weight }] : [];
        });
    }

    corruptedModifiers(item: CraftingItem): PoolEntry[] {
        const base = this.base(item);
        if (
            !this.catalog.crafting.classes[base.item_class]?.corrupt &&
            !(this.catalog.game === "poe1" && base.item_class === "Map" && base.domain === "area")
        )
            return [];
        const tags = new Set([
            ...base.tags,
            ...item.mods.flatMap((entry) => this.mod(entry.id).adds_tags),
            ...augmentTags(this.catalog, item),
        ]);
        const key = JSON.stringify([item.baseId, item.level, [...tags].sort()]);
        const cached = this.corruptedPools.get(key);
        if (cached) return cached;
        const pool = Object.entries(this.catalog.mods).flatMap(([id, mod]) => {
            const rules = this.catalog.crafting.modRules[id];
            if (
                mod.generation_type !== "corrupted" ||
                mod.domain !== base.domain ||
                (rules?.spawnLevel ?? mod.required_level) > item.level ||
                (mod.maximum_level > 0 && mod.maximum_level < item.level) ||
                (this.catalog.game === "poe1" && rules?.gameMode === 2) ||
                (rules?.itemClasses.length && !rules.itemClasses.includes(base.item_class))
            )
                return [];
            const weight =
                ((mod.spawn_weights.find((rule) => tags.has(rule.tag))?.weight ?? 0) *
                    (mod.generation_weights.find((rule) => tags.has(rule.tag))?.weight ?? 100)) /
                100;
            return weight > 0 ? [{ id, mod, weight }] : [];
        });
        if (this.corruptedPools.size >= 256)
            this.corruptedPools.delete(this.corruptedPools.keys().next().value!);
        this.corruptedPools.set(key, pool);
        return pool;
    }

    private replaceCorruptedImplicit(
        item: CraftingItem,
        random: CraftingRandom,
        selected?: string,
        replaceAny = false,
    ) {
        let pool = this.corruptedModifiers(item);
        if (!pool.length || (selected && !pool.some((entry) => entry.id === selected)))
            throw new Error("No eligible corrupted implicit for this base and item level.");
        const existing = item.implicits.find(
            (entry) => this.mod(entry.id).generation_type === "corrupted",
        );
        const replaceable =
            existing && !replaceAny
                ? [existing]
                : item.implicits.filter(
                      (entry) =>
                          !this.mod(entry.id).stats.some(
                              (stat) => stat.id === "local_implicit_mod_cannot_be_changed",
                          ),
                  );
        if (replaceable.length) {
            const removed = random.pick(replaceable.map((entry) => ({ value: entry, weight: 1 })));
            item.implicits = item.implicits.filter((entry) => entry !== removed);
        }
        if (replaceAny) {
            const groups = new Set(item.implicits.flatMap((entry) => this.mod(entry.id).groups));
            pool = pool.filter((entry) => !entry.mod.groups.some((group) => groups.has(group)));
            if (!pool.length)
                throw new Error("No compatible corrupted implicit remains for this item.");
        }
        const id =
            selected ??
            random.pick(pool.map((entry) => ({ value: entry.id, weight: entry.weight })));
        item.implicits.push(this.rollMod(id, random));
        item.corrupted = true;
    }

    corruptionKind(item: CraftingItem) {
        const base = this.base(item);
        if (strongbox(this.catalog, item)) return "strongbox";
        if (this.map(item)) return "map";
        if (!this.catalog.crafting.classes[base.item_class]?.corrupt) return;
        if (base.domain === "flask") return "quality";
        if (
            this.catalog.game === "poe1" &&
            (base.item_class === "Jewel" || base.domain === "abyss_jewel")
        )
            return "poe1-jewel";
        if (supportsJewelCorruption(this.catalog, item)) return "jewel";
        if (this.waystone(item)) return "waystone";
        if (
            base.domain === "item" &&
            base.tags.some((tag) =>
                [
                    "armour",
                    "weapon",
                    "wand",
                    "staff",
                    "sceptre",
                    "ring",
                    "amulet",
                    "belt",
                    "quiver",
                ].includes(tag),
            )
        )
            return "equipment";
    }

    corruptionQualityLimit() {
        // Server outcome model from the reference; ordinary quality limits are client-extracted.
        return this.catalog.game === "poe1" ? 40 : 23;
    }

    private corrupt(item: CraftingItem, random: CraftingRandom, removeNoChange: boolean) {
        const kind = this.corruptionKind(item);
        if (!kind)
            throw new Error("Corruption outcomes for this item class are not supported yet.");
        if (kind === "strongbox") {
            item.corrupted = true;
            return;
        }
        if (kind === "map") {
            this.corruptMap(item, random);
            return;
        }
        if (kind === "quality") {
            const delta = random.pick(
                Array.from({ length: 21 }, (_, index) => ({ value: index - 10, weight: 1 })),
            );
            item.quality = Math.max(
                0,
                Math.min(this.corruptionQualityLimit(), item.quality + delta),
            );
        } else {
            const outcomes =
                kind === "poe1-jewel"
                    ? ["none", "implicit", "reroll-rare", "unique-jewel"]
                    : kind === "jewel"
                      ? ["none", "implicit", "values", "none"]
                      : kind === "waystone"
                        ? ["none", "tier", "prefixes", "extra"]
                        : this.catalog.game === "poe1"
                          ? ["none", "reroll-six", "implicit", "white-sockets"]
                          : ["none", "reroll", "implicit", "socket"];
            const outcome = random.pick(
                outcomes
                    .filter((value) => !removeNoChange || value !== "none")
                    .map((value) => ({ value, weight: 1 })),
            );
            if (kind === "waystone") this.corruptWaystone(item, random, outcome);
            if (
                outcome === "socket" &&
                socketLimit(this.catalog, item) > 0 &&
                (item.sockets ?? 0) <
                    retainedSocketLimit(this.catalog, { ...item, corrupted: true })
            )
                item.sockets = (item.sockets ?? 0) + 1;
            if (outcome === "implicit" && this.corruptedModifiers(item).length)
                this.replaceCorruptedImplicit(item, random);
            if (outcome === "reroll-six") {
                delete item.socketLinks;
                item.rarity = "rare";
                item.mods = item.mods.filter((entry) => this.protected(item, entry));
                if (item.reveal && !item.mods.some((entry) => entry.id === item.reveal!.mod))
                    delete item.reveal;
                while (item.mods.length < 6 && this.pool(item).length) this.add(item, random);
            }
            if (outcome === "reroll-rare") {
                item.rarity = "rare";
                this.reroll(item, random);
            }
            if (outcome === "values") {
                item.mods = item.mods.map((entry) => {
                    if (this.protected(item, entry) || this.mod(entry.id).domain === "veiled")
                        return entry;
                    const corruptionScale = random.integer(
                        jewelCorruptionRange.min,
                        jewelCorruptionRange.max,
                    );
                    return { ...this.rollMod(entry.id, random, entry), corruptionScale };
                });
            }
            if (outcome === "reroll") {
                const count = item.mods.length;
                const removals = random.pick([1, 2, 3].map((value) => ({ value, weight: 1 })));
                for (let index = 0; index < removals; index++) {
                    if (!item.mods.some((entry) => !this.protected(item, entry, true))) break;
                    this.remove(item, random, true);
                }
                if (item.reveal && !item.mods.some((entry) => entry.id === item.reveal!.mod))
                    delete item.reveal;
                while (item.mods.length < count && this.pool(item).length) this.add(item, random);
            }
        }
        item.corrupted = true;
    }

    private corruptLocus(item: CraftingItem, random: CraftingRandom) {
        if (!supportsLocus(this.catalog, item))
            throw new Error("This item class cannot use the Locus of Corruption.");
        const outcome = random.pick(
            ["two-implicits", "white-sockets", "influenced-rare", "destroy"].map((value) => ({
                value,
                weight: 1,
            })),
        );
        if (outcome === "destroy") item.destroyed = true;
        if (outcome === "two-implicits") {
            const removable = item.implicits.filter(
                (entry) =>
                    !this.mod(entry.id).stats.some(
                        (stat) => stat.id === "local_implicit_mod_cannot_be_changed",
                    ),
            );
            for (let count = 0; count < 2 && removable.length; count++) {
                const removed = random.pick(removable.map((value) => ({ value, weight: 1 })));
                removable.splice(removable.indexOf(removed), 1);
                item.implicits = item.implicits.filter((entry) => entry !== removed);
            }
            for (let count = 0; count < 2; count++) {
                const groups = new Set(
                    item.implicits.flatMap((entry) => this.mod(entry.id).groups),
                );
                const pool = this.corruptedModifiers(item).filter(
                    (entry) => !entry.mod.groups.some((group) => groups.has(group)),
                );
                if (!pool.length) break;
                const id = random.pick(
                    pool.map((entry) => ({ value: entry.id, weight: entry.weight })),
                );
                item.implicits.push(this.rollMod(id, random));
            }
        }
        if (outcome === "influenced-rare") {
            delete item.socketLinks;
            const influences = [
                ...new Set(
                    this.catalog.crafting.influences
                        .filter((entry) => entry.itemClass === this.base(item).item_class)
                        .map((entry) => entry.influence),
                ),
            ];
            if (
                influences.length &&
                !this.effectiveInfluences(item).length &&
                !item.mods.some((entry) => entry.fractured) &&
                !item.implicits.some((entry) => eldritchTier(this.mod(entry.id)) > 0)
            )
                item.influences = [random.pick(influences.map((value) => ({ value, weight: 1 })))];
            item.rarity = "rare";
            this.reroll(item, random);
            if (item.reveal && !item.mods.some((entry) => entry.id === item.reveal!.mod))
                delete item.reveal;
        }
        item.corrupted = true;
    }

    private corruptMap(item: CraftingItem, random: CraftingRandom, excluded?: string) {
        if (item.blight)
            throw new Error("Corruption transformations of Blighted Maps are not modeled yet.");
        if (item.memoryMap)
            throw new Error(
                "Corruption transformations of Memory Influenced Maps are not modeled yet.",
            );
        const outcome = random.pick(
            ["none", "transform", "reroll-eight", "implicit"]
                .filter((value) => value !== excluded)
                .map((value) => ({ value, weight: 1 })),
        );
        if (outcome === "implicit" && this.corruptedModifiers(item).length)
            this.replaceCorruptedImplicit(item, random);
        if (outcome === "reroll-eight") {
            item.rarity = "rare";
            item.mods = item.mods.filter((entry) => this.protected(item, entry));
            const options = { limits: { max: 8, prefixes: 4, suffixes: 4 } };
            while (item.mods.length < 8 && this.pool(item, options).length)
                this.add(item, random, options);
        }
        if (outcome === "transform") {
            const current = this.map(item)!;
            const next =
                current.tier === 16
                    ? "Metadata/Items/Maps/MapAtlasVaalTemple"
                    : random.pick([
                            { value: false, weight: 1 },
                            { value: true, weight: 1 },
                        ])
                      ? current.upgrade
                      : null;
            if (next) {
                if (!this.catalog.bases[next] || !this.map({ baseId: next }))
                    throw new Error("The transformed map is missing from this build.");
                item.baseId = next;
            }
            item.rarity = "rare";
            item.mods = [];
            item.implicits = this.base(item).implicits.map((id) => this.rollMod(id, random));
            delete item.enchantments;
            delete item.anointments;
            delete item.reveal;
            this.reroll(item, random, { ignoreMeta: true, limits: this.limits(item) });
        }
        item.corrupted = true;
        return outcome;
    }

    private corruptWaystone(item: CraftingItem, random: CraftingRandom, outcome: string) {
        let additions = 0;
        let options: PoolOptions = { ignoreMeta: true };
        if (outcome === "tier") {
            const current = this.waystone(item)!;
            const direction = random.pick([-1, 1].map((value) => ({ value, weight: 1 })));
            const next = this.catalog.crafting.waystones.find(
                (entry) =>
                    entry.series === current.series && entry.tier === current.tier + direction,
            );
            additions = item.mods.length;
            item.mods = [];
            delete item.reveal;
            delete item.enchantments;
            delete item.anointments;
            if (next) {
                item.baseId = next.id;
                item.implicits = this.base(item).implicits.map((id) => this.rollMod(id, random));
            }
        } else if (outcome === "prefixes") {
            additions = this.counts(item).suffixes;
            item.mods = item.mods.filter(
                (entry) => entry.fractured || this.mod(entry.id).generation_type !== "suffix",
            );
            if (item.reveal && !item.mods.some((entry) => entry.id === item.reveal!.mod))
                delete item.reveal;
            options = {
                ...options,
                limits: {
                    max: item.mods.length + additions,
                    prefixes: this.counts(item).prefixes + additions,
                    suffixes: 0,
                },
            };
        } else if (outcome === "extra") {
            additions = Math.min(
                random.pick([0, 1, 2, 3, 4].map((value) => ({ value, weight: 1 }))),
                8 - item.mods.length,
            );
            options = { ...options, limits: { max: 8, prefixes: 4, suffixes: 4 } };
        }
        for (let index = 0; index < additions && this.pool(item, options).length; index++)
            this.add(item, random, options);
    }

    private corruptTablet(item: CraftingItem, random: CraftingRandom) {
        if (!supportsTabletCorruption(this.catalog, item))
            throw new Error("Ancient Infusers require a PoE 2 tablet.");
        const outcome = random.pick(
            ["modifier", "uses", "base"].map((value) => ({ value, weight: 1 })),
        );
        if (outcome === "uses") item.implicits[0]!.values[0]! += tabletCorruptionUses;
        if (outcome === "modifier") {
            const limits = this.limits(item);
            const options = {
                ignoreMeta: true,
                limits: {
                    max: limits.max + 1,
                    prefixes: limits.prefixes + 1,
                    suffixes: limits.suffixes + 1,
                },
            };
            if (this.pool(item, options).length) this.add(item, random, options);
        }
        if (outcome === "base") {
            const count = item.mods.length;
            item.baseId = random.pick(
                Object.keys(this.catalog.bases)
                    .filter((baseId) => supportsTabletCorruption(this.catalog, { baseId }))
                    .map((value) => ({ value, weight: 1 })),
            );
            item.mods = [];
            item.implicits = this.base(item).implicits.map((id) => this.rollMod(id, random));
            for (let index = 0; index < count && this.pool(item).length; index++)
                this.add(item, random, { ignoreMeta: true });
        }
        item.corrupted = true;
    }

    ukatoaModifiers(item: CraftingItem, ignoreMeta = false): PoolEntry[] {
        if (this.catalog.game !== "poe1" || this.base(item).item_class !== "Amulet") return [];
        const key = `ukatoa:${item.baseId}`;
        let pool = this.eldritchPools.get(key);
        if (!pool) {
            pool = [
                ...this.implicitPool(item, "searing_exarch_implicit"),
                ...this.implicitPool(item, "eater_of_worlds_implicit"),
            ];
            this.eldritchPools.set(key, pool);
        }
        return pool.filter(({ id, mod }) => {
            const level = this.catalog.crafting.modRules[id]?.spawnLevel ?? mod.required_level;
            return (
                level <= item.level &&
                (!mod.maximum_level || mod.maximum_level >= item.level) &&
                (ignoreMeta ||
                    !(["attack", "caster"] as const).some(
                        (tag) =>
                            this.hasStat(item, metaStats[tag]) && mod.implicit_tags.includes(tag),
                    ))
            );
        });
    }

    private ukatoaReplacements(item: CraftingItem) {
        return this.catalog.game === "poe1" &&
            this.base(item).item_class === "Amulet" &&
            !item.corrupted &&
            !item.mirrored &&
            !item.destroyed &&
            !item.implicits.some((entry) => eldritchTier(this.mod(entry.id)))
            ? item.implicits
            : [];
    }

    private replaceUkatoaImplicit(item: CraftingItem, random: CraftingRandom, selected?: string) {
        const replacements = this.ukatoaReplacements(item);
        const currency = this.catalog.crafting.currencies.find(
            (entry) => entry.action === "add_eldritch_implicit_amulet",
        );
        if (!currency || !replacements.length)
            throw new Error(
                "Ukatoa's Ducat requires an eligible amulet implicit and no Eldritch implicit.",
            );
        const pool = this.ukatoaModifiers(item);
        if (selected && !pool.some((entry) => entry.id === selected))
            throw new Error("This Eldritch implicit cannot roll on this amulet.");
        const removed = random.pick(replacements.map((value) => ({ value, weight: 1 })));
        item.implicits = item.implicits.filter((entry) => entry !== removed);
        item.implicitCraft = {
            currency: currency.id,
            level: item.level,
            removed: [
                ...(item.implicitCraft?.removed ?? []),
                ...(this.base(item).implicits.includes(removed.id) ? [removed.id] : []),
            ],
        };
        item.allflameCrafted = true;
        if (pool.length) {
            const id =
                selected ??
                random.pick(pool.map((entry) => ({ value: entry.id, weight: entry.weight })));
            item.implicits.push(this.rollMod(id, random));
        }
    }

    eldritchModifiers(item: CraftingItem): PoolEntry[] {
        const base = this.base(item);
        if (
            this.catalog.game !== "poe1" ||
            !["Body Armour", "Helmet", "Gloves", "Boots"].includes(base.item_class)
        )
            return [];
        const cached = this.eldritchPools.get(item.baseId);
        if (cached) return cached;
        const natural = [
            ...this.implicitPool(item, "searing_exarch_implicit"),
            ...this.implicitPool(item, "eater_of_worlds_implicit"),
        ];
        const weights = new Map(natural.map((entry) => [entry.id, entry.weight]));
        const families = new Set(natural.map((entry) => eldritchFamilyKey(entry.mod)));
        const pool = [...families].flatMap((key) =>
            (this.eldritchFamilies.get(key) ?? []).flatMap((entry) => {
                const rules = this.catalog.crafting.modRules[entry.id];
                if (
                    rules?.gameMode === 2 ||
                    (rules?.itemClasses.length && !rules.itemClasses.includes(base.item_class))
                )
                    return [];
                return [{ ...entry, weight: weights.get(entry.id) ?? 0 }];
            }),
        );
        this.eldritchPools.set(item.baseId, pool);
        return pool;
    }

    private conflict(item: CraftingItem, random: CraftingRandom) {
        this.requireEldritchArmour(item);
        const implicits = item.implicits.filter((entry) => eldritchTier(this.mod(entry.id)));
        if (
            implicits.length !== 2 ||
            this.hasImplicitStat(item, "local_implicit_mod_cannot_be_changed")
        )
            throw new Error("Orb of Conflict requires both modifiable Eldritch implicits.");
        const available = new Set(this.eldritchModifiers(item).map((entry) => entry.id));
        const changes = implicits.map((rolled) => {
            const mod = this.mod(rolled.id);
            const tier = eldritchTier(mod);
            const family = (this.eldritchFamilies.get(eldritchFamilyKey(mod)) ?? []).filter(
                (entry) => available.has(entry.id),
            );
            const adjacent = (strength: number) => {
                const candidates = family.filter((entry) => eldritchTier(entry.mod) === strength);
                if (candidates.length !== 1)
                    throw new Error("This build does not provide an unambiguous Eldritch tier.");
                return candidates[0]!.id;
            };
            return {
                up: tier === 6 ? undefined : adjacent(tier + 1),
                down: tier === 1 ? undefined : adjacent(tier - 1),
            };
        });
        // The reference uses equal directions; strength-dependent server odds are not extracted.
        const upgrade = random.pick([
            { value: 0, weight: 1 },
            { value: 1, weight: 1 },
        ]);
        item.implicits = item.implicits.flatMap((rolled) => {
            const index = implicits.indexOf(rolled);
            if (index < 0) return [rolled];
            const id = index === upgrade ? changes[index]!.up : changes[index]!.down;
            return id ? [this.rollMod(id, random)] : index === upgrade ? [rolled] : [];
        });
    }

    private requireEldritchArmour(item: CraftingItem) {
        if (
            this.catalog.game !== "poe1" ||
            !["Body Armour", "Helmet", "Gloves", "Boots"].includes(this.base(item).item_class) ||
            this.effectiveInfluences(item).length
        )
            throw new Error("Eldritch currency requires eligible, non-influenced armour.");
    }

    private eldritchSide(item: CraftingItem) {
        this.requireEldritchArmour(item);
        const strength = (type: string) =>
            Math.max(
                0,
                ...item.implicits
                    .filter((entry) => this.mod(entry.id).generation_type === type)
                    .map((entry) => eldritchTier(this.mod(entry.id))),
            );
        const exarch = strength("searing_exarch_implicit");
        const eater = strength("eater_of_worlds_implicit");
        if (exarch === eater) throw new Error("This craft requires a dominant Eldritch implicit.");
        return exarch > eater ? "prefix" : "suffix";
    }

    validateSocketedJewel(input: unknown) {
        const jewel = this.validateItem(input);
        if (
            this.catalog.game !== "poe2" ||
            this.base(jewel).item_class !== "Jewel" ||
            jewel.destroyed ||
            jewel.reveal ||
            jewel.imprint ||
            jewel.socketedJewel
        )
            throw new Error("Choose an intact PoE 2 Jewel with all modifiers revealed.");
        return jewel;
    }

    validateItem(input: unknown): CraftingItem {
        const item = craftingItemSchema.parse(input);
        const base = this.base(item);
        validateCluster(this.catalog, item);
        if (item.unidentified && !this.identificationSupported(item))
            throw new Error(
                "Unidentified templates require ordinary magic or rare equipment without explicit modifiers or special crafting state.",
            );
        const chest = strongbox(this.catalog, item);
        if (Boolean(item.allflameCopies) !== Boolean(item.allflameCost))
            throw new Error("Pending Allflame copies require their crafting cost.");
        if (item.intangibility !== undefined || item.allflameCrafted || item.allflameCopies) {
            if (
                this.catalog.game !== "poe1" ||
                !this.catalog.crafting.allflame?.classes.some(
                    (entry) => entry.itemClass === base.item_class,
                )
            )
                throw new Error("Allflame item state requires an eligible PoE 1 item class.");
            if (item.allflameCopies) {
                if (item.corrupted || item.mirrored || item.destroyed || item.imprint)
                    throw new Error("Pending Allflame copies have an ineligible starting state.");
                for (const copy of item.allflameCopies) {
                    if (
                        !copy.allflameCrafted ||
                        (copy.corrupted && !copy.corruptedBy) ||
                        copy.mirrored ||
                        (copy.destroyed && !copy.destroyedBy)
                    )
                        throw new Error("Invalid pending Allflame copy.");
                    this.validateItem(copy);
                }
            }
        }
        if (base.strongbox && !chest) throw new Error("Missing extracted Strongbox definition.");
        if (chest) {
            if (item.level < Math.max(1, chest.minimumLevel) || item.level > chest.maximumLevel)
                throw new Error(
                    `This Strongbox variant requires level ${Math.max(1, chest.minimumLevel)}–${chest.maximumLevel}.`,
                );
            if (
                item.mirrored ||
                item.split ||
                item.imprint ||
                item.mods.some(
                    (mod) => mod.crafted || mod.fractured || mod.origin || mod.desecrated,
                )
            )
                throw new Error("Strongboxes cannot use equipment crafting states.");
        }
        validateBaseDefences(this.catalog, item);
        if (item.split !== undefined && this.catalog.game !== "poe1")
            throw new Error("Split items are only available in PoE 1.");
        if (
            item.corruptedBy &&
            (this.catalog.game !== "poe1" ||
                base.item_class !== "AbyssJewel" ||
                !item.corrupted ||
                !item.allflameCrafted ||
                item.mirrored ||
                item.destroyed ||
                item.imprint ||
                this.catalog.crafting.currencies.find((entry) => entry.id === item.corruptedBy)
                    ?.action !== "add_mod_and_corrupt_rare_abyss_jewel")
        )
            throw new Error(
                "The corruption source requires an Allflame Ducat Abyss Jewel outcome.",
            );
        if (
            item.twiceCorrupted &&
            (!item.corrupted ||
                !supportsTempleCorruption(this.catalog, item, "incursion_corrupt_equipment"))
        )
            throw new Error(
                "Twice-corrupted outcomes require eligible corrupted PoE 2 equipment or jewels.",
            );
        if (
            item.destroyedBy &&
            (!item.destroyed ||
                !item.allflameCrafted ||
                item.corrupted ||
                item.mirrored ||
                item.imprint ||
                this.catalog.crafting.currencies.find((entry) => entry.id === item.destroyedBy)
                    ?.action !== "reset_ghostliness_or_delete")
        )
            throw new Error("The destruction source requires a destroyed Allflame Ducat outcome.");
        if (
            item.destroyed &&
            !item.destroyedBy &&
            !item.twiceCorrupted &&
            !(item.corrupted && supportsLocus(this.catalog, item))
        )
            throw new Error(
                "Destroyed outcomes require a twice-corrupted item, eligible PoE 1 Locus corruption or Allflame Ducat source.",
            );
        if (item.memoryStrands !== undefined && !supportsMemoryStrands(this.catalog, item))
            throw new Error("Memory strands require PoE 1 equipment.");
        if (item.memoryMap) {
            if (!supportsMemoryMap(this.catalog, item))
                throw new Error("Memory Influenced Maps require a PoE 1 map.");
            if (item.memoryMap.intentions > this.catalog.crafting.memoryMaps!.maximumUses)
                throw new Error("Orb of Intention uses exceed the extracted map limit.");
        }
        if (
            item.putrefied &&
            (this.catalog.game !== "poe2" || !item.corrupted || item.rarity !== "rare")
        )
            throw new Error("Putrefaction requires a corrupted PoE 2 rare item.");
        if (
            item.putrefied &&
            !this.catalog.crafting.desecration.some((ticket) =>
                ticket.itemClasses.includes(base.item_class),
            )
        )
            throw new Error("Putrefaction requires a desecratable base.");
        if (
            (item.sanctified !== undefined && this.catalog.game !== "poe2") ||
            (item.sanctified &&
                (!this.catalog.crafting.sanctification || item.rarity !== "rare" || item.reveal))
        )
            throw new Error(
                "Sanctification requires a PoE 2 rare item without unrevealed modifiers.",
            );
        validateAnointments(this.catalog, item);
        for (const entry of item.enchantments ?? []) {
            if (
                !availableEnchantments(this.catalog, item).some((recipe) => recipe.mod === entry.id)
            )
                throw new Error("This enchantment is not available on this item base.");
            if (entry.crafted || entry.fractured || entry.origin || entry.desecrated)
                throw new Error(
                    "Enchantments cannot be crafted, fractured or transferred modifiers.",
                );
        }
        if (item.enchantments?.length && item.anointments?.length)
            throw new Error("An item cannot have both an anointment and another enchantment.");
        if (base.corrupted && !item.corrupted)
            throw new Error("This base is intrinsically corrupted.");
        if (item.sockets && hasAbyssSockets(this.catalog, item))
            throw new Error("Gem socket counts cannot be combined with Abyss sockets yet.");
        const minimumSockets = initialSockets(this.catalog, item);
        if (minimumSockets && item.sockets === undefined) item.sockets = minimumSockets;
        if ((item.sockets ?? 0) < minimumSockets)
            throw new Error("Socket count is below this base's extracted initial socket count.");
        if (item.sockets !== undefined && item.sockets > retainedSocketLimit(this.catalog, item))
            throw new Error("Socket count exceeds this item's supported extracted limit.");
        if (enchantmentStat(this.catalog, item, "local_all_sockets_linked"))
            item.socketLinks =
                (item.sockets ?? 0) > 1
                    ? Array.from({ length: item.sockets! - 1 }, () => true)
                    : undefined;
        validateSocketLinks(this.catalog, item);
        validateAugments(this.catalog, item);
        if (item.socketedJewel) {
            if (!item.jewelSocket)
                throw new Error("A socketed Jewel requires a converted Jewel socket.");
            item.socketedJewel = this.validateSocketedJewel(item.socketedJewel);
        }
        if (item.quality > 30 && item.quality > retainedBaseQualityLimit(this.catalog, item))
            throw new Error("Base quality exceeds this item's supported maximum quality.");
        if (item.mapQuality && !mapQualityRecipe(this.catalog, item))
            throw new Error("This map quality type is unavailable for this item class.");
        if (item.catalyst) {
            if (
                !availableCatalysts(this.catalog, item).some(
                    (entry) => entry.id === item.catalyst!.id,
                )
            )
                throw new Error(
                    "This catalyst is not available on this item class in the extracted build.",
                );
            if (item.catalyst.quality > retainedCatalystLimit(this.catalog, item))
                throw new Error("Catalyst quality exceeds this item's maximum quality.");
            if (item.quality)
                throw new Error("Items with both base and catalyst quality are not supported yet.");
        }
        if (item.imprint) {
            const snapshot = this.validateItem(item.imprint);
            if (
                this.catalog.game !== "poe1" ||
                snapshot.baseId !== item.baseId ||
                snapshot.level !== item.level ||
                snapshot.cluster?.passive !== item.cluster?.passive ||
                snapshot.cluster?.nodes !== item.cluster?.nodes ||
                snapshot.cluster?.jewelSockets !== item.cluster?.jewelSockets ||
                snapshot.unidentified ||
                snapshot.corrupted ||
                snapshot.mirrored ||
                snapshot.destroyed ||
                (item.allflameCrafted && !snapshot.allflameCrafted) ||
                snapshot.mods.some((entry) => entry.fractured)
            )
                throw new Error(
                    "The imprint does not belong to this item or has an ineligible state.",
                );
        }
        if (!base.rarities.includes(item.rarity))
            throw new Error("This base cannot have that rarity.");
        if (new Set(item.influences).size !== item.influences.length)
            throw new Error("Influences must be unique.");
        if (this.hasFixedInfluences(item) && item.influences.length)
            throw new Error("This base has fixed influences; assigned influences must be empty.");
        const influences = this.effectiveInfluences(item);
        if (
            item.influences.some(
                (influence) =>
                    !this.catalog.crafting.influences.some(
                        (rule) =>
                            rule.itemClass === base.item_class && rule.influence === influence,
                    ),
            )
        )
            throw new Error("This base cannot have the selected influence.");
        const histories = conversionHistory(this.catalog, item);
        const revealMods = item.mods.filter(
            (entry) =>
                ["veiled", this.revealDomain()].includes(this.mod(entry.id).domain) ||
                this.isDesecrated(entry),
        );
        if (revealMods.length > 1 && !item.putrefied)
            throw new Error("Only one veiled or revealed modifier is allowed.");
        for (const entry of item.mods) {
            if (
                entry.attributeSource &&
                (entry.conversion ||
                    entry.crafted ||
                    !this.attributes.get(entry.attributeSource)?.includes(entry.id))
            )
                throw new Error("Invalid extracted attribute conversion source.");
            const sourceId = entry.attributeSource ?? entry.conversion?.source ?? entry.id;
            const mod = this.mod(sourceId);
            if (entry.essence && !this.essenceMods.has(sourceId))
                throw new Error("This modifier has no extracted essence recipe.");
            if (this.catalog.game === "poe1" && entry.id.includes("Royale"))
                throw new Error("Royale modifiers are unavailable in ordinary crafting.");
            const emotion =
                entry.crafted &&
                this.recipePool(item, "emotion").some((value) => value.id === sourceId);
            const essence =
                entry.crafted &&
                this.catalog.game === "poe2" &&
                (this.recipePool(item, "essence").some((value) => value.id === sourceId) ||
                    passiveAllocationMod(this.catalog, item) === entry.id);
            if (!["prefix", "suffix"].includes(mod.generation_type))
                throw new Error("Explicit modifiers must be prefixes or suffixes.");
            if (
                entry.desecrated &&
                (this.catalog.game !== "poe2" ||
                    entry.crafted ||
                    mod.is_essence_only ||
                    ![base.domain, "desecrated"].includes(mod.domain) ||
                    !this.catalog.crafting.desecration.some((ticket) =>
                        ticket.itemClasses.includes(base.item_class),
                    ))
            )
                throw new Error("This modifier cannot be marked as desecrated.");
            const pending = item.putrefied && ["VeiledPrefix", "VeiledSuffix"].includes(entry.id);
            if (
                !pending &&
                item.mods
                    .slice(0, item.mods.indexOf(entry))
                    .some(
                        (other) =>
                            !(
                                item.putrefied &&
                                ["VeiledPrefix", "VeiledSuffix"].includes(other.id)
                            ) &&
                            this.mod(entry.id).groups.some((group) =>
                                this.mod(other.id).groups.includes(group),
                            ) &&
                            !conversionSeparates(this.catalog, histories, entry, other),
                    )
            )
                throw new Error("Modifiers in the same group cannot coexist.");
            if (
                this.catalog.game === "poe1"
                    ? entry.crafted !== (mod.domain === "crafted")
                    : entry.crafted &&
                      !emotion &&
                      !essence &&
                      !this.catalog.crafting.craftableModTypes.includes(mod.type)
            )
                throw new Error("Crafted modifier flags must match the build data.");
            if (
                entry.fractured &&
                (mod.domain === "veiled" ||
                    this.isDesecrated(entry) ||
                    influences.length ||
                    !this.catalog.crafting.classes[base.item_class]?.fracture)
            )
                throw new Error("This modifier cannot be fractured on this item.");
            const rules = this.catalog.crafting.modRules[sourceId];
            const origin = entry.origin;
            if (origin) {
                if (this.catalog.game !== "poe1" || entry.crafted)
                    throw new Error(
                        "This modifier cannot have a transferred or beastcraft origin.",
                    );
                if (origin.kind === "awakener") {
                    if (rules?.influence == null || item.influences.length !== 2)
                        throw new Error(
                            "An Awakener origin requires a dual-influence item and an influenced modifier.",
                        );
                } else if (origin.kind === "recombine") {
                    if (
                        !supportsRecombination(this, item) ||
                        mod.domain !== "item" ||
                        mod.is_essence_only
                    )
                        throw new Error("Invalid recombination origin for this modifier.");
                } else {
                    const operation = this.beastOperation(origin.recipe);
                    const recipe = this.catalog.crafting.beasts.find(
                        (value) => value.id === origin.recipe,
                    );
                    const side = operation === "suffix-to-prefix" ? "prefix" : "suffix";
                    if (
                        !recipe ||
                        !["prefix-to-suffix", "suffix-to-prefix", "flask"].includes(
                            operation ?? "",
                        ) ||
                        mod.generation_type !== side ||
                        (operation === "flask" && recipe.mod !== entry.id) ||
                        origin.level < Math.max(1, ...recipe.components.map((value) => value.level))
                    )
                        throw new Error("The modifier has an invalid beastcraft origin.");
                }
            }
            if (rules?.itemClasses.length && !rules.itemClasses.includes(base.item_class))
                throw new Error("Modifier is restricted to another item class.");
            if (rules?.influence != null && !influences.includes(rules.influence))
                throw new Error("This modifier requires its matching influence.");
            const recipe = this.recipeClasses.get(sourceId)?.has(base.item_class) || emotion;
            const tags = new Set([
                ...base.tags,
                ...clusterTags(this.catalog, item),
                ...(item.blight ? this.mod(item.blight).adds_tags : []),
                ...item.mods.flatMap((value) => this.mod(value.id).adds_tags),
                ...augmentTags(this.catalog, item),
                ...this.catalog.crafting.influences
                    .filter(
                        (value) =>
                            value.itemClass === base.item_class &&
                            influences.includes(value.influence),
                    )
                    .map((value) => value.tag),
            ]);
            const weight = mod.spawn_weights.find((rule) => tags.has(rule.tag))?.weight ?? 0;
            const natural =
                [base.domain, this.revealDomain()].includes(mod.domain) &&
                weight > 0 &&
                (rules?.spawnLevel ?? mod.required_level) <= (origin?.level ?? item.level);
            const ducat =
                ["mercenary", "ducat_crafted"].includes(mod.domain) &&
                [...allflameDucatActions].some((action) =>
                    this.ducatPool(
                        { ...item, mods: item.mods.filter((value) => value !== entry) },
                        action,
                        { ignoreMeta: true },
                    ).some((value) => value.id === sourceId),
                );
            if (entry.desecrated && mod.domain === base.domain && !natural)
                throw new Error(
                    "This ordinary modifier cannot be revealed on this base and level.",
                );
            const hidden = mod.domain === "veiled" && (pending || item.reveal?.mod === entry.id);
            const specialReveal =
                !natural &&
                !item.putrefied &&
                mod.domain === "desecrated" &&
                this.catalog.crafting.desecration.some(
                    (ticket) =>
                        ticket.tag &&
                        ticket.itemClasses.includes(base.item_class) &&
                        this.pool(
                            { ...item, mods: item.mods.filter((value) => value !== entry) },
                            {
                                domain: "desecrated",
                                extraTags: [ticket.tag],
                                ignoreMeta: true,
                            },
                        ).some((value) => value.id === sourceId),
                );
            const elevated =
                !natural &&
                !recipe &&
                this.catalog.crafting.influenceUpgrades.some(
                    (rule) => rule.upgraded === entry.id && rule.highestTier,
                );
            if (
                origin &&
                !natural &&
                !(origin.kind === "awakener" && elevated) &&
                !(origin.kind === "recombine" && isBreachModifier(this.catalog, item, entry.id))
            )
                throw new Error(
                    "This modifier is unavailable at its recorded crafting origin level.",
                );
            const fossil =
                !natural &&
                !recipe &&
                !elevated &&
                this.catalog.crafting.fossils.some(
                    (value) =>
                        [...value.added, ...value.forced].includes(entry.id) &&
                        (!value.allowed.length ||
                            value.allowed.some(
                                (rule) =>
                                    (rule.tag && tags.has(rule.tag)) ||
                                    rule.itemClass === base.item_class,
                            )) &&
                        !value.forbidden.some(
                            (rule) =>
                                (rule.tag && tags.has(rule.tag)) ||
                                rule.itemClass === base.item_class,
                        ),
                );
            if (
                !recipe &&
                !elevated &&
                !(
                    fossil &&
                    (weight > 0 ||
                        this.catalog.crafting.fossils.some((value) =>
                            value.forced.includes(entry.id),
                        ))
                ) &&
                !natural &&
                !hidden &&
                !specialReveal &&
                !ducat &&
                !isBreachModifier(this.catalog, item, sourceId)
            )
                throw new Error("This modifier is not available on this item base and level.");
        }
        for (const entry of [...item.mods, ...item.implicits, ...(item.enchantments ?? [])]) {
            const mod = this.mod(entry.id);
            if (entry.essence && !item.mods.includes(entry))
                throw new Error("Essence sources apply only to explicit modifiers.");
            if (entry.attributeSource && !item.mods.includes(entry))
                throw new Error("Attribute conversion applies only to explicit modifiers.");
            if (entry.conversion && !item.mods.includes(entry))
                throw new Error("Elemental conversion applies only to explicit modifiers.");
            if (mod.stats.some((stat) => stat.id === grantedPassiveStat) || entry.grantedPassive) {
                if (
                    !entry.grantedPassive ||
                    !item.mods.includes(entry) ||
                    passiveAllocationMod(this.catalog, item) !== entry.id
                )
                    throw new Error("This modifier requires a valid allocated notable passive.");
                grantedPassive(this.catalog, entry.grantedPassive);
            }
            if (entry.sanctification !== undefined) {
                const range = this.catalog.crafting.sanctification;
                if (
                    !item.sanctified ||
                    !item.mods.includes(entry) ||
                    entry.fractured ||
                    !range ||
                    entry.sanctification < range.min ||
                    entry.sanctification > range.max
                )
                    throw new Error("Invalid Sanctification multiplier for this modifier.");
            }
            if (
                entry.corruptionScale !== undefined &&
                (!item.corrupted ||
                    !supportsJewelCorruption(this.catalog, item) ||
                    !item.mods.includes(entry) ||
                    entry.fractured ||
                    entry.sanctification !== undefined ||
                    mod.domain === "veiled")
            )
                throw new Error(
                    "Corruption value multipliers require revealed, unfractured PoE 2 jewel affixes.",
                );
            if (
                entry.values.length !== mod.stats.length ||
                entry.values.some((value, index) => {
                    const range = corruptionStatRange(this.catalog, item, entry.id, index);
                    return value < range.min || value > range.max;
                })
            )
                throw new Error("Modifier values are outside the extracted ranges.");
        }
        if (item.implicits.some((entry) => entry.origin))
            throw new Error("Crafting origin levels apply only to explicit modifiers.");
        if (item.implicits.some((entry) => entry.desecrated))
            throw new Error("Implicit modifiers cannot be desecrated.");
        if (
            item.implicits.some((entry) =>
                ["prefix", "suffix"].includes(this.mod(entry.id).generation_type),
            )
        )
            throw new Error("Implicit modifiers cannot be prefixes or suffixes.");
        const gilded = item.implicits.filter((entry) => entry.id === gildedImplicitId);
        if (
            gilded.length &&
            (gilded.length > 1 ||
                !this.gildedModifiers(item).length ||
                gilded.some((entry) => entry.crafted || entry.fractured))
        )
            throw new Error("The item has an invalid Gilded Fossil implicit.");
        const corrupted = item.implicits.filter(
            (entry) => this.mod(entry.id).generation_type === "corrupted",
        );
        if (
            corrupted.length &&
            (!item.corrupted ||
                corrupted.length >
                    (item.twiceCorrupted || supportsLocus(this.catalog, item) ? 2 : 1) ||
                corrupted.some((entry, index) =>
                    corrupted
                        .slice(0, index)
                        .some(
                            (other) =>
                                entry.id === other.id ||
                                this.mod(entry.id).groups.some((group) =>
                                    this.mod(other.id).groups.includes(group),
                                ),
                        ),
                ) ||
                corrupted.some(
                    (entry) =>
                        entry.fractured ||
                        entry.crafted ||
                        !this.corruptedModifiers(item).some(
                            (candidate) => candidate.id === entry.id,
                        ),
                ))
        )
            throw new Error("The item has an invalid corrupted implicit.");
        const ordinaryImplicits = item.implicits.filter(
            (entry) =>
                entry.id !== gildedImplicitId && this.mod(entry.id).generation_type !== "corrupted",
        );
        const eldritch = ordinaryImplicits.filter((entry) => eldritchTier(this.mod(entry.id)) > 0);
        if (
            item.implicitCraft &&
            (this.catalog.game !== "poe1" ||
                base.item_class !== "Amulet" ||
                !item.allflameCrafted ||
                this.catalog.crafting.currencies.find(
                    (entry) => entry.id === item.implicitCraft!.currency,
                )?.action !== "add_eldritch_implicit_amulet" ||
                new Set(item.implicitCraft.removed).size !== item.implicitCraft.removed.length ||
                item.implicitCraft.removed.some((id) => !base.implicits.includes(id)))
        )
            throw new Error("Invalid Ukatoa implicit replacement record.");
        const nativeIds = base.implicits.filter((id) => !item.implicitCraft?.removed.includes(id));
        const native = item.implicitCraft
            ? ordinaryImplicits.filter((entry) => !eldritch.includes(entry))
            : ordinaryImplicits;
        if (
            (!eldritch.length || item.implicitCraft) &&
            (native.length < nativeIds.length - corrupted.length ||
                native.length > nativeIds.length ||
                new Set(native.map((entry) => entry.id)).size !== native.length ||
                native.some((entry) => !nativeIds.includes(entry.id)) ||
                nativeIds.some(
                    (id) =>
                        this.mod(id).stats.some(
                            (stat) => stat.id === "local_implicit_mod_cannot_be_changed",
                        ) && !native.some((entry) => entry.id === id),
                ))
        )
            throw new Error(
                "The item has missing or unsupported implicit modifiers for this base.",
            );
        if (
            eldritch.length &&
            (item.implicitCraft
                ? eldritch.length !== 1 ||
                  eldritch.some((entry) => entry.crafted || entry.fractured)
                : this.catalog.game !== "poe1" ||
                  influences.length ||
                  !["Body Armour", "Helmet", "Gloves", "Boots"].includes(base.item_class) ||
                  new Set(eldritch.map((entry) => this.mod(entry.id).generation_type)).size !==
                      eldritch.length ||
                  ordinaryImplicits.length !== eldritch.length)
        )
            throw new Error("The item has incompatible Eldritch implicits.");
        for (const entry of eldritch) {
            const pool = item.implicitCraft
                ? this.ukatoaModifiers({ ...item, level: item.implicitCraft.level }, true)
                : this.eldritchModifiers(item);
            if (!pool.some((candidate) => candidate.id === entry.id))
                throw new Error("This Eldritch implicit is not available on this base.");
        }
        const distinctMods = item.mods.filter(
            (entry) => !item.putrefied || this.mod(entry.id).domain !== "veiled",
        );
        if (
            distinctMods.some((entry, index) =>
                distinctMods
                    .slice(0, index)
                    .some(
                        (other) =>
                            entry.id === other.id &&
                            !conversionSeparates(this.catalog, histories, entry, other),
                    ),
            )
        )
            throw new Error("Duplicate modifiers are not allowed.");
        const counts = this.counts(item);
        const limits = this.limits(item);
        const retainedLimits = { ...(this.corruptedAreaLimits(item) ?? limits) };
        if (item.corruptedBy && item.rarity === "rare") {
            retainedLimits.max++;
            retainedLimits.prefixes++;
            retainedLimits.suffixes++;
        }
        if (item.corrupted && supportsTabletCorruption(this.catalog, item)) {
            retainedLimits.max++;
            retainedLimits.prefixes++;
            retainedLimits.suffixes++;
        }
        if (this.catalog.game === "poe2" && item.rarity === "rare" && base.item_class === "Jewel") {
            const ordinary = this.limits({ ...item, mods: [] });
            const outcomes = this.recipePool(item, "emotion");
            // Removing a capacity modifier leaves existing jewel affixes intact; new rolls use current limits.
            for (const side of ["prefix", "suffix"] as const) {
                const maximum = Math.max(
                    0,
                    ...outcomes.flatMap(({ mod }) =>
                        mod.stats
                            .filter((stat) => stat.id === `local_maximum_${side}es_allowed_+`)
                            .map((stat) => stat.max),
                    ),
                );
                const key = side === "prefix" ? "prefixes" : "suffixes";
                retainedLimits[key] = Math.max(limits[key], ordinary[key] + maximum);
            }
        }
        if (
            counts.prefixes > retainedLimits.prefixes ||
            counts.suffixes > retainedLimits.suffixes ||
            item.mods.length > retainedLimits.max
        )
            throw new Error("The item exceeds its affix limits.");
        const crafted = item.mods.filter((mod) => mod.crafted).length;
        // Replacing Astrid's Creativity preserves existing crafts but closes its additional slot.
        const retainedCrafted =
            crafted > this.craftedLimit(item) && this.catalog.game === "poe2" && item.sockets
                ? 1 +
                  Math.max(
                      0,
                      ...availableAugments(this.catalog, item).map(
                          (entry) =>
                              augmentStats(this.catalog, item, entry.id).get(
                                  "local_can_have_additional_crafted_mods",
                              ) ?? 0,
                      ),
                  )
                : 0;
        if (crafted > Math.max(this.craftedLimit(item), retainedCrafted))
            throw new Error("The item has too many crafted modifiers.");
        if (item.reveal) {
            if (item.putrefied && item.reveal.index === undefined)
                throw new Error("Putrefaction requires an indexed reveal state.");
            if (item.reveal.index !== undefined && !item.putrefied)
                throw new Error("Indexed reveals require a Putrefaction item.");
            const active = this.revealIndex(item);
            if (active < 0 || item.mods[active]?.id !== item.reveal.mod)
                throw new Error("The reveal index must identify its unrevealed modifier.");
            if (item.putrefied && item.reveal.omens?.length)
                throw new Error("Putrefaction reveals do not use directional or Lich omens.");
            if (item.reveal.echoes) {
                const effects = omenEffects(this.catalog, {
                    kind: "reveal",
                    preferred: [],
                    omens: [item.reveal.echoes.omen],
                });
                if (!effects.revealReroll || !item.reveal.choices.length)
                    throw new Error("A reveal reroll requires an omen and revealed choices.");
            }
            if (
                !item.mods.some(
                    (entry) =>
                        entry.id === item.reveal!.mod && this.mod(entry.id).domain === "veiled",
                )
            )
                throw new Error("The reveal state requires its veiled modifier.");
            const context = item.reveal.offeredOn;
            if (context && (!item.reveal.choices.length || context.baseId !== item.baseId))
                throw new Error(
                    "Retained reveal context requires choices from the same item base.",
                );
            const currentPools = this.revealPools(item);
            const offeredOn = context
                ? this.validateItem({
                      ...context,
                      reveal: {
                          ...item.reveal,
                          choices: [],
                          echoes: undefined,
                          offeredOn: undefined,
                      },
                  })
                : item;
            const { exclusive, ordinary } = context ? this.revealPools(offeredOn) : currentPools;
            const pool = [...exclusive, ...ordinary];
            const choiceGroups = new Set<string>();
            for (const id of item.reveal.choices) {
                const candidate = pool.find((entry) => entry.id === id);
                if (!candidate || candidate.mod.groups.some((group) => choiceGroups.has(group)))
                    throw new Error("Invalid or conflicting reveal choices.");
                for (const group of candidate.mod.groups) choiceGroups.add(group);
            }
            if (new Set(item.reveal.choices).size !== item.reveal.choices.length)
                throw new Error("Duplicate reveal choices.");
            const tag = this.revealTag(item);
            if (
                tag &&
                item.reveal.choices.length &&
                exclusive.some((entry) => entry.mod.implicit_tags.includes(tag)) &&
                !item.reveal.choices.some((id) => this.mod(id).implicit_tags.includes(tag))
            )
                throw new Error("The reveal choices are missing the guaranteed Lich modifier.");
            if (item.reveal.choices.length && !context)
                item.reveal.offeredOn = craftingRevealContextSchema.parse(item);
        }
        if (item.putrefied && this.unrevealedCount(item) > 0 && !item.reveal)
            throw new Error("Unrevealed Putrefaction modifiers require an active reveal state.");
        return item;
    }

    revealDomain() {
        return this.catalog.game === "poe1" ? "unveiled" : "desecrated";
    }

    isDesecrated(entry: RolledMod) {
        return (
            this.catalog.game === "poe2" &&
            (entry.desecrated === true || this.mod(entry.id).domain === "desecrated")
        );
    }

    isAbyssalMark(id: string) {
        return (
            this.catalog.game === "poe2" &&
            this.mod(id).stats.some((stat) => stat.id === "essence_abyss_guaranteed_pick")
        );
    }

    revealMinimumLevel(item: CraftingItem) {
        if (item.putrefied) return 0;
        const ticket = this.catalog.crafting.desecration.find(
            (entry) => entry.id === item.reveal?.source,
        );
        // The mark's 40% floor follows the reference model; the client only promises higher tiers.
        return Math.max(
            ticket?.minimumModLevel ?? 0,
            item.reveal?.mark ? Math.floor(item.level * 0.4) : 0,
        );
    }

    unrevealedCount(item: CraftingItem) {
        return item.mods.filter((entry) => this.mod(entry.id).domain === "veiled").length;
    }

    private revealIndex(item: CraftingItem) {
        return item.reveal?.index ?? item.mods.findIndex((entry) => entry.id === item.reveal?.mod);
    }

    selectUnrevealed(input: CraftingItem, index: number) {
        const item = this.validateItem(input);
        if (
            !item.putrefied ||
            !item.reveal ||
            !Number.isInteger(index) ||
            !item.mods[index] ||
            this.mod(item.mods[index]!.id).domain !== "veiled"
        )
            throw new Error("Choose an unrevealed Putrefaction modifier.");
        if (item.reveal.choices.length)
            throw new Error("Choose a revealed modifier before switching to another affix.");
        item.reveal = { mod: item.mods[index]!.id, index, source: item.reveal.source, choices: [] };
        return this.validateItem(item);
    }

    private revealTag(item: CraftingItem) {
        return item.reveal
            ? omenEffects(this.catalog, {
                  kind: "currency",
                  id: item.reveal.source,
                  omens: item.reveal.omens,
              }).revealTag
            : undefined;
    }

    revealedModifiers(item: CraftingItem): PoolEntry[] {
        const empty = { ...item, rarity: "rare" as const, mods: [] };
        const options = { domain: this.revealDomain(), ignoreMeta: true };
        const entries = [
            ...this.pool(empty, options),
            ...(this.catalog.game === "poe2" &&
            this.catalog.crafting.desecration.some((ticket) =>
                ticket.itemClasses.includes(this.base(item).item_class),
            )
                ? this.pool(empty, { ignoreMeta: true })
                : []),
            ...this.catalog.crafting.desecration.flatMap((ticket) =>
                !item.putrefied &&
                ticket.tag &&
                ticket.itemClasses.includes(this.base(item).item_class)
                    ? this.pool(empty, { ...options, extraTags: [ticket.tag] })
                    : [],
            ),
        ];
        return [...new Map(entries.map((entry) => [entry.id, entry])).values()];
    }

    revealSources(item: CraftingItem) {
        const base = this.base(item);
        if (
            !base.rarities.includes("rare") ||
            (this.catalog.game === "poe1" &&
                !this.catalog.crafting.classes[base.item_class]?.veiled)
        )
            return [];
        const sources =
            this.catalog.game === "poe1"
                ? this.revealedModifiers(item).length
                    ? this.catalog.crafting.currencies.filter((entry) =>
                          ["replace_rare_mod_veiled", "reroll_rare_veiled"].includes(entry.action),
                      )
                    : []
                : this.catalog.crafting.desecration
                      .filter(
                          (entry) =>
                              entry.itemClasses.includes(this.base(item).item_class) &&
                              (!entry.maximumItemLevel || item.level <= entry.maximumItemLevel),
                      )
                      .map(
                          (entry) =>
                              this.catalog.crafting.currencies.find(
                                  (currency) => currency.id === entry.id,
                              )!,
                      );
        return sources;
    }

    revealPreview(item: CraftingItem, source: string) {
        if (!this.revealSources(item).some((entry) => entry.id === source))
            throw new Error("Choose a reveal source available for this base and item level.");
        const pool: PoolEntry[] = [];
        const probabilities = new Map<string, number>();
        for (const mod of ["VeiledPrefix", "VeiledSuffix"]) {
            const preview: CraftingItem = {
                ...item,
                rarity: "rare",
                putrefied: undefined,
                mods: [
                    {
                        id: mod,
                        values: this.mod(mod).stats.map((stat) => stat.min),
                        fractured: false,
                        crafted: false,
                    },
                ],
                reveal: { mod, source, choices: [] },
            };
            pool.push(...this.revealPool(preview));
            for (const [id, chance] of this.revealProbabilities(preview))
                probabilities.set(id, chance);
        }
        return { pool, probabilities };
    }

    revealPool(item: CraftingItem): PoolEntry[] {
        const { exclusive, ordinary } = this.revealPools(item);
        return [...exclusive, ...ordinary];
    }

    revealProbabilities(item: CraftingItem): Map<string, number> {
        const pools = this.revealPools(item);
        if (item.reveal!.choices.length)
            return new Map(
                [
                    ...new Set(
                        [...pools.exclusive, ...pools.ordinary]
                            .map(({ id }) => id)
                            .concat(item.reveal!.choices),
                    ),
                ].map((id) => [id, item.reveal!.choices.includes(id) ? 1 : 0]),
            );
        return revealChoiceProbabilities(this.catalog.game, pools, this.revealTag(item));
    }

    private revealPools(item: CraftingItem) {
        const state = item.reveal;
        if (!state) throw new Error("The item has no modifier to reveal.");
        const source = this.catalog.crafting.currencies.find((entry) => entry.id === state.source);
        const ticket = this.catalog.crafting.desecration.find((entry) => entry.id === state.source);
        if (!["VeiledPrefix", "VeiledSuffix"].includes(state.mod))
            throw new Error("This specialised veiled modifier is not supported yet.");
        if (
            state.mark &&
            (item.putrefied ||
                !this.isAbyssalMark(state.mark) ||
                this.mod(state.mark).generation_type !== this.mod(state.mod).generation_type ||
                !this.recipePool(item, "essence").some((entry) => entry.id === state.mark))
        )
            throw new Error("The reveal state has an invalid Mark of the Abyssal Lord origin.");
        if (
            this.catalog.game === "poe1"
                ? !source ||
                  !["replace_rare_mod_veiled", "reroll_rare_veiled"].includes(source.action)
                : !ticket
        )
            throw new Error("The reveal source is missing from this build.");
        if (
            ticket &&
            (!ticket.itemClasses.includes(this.base(item).item_class) ||
                (ticket.maximumItemLevel && item.level > ticket.maximumItemLevel))
        )
            throw new Error("This desecration bone cannot be used on this item class or level.");
        const effects = omenEffects(this.catalog, {
            kind: "currency",
            id: state.source,
            omens: state.omens,
        });
        if (state.mark && state.omens?.some((id) => directionalDesecrationOmen.test(id)))
            throw new Error("Necromancy omens are not consumed when replacing an Abyssal Mark.");
        if (effects.addSide && this.mod(state.mod).generation_type !== effects.addSide)
            throw new Error("The veiled modifier does not match its directional omen.");
        const unhidden = {
            ...item,
            mods: item.mods.filter((_, index) => index !== this.revealIndex(item)),
        };
        const options = {
            side: this.mod(state.mod).generation_type,
            ignoreMeta: true,
        };
        const minimumLevel = this.revealMinimumLevel(item);
        const exclusive = this.pool(unhidden, {
            ...options,
            domain: this.revealDomain(),
        }).filter((entry) => entry.mod.required_level >= minimumLevel);
        const exclusiveIds = new Set(exclusive.map((entry) => entry.id));
        const ordinary = [
            ...(this.catalog.game === "poe2" ? this.pool(unhidden, options) : []),
            ...(!item.putrefied && ticket?.tag
                ? this.pool(unhidden, {
                      ...options,
                      domain: this.revealDomain(),
                      extraTags: [ticket.tag],
                  }).filter((entry) => !exclusiveIds.has(entry.id))
                : []),
        ].filter((entry) => entry.mod.required_level >= minimumLevel);
        return { exclusive, ordinary };
    }

    revealChoices(input: CraftingItem, random: CraftingRandom) {
        const item = this.validateItem(input);
        if (!item.reveal) throw new Error("The item has no modifier to reveal.");
        if (item.reveal.choices.length) return item;
        const pools = this.revealPools(item);
        if (!pools.exclusive.length && !pools.ordinary.length)
            throw new Error("No eligible reveal choices.");
        const tag = this.revealTag(item);
        const guaranteed = tag
            ? pools.exclusive.filter((entry) => entry.mod.implicit_tags.includes(tag))
            : [];
        // The reference models 1/2/3 Abyss-exclusive choices with 80/15/5 odds, then ordinary choices.
        const exclusiveCount =
            this.catalog.game === "poe2" ? random.pick(revealCountWeights(this.catalog.game)) : 3;
        const pickChoice = (candidates: PoolEntry[]) => {
            const selected = random.pick(
                candidates.map((entry) => ({ value: entry, weight: entry.weight })),
            );
            item.reveal!.choices.push(selected.id);
            const compatible = (entry: PoolEntry) =>
                entry.id !== selected.id &&
                !entry.mod.groups.some((group) => selected.mod.groups.includes(group));
            pools.exclusive = pools.exclusive.filter(compatible);
            pools.ordinary = pools.ordinary.filter(compatible);
        };
        while (item.reveal.choices.length < exclusiveCount && pools.exclusive.length)
            pickChoice(
                guaranteed.length && !item.reveal.choices.length ? guaranteed : pools.exclusive,
            );
        while (item.reveal.choices.length < 3 && pools.ordinary.length) pickChoice(pools.ordinary);
        return this.validateItem(item);
    }

    prepareReveal(
        input: CraftingItem,
        method: Extract<CraftingMethod, { kind: "reveal" }>,
        random: CraftingRandom,
    ): { item: CraftingItem; cost: CraftingCost[] } {
        this.validateMethod(method);
        const item = this.validateItem(input);
        if (!item.reveal) throw new Error("The item has no modifier to reveal.");
        if (item.reveal.choices.length) {
            if (method.omens?.some((id) => id !== item.reveal!.echoes?.omen))
                throw new Error("Select reveal omens before revealing the first choices.");
            return { item, cost: [] };
        }
        const revealed = this.revealChoices(item, random);
        if (omenEffects(this.catalog, method).revealReroll)
            revealed.reveal!.echoes = { omen: method.omens![0]!, remaining: 1 };
        return { item: this.validateItem(revealed), cost: this.costs(method) };
    }

    rerollReveal(input: CraftingItem, random: CraftingRandom) {
        const item = this.validateItem(input);
        if (!item.reveal?.echoes?.remaining)
            throw new Error("This item has no reveal reroll remaining.");
        const echoes = item.reveal.echoes;
        const rerolled = this.revealChoices(
            {
                ...item,
                reveal: { ...item.reveal, choices: [], echoes: undefined, offeredOn: undefined },
            },
            random,
        );
        rerolled.reveal!.echoes = { ...echoes, remaining: 0 };
        return this.validateItem(rerolled);
    }

    selectableRevealChoices(item: CraftingItem) {
        const eligible = new Set(this.revealPool(item).map((entry) => entry.id));
        return item.reveal!.choices.filter((id) => eligible.has(id));
    }

    chooseRevealed(input: CraftingItem, id: string, random: CraftingRandom) {
        const item = this.validateItem(input);
        if (!item.reveal?.choices.includes(id))
            throw new Error("Choose one of the revealed modifiers.");
        if (!this.selectableRevealChoices(item).includes(id))
            throw new Error("This retained reveal choice conflicts with the current item.");
        const source = item.reveal.source;
        const active = this.revealIndex(item);
        item.mods = item.mods.map((entry, index) =>
            index === active
                ? this.rollMod(
                      id,
                      random,
                      this.catalog.game === "poe2" && this.mod(id).domain !== "desecrated"
                          ? { desecrated: true }
                          : {},
                  )
                : entry,
        );
        delete item.reveal;
        if (item.putrefied) {
            const index = item.mods.findIndex((entry) => this.mod(entry.id).domain === "veiled");
            if (index >= 0) item.reveal = { mod: item.mods[index]!.id, index, source, choices: [] };
        }
        return this.validateItem(item);
    }

    private putrefy(item: CraftingItem, source: string, random: CraftingRandom) {
        const ticket = this.catalog.crafting.desecration.find((entry) => entry.id === source);
        if (
            !ticket ||
            !ticket.itemClasses.includes(this.base(item).item_class) ||
            (ticket.maximumItemLevel && item.level > ticket.maximumItemLevel)
        )
            throw new Error("This desecration bone cannot be used on this item class or level.");
        item.mods = item.mods.filter((entry) => this.protected(item, entry));
        delete item.reveal;
        item.corrupted = true;
        item.putrefied = true;
        const limits = this.limits(item);
        // Putrefaction counts and side selection are modeled server behavior, separate from client weights.
        const count = Math.min(
            limits.max,
            random.pick(
                limits.max === 4
                    ? [
                          { value: 3, weight: 65 },
                          { value: 4, weight: 35 },
                      ]
                    : [
                          { value: 4, weight: 8 },
                          { value: 5, weight: 3 },
                          { value: 6, weight: 1 },
                      ],
            ),
        );
        while (item.mods.length < count) {
            const counts = this.counts(item);
            const choices = (["prefix", "suffix"] as const).filter((side) =>
                side === "prefix"
                    ? counts.prefixes < limits.prefixes
                    : counts.suffixes < limits.suffixes,
            );
            const side = random.pick(choices.map((value) => ({ value, weight: 1 })));
            const id = side === "prefix" ? "VeiledPrefix" : "VeiledSuffix";
            const index = item.mods.length;
            item.mods.push(this.rollMod(id, random));
            item.reveal ??= { mod: id, index, source, choices: [] };
        }
    }

    private addVeiled(
        item: CraftingItem,
        source: string,
        random: CraftingRandom,
        options: { side?: string; omens?: string[] } = {},
    ) {
        if (this.catalog.game === "poe2") {
            const ticket = this.catalog.crafting.desecration.find((entry) => entry.id === source);
            if (
                !ticket ||
                !ticket.itemClasses.includes(this.base(item).item_class) ||
                (ticket.maximumItemLevel && item.level > ticket.maximumItemLevel)
            )
                throw new Error(
                    "This desecration bone cannot be used on this item class or level.",
                );
        }
        const mark = item.mods.find((entry) => this.isAbyssalMark(entry.id));
        if (mark) {
            const id =
                this.mod(mark.id).generation_type === "prefix" ? "VeiledPrefix" : "VeiledSuffix";
            const state = {
                mod: id,
                source,
                mark: mark.id,
                choices: [],
                omens: options.omens?.filter((id) => !directionalDesecrationOmen.test(id)),
            };
            item.mods = item.mods.map((entry) =>
                entry === mark ? this.rollMod(id, random) : entry,
            );
            item.reveal = state;
            return;
        }
        if (this.catalog.game === "poe2") {
            const counts = this.counts(item);
            const limits = this.limits(item);
            const fullSide =
                options.side &&
                (options.side === "prefix"
                    ? counts.prefixes >= limits.prefixes
                    : counts.suffixes >= limits.suffixes);
            if (fullSide || item.mods.length >= limits.max)
                this.remove(item, random, false, { side: fullSide ? options.side : undefined });
            const remaining = this.counts(item);
            const available = this.limits(item);
            const sides = (["prefix", "suffix"] as const).filter(
                (side) =>
                    (!options.side || side === options.side) &&
                    item.mods.length < available.max &&
                    (side === "prefix"
                        ? remaining.prefixes < available.prefixes
                        : remaining.suffixes < available.suffixes),
            );
            const side = random.pick(sides.map((value) => ({ value, weight: 1 })));
            const id = side === "prefix" ? "VeiledPrefix" : "VeiledSuffix";
            item.mods.push(this.rollMod(id, random));
            item.reveal = { mod: id, source, choices: [], omens: options.omens };
            return;
        }
        const counts = this.counts(item);
        const limits = this.limits(item);
        const choices = Object.entries(this.catalog.mods).flatMap(([id, mod]) => {
            if (
                mod.domain !== "veiled" ||
                !["VeiledPrefix", "VeiledSuffix"].includes(id) ||
                (options.side && mod.generation_type !== options.side)
            )
                return [];
            const fullSide =
                mod.generation_type === "prefix"
                    ? counts.prefixes >= limits.prefixes
                    : counts.suffixes >= limits.suffixes;
            if (fullSide || item.mods.length >= limits.max) return [];
            const pool = this.revealPool({
                ...item,
                mods: [...item.mods, this.rollMod(id, seededRandom(0))],
                reveal: { mod: id, source, choices: [], omens: options.omens },
            });
            return pool.length ? [{ value: id, weight: 1 }] : [];
        });
        const id = random.pick(choices);
        item.mods.push(this.rollMod(id, random));
        item.reveal = { mod: id, source, choices: [], omens: options.omens };
    }

    rollMod(
        id: string,
        random: CraftingRandom,
        flags: Partial<
            Pick<
                RolledMod,
                "fractured" | "crafted" | "origin" | "desecrated" | "grantedPassive" | "essence"
            >
        > = {},
        lucky = false,
    ): RolledMod {
        const mod = this.mod(id);
        return {
            id,
            fractured: false,
            crafted: mod.domain === "crafted",
            ...flags,
            values: mod.stats.map((stat) => {
                const value = random.integer(stat.min, stat.max);
                return lucky ? Math.max(value, random.integer(stat.min, stat.max)) : value;
            }),
        };
    }

    createItem(baseId: string, level = 86): CraftingItem {
        const base = this.catalog.bases[baseId];
        if (!base) throw new Error("Unknown item base.");
        const chest = strongbox(this.catalog, { baseId });
        const validLevel = craftingItemSchema.shape.level.parse(level);
        const passive = clusterSkills(this.catalog, { baseId })[0];
        return this.validateItem({
            baseId,
            ...(passive ? { cluster: { passive: passive.id } } : {}),
            level: chest
                ? Math.max(
                      Math.max(1, chest.minimumLevel),
                      Math.min(validLevel, chest.maximumLevel),
                  )
                : validLevel,
            rarity: "normal",
            corrupted: base.corrupted,
            mods: [],
            implicits: base.implicits.map((id) => this.rollMod(id, seededRandom(0))),
        });
    }

    generationRarities(item: CraftingItem) {
        return this.base(item).rarities;
    }

    identificationSupported(item: CraftingItem) {
        const base = this.base(item);
        return (
            base.domain === "item" &&
            ["weapon", "armour", "ring", "amulet", "belt", "quiver"].some((tag) =>
                base.tags.includes(tag),
            ) &&
            item.rarity !== "normal" &&
            !(
                this.catalog.game === "poe1" &&
                item.baseId === graspingMailBase &&
                item.rarity === "rare"
            ) &&
            this.generationRarities(item).includes(item.rarity) &&
            !item.mods.length &&
            item.implicits.every((entry) => base.implicits.includes(entry.id)) &&
            !item.implicitCraft &&
            !item.reveal &&
            !item.imprint &&
            !item.destroyed &&
            !item.allflameCopies &&
            !item.allflameCrafted &&
            item.intangibility === undefined &&
            !item.sanctified &&
            !item.putrefied &&
            !item.twiceCorrupted &&
            !item.split
        );
    }

    private generate(
        item: CraftingItem,
        rarity: CraftingItem["rarity"],
        random: CraftingRandom,
        genesis?: string[],
        breachRings?: BreachRings,
    ) {
        if (genesis && !genesisSupported(this.catalog, item))
            throw new Error("Choose an eligible Genesis equipment base from this build.");
        if (!this.base(item).rarities.includes(rarity))
            throw new Error("This base cannot have that rarity.");
        const grasping =
            this.catalog.game === "poe1" &&
            item.baseId === graspingMailBase &&
            rarity === "rare" &&
            !genesis;
        if (breachRings !== undefined && !grasping)
            throw new Error("Breach rings require a Grasping Mail base.");
        const base = this.base(item);
        const fresh = this.validateItem({
            baseId: item.baseId,
            ...(item.cluster ? { cluster: structuredClone(item.cluster) } : {}),
            level: item.level,
            rarity,
            corrupted: base.corrupted,
            mods: [],
            implicits: base.implicits.map((id) => this.rollMod(id, random)),
            baseDefences: Object.fromEntries(
                baseDefenceEntries(this.catalog, item).map(({ key, range }) => [
                    key,
                    random.integer(range.min, range.max),
                ]),
            ),
        });
        if (rarity !== "normal") {
            const options = { genesis };
            if (!this.pool(fresh, options).length)
                throw new Error("No eligible modifiers for this base and item level.");
            if (genesis) {
                for (
                    let count = 0;
                    count < Math.min(4, this.limits(fresh).max) && this.pool(fresh, options).length;
                    count++
                )
                    this.add(fresh, random, options);
            } else if (grasping) {
                const count = random.pick([
                    { value: 1, weight: 50 },
                    { value: 2, weight: 33 },
                    { value: 3, weight: 17 },
                ]);
                for (let index = 0; index < count; index++) {
                    const selected = random.pick(
                        graspingPool(this.catalog, fresh, breachRings).map((entry) => ({
                            value: entry.id,
                            weight: entry.weight,
                        })),
                    );
                    fresh.mods.push(this.rollMod(selected, random));
                }
                const total = this.rollAffixCount(fresh, random);
                while (fresh.mods.length < total && this.pool(fresh).length)
                    this.add(fresh, random);
            } else this.reroll(fresh, random);
        }
        return this.validateItem(fresh);
    }

    genesisModifiers(item: CraftingItem, nodes: string[]) {
        if (!genesisSupported(this.catalog, item)) return [];
        return this.pool(
            { ...this.createItem(item.baseId, item.level), rarity: "rare" },
            { genesis: nodes },
        );
    }

    recipePool(item: CraftingItem, kind: "bench" | "essence" | "aspect" | "emotion"): PoolEntry[] {
        const itemClass = this.base(item).item_class;
        const data = this.catalog.crafting;
        if (kind === "emotion") {
            const ids = data.liquidEmotions
                .filter((entry) => this.emotionSupported(entry.id))
                .flatMap((entry) => this.emotionRule(item, entry.id)?.mods ?? []);
            return [...new Set(ids)].map((id) => ({ id, mod: this.mod(id), weight: 0 }));
        }
        if (kind === "aspect") {
            if (!data.classes[itemClass]?.aspects) return [];
            return [
                ...new Set(
                    data.beasts
                        .filter((recipe) => recipe.gameMode !== 2)
                        .flatMap((recipe) => (recipe.aspectMod ? [recipe.aspectMod] : [])),
                ),
            ].map((id) => ({ id, mod: this.mod(id), weight: 0 }));
        }
        const ids =
            kind === "bench"
                ? data.bench
                      .filter((entry) => entry.mod && entry.itemClasses.includes(itemClass))
                      .map((entry) => entry.mod!)
                : [
                      ...data.essences.flatMap((entry) =>
                          entry.mods[itemClass] ? [entry.mods[itemClass]!] : [],
                      ),
                      ...data.poe2Essences
                          .filter((entry) => this.essenceSupported(entry.id))
                          .flatMap((entry) =>
                              entry.rules
                                  .filter((rule) => rule.itemClasses.includes(itemClass))
                                  .flatMap((rule) => [
                                      ...(rule.mod ? [rule.mod] : []),
                                      ...rule.outcomes.map((outcome) => outcome.mod),
                                  ]),
                          ),
                  ];
        return [...new Set(ids)]
            .filter((id) => ["prefix", "suffix"].includes(this.mod(id).generation_type))
            .map((id) => ({ id, mod: this.mod(id), weight: 0 }));
    }

    influenceModifiers(
        item: CraftingItem,
        influence: number,
        options: PoolOptions = {},
    ): PoolEntry[] {
        if (
            !this.catalog.crafting.influences.some(
                (entry) =>
                    entry.itemClass === this.base(item).item_class && entry.influence === influence,
            )
        )
            return [];
        return this.pool(
            {
                ...item,
                rarity: "rare",
                mods: [],
                influences: this.effectiveInfluences(item).includes(influence)
                    ? item.influences
                    : [influence],
            },
            options,
        );
    }

    addStartingMod(
        input: CraftingItem,
        id: string,
        random: CraftingRandom,
        source:
            | "natural"
            | "essence"
            | "emotion"
            | "revealed"
            | "attribute"
            | "ukatoa"
            | "influence" = "natural",
    ) {
        const item = this.validateItem(input);
        if (item.unidentified) throw new Error("Identify the item before adding modifiers.");
        const mod = this.mod(id);
        if (source === "influence") {
            const influence = this.catalog.crafting.modRules[id]?.influence;
            if (influence == null) throw new Error("Choose an extracted influence modifier.");
            if (!this.effectiveInfluences(item).includes(influence))
                item.influences.push(influence);
            if (item.rarity === "normal") item.rarity = "rare";
            this.validateItem(item);
            if (!this.pool(item, { ignoreMeta: true }).some((entry) => entry.id === id))
                throw new Error("This influence modifier is not available on the current item.");
        }
        if (source === "ukatoa") {
            this.replaceUkatoaImplicit(item, random, id);
            return this.validateItem(item);
        }
        if (source === "attribute") {
            const choice = this.attributeChoices(item).find((entry) => entry.ids.includes(id));
            if (!choice) throw new Error("No eligible attribute to replace with this modifier.");
            this.replaceAttribute(item, choice.index, id, random);
            return this.validateItem(item);
        }
        if (
            source === "emotion" &&
            !this.recipePool(item, "emotion").some((entry) => entry.id === id)
        )
            throw new Error("This emotion modifier is not available on this item base.");
        if (mod.generation_type === "corrupted") {
            this.replaceCorruptedImplicit(item, random, id);
        } else if (id === gildedImplicitId) {
            if (!this.gildedModifiers(item).length)
                throw new Error("This Gilded Fossil implicit is not available on this base.");
            item.implicits.push(this.rollMod(id, random));
        } else if (eldritchTier(mod)) {
            if (!this.eldritchModifiers(item).some((entry) => entry.id === id))
                throw new Error("This implicit cannot be used on this base.");
            item.implicits = [
                ...item.implicits.filter(
                    (entry) =>
                        eldritchTier(this.mod(entry.id)) &&
                        this.mod(entry.id).generation_type !== mod.generation_type,
                ),
                this.rollMod(id, random),
            ];
        } else {
            if (item.rarity === "normal")
                item.rarity = this.base(item).rarities.includes("rare") ? "rare" : "magic";
            item.mods.push(
                this.rollMod(id, random, {
                    ...(source === "essence" ? { essence: true as const } : {}),
                    ...(this.catalog.game === "poe2"
                        ? source === "revealed" && mod.domain !== "desecrated"
                            ? { desecrated: true as const }
                            : source === "essence" || source === "emotion"
                              ? { crafted: true }
                              : {}
                        : {}),
                }),
            );
        }
        return this.validateItem(item);
    }

    setStartingPassive(input: CraftingItem, passive: string) {
        const item = this.validateItem(input);
        const id = passiveAllocationMod(this.catalog, item);
        if (!id)
            throw new Error("This base cannot allocate a passive through an essence modifier.");
        grantedPassive(this.catalog, passive);
        const existing = item.mods.find((entry) => entry.id === id);
        if (existing) existing.grantedPassive = passive;
        else {
            if (item.rarity === "normal") item.rarity = "rare";
            item.mods.push(
                this.rollMod(id, seededRandom(0), { crafted: true, grantedPassive: passive }),
            );
        }
        return this.validateItem(item);
    }

    attributeChoices(item: CraftingItem) {
        return item.mods.flatMap((entry, index) => {
            const ids = this.attributes.get(entry.id);
            return ids ? [{ index, ids }] : [];
        });
    }

    attributeModifiers(item: CraftingItem): PoolEntry[] {
        return [...new Set(this.attributeChoices(item).flatMap((entry) => entry.ids))].map(
            (id) => ({ id, mod: this.mod(id), weight: 0 }),
        );
    }

    private replaceAttribute(
        item: CraftingItem,
        index: number,
        id: string,
        random: CraftingRandom,
    ) {
        const previous = item.mods[index]!;
        const source = previous.attributeSource ?? previous.id;
        item.mods.splice(index, 1);
        const mod = this.mod(id);
        if (
            item.mods.some((entry) =>
                this.mod(entry.id).groups.some((group) => mod.groups.includes(group)),
            )
        )
            return;
        item.mods.push({
            ...this.rollMod(id, random, {
                ...(previous.origin ? { origin: previous.origin } : {}),
                ...(previous.essence ? { essence: true } : {}),
            }),
            ...(source !== id ? { attributeSource: source } : {}),
        });
    }

    ducatPool(item: CraftingItem, action: string, options: PoolOptions = {}): PoolEntry[] {
        const rule = ducatPoolOptions(this.catalog, item, action);
        return rule ? this.pool(item, { ...options, ...rule }) : [];
    }

    pool(item: CraftingItem, options: PoolOptions = {}): PoolEntry[] {
        const base = this.base(item);
        const influences = this.effectiveInfluences(item);
        const limits = options.limits ?? this.corruptedAreaLimits(item) ?? this.limits(item);
        const counts = this.counts(item);
        if (item.mods.length >= limits.max) return [];
        const existing = item.mods.map((entry) => this.mod(entry.id));
        const groups = new Set(existing.flatMap((mod) => mod.groups));
        const tags = new Set([
            ...base.tags,
            ...clusterTags(this.catalog, item),
            ...(options.extraTags ?? []),
            ...(item.blight ? this.mod(item.blight).adds_tags : []),
            ...existing.flatMap((mod) => mod.adds_tags),
            ...augmentTags(this.catalog, item),
            ...this.catalog.crafting.influences
                .filter(
                    (rule) =>
                        rule.itemClass === base.item_class && influences.includes(rule.influence),
                )
                .map((rule) => rule.tag),
        ]);
        const blocked = options.ignoreMeta
            ? []
            : (["attack", "caster"] as const).filter((tag) => this.hasStat(item, metaStats[tag]));
        const level = options.level ?? item.level;
        const key = JSON.stringify([
            item.baseId,
            level,
            [...tags].sort(),
            blocked,
            options.fossils,
            options.tangled,
            options.genesis,
            options.logic,
            options.influence,
            options.tag,
            options.anyTags,
            options.excludedTags,
            options.domain,
            options.affinity,
            options.catalysing ? item.catalyst : undefined,
        ]);
        let weighted = this.weightedPools.get(key);
        if (!weighted) {
            const fossils = this.effectiveFossils(options.fossils ?? [], options.tangled);
            const added = new Set(fossils.flatMap((fossil) => fossil.added));
            const candidates = [
                ...(this.domains.get(options.domain ?? base.domain) ?? []),
                ...[...added]
                    .filter((id) => this.mod(id).domain !== base.domain)
                    .map((id) => ({ id, mod: this.mod(id), weight: 0 })),
            ];
            weighted = candidates.flatMap(({ id, mod }) => {
                if (this.catalog.game === "poe1" && id.includes("Royale")) return [];
                if (mod.is_essence_only && !added.has(id)) return [];
                const rules = this.catalog.crafting.modRules[id];
                if (
                    (rules?.spawnLevel ?? mod.required_level) > level ||
                    (mod.maximum_level > 0 && level > mod.maximum_level)
                )
                    return [];
                if (rules?.gameMode === 2) return [];
                if (rules?.itemClasses.length && !rules.itemClasses.includes(base.item_class))
                    return [];
                if (
                    options.influence === "any"
                        ? rules?.influence == null || !influences.includes(rules.influence)
                        : options.influence !== undefined && rules?.influence !== options.influence
                )
                    return [];
                if (options.tag && !mod.implicit_tags.includes(options.tag)) return [];
                if (options.excludedTags?.some((tag) => mod.implicit_tags.includes(tag))) return [];
                if (
                    options.anyTags &&
                    !mod.implicit_tags.some((tag) => options.anyTags!.includes(tag))
                )
                    return [];
                if (blocked.some((tag) => mod.implicit_tags.includes(tag))) return [];
                let weight = this.fossilWeight(
                    mod,
                    mod.spawn_weights.find((rule) => tags.has(rule.tag))?.weight ?? 0,
                    fossils,
                    options.logic,
                    (mod.generation_weights.find((rule) => tags.has(rule.tag))?.weight ?? 100) /
                        100,
                );
                if (options.affinity?.types.includes(mod.type))
                    weight *= options.affinity.multiplier;
                if (options.catalysing && catalystEffect(this.catalog, item, id))
                    weight *= catalysingMultiplier(this.catalog, item);
                return weight > 0 ? [{ id, mod, weight }] : [];
            });
            if (options.genesis)
                weighted = genesisPool(weighted, genesisEffects(this.catalog, options.genesis));
            if (this.weightedPools.size >= 256)
                this.weightedPools.delete(this.weightedPools.keys().next().value!);
            this.weightedPools.set(key, weighted);
        }
        const pool = memoryTierPool(weighted, options.memoryStrands ?? 0, options.foulborn).filter(
            ({ id, mod }) => {
                const side = mod.generation_type;
                return (
                    (!options.side || side === options.side) &&
                    (side === "prefix"
                        ? counts.prefixes < limits.prefixes
                        : counts.suffixes < limits.suffixes) &&
                    !item.mods.some((entry) => entry.id === id) &&
                    !mod.groups.some((group) => groups.has(group))
                );
            },
        );
        if (!options.minimumLevel) return pool;
        return pool.filter(
            (entry) =>
                entry.mod.required_level >= options.minimumLevel! ||
                !pool.some(
                    (other) =>
                        other.mod.type === entry.mod.type &&
                        other.mod.generation_type === entry.mod.generation_type &&
                        other.mod.groups.join("|") === entry.mod.groups.join("|") &&
                        other.mod.required_level > entry.mod.required_level,
                ),
        );
    }

    fossil(id: string) {
        const fossil = this.catalog.crafting.fossils.find((entry) => entry.id === id);
        if (!fossil) throw new Error("Unknown fossil.");
        return fossil;
    }

    poe2EssenceOperation(id: string) {
        const description = this.catalog.crafting.currencies.find(
            (currency) => currency.id === id && currency.action === "use_essence",
        )?.description;
        if (description?.startsWith("Upgrades a ")) return "upgrade";
        if (description?.startsWith("Removes a random modifier")) return "replace";
    }

    essenceSupported(id: string) {
        if (this.catalog.game === "poe1")
            return this.catalog.crafting.essences.some((entry) => entry.id === id);
        const essence = this.catalog.crafting.poe2Essences.find((entry) => entry.id === id);
        return Boolean(
            essence &&
                this.poe2EssenceOperation(id) &&
                essence.replacement.every((type) => type === "Breach") &&
                essence.rules.every((rule) =>
                    [rule.mod, ...rule.outcomes.map((entry) => entry.mod)].every(
                        (id) =>
                            !id ||
                            !this.mod(id).stats.some(
                                (stat) => stat.id === "mod_granted_passive_hash_essence",
                            ),
                    ),
                ),
        );
    }

    harvestSupported(id: string) {
        const recipe = this.catalog.crafting.harvest.find((entry) => entry.id === id);
        return Boolean(
            recipe &&
                recipe.gameMode !== 2 &&
                ((recipe.command === "reroll_with_mod" &&
                    /^([a-z_]+) ON rare$/.test(recipe.parameters)) ||
                    (recipe.command === "add_enchant_to_class" && recipe.enchantment) ||
                    (recipe.command === "reroll_with_influence_mod" && !recipe.parameters) ||
                    (recipe.command === "reroll_influence_types" &&
                        recipe.influenceRerollClasses) ||
                    (recipe.command === "reroll_with_current_tags_affinity_multiplier" &&
                        recipe.affinityMultiplier !== null) ||
                    (recipe.command === "remove_type_and_add_type_mod" &&
                        /^ANY FOR ([a-z_]+) noinfluence$/.test(recipe.parameters)) ||
                    (recipe.command === "convert_mod" &&
                        /^\S+(?: \S+)* CONVERT (fire|cold|lightning) (fire|cold|lightning)$/.test(
                            recipe.parameters,
                        ))),
        );
    }

    protected(item: CraftingItem, entry: RolledMod, blockTags = false) {
        const mod = this.mod(entry.id);
        return (
            entry.fractured ||
            this.hasStat(
                item,
                mod.generation_type === "prefix" ? metaStats.prefixes : metaStats.suffixes,
            ) ||
            (blockTags &&
                (["attack", "caster"] as const).some(
                    (tag) => mod.implicit_tags.includes(tag) && this.hasStat(item, metaStats[tag]),
                ))
        );
    }

    private add(
        item: CraftingItem,
        random: CraftingRandom,
        options: PoolOptions = {},
        lucky = false,
    ) {
        const selected = random.pick(
            this.pool(item, options).map((entry) => ({ value: entry.id, weight: entry.weight })),
        );
        item.mods.push(this.rollMod(selected, random, {}, lucky));
    }

    private remove(
        item: CraftingItem,
        random: CraftingRandom,
        blockTags = false,
        options: {
            side?: string;
            lowestLevel?: boolean;
            desecrated?: boolean;
            count?: number;
        } = {},
    ) {
        let removable = item.mods.filter(
            (entry) =>
                !this.protected(item, entry, blockTags) &&
                (!options.desecrated ||
                    this.mod(entry.id).domain === "veiled" ||
                    this.isDesecrated(entry)) &&
                (!options.side || this.mod(entry.id).generation_type === options.side),
        );
        if (options.lowestLevel) {
            const lowest = Math.min(...removable.map((entry) => this.mod(entry.id).required_level));
            removable = removable.filter((entry) => this.mod(entry.id).required_level === lowest);
        }
        for (let index = 0; index < (options.count ?? 1); index++) {
            if (index > 0 && !removable.length) break;
            const selected = random.pick(removable.map((entry) => ({ value: entry, weight: 1 })));
            item.mods = item.mods.filter((entry) => entry !== selected);
            removable = removable.filter((entry) => entry !== selected);
        }
    }

    private addCraftedModifier(
        item: CraftingItem,
        candidates: { value: string; weight: number }[],
        random: CraftingRandom,
        replace: boolean,
        removeSide?: string,
    ) {
        const groups = new Set(item.mods.flatMap((entry) => this.mod(entry.id).groups));
        const compatible = candidates.filter(
            ({ value }) =>
                !item.mods.some((entry) => entry.id === value) &&
                !this.mod(value).groups.some((group) => groups.has(group)),
        );
        if (!compatible.length)
            throw new Error(
                "No compatible guaranteed modifier; conflicting modifier already present.",
            );
        const fullSide = (id: string, mods: RolledMod[]) => {
            const remaining = { ...item, mods };
            const counts = this.counts(remaining);
            const limits = this.limits(remaining);
            return this.mod(id).generation_type === "prefix"
                ? counts.prefixes >= limits.prefixes
                : counts.suffixes >= limits.suffixes;
        };
        const eligible = (mods: RolledMod[]) =>
            compatible.filter(
                ({ value }) =>
                    mods.length < this.limits({ ...item, mods }).max && !fullSide(value, mods),
            );
        const choices = compatible.map(({ value: id, weight }) => {
            const side =
                removeSide ?? (fullSide(id, item.mods) ? this.mod(id).generation_type : undefined);
            if (replace) {
                const removable = item.mods.filter(
                    (entry) =>
                        !this.protected(item, entry) &&
                        (!side || this.mod(entry.id).generation_type === side),
                );
                if (!removable.length) throw new Error("No eligible modifier to remove.");
                if (
                    removable.some(
                        (removed) =>
                            !eligible(item.mods.filter((entry) => entry !== removed)).length,
                    )
                )
                    throw new Error("No open affix for the guaranteed modifier after removal.");
            }
            return { value: { id, side }, weight };
        });
        if (!replace && !eligible(item.mods).length)
            throw new Error("No open affix for the guaranteed modifier.");
        const selected = random.pick(choices);
        if (replace) this.remove(item, random, false, { side: selected.side });
        const id = fullSide(selected.id, item.mods)
            ? random.pick(eligible(item.mods))
            : selected.id;
        item.mods.push(this.rollMod(id, random, { crafted: true }));
    }

    private scour(item: CraftingItem) {
        item.mods = item.mods.filter((entry) => this.protected(item, entry));
        const counts = this.counts(item);
        const magicLimits = this.limits({ ...item, rarity: "magic" });
        item.rarity =
            item.mods.length === 0
                ? "normal"
                : counts.prefixes <= magicLimits.prefixes &&
                    counts.suffixes <= magicLimits.suffixes &&
                    item.mods.length <= magicLimits.max
                  ? "magic"
                  : "rare";
    }

    private rollAffixCount(item: CraftingItem, random: CraftingRandom) {
        // Server count distributions are modeled separately from extracted modifier weights.
        if (this.catalog.game === "poe2") return item.rarity === "magic" ? 1 : 4;
        return random.pick(
            item.rarity === "magic"
                ? [
                      { value: 1, weight: 1 },
                      { value: 2, weight: 1 },
                  ]
                : this.limits(item).max === 4
                  ? [
                        { value: 3, weight: 2 },
                        { value: 4, weight: 1 },
                    ]
                  : [
                        { value: 4, weight: 8 },
                        { value: 5, weight: 3 },
                        { value: 6, weight: 1 },
                    ],
        );
    }

    private reroll(
        item: CraftingItem,
        random: CraftingRandom,
        options: PoolOptions = {},
        forced: string[] = [],
        keepMeta = true,
        maximumSide?: "prefix" | "suffix",
    ) {
        const guarantee = options.tag || options.influence !== undefined;
        const guaranteedOptions = {
            ...options,
            excludedTags: [
                ...(options.excludedTags ?? []),
                ...(["attack", "caster"] as const).filter(
                    (tag) => !options.ignoreMeta && this.hasStat(item, metaStats[tag]),
                ),
            ],
        };
        const kept = item.mods.filter(
            (entry) =>
                entry.fractured ||
                (keepMeta && this.protected(item, entry)) ||
                (options.side && this.mod(entry.id).generation_type !== options.side),
        );
        item.mods = kept;
        if (options.fossils?.some((id) => this.fossil(id).corruptedEssenceChance === 100)) {
            const pool = this.corruptedEssencePool(item, options);
            if (!pool.length)
                throw new Error(
                    "No eligible corrupted essence modifier for this fossil combination.",
                );
            const selected = random.pick(
                pool.map((entry) => ({ value: entry.id, weight: entry.weight })),
            );
            forced = [selected, ...forced];
        }
        for (const id of forced) {
            const mod = this.mod(id);
            if (
                item.mods.some((entry) =>
                    this.mod(entry.id).groups.some((group) => mod.groups.includes(group)),
                )
            )
                throw new Error("The guaranteed modifier conflicts with a preserved modifier.");
            item.mods.push(this.rollMod(id, random));
        }
        const limits = this.limits(item);
        if (guarantee && !this.pool(item, guaranteedOptions).length)
            throw new Error("No eligible modifier for the reforge guarantee.");
        const count = this.rollAffixCount(item, random);
        if (guarantee) this.add(item, random, guaranteedOptions);
        const lucky = options.fossils?.some((id) => this.fossil(id).lucky) ?? false;
        if (maximumSide) {
            const limit = maximumSide === "prefix" ? limits.prefixes : limits.suffixes;
            while (
                item.mods.filter((entry) => this.mod(entry.id).generation_type === maximumSide)
                    .length < limit
            )
                this.add(item, random, { ...options, side: maximumSide });
        }
        while (item.mods.length < Math.max(count, kept.length)) {
            const rest = { ...options, tag: undefined, influence: undefined };
            if (!this.pool(item, rest).length) break;
            this.add(item, random, rest, lucky);
        }
    }

    methodName(method: CraftingMethod): string {
        const omens = "omens" in method ? (method.omens ?? []) : [];
        return [
            ...(usesAllflame(method) ? ["Allflame"] : []),
            this.baseMethodName(method),
            ...omens.map(
                (id) =>
                    this.catalog.crafting.currencies.find((entry) => entry.id === id)?.name ?? id,
            ),
        ].join(" + ");
    }

    private baseMethodName(method: CraftingMethod): string {
        if (method.kind === "generate") return `Generate ${method.id} item`;
        if (method.kind === "genesis") return this.catalog.crafting.genesis?.name ?? "Genesis Tree";
        if (method.kind === "socket_jewel") return "Socket inventory Jewel";
        if (method.kind === "remove_jewel") return "Remove socketed Jewel";
        if (method.kind === "recombine") return "Recombine items";
        const data = this.catalog.crafting;
        if (method.kind === "augment") return `Socket ${augment(this.catalog, method.id).name}`;
        if (method.kind === "upgrade_augment")
            return `Upgrade socket ${method.socket + 1} · ${augment(this.catalog, method.id).name}`;
        if (method.kind === "locus") return data.locus?.name ?? method.id;
        if (method.kind === "anoint")
            return `${this.catalog.game === "poe1" ? "Anoint" : "Instil"} · ${anointingRecipes(
                method,
            )
                .map((id) => anointmentText(this.catalog, id))
                .join(" + ")}`;
        if (method.kind === "reveal")
            return this.catalog.game === "poe1" ? "Unveil modifier" : "Reveal desecrated modifier";
        if (method.kind === "currency")
            return data.currencies.find((entry) => entry.id === method.id)?.name ?? method.id;
        if (method.kind === "essence")
            return (
                [...data.essences, ...data.poe2Essences].find((entry) => entry.id === method.id)
                    ?.name ?? method.id
            );
        if (method.kind === "fossils")
            return (
                method.ids.map((id) => this.fossil(id).name).join(" + ") +
                (method.tangled ? ` (${this.fossil(method.tangled).descriptions.join("; ")})` : "")
            );
        if (method.kind === "harvest")
            return data.harvest.find((entry) => entry.id === method.id)?.name ?? method.id;
        if (method.kind === "beast") {
            const recipe = data.beasts.find((entry) => entry.id === method.id);
            return recipe ? `${recipe.category}: ${recipe.description}` : method.id;
        }
        const recipe = data.bench.find((entry) => entry.id === method.id);
        if (recipe?.enchantment)
            return this.mod(recipe.enchantment.mod).text ?? recipe.enchantment.mod;
        return recipe?.mod
            ? (this.mod(recipe.mod).text ?? recipe.mod)
            : (recipe?.name ?? method.id);
    }

    costName(id: string): string {
        if (id === "generated:genesis") return "Genesis equipment item";
        if (id.startsWith("generated:")) return `Generated ${id.slice("generated:".length)} item`;
        if (id === "service:recombine") return "Recombination service";
        if (id.startsWith("donor:")) return "Donor item";
        if (this.catalog.crafting.locus?.id === id) return this.catalog.crafting.locus.name;
        if (this.catalog.crafting.beasts.some((recipe) => recipe.id === id))
            return `Beastcraft · ${this.baseMethodName({ kind: "beast", id })}`;
        return (
            this.catalog.crafting.currencies.find((currency) => currency.id === id)?.name ??
            this.catalog.crafting.augments.find((entry) => entry.id === id)?.name ??
            id.split("/").at(-1)!
        );
    }

    costs(method: CraftingMethod, item?: CraftingItem): CraftingCost[] {
        omenEffects(this.catalog, method);
        if (method.kind === "reveal" && item?.reveal?.choices.length) return [];
        if (
            item &&
            method.kind === "bench" &&
            this.catalog.crafting.bench.find((entry) => entry.id === method.id)?.mod
        )
            return this.prepareBenchCraft(item, method.id).cost;
        const omens = "omens" in method ? (method.omens ?? []) : [];
        const costs = [...this.baseCosts(method)];
        if (
            item &&
            method.kind === "bench" &&
            this.catalog.crafting.bench.find((entry) => entry.id === method.id)?.enchantment &&
            item.enchantments?.some(
                (entry) => this.mod(entry.id).generation_type === "flask_enchantment_instilling",
            )
        )
            costs.unshift(...this.benchRemovalCost(item, true));
        if (usesAllflame(method)) {
            const sulphur = this.catalog.crafting.allflame?.sulphur;
            const quote = item ? allflameQuote(this.catalog, item, method) : undefined;
            if (!sulphur || (item && !quote))
                throw new Error("Allflame sulphur cost is unavailable for this item.");
            costs.push({ id: sulphur, name: this.costName(sulphur), amount: quote?.amount ?? 1 });
        }
        const socketRecipe =
            method.kind === "bench" &&
            this.catalog.game === "poe1" &&
            this.catalog.crafting.bench.find((entry) => entry.id === method.id);
        if (
            socketRecipe &&
            (socketRecipe.socketCount || socketRecipe.linkCount) &&
            (!item || item.corrupted)
        ) {
            const currency = this.catalog.crafting.currencies.find(
                (entry) => entry.action === "corrupt_item",
            );
            if (!currency)
                throw new Error("The socket bench surcharge currency is missing from this build.");
            costs.push({
                id: currency.id,
                name: currency.name,
                amount: costs.reduce((total, entry) => total + entry.amount, 0),
            });
        }
        return [
            ...costs,
            ...omens
                .filter(
                    (id) =>
                        !directionalDesecrationOmen.test(id) ||
                        !item?.mods.some((entry) => this.isAbyssalMark(entry.id)),
                )
                .filter(
                    (id) =>
                        !item ||
                        item.catalyst?.quality ||
                        !id.endsWith("/OmenOnExaltConsumeQuality"),
                )
                .map((id) => ({
                    id,
                    name: this.catalog.crafting.currencies.find((entry) => entry.id === id)!.name,
                    amount: 1,
                })),
        ];
    }

    benchRemovalCost(item: CraftingItem, enchantment = false) {
        const recipe = this.catalog.crafting.bench.find(
            (entry) =>
                entry.action === (enchantment ? 1 : 0) &&
                !entry.mod &&
                !entry.enchantment &&
                entry.itemClasses.includes(this.base(item).item_class),
        );
        if (!recipe) throw new Error("The build has no bench removal recipe for this item class.");
        return recipe.cost;
    }

    private prepareBenchCraft(input: CraftingItem, id: string) {
        const item = structuredClone(input);
        const recipe = this.catalog.crafting.bench.find((entry) => entry.id === id)!;
        const base = this.base(item);
        if (!recipe.itemClasses.includes(base.item_class))
            throw new Error("This bench recipe cannot be applied to this item class.");
        const rarity = item.rarity === "normal" ? "magic" : item.rarity;
        if (!base.rarities.includes(rarity)) throw new Error("This base cannot be magic.");
        const cost: CraftingCost[] = [];
        if (
            this.craftedLimit(item) === 1 &&
            item.mods.some((entry) => entry.crafted && !entry.fractured)
        ) {
            cost.push(...this.benchRemovalCost(item));
            item.mods = item.mods.filter((entry) => !entry.crafted || entry.fractured);
        }
        const mod = this.mod(recipe.mod!);
        const limits = this.limits({ ...item, rarity });
        const counts = this.counts(item);
        const side = mod.generation_type === "prefix" ? "prefixes" : "suffixes";
        const conflict =
            item.mods.filter((entry) => entry.crafted).length >= this.craftedLimit(item)
                ? "This item has no remaining crafted modifier capacity."
                : counts[side] >= limits[side] || item.mods.length >= limits.max
                  ? `This bench craft requires an open ${mod.generation_type}.`
                  : item.mods.some(
                          (entry) =>
                              entry.id === recipe.mod ||
                              this.mod(entry.id).groups.some((group) => mod.groups.includes(group)),
                      )
                    ? "The bench modifier conflicts with an existing modifier."
                    : undefined;
        if (!conflict) {
            item.rarity = rarity;
            cost.push(...recipe.cost);
        }
        return { item, cost, conflict };
    }

    private baseCosts(method: CraftingMethod): CraftingCost[] {
        if (method.kind === "generate" || method.kind === "genesis") {
            const id = `generated:${method.id}`;
            return [{ id, name: this.costName(id), amount: 1 }];
        }
        if (method.kind === "socket_jewel" || method.kind === "remove_jewel") return [];
        const data = this.catalog.crafting;
        if (method.kind === "recombine")
            return [
                { id: "service:recombine", name: "Recombination service", amount: 1 },
                ...(method.donor
                    ? [
                          {
                              id: `donor:${method.donor.id}`,
                              name: `Donor · ${method.donor.name}`,
                              amount: 1,
                          },
                      ]
                    : []),
            ];
        if (method.kind === "augment" || method.kind === "upgrade_augment")
            return [{ id: method.id, name: augment(this.catalog, method.id).name, amount: 1 }];
        if (method.kind === "anoint") {
            const counts = new Map<string, number>();
            for (const id of [
                ...anointingRecipes(method).flatMap((id) => anointment(this.catalog, id).items),
                ...(method.oils ?? []),
            ])
                counts.set(id, (counts.get(id) ?? 0) + 1);
            return [...counts].map(([id, amount]) => ({ id, amount, name: this.costName(id) }));
        }
        if (method.kind === "reveal") return [];
        if (method.kind === "beast")
            return [
                { id: method.id, name: `Beastcraft · ${this.baseMethodName(method)}`, amount: 1 },
            ];
        if (method.kind === "currency" && method.donor)
            return [
                { id: method.id, name: this.baseMethodName(method), amount: 1 },
                { id: `donor:${method.donor.id}`, name: `Donor · ${method.donor.name}`, amount: 1 },
            ];
        if (
            method.kind === "currency" &&
            data.currencies.find((entry) => entry.id === method.id)?.action === "restore_imprint"
        )
            return [];
        if (method.kind === "bench")
            return data.bench.find((entry) => entry.id === method.id)?.cost ?? [];
        if (method.kind === "fossils")
            return [
                ...method.ids.map((id) => ({ id, name: this.fossil(id).name, amount: 1 })),
                {
                    id: method.resonator,
                    name:
                        data.currencies.find((entry) => entry.id === method.resonator)?.name ??
                        method.resonator,
                    amount: 1,
                },
            ];
        if (method.kind === "harvest") {
            const harvest = data.harvest.find((entry) => entry.id === method.id);
            if (!harvest) throw new Error("Unknown Harvest recipe.");
            // LifeforceType is the client enum; names and currency IDs come from extracted bases.
            const suffix = ["", "Red", "Green", "Blue"][harvest.lifeforceType];
            const currency = data.currencies.find((entry) =>
                entry.id.endsWith(`HarvestSeed${suffix}`),
            );
            const sacred = data.currencies.find((entry) => entry.id.endsWith("HarvestSeedBoss"));
            if (!currency || (harvest.sacred && !sacred))
                throw new Error("Lifeforce currency is missing from the build.");
            return [
                { id: currency.id, name: currency.name, amount: harvest.lifeforce },
                ...(harvest.sacred && sacred
                    ? [{ id: sacred.id, name: sacred.name, amount: harvest.sacred }]
                    : []),
            ];
        }
        return [{ id: method.id, name: this.baseMethodName(method), amount: 1 }];
    }

    prepareAllflame(input: CraftingItem, inputMethod: CraftingMethod, random: CraftingRandom) {
        const method = this.validateMethod(inputMethod);
        const item = this.validateItem(input);
        if (item.unidentified) throw new Error("Identify the item before crafting.");
        const quote = allflameQuote(this.catalog, item, method);
        if (!usesAllflame(method) || !quote)
            throw new Error("Allflame is unavailable for this item and method.");
        if (
            item.allflameCopies ||
            item.corrupted ||
            item.mirrored ||
            item.destroyed ||
            item.reveal?.choices.length
        )
            throw new Error(
                "Allflame requires an intact, uncorrupted, unmirrored item without pending choices.",
            );
        const action =
            method.kind === "currency"
                ? this.catalog.crafting.currencies.find((entry) => entry.id === method.id)?.action
                : undefined;
        let merrickLimits: PoolOptions["limits"];
        if (action === "add_eldritch_implicit_amulet" && !this.ukatoaReplacements(item).length)
            throw new Error(
                "Ukatoa's Ducat requires an eligible amulet implicit and no Eldritch implicit.",
            );
        if (action === "add_mod_and_corrupt_rare_abyss_jewel") {
            if (this.base(item).item_class !== "AbyssJewel" || item.rarity !== "rare")
                throw new Error("This Ducat requires a rare Abyss Jewel.");
            const limits = this.limits(item);
            merrickLimits =
                item.mods.length >= limits.max
                    ? {
                          max: limits.max + 1,
                          prefixes: limits.prefixes + 1,
                          suffixes: limits.suffixes + 1,
                      }
                    : limits;
            if (!this.pool(item, { limits: merrickLimits }).length)
                throw new Error("No eligible Abyss Jewel modifier to add.");
        }
        if (action === "reroll_single_attribute_modifier" && !this.attributeChoices(item).length)
            throw new Error(
                "This Ducat requires a modifier with an extracted single-attribute equivalent.",
            );
        if (
            action === "split_to_single_explicit" &&
            (!item.mods.length || !this.base(item).rarities.includes("rare"))
        )
            throw new Error(
                `${this.baseMethodName(method)} requires an explicit modifier and a base that can be rare.`,
            );
        if (
            action === "reroll_rare_infamous" ||
            action === "add_deepwater_hazard_belt_mod" ||
            action === "add_pantheon_aspect"
        ) {
            if (
                item.rarity === "normal" ||
                (action !== "add_pantheon_aspect" && item.rarity !== "rare")
            )
                throw new Error(`${this.baseMethodName(method)} cannot craft this rarity.`);
            const candidate =
                action === "reroll_rare_infamous"
                    ? { ...item, mods: item.mods.filter((entry) => this.protected(item, entry)) }
                    : item;
            if (
                !this.ducatPool({ ...item, mods: [] }, action, { ignoreMeta: true }).length ||
                (!this.ducatPool(candidate, action, {
                    excludedTags: (["attack", "caster"] as const).filter((tag) =>
                        this.hasStat(item, metaStats[tag]),
                    ),
                }).length &&
                    !(
                        action === "reroll_rare_infamous" &&
                        candidate.mods.length === this.limits(item).max
                    ))
            )
                throw new Error(
                    `${this.baseMethodName(method)} has no eligible modifier on this item base, level and open affixes.`,
                );
        }
        const count = random.pick([
            { value: 1, weight: item.intangibility ?? 0 },
            { value: quote.bracket.outcomes.max, weight: 100 - (item.intangibility ?? 0) },
        ]);
        const ordinary = { ...method, allflame: undefined };
        const copies = Array.from({ length: count }, () => {
            const copy = structuredClone(item);
            delete copy.imprint;
            const { min, max } = quote.bracket.intangibility;
            // These rolls affect subsequent crafts even when the target ignores numeric mod values.
            const added = random.pick(
                Array.from({ length: max - min + 1 }, (_, index) => ({
                    value: min + index,
                    weight: 1,
                })),
            );
            copy.intangibility = Math.min(100, (copy.intangibility ?? 0) + added);
            copy.allflameCrafted = true;
            let result = copy;
            if (action === "reset_ghostliness_or_delete" && method.kind === "currency") {
                const outcome = random.pick([
                    { value: "destroy", weight: 1 },
                    { value: "reset", weight: 1 },
                ]);
                if (outcome === "destroy") {
                    result.destroyed = true;
                    result.destroyedBy = method.id;
                } else result.intangibility = 0;
            } else if (
                action === "add_mod_and_corrupt_rare_abyss_jewel" &&
                method.kind === "currency"
            ) {
                this.add(copy, random, { limits: merrickLimits });
                copy.corrupted = true;
                copy.corruptedBy = method.id;
            } else if (action === "add_eldritch_implicit_amulet") {
                this.replaceUkatoaImplicit(copy, random);
            } else if (action === "reroll_single_attribute_modifier") {
                const selected = random.pick(
                    this.attributeChoices(copy).map((value) => ({ value, weight: 1 })),
                );
                const id = random.pick(selected.ids.map((value) => ({ value, weight: 1 })));
                this.replaceAttribute(copy, selected.index, id, random);
            } else if (action === "split_to_single_explicit") {
                result.mods = [random.pick(copy.mods.map((value) => ({ value, weight: 1 })))];
                result.rarity = "rare";
                if (result.reveal && !result.mods.some((entry) => entry.id === result.reveal!.mod))
                    delete result.reveal;
            } else if (
                action === "reroll_rare_infamous" ||
                action === "add_deepwater_hazard_belt_mod" ||
                action === "add_pantheon_aspect"
            ) {
                const options = {
                    excludedTags: (["attack", "caster"] as const).filter((tag) =>
                        this.hasStat(copy, metaStats[tag]),
                    ),
                };
                const count =
                    action === "reroll_rare_infamous"
                        ? this.rollAffixCount(copy, random)
                        : copy.mods.length + 1;
                if (action === "reroll_rare_infamous")
                    copy.mods = copy.mods.filter((entry) => this.protected(result, entry));
                if (copy.mods.length < count) {
                    const selected = random.pick(
                        this.ducatPool(copy, action, options).map((entry) => ({
                            value: entry.id,
                            weight: entry.weight,
                        })),
                    );
                    copy.mods.push(this.rollMod(selected, random));
                    while (copy.mods.length < count && this.pool(copy, options).length)
                        this.add(copy, random, options);
                }
                if (copy.reveal && !copy.mods.some((entry) => entry.id === copy.reveal!.mod))
                    delete copy.reveal;
            } else result = this.apply(copy, ordinary, random).item;
            if (
                (result.corrupted && !result.corruptedBy) ||
                result.mirrored ||
                (result.destroyed && !result.destroyedBy)
            )
                throw new Error("This crafting outcome is incompatible with Allflame.");
            return craftingItemStateSchema.parse(result);
        });
        delete item.imprint;
        item.allflameCopies = copies;
        item.allflameCost = this.costs(method, input);
        return { item: this.validateItem(item), cost: item.allflameCost };
    }

    chooseAllflame(input: CraftingItem, index: number): CraftingItem {
        const item = this.validateItem(input);
        if (!Number.isInteger(index) || !item.allflameCopies?.[index])
            throw new Error("Choose an offered Allflame copy.");
        return this.validateItem(item.allflameCopies[index]);
    }

    apply(
        input: CraftingItem,
        inputMethod: CraftingMethod,
        random: CraftingRandom,
        preferences: CraftingTarget[] = [],
    ): { item: CraftingItem; cost: CraftingCost[] } {
        const method = this.validateMethod(inputMethod);
        if (input.allflameCopies) throw new Error("Choose an Allflame copy before crafting again.");
        if (usesAllflame(method)) {
            const offered = this.prepareAllflame(input, method, random);
            const copies = offered.item.allflameCopies!;
            let selected = 0;
            for (const preference of preferences) {
                const target = this.validateTarget(preference);
                const index = copies.findIndex((copy) => this.matches(copy, target));
                if (index < 0) continue;
                selected = index;
                break;
            }
            return { item: this.chooseAllflame(offered.item, selected), cost: offered.cost };
        }
        const omens = omenEffects(this.catalog, method);
        const item = this.validateItem(input);
        if (method.kind === "generate")
            return {
                item: this.generate(item, method.id, random, undefined, method.breachRings),
                cost: this.costs(method),
            };
        if (method.kind === "genesis")
            return {
                item: this.generate(item, "rare", random, method.nodes),
                cost: this.costs(method),
            };
        if (
            method.kind === "currency" &&
            this.catalog.crafting.currencies.find((entry) => entry.id === method.id)?.action ===
                "identify"
        ) {
            if (!item.unidentified) throw new Error("Choose an unidentified starting item.");
            const options = { memoryStrands: item.memoryStrands };
            if (!this.pool(item, options).length)
                throw new Error("No eligible modifiers for this base and item level.");
            delete item.unidentified;
            this.reroll(item, random, options);
            return { item: this.validateItem(item), cost: this.costs(method) };
        }
        if (item.unidentified) throw new Error("Identify the item before crafting.");
        if ("donor" in method && method.donor?.item.unidentified)
            throw new Error("Identify the donor item before crafting.");
        if (item.destroyed)
            throw new Error("Destroyed items cannot be crafted. Undo or start a new item.");
        if (strongbox(this.catalog, item) && !strongboxMethod(this.catalog, method))
            throw new Error(
                "This method is not supported for Strongboxes. Choose an ordinary crafting currency.",
            );
        if (method.kind === "socket_jewel" || method.kind === "remove_jewel") {
            if (!item.jewelSocket) throw new Error("This item has no converted Jewel socket.");
            if (method.kind === "socket_jewel") {
                if (!method.jewel) throw new Error("Choose a Jewel from inventory.");
                if (item.socketedJewel) throw new Error("Remove the socketed Jewel first.");
                item.socketedJewel = this.validateSocketedJewel(method.jewel.item);
            } else {
                if (!item.socketedJewel) throw new Error("The Jewel socket is already empty.");
                delete item.socketedJewel;
            }
            return { item: this.validateItem(item), cost: [] };
        }
        if (method.kind === "recombine") {
            if (!method.donor) throw new Error("Choose a donor item from inventory.");
            const donor = this.validateItem(method.donor.item);
            const key = JSON.stringify([item, donor]);
            let outcomes = this.recombinations.get(key);
            if (!outcomes) {
                outcomes = recombinationOutcomes(this, item, donor);
                if (
                    this.recombinations.size >= 128 ||
                    [...this.recombinations.values()].reduce(
                        (count, entries) => count + entries.length,
                        outcomes.length,
                    ) > 10_000
                )
                    this.recombinations.clear();
                this.recombinations.set(key, outcomes);
            }
            return { item: structuredClone(random.pick(outcomes)), cost: this.costs(method) };
        }
        if (method.kind === "upgrade_augment")
            return {
                item: this.validateItem(
                    upgradeSocketedAugment(this.catalog, item, method.id, method.socket),
                ),
                cost: this.costs(method),
            };
        if (method.kind === "augment") {
            const socketed = socketAugment(this.catalog, item, method.id, method.replace);
            const element = augmentConversion(this.catalog, item, method.id);
            if (element) {
                const order =
                    1 +
                    Math.max(
                        -1,
                        ...item.mods.flatMap(
                            (entry) => entry.conversion?.steps.map((step) => step.order) ?? [],
                        ),
                    );
                const socket = method.replace ?? socketed.augments.length - 1;
                socketed.mods = item.mods.map((entry) => {
                    const id = convertedModifier(this.catalog, entry.id, element);
                    if (entry.fractured || id === entry.id) return entry;
                    return {
                        ...entry,
                        id,
                        values: this.rollMod(id, random).values,
                        ...(this.isDesecrated(entry) ? { desecrated: true as const } : {}),
                        conversion: {
                            source: entry.conversion?.source ?? entry.id,
                            steps: [...(entry.conversion?.steps ?? []), { socket, order }],
                        },
                    };
                });
            }
            return {
                item: this.validateItem(socketed),
                cost: this.costs(method),
            };
        }
        if (item.sanctified)
            throw new Error("Sanctified items cannot use the supported crafting methods.");
        if (method.kind === "reveal") {
            const prepared = this.prepareReveal(item, method, random);
            let revealed = prepared.item;
            let choices = this.selectableRevealChoices(revealed);
            if (
                revealed.reveal!.echoes?.remaining &&
                (method.preferred.length || method.skipOnMiss) &&
                !method.preferred.some((id) => choices.includes(id))
            ) {
                revealed = this.rerollReveal(revealed, random);
                choices = this.selectableRevealChoices(revealed);
            }
            const selected = method.preferred.find((id) => choices.includes(id));
            if (!selected && method.skipOnMiss) return { item: revealed, cost: prepared.cost };
            if (!choices.length)
                throw new Error("No retained reveal choices fit the current item.");
            return {
                item: this.chooseRevealed(revealed, selected ?? choices[0]!, random),
                cost: prepared.cost,
            };
        }
        if (
            method.kind === "currency" &&
            this.catalog.crafting.currencies.find((entry) => entry.id === method.id)?.action ===
                "incursion_corrupt_equipment"
        ) {
            if (!supportsTempleCorruption(this.catalog, item, "incursion_corrupt_equipment"))
                throw new Error("Architect's Orbs require eligible PoE 2 equipment or jewels.");
            if (!item.corrupted || item.mirrored)
                throw new Error("Architect's Orbs require a corrupted, unmirrored item.");
            if (item.twiceCorrupted)
                throw new Error(
                    cleanModText(this.catalog.crafting.templeCorruption!.alreadyTwiceCorruptedText),
                );
            if (!this.corruptedModifiers(item).length)
                throw new Error("No eligible corrupted implicit for this base and item level.");
            const outcome = random.pick([
                { value: "implicit", weight: 1 },
                { value: "destroy", weight: 1 },
            ]);
            if (outcome === "destroy") item.destroyed = true;
            else this.replaceCorruptedImplicit(item, random, undefined, true);
            item.twiceCorrupted = true;
            return { item: this.validateItem(item), cost: this.costs(method) };
        }
        if (method.kind === "anoint") {
            validateAnointments(this.catalog, { ...item, anointments: anointingRecipes(method) });
            if (this.catalog.game === "poe2" && (item.corrupted || item.mirrored))
                throw new Error("Instilling requires an uncorrupted, unmirrored item.");
            const oils = anointingOils(this.catalog, item);
            if (
                oils.length !== (method.oils?.length ?? 0) ||
                oils.some((id) => !method.oils?.includes(id))
            )
                throw new Error(
                    "Select the matching Tainted or Reflective Oil for this item's corruption and mirroring.",
                );
            item.anointments = anointingRecipes(method);
            if (item.enchantments?.length) item.enchantments = [];
            return { item: this.validateItem(item), cost: this.costs(method) };
        }
        const qualityRecipe =
            method.kind === "currency"
                ? this.catalog.crafting.baseQuality.find((entry) => entry.id === method.id)
                : undefined;
        if (qualityRecipe) {
            if (
                !availableBaseQuality(this.catalog, item).some(
                    (entry) => entry.id === qualityRecipe.id,
                )
            )
                throw new Error("This quality currency is not available on this item base.");
            if (item.mirrored || item.corrupted !== qualityRecipe.corrupted)
                throw new Error(
                    qualityRecipe.corrupted
                        ? "Tainted quality currency requires a corrupted, unmirrored item."
                        : "This quality currency requires an uncorrupted, unmirrored item.",
                );
            if (item.catalyst)
                throw new Error("Items with both base and catalyst quality are not supported yet.");
            const maximum = baseQualityLimit(this.catalog, item);
            if (!qualityRecipe.corrupted && item.quality >= maximum)
                throw new Error("This item already has the maximum quality for this currency.");
            const amount = random.pick(baseQualityOutcomes(this.catalog, item, qualityRecipe.id));
            item.quality = qualityRecipe.corrupted
                ? amount
                : Math.min(maximum, item.quality + amount);
            return { item: this.validateItem(item), cost: this.costs(method) };
        }
        const taintedCatalyst =
            method.kind === "currency"
                ? this.catalog.crafting.taintedCatalysts.find((entry) => entry.id === method.id)
                : undefined;
        if (taintedCatalyst) {
            if (!item.corrupted || item.mirrored)
                throw new Error("Tainted Catalyst requires a corrupted, unmirrored item.");
            const outcomes = taintedCatalystOutcomes(this.catalog, item, taintedCatalyst.id);
            if (!outcomes.length)
                throw new Error("Tainted Catalyst is unavailable for this item class.");
            item.catalyst = random.pick(outcomes);
            item.quality = 0;
            return { item: this.validateItem(item), cost: this.costs(method) };
        }
        const socketRecipe =
            method.kind === "bench"
                ? this.catalog.crafting.bench.find((entry) => entry.id === method.id)
                : undefined;
        if (socketRecipe?.socketCount || socketRecipe?.linkCount) {
            if (item.mirrored)
                throw new Error("Socket bench crafting requires an unmirrored item.");
            if (!socketBenchEligible(this.catalog, item, socketRecipe))
                throw new Error(
                    "This socket recipe exceeds the base limit or is unavailable for this item class.",
                );
            if (socketRecipe.socketCount) {
                if (item.sockets === socketRecipe.socketCount)
                    throw new Error("This item already has the requested number of sockets.");
                setSocketCount(item, socketRecipe.socketCount);
            } else {
                if (
                    socketRecipe.linkCount === item.sockets &&
                    linkedSocketRange(item).min === item.sockets
                )
                    throw new Error("All sockets are already linked.");
                setLinkedSockets(item, socketRecipe.linkCount!);
            }
            return { item: this.validateItem(item), cost: this.costs(method, input) };
        }
        const taintedAction =
            method.kind === "currency"
                ? this.catalog.crafting.currencies.find((entry) => entry.id === method.id)?.action
                : undefined;
        if (taintedAction === "reroll_socket_numbers_hellscape" && this.catalog.game === "poe1") {
            if (!item.corrupted || item.mirrored)
                throw new Error("Tainted Jeweller's Orbs require a corrupted, unmirrored item.");
            const maximum = socketLimit(this.catalog, item, item.level);
            const current = item.sockets ?? 0;
            if (!maximum || !current || hasAbyssSockets(this.catalog, item))
                throw new Error("Tainted Jeweller's Orbs require ordinary gem sockets.");
            if (current >= maximum)
                throw new Error("This item already has the maximum sockets for its item level.");
            setSocketCount(
                item,
                random.pick([
                    { value: current + 1, weight: 1 },
                    { value: Math.max(1, current - 1), weight: 1 },
                ]),
            );
            return { item: this.validateItem(item), cost: this.costs(method, input) };
        }
        const taintedRare =
            taintedAction === "reroll_rare_hellscape" ||
            taintedAction === "add_mod_to_rare_hellscape" ||
            taintedAction === "upgrade_mod_tier_hellscape";
        if (taintedRare) {
            if (item.rarity !== "rare" || !item.corrupted || item.mirrored)
                throw new Error(
                    "Tainted rare-item currency requires a corrupted, unmirrored rare item.",
                );
        }
        if ((item.corrupted && !taintedRare) || item.mirrored)
            throw new Error("This craft requires an uncorrupted, unmirrored item.");
        const mapQuality =
            method.kind === "currency"
                ? this.catalog.crafting.mapQuality.find((entry) => entry.id === method.id)
                : undefined;
        if (mapQuality) {
            if (
                !availableMapQuality(this.catalog, item).some((entry) => entry.id === mapQuality.id)
            )
                throw new Error("This chisel is unavailable for this item class.");
            const current = mapQualityRecipe(this.catalog, item);
            if (current?.id === mapQuality.id && item.quality >= mapQuality.maximumQuality)
                throw new Error("This map already has maximum quality for this chisel.");
            item.quality = Math.min(
                mapQuality.maximumQuality,
                (current?.id === mapQuality.id ? item.quality : 0) + mapQualityIncrement(item),
            );
            item.mapQuality = mapQuality.stats.includes("map_item_drop_quantity_+%")
                ? undefined
                : mapQuality.id;
            return { item: this.validateItem(item), cost: this.costs(method) };
        }
        if (method.kind === "locus") {
            this.corruptLocus(item, random);
            return { item: this.validateItem(item), cost: this.costs(method) };
        }
        if (
            method.kind === "currency" &&
            this.catalog.crafting.qualityInfusers.some((entry) => entry.id === method.id)
        ) {
            const state = qualityInfuserState(this.catalog, item, method.id);
            if (!state) throw new Error("This quality Infuser is not available on this item base.");
            if (state.quality < state.maximum)
                throw new Error(
                    `This Infuser requires at least ${state.maximum}% quality on this item.`,
                );
            if (state.quality >= state.limit)
                throw new Error(
                    `This item already has the Infuser's maximum quality of ${state.limit}%.`,
                );
            const quality = Math.min(state.limit, state.quality + random.pick(state.increments));
            if (state.recipe.qualityType === "catalyst") item.catalyst!.quality = quality;
            else item.quality = quality;
            item.corrupted = random.pick([
                { value: false, weight: 100 - state.corruptionChance },
                { value: true, weight: state.corruptionChance },
            ]);
            return { item: this.validateItem(item), cost: this.costs(method) };
        }
        const consumption = memoryConsumption(this.catalog, item, method);
        const strands = consumption ? (item.memoryStrands ?? 0) : 0;
        const base = this.base(item);
        const requireRarity = (...rarities: CraftingItem["rarity"][]) => {
            if (!rarities.includes(item.rarity))
                throw new Error(`This craft requires a ${rarities.join(" or ")} item.`);
        };
        const rare = () => {
            if (!base.rarities.includes("rare")) throw new Error("This base cannot be rare.");
            item.rarity = "rare";
        };
        if (method.kind === "currency") {
            const currency = this.catalog.crafting.currencies.find(
                (entry) => entry.id === method.id,
            );
            if (!currency || !this.currencySupported(currency.action))
                throw new Error("This currency action is not supported.");
            const currencyPool: PoolOptions = {
                memoryStrands: strands,
                foulborn: currency.action.startsWith("mutated_"),
                side: omens.addSide,
                catalysing: omens.catalysing,
                excludedTags: omens.excludedWaystoneTags,
                anyTags: omens.existingTags
                    ? [...new Set(item.mods.flatMap((entry) => this.mod(entry.id).implicit_tags))]
                    : undefined,
                minimumLevel: this.catalog.crafting.tieredCurrency.find(
                    (entry) => entry.id === method.id,
                )?.minimumModLevel,
            };
            if (currency.action === "use_liquid_emotion") {
                requireRarity("rare");
                const rule = this.emotionRule(item, method.id);
                if (!rule)
                    throw new Error("This Liquid Emotion has no outcome for this jewel base.");
                if (item.mods.filter((entry) => entry.crafted).length >= this.craftedLimit(item))
                    throw new Error(
                        "Remove the existing crafted modifier before using a Liquid Emotion.",
                    );
                this.addCraftedModifier(
                    item,
                    rule.mods.map((value) => ({ value, weight: 1 })),
                    random,
                    true,
                );
            }
            if (currency.action.startsWith("abyssal_bench_ticket_")) {
                requireRarity("rare");
                if (omens.putrefy) {
                    this.putrefy(item, method.id, random);
                } else {
                    if (
                        item.mods.some(
                            (entry) =>
                                this.mod(entry.id).domain === "veiled" || this.isDesecrated(entry),
                        )
                    )
                        throw new Error("Remove the existing desecrated modifier first.");
                    this.addVeiled(item, method.id, random, {
                        side: omens.addSide,
                        omens: method.omens,
                    });
                }
            }
            const implicit = /^add_(cleansing_fire|great_tangle)_implicit_([1-4])$/.exec(
                currency.action,
            );
            if (implicit) {
                if (
                    this.effectiveInfluences(item).length ||
                    this.hasImplicitStat(item, "local_implicit_mod_cannot_be_changed") ||
                    !["Body Armour", "Helmet", "Gloves", "Boots"].includes(base.item_class) ||
                    item.implicits.some((entry) =>
                        this.mod(entry.id).generation_type.startsWith("synthesis"),
                    )
                )
                    throw new Error(
                        "Eldritch implicits require eligible, non-influenced, non-synthesised armour.",
                    );
                const generation =
                    implicit[1] === "cleansing_fire"
                        ? "searing_exarch_implicit"
                        : "eater_of_worlds_implicit";
                const opposite =
                    implicit[1] === "cleansing_fire"
                        ? "eater_of_worlds_implicit"
                        : "searing_exarch_implicit";
                const chosen = random.pick(
                    this.implicitPool(item, generation, Number(implicit[2])).map((entry) => ({
                        value: entry.id,
                        weight: entry.weight,
                    })),
                );
                item.implicits = [
                    ...item.implicits.filter(
                        (entry) => this.mod(entry.id).generation_type === opposite,
                    ),
                    this.rollMod(chosen, random),
                ];
            }
            switch (currency.action) {
                case "reroll_variable_defences":
                    if (!supportsSacredOrb(this.catalog, item))
                        throw new Error("Sacred Orbs require armour with extracted base defences.");
                    item.baseDefences = Object.fromEntries(
                        baseDefenceEntries(this.catalog, item).map(({ key, range }) => [
                            key,
                            random.integer(range.min, range.max),
                        ]),
                    );
                    break;
                case "add_flask_injector":
                case "add_flask_seal": {
                    const pool = flaskEnchantmentPool(this.catalog, item, method.id);
                    if (!pool.length)
                        throw new Error(
                            "This currency requires a utility flask with eligible enchantments.",
                        );
                    const id = random.pick(
                        pool.map((entry) => ({ value: entry.id, weight: entry.weight })),
                    );
                    item.enchantments = [this.rollMod(id, random)];
                    break;
                }
                case "add_equipment_socket": {
                    const maximum = socketLimit(this.catalog, item);
                    if (!maximum) throw new Error("This item base cannot have augment sockets.");
                    if ((item.sockets ?? 0) >= maximum)
                        throw new Error("This item already has the maximum number of sockets.");
                    item.sockets = (item.sockets ?? 0) + 1;
                    break;
                }
                case "incursion_corrupt_tablet":
                    this.corruptTablet(item, random);
                    break;
                case "corrupt_item":
                    this.corrupt(
                        item,
                        random,
                        Boolean(omens.corruption) ||
                            (socketedStats(this.catalog, item).get(
                                "soul_core_cannot_roll_no_outcome_with_corruption",
                            ) ?? 0) > 0,
                    );
                    break;
                case "conflict_orb":
                    this.conflict(item, random);
                    break;
                case "apply_zana_influence":
                    requireRarity("normal");
                    if (!supportsMemoryStrands(this.catalog, item))
                        throw new Error("Remembrance requires normal equipment.");
                    item.memoryStrands = random.pick(remembranceOutcomes);
                    break;
                case "enchant_map_zana_influence_drops":
                    if (!item.memoryMap || !supportsMemoryMap(this.catalog, item))
                        throw new Error("Orb of Intention requires a Memory Influenced Map.");
                    if (item.memoryMap.intentions >= this.catalog.crafting.memoryMaps!.maximumUses)
                        throw new Error("This map has reached its Orb of Intention limit.");
                    item.memoryMap.intentions++;
                    break;
                case "consume_zana_influence_upgrade_mods": {
                    if (!item.memoryStrands || !supportsMemoryStrands(this.catalog, item))
                        throw new Error("Unravelling requires equipment with memory strands.");
                    if (
                        item.mods.some(
                            (entry) =>
                                !entry.fractured &&
                                (entry.crafted ||
                                    this.mod(entry.id).domain !== base.domain ||
                                    this.mod(entry.id).is_essence_only),
                        )
                    )
                        throw new Error(
                            "Unravelling special or crafted modifier tiers is not modeled yet.",
                        );
                    const pool = this.pool(
                        { ...item, rarity: "rare", mods: [] },
                        { ignoreMeta: true },
                    );
                    item.mods = item.mods.map((entry) => {
                        if (entry.fractured) return entry;
                        const current = pool.find((candidate) => candidate.id === entry.id);
                        if (!current) return entry;
                        const selected = random.pick(
                            unravellingOutcomes(current, pool, item.memoryStrands!),
                        );
                        return selected === entry.id ? entry : this.rollMod(selected, random);
                    });
                    delete item.memoryStrands;
                    break;
                }
                case "add_jewellery_quality":
                case "add_alternate_quality": {
                    if (
                        !availableCatalysts(this.catalog, item).some(
                            (entry) => entry.id === method.id,
                        )
                    )
                        throw new Error(
                            "This catalyst is not available on this item class in the extracted build.",
                        );
                    const maximum = catalystLimit(this.catalog, item);
                    const quality = item.catalyst?.id === method.id ? item.catalyst.quality : 0;
                    if (quality >= maximum)
                        throw new Error(
                            "This item already has the maximum quality for this catalyst.",
                        );
                    item.catalyst = {
                        id: method.id,
                        quality: Math.min(
                            maximum,
                            quality + random.pick(catalystQualityOutcomes(this.catalog, item)),
                        ),
                    };
                    item.quality = 0;
                    break;
                }
                case "transfer_item_influence": {
                    if (!method.donor) throw new Error("Choose a donor item from inventory.");
                    const donor = this.validateItem(method.donor.item);
                    if (this.base(donor).item_class !== base.item_class)
                        throw new Error("The donor and target must have the same item class.");
                    if (
                        [item, donor].some(
                            (entry) =>
                                entry.influences.length !== 1 ||
                                entry.corrupted ||
                                entry.mirrored ||
                                entry.mods.some((mod) => mod.fractured),
                        )
                    )
                        throw new Error(
                            "Awakening requires two uncorrupted, unmirrored items with one influence each and no fractures.",
                        );
                    if (item.influences[0] === donor.influences[0])
                        throw new Error("The donor and target must have different influences.");
                    const influenced = [donor, item].map((entry) =>
                        entry.mods
                            .filter(
                                (mod) =>
                                    this.catalog.crafting.modRules[mod.id]?.influence ===
                                    entry.influences[0],
                            )
                            .map((mod) => {
                                const level = Math.max(entry.level, mod.origin?.level ?? 0);
                                return level > item.level
                                    ? { ...mod, origin: { kind: "awakener" as const, level } }
                                    : mod;
                            }),
                    );
                    rare();
                    item.influences = [...item.influences, donor.influences[0]!];
                    delete item.reveal;
                    for (const mods of influenced) {
                        for (const mod of mods) {
                            try {
                                this.validateItem({ ...item, mods: [mod] });
                            } catch {
                                throw new Error(
                                    "A transferred modifier is unavailable on the target base. This transfer is not supported.",
                                );
                            }
                        }
                    }
                    let forced = influenced.flatMap((mods) =>
                        mods.length
                            ? [random.pick(mods.map((mod) => ({ value: mod, weight: 1 })))]
                            : [],
                    );
                    if (
                        forced.length === 2 &&
                        this.mod(forced[0]!.id).groups.some((group) =>
                            this.mod(forced[1]!.id).groups.includes(group),
                        )
                    )
                        forced = [random.pick(forced.map((id) => ({ value: id, weight: 1 })))];
                    this.reroll(
                        item,
                        random,
                        { ...currencyPool, ignoreMeta: true },
                        forced.map((mod) => mod.id),
                        false,
                    );
                    item.mods = item.mods.map((mod) => {
                        const origin = forced.find((entry) => entry.id === mod.id)?.origin;
                        return origin ? { ...mod, origin } : mod;
                    });
                    break;
                }
                case "inital_imprint":
                    if (item.mods.some((entry) => entry.fractured))
                        throw new Error("Fractured items cannot be imprinted.");
                    item.imprint = craftingItemStateSchema.parse(item);
                    break;
                case "restore_imprint": {
                    if (!item.imprint) throw new Error("This item has no stored imprint.");
                    if (item.mods.some((entry) => entry.fractured))
                        throw new Error("An imprint cannot restore a fractured item.");
                    return { item: this.validateItem(item.imprint), cost: [] };
                }
                case "replace_rare_mod_veiled":
                case "reroll_rare_veiled": {
                    requireRarity("rare");
                    if (!this.catalog.crafting.classes[base.item_class]?.veiled)
                        throw new Error("This item class cannot have veiled modifiers.");
                    if (
                        item.mods.some((entry) =>
                            ["veiled", "unveiled"].includes(this.mod(entry.id).domain),
                        )
                    )
                        throw new Error("Remove the existing veiled or unveiled modifier first.");
                    if (currency.action === "replace_rare_mod_veiled") {
                        this.remove(item, random);
                        this.addVeiled(item, method.id, random);
                    } else {
                        item.mods = item.mods.filter((entry) => this.protected(item, entry));
                        this.addVeiled(item, method.id, random);
                        item.mods = item.mods.filter((entry) => entry.id !== item.reveal!.mod);
                        this.reroll(item, random, currencyPool, [item.reveal!.mod]);
                    }
                    break;
                }
                case "add_influence_mod_to_rare": {
                    requireRarity("rare");
                    if (
                        item.level < 68 ||
                        this.effectiveInfluences(item).length ||
                        item.mods.some((entry) => entry.fractured) ||
                        item.implicits.some(
                            (entry) =>
                                eldritchTier(this.mod(entry.id)) ||
                                this.mod(entry.id).generation_type.startsWith("synthesis"),
                        )
                    )
                        throw new Error(
                            "Influenced exalted orbs require item level 68+, no influence, fracture or special implicits.",
                        );
                    const influence = [
                        "Shaper",
                        "Elder",
                        "Crusader",
                        "Redeemer",
                        "Hunter",
                        "Warlord",
                    ].findIndex((name) => method.id.endsWith(name));
                    if (influence < 0) throw new Error("Unknown influence currency.");
                    item.influences = [influence];
                    this.add(item, random, { ...currencyPool, influence });
                    break;
                }
                case "upgrade_influence_mod": {
                    requireRarity("rare");
                    if (!["Body Armour", "Helmet", "Gloves", "Boots"].includes(base.item_class))
                        throw new Error("This item class cannot use an Orb of Dominance.");
                    const upgrades = this.catalog.crafting.influenceUpgrades;
                    const eligible = item.mods.filter(
                        (entry) =>
                            !this.protected(item, entry) &&
                            upgrades.some(
                                (rule) => rule.mod === entry.id || rule.upgraded === entry.id,
                            ),
                    );
                    if (eligible.length < 2)
                        throw new Error(
                            "At least two removable influenced modifiers are required.",
                        );
                    const removed = random.pick(
                        eligible.map((entry) => ({ value: entry, weight: 1 })),
                    );
                    const upgraded = random.pick(
                        eligible
                            .filter((entry) => entry !== removed)
                            .map((entry) => ({ value: entry, weight: 1 })),
                    );
                    const next =
                        upgrades.find((entry) => entry.mod === upgraded.id)?.upgraded ??
                        upgraded.id;
                    item.mods = item.mods
                        .filter((entry) => entry !== removed)
                        .map((entry) => (entry === upgraded ? this.rollMod(next, random) : entry));
                    break;
                }
                case "add_mod_to_rare_eldritch":
                    requireRarity("rare");
                    this.add(item, random, { ...currencyPool, side: this.eldritchSide(item) });
                    break;
                case "remove_random_mod_eldritch":
                    requireRarity("rare");
                    this.remove(item, random, true, { side: this.eldritchSide(item) });
                    break;
                case "reroll_rare_eldritch":
                    requireRarity("rare");
                    this.reroll(item, random, { ...currencyPool, side: this.eldritchSide(item) });
                    break;
                case "transmute_to_magic":
                    requireRarity("normal");
                    item.rarity = "magic";
                    this.reroll(item, random, currencyPool);
                    break;
                case "reroll_magic":
                    requireRarity("magic");
                    this.reroll(item, random, currencyPool);
                    break;
                case "add_mod_to_magic":
                case "mutated_add_mod_to_magic":
                    requireRarity("magic");
                    this.add(item, random, currencyPool);
                    break;
                case "transmute_to_rare":
                    requireRarity(
                        ...(this.catalog.game === "poe2"
                            ? (["normal", "magic"] as const)
                            : (["normal"] as const)),
                    );
                    rare();
                    this.reroll(item, random, currencyPool, [], true, omens.maximumSide);
                    break;
                case "upgrade_magic_to_rare":
                case "mutated_upgrade_magic_to_rare":
                    requireRarity("magic");
                    rare();
                    this.add(item, random, currencyPool);
                    break;
                case "reroll":
                    requireRarity("rare");
                    if (omens.excludedWaystoneTags) {
                        if (base.item_class !== "Map")
                            throw new Error("Waystone reroll omens require a Waystone.");
                        const count = item.mods.length;
                        item.mods = item.mods.filter((entry) => entry.fractured);
                        if (item.mods.length === count)
                            throw new Error("The Waystone has no modifiers to replace.");
                        delete item.reveal;
                        if (!this.pool(item, currencyPool).length)
                            throw new Error(
                                "No eligible Waystone modifiers remain after these exclusions.",
                            );
                        while (item.mods.length < count) {
                            if (!this.pool(item, currencyPool).length) break;
                            this.add(item, random, currencyPool);
                        }
                    } else if (this.catalog.game === "poe2") {
                        this.remove(item, random, false, {
                            side: omens.removeSide,
                            lowestLevel: omens.lowestLevel,
                        });
                        this.add(item, random, currencyPool);
                    } else this.reroll(item, random, currencyPool);
                    break;
                case "upgrade_mod_tier_hellscape": {
                    const pool = this.pool(
                        { ...item, mods: [] },
                        {
                            ignoreMeta: true,
                            extraTags: item.mods.flatMap((entry) => this.mod(entry.id).adds_tags),
                        },
                    );
                    item.mods = item.mods.map((entry) => {
                        if (entry.crafted || this.protected(item, entry)) return entry;
                        const current = pool.find((candidate) => candidate.id === entry.id);
                        if (!current) return entry;
                        const family = pool.filter(
                            (candidate) =>
                                modifierFamily(candidate.mod) === modifierFamily(current.mod),
                        );
                        const levels = [
                            ...new Set(family.map((value) => value.mod.required_level)),
                        ].sort((a, b) => a - b);
                        const index = levels.indexOf(current.mod.required_level);
                        const direction = random.pick([
                            { value: 1, weight: 1 },
                            { value: -1, weight: 1 },
                        ]);
                        const level = levels[index + direction];
                        if (level === undefined) return entry;
                        const next = random.pick(
                            family
                                .filter((value) => value.mod.required_level === level)
                                .map((value) => ({ value: value.id, weight: value.weight })),
                        );
                        return this.rollMod(next, random);
                    });
                    break;
                }
                case "reroll_rare_hellscape": {
                    const outcome = random.pick([
                        { value: "reroll", weight: 1 },
                        { value: "scour", weight: 1 },
                    ]);
                    if (outcome === "reroll") this.reroll(item, random, currencyPool);
                    else this.scour(item);
                    break;
                }
                case "add_mod_to_rare_hellscape": {
                    const full = item.mods.length >= this.limits(item).max;
                    const empty = item.mods.length === 0;
                    if (!full && !this.pool(item, currencyPool).length)
                        throw new Error(
                            "No eligible modifier for the Tainted Exalted Orb's add outcome.",
                        );
                    if (!empty && !item.mods.some((entry) => !this.protected(item, entry, true)))
                        throw new Error(
                            "No unprotected modifier for the Tainted Exalted Orb's remove outcome.",
                        );
                    const outcome = empty
                        ? "add"
                        : full
                          ? "remove"
                          : random.pick([
                                { value: "add", weight: 1 },
                                { value: "remove", weight: 1 },
                            ]);
                    if (outcome === "add") this.add(item, random, currencyPool);
                    else this.remove(item, random, true);
                    break;
                }
                case "add_mod_to_rare":
                case "mutated_add_mod_to_rare":
                    requireRarity("rare");
                    for (let i = 0; i < (omens.addCount ?? 1); i++) {
                        if (i > 0 && !this.pool(item, currencyPool).length) break;
                        this.add(item, random, currencyPool);
                    }
                    if (omens.catalysing && item.catalyst?.quality) delete item.catalyst;
                    break;
                case "remove_random_mod":
                    requireRarity("magic", "rare");
                    this.remove(item, random, true, {
                        side: omens.removeSide,
                        desecrated: omens.removeDesecrated,
                        count: omens.removeCount,
                    });
                    break;
                case "convert_to_normal": {
                    this.scour(item);
                    break;
                }
                case "reroll_mod_values":
                    requireRarity("magic", "rare");
                    if (omens.sanctify) {
                        requireRarity("rare");
                        if (item.reveal)
                            throw new Error(
                                "Reveal the desecrated modifier before Sanctification.",
                            );
                    }
                    if (omens.implicitsOnly) {
                        if (!item.implicits.length)
                            throw new Error("The item has no implicit modifiers.");
                        if (this.hasImplicitStat(item, "local_implicit_mod_cannot_be_changed"))
                            throw new Error("This item's implicit modifiers cannot be changed.");
                        item.implicits = item.implicits.map((entry) =>
                            this.rollMod(entry.id, random, entry),
                        );
                    } else {
                        item.mods = item.mods.map((entry) => {
                            if (this.protected(item, entry)) return entry;
                            const rolled = this.rollMod(entry.id, random, entry);
                            if (omens.sanctify) {
                                const range = this.catalog.crafting.sanctification!;
                                rolled.sanctification = random.integer(range.min, range.max);
                            }
                            return rolled;
                        });
                        if (omens.sanctify) item.sanctified = true;
                    }
                    break;
                case "reroll_implicit_mod":
                    if (!item.implicits.length)
                        throw new Error("The item has no implicit modifiers.");
                    if (this.hasImplicitStat(item, "local_implicit_mod_cannot_be_changed"))
                        throw new Error("This item's implicit modifiers cannot be changed.");
                    item.implicits = item.implicits.map((entry) =>
                        this.rollMod(entry.id, random, entry),
                    );
                    break;
                case "fracture_random_mod": {
                    requireRarity("rare");
                    if (
                        item.mods.length < 4 ||
                        this.effectiveInfluences(item).length ||
                        item.mods.some((entry) => entry.fractured) ||
                        !this.catalog.crafting.classes[base.item_class]?.fracture
                    )
                        throw new Error(
                            "Fracturing requires an eligible rare item with at least four modifiers and no influence or fracture.",
                        );
                    const selected = random.pick(
                        item.mods
                            .filter(
                                (entry) =>
                                    this.mod(entry.id).domain !== "veiled" &&
                                    !this.isDesecrated(entry),
                            )
                            .map((entry) => ({ value: entry, weight: 1 })),
                    );
                    selected.fractured = true;
                    break;
                }
            }
        } else if (method.kind === "beast") {
            const operation = this.beastOperation(method.id);
            if (operation === "maximum-sockets") {
                const maximum = socketLimit(this.catalog, item);
                if (!maximum || hasAbyssSockets(this.catalog, item))
                    throw new Error("This beastcraft requires ordinary gem sockets.");
                if (item.sockets === maximum)
                    throw new Error("This item already has the maximum number of sockets.");
                setSocketCount(item, maximum);
            } else if (operation === "maximum-links") {
                if ((item.sockets ?? 0) < 2 || hasAbyssSockets(this.catalog, item))
                    throw new Error("This beastcraft requires at least two ordinary gem sockets.");
                if (linkedSocketRange(item).min === item.sockets)
                    throw new Error("All sockets are already linked.");
                setLinkedSockets(item, item.sockets!);
            } else if (operation === "talisman") {
                requireRarity("rare");
                if (!base.tags.includes("talisman"))
                    throw new Error("This beastcraft requires a rare Talisman.");
                const recipe = this.catalog.crafting.beasts.find(
                    (entry) => entry.id === method.id,
                )!;
                if (item.mods.some((entry) => entry.fractured))
                    throw new Error("This Talisman beastcraft cannot be used on a fractured item.");
                if (recipe.talismanCraft === "imprint") {
                    item.imprint = craftingItemStateSchema.parse(item);
                } else if (recipe.talismanCraft) {
                    if (
                        this.effectiveInfluences(item).length ||
                        item.mods.length < recipe.talismanCraft.minimumMods
                    )
                        throw new Error(
                            `This fracture recipe requires at least ${recipe.talismanCraft.minimumMods} modifiers and no influence.`,
                        );
                    const candidates = item.mods.filter(
                        (entry) => this.mod(entry.id).domain !== "veiled",
                    );
                    if (candidates.length < recipe.talismanCraft.fractures)
                        throw new Error(
                            "This Talisman has too few eligible modifiers to fracture.",
                        );
                    for (let count = 0; count < recipe.talismanCraft.fractures; count++) {
                        const selected = random.pick(
                            candidates
                                .filter((entry) => !entry.fractured)
                                .map((entry) => ({ value: entry, weight: 1 })),
                        );
                        selected.fractured = true;
                    }
                }
            } else if (operation === "metamod") {
                if (
                    item.mods.some(
                        (entry) =>
                            entry.crafted &&
                            !this.mod(entry.id).stats.some(
                                (stat) => stat.id === metaStats.multiple,
                            ),
                    )
                )
                    throw new Error(
                        "Remove existing crafted modifiers other than multimod before this beastcraft.",
                    );
                const pool = this.beastMetamodPool(item, method.id);
                if (!pool.length)
                    throw new Error(
                        "No eligible metamod; check this item's class and open affix slots.",
                    );
                if (item.rarity === "normal") {
                    if (!base.rarities.includes("magic"))
                        throw new Error("This base cannot be magic.");
                    item.rarity = "magic";
                }
                const id = random.pick(
                    pool.map((entry) => ({ value: entry.id, weight: entry.weight })),
                );
                item.mods.push(this.rollMod(id, random));
            } else if (operation === "augment") {
                requireRarity("rare");
                if (!this.beastAugmentationEligible(item, method.id))
                    throw new Error("This beastcraft requires its stated influence or item class.");
                if (!this.pool(item).length)
                    throw new Error(
                        "No eligible modifiers for this beastcraft; check open affix slots.",
                    );
                this.add(item, random);
            } else if (operation === "map-implicit" || operation === "map-twice") {
                if (!this.map(item)) throw new Error("This corruption beastcraft requires a map.");
                if (operation === "map-implicit") this.replaceCorruptedImplicit(item, random);
                else this.corruptMap(item, random, this.corruptMap(item, random));
            } else if (operation === "aspect") {
                if (!this.catalog.crafting.classes[base.item_class]?.aspects)
                    throw new Error("This item class cannot receive an Aspect skill.");
                const id = this.catalog.crafting.beasts.find((entry) => entry.id === method.id)!
                    .aspectMod!;
                if (item.rarity === "normal") item.rarity = "magic";
                const limits = this.limits(item);
                if (this.counts(item).suffixes >= limits.suffixes || item.mods.length >= limits.max)
                    throw new Error("An Aspect skill requires an open suffix.");
                if (
                    item.mods.some((entry) =>
                        this.mod(entry.id).groups.some((group) =>
                            this.mod(id).groups.includes(group),
                        ),
                    )
                )
                    throw new Error("An existing modifier conflicts with this Aspect skill.");
                item.mods.push(this.rollMod(id, random));
            } else if (operation === "imprint") {
                requireRarity("magic");
                if (item.mods.some((entry) => entry.fractured))
                    throw new Error("Fractured items cannot be imprinted.");
                item.imprint = craftingItemStateSchema.parse(item);
            } else {
                const level = method.level!;
                const origin = { kind: "beast" as const, level, recipe: method.id };
                if (operation === "flask") {
                    requireRarity("normal", "magic");
                    if (base.domain !== "flask")
                        throw new Error("This beastcraft requires a flask.");
                    item.rarity = "magic";
                    const id = this.catalog.crafting.beasts.find((entry) => entry.id === method.id)!
                        .mod!;
                    if (!this.pool(item, { level }).some((entry) => entry.id === id))
                        throw new Error(
                            "This flask cannot receive the recipe modifier; check its type and open suffix.",
                        );
                    item.mods.push(this.rollMod(id, random, { origin }));
                } else {
                    requireRarity("rare");
                    const side = operation === "suffix-to-prefix" ? "prefix" : "suffix";
                    const removeSide = side === "prefix" ? "suffix" : "prefix";
                    const removable = item.mods.filter(
                        (entry) =>
                            !this.protected(item, entry, true) &&
                            this.mod(entry.id).generation_type === removeSide,
                    );
                    if (!removable.length)
                        throw new Error(`No unprotected ${removeSide} to remove.`);
                    this.add(item, random, { side, level });
                    item.mods.at(-1)!.origin = origin;
                    this.remove(item, random, true, { side: removeSide });
                }
            }
        } else if (method.kind === "bench") {
            const recipe = this.catalog.crafting.bench.find((entry) => entry.id === method.id);
            if (!recipe) throw new Error("Unknown bench recipe.");
            if (recipe.enchantment) {
                if (
                    !recipe.enchantment.itemClasses.includes(base.item_class) ||
                    !availableEnchantments(this.catalog, item).some(
                        (entry) => entry.mod === recipe.enchantment!.mod,
                    )
                )
                    throw new Error("This bench enchantment is not available on this item base.");
                item.enchantments = [this.rollMod(recipe.enchantment.mod, random)];
            } else if (!recipe.mod) {
                if (recipe.action === 8 || recipe.action === 9) {
                    if (!recipe.itemClasses.includes(base.item_class))
                        throw new Error("This bench recipe cannot be applied to this item class.");
                    requireRarity("rare");
                    const count = item.mods.length;
                    const removals = recipe.action === 8 ? 3 : 1;
                    for (let index = 0; index < removals; index++) {
                        if (!item.mods.some((entry) => !this.protected(item, entry, true))) break;
                        this.remove(item, random, true);
                    }
                    while (item.mods.length < count && this.pool(item).length)
                        this.add(item, random);
                } else if (recipe.action === 1) {
                    if (!recipe.itemClasses.includes(base.item_class))
                        throw new Error("This bench recipe cannot be applied to this item class.");
                    if (!item.enchantments?.length && !item.anointments?.length)
                        throw new Error("There are no enchantments to remove.");
                    delete item.enchantments;
                    delete item.anointments;
                } else {
                    if (recipe.action !== 0) throw new Error("This bench action is not supported.");
                    if (!item.mods.some((entry) => entry.crafted && !entry.fractured))
                        throw new Error("There are no crafted modifiers to remove.");
                    item.mods = item.mods.filter((entry) => !entry.crafted || entry.fractured);
                }
            } else {
                const prepared = this.prepareBenchCraft(item, method.id);
                if (prepared.conflict) {
                    if (!method.skipOnConflict)
                        throw new BenchCraftConflict(
                            prepared.conflict,
                            prepared.item,
                            prepared.cost,
                        );
                } else prepared.item.mods.push(this.rollMod(recipe.mod, random));
                return { item: this.validateItem(prepared.item), cost: prepared.cost };
            }
        } else if (method.kind === "essence" && this.catalog.game === "poe2") {
            const essence = this.catalog.crafting.poe2Essences.find(
                (entry) => entry.id === method.id,
            );
            if (!essence) throw new Error("Unknown PoE 2 essence.");
            if (item.mods.filter((entry) => entry.crafted).length >= this.craftedLimit(item))
                throw new Error(
                    "Remove the existing crafted modifier before using another essence.",
                );
            const rule = essence.rules.find((entry) => entry.itemClasses.includes(base.item_class));
            if (!rule) throw new Error("This essence has no modifier for this item class.");
            const operation = this.poe2EssenceOperation(essence.id);
            requireRarity(operation === "replace" ? "rare" : "magic");
            if (operation === "upgrade") rare();
            const candidates = rule.mod
                ? [{ value: rule.mod, weight: 1 }]
                : rule.outcomes.flatMap((outcome) => {
                      const mod = this.mod(outcome.mod);
                      const weight =
                          outcome.weight ??
                          mod.spawn_weights.find((entry) => base.tags.includes(entry.tag))
                              ?.weight ??
                          0;
                      return weight > 0 ? [{ value: outcome.mod, weight }] : [];
                  });
            this.addCraftedModifier(
                item,
                candidates,
                random,
                operation === "replace",
                omens.removeSide,
            );
            item.mods.at(-1)!.essence = true;
        } else if (method.kind === "essence") {
            const essence = this.catalog.crafting.essences.find((entry) => entry.id === method.id);
            if (!essence) throw new Error("Unknown essence.");
            requireRarity(
                ...(essence.level >= 5 ? (["normal", "rare"] as const) : (["normal"] as const)),
            );
            if (
                Object.values(metaStats).some(
                    (stat) => stat !== metaStats.multiple && this.hasStat(item, stat),
                )
            )
                throw new Error("Essences cannot be used with metamods.");
            const mod = essence.mods[base.item_class];
            if (!mod) throw new Error("This essence has no modifier for this item class.");
            rare();
            this.reroll(
                item,
                random,
                {
                    level: essence.itemLevelLimit
                        ? Math.min(item.level, essence.itemLevelLimit)
                        : item.level,
                    ignoreMeta: true,
                    memoryStrands: strands,
                },
                [mod],
                false,
            );
            const guaranteed = item.mods.find((entry) => entry.id === mod && !entry.fractured);
            if (guaranteed) guaranteed.essence = true;
        } else if (method.kind === "fossils") {
            if (new Set(method.ids).size !== method.ids.length)
                throw new Error("A fossil can only be used once per resonator.");
            const resonator = this.catalog.crafting.currencies.find(
                (entry) => entry.id === method.resonator,
            );
            if (
                !resonator ||
                !["delve_currency_upgrade", "delve_currency_reroll"].includes(resonator.action)
            )
                throw new Error("Choose an extracted resonator.");
            if (Number(resonator.id.at(-1)) !== method.ids.length)
                throw new Error("The resonator must have one socket per fossil.");
            requireRarity(resonator.action === "delve_currency_upgrade" ? "normal" : "rare");
            if (
                Object.values(metaStats).some(
                    (stat) => stat !== metaStats.multiple && this.hasStat(item, stat),
                )
            )
                throw new Error("Fossils cannot be used with metamods.");
            const fossils = this.effectiveFossils(method.ids, method.tangled);
            const gilded = fossils.some((fossil) => fossil.effects.includes("BetterSellPrice"));
            if (gilded) this.mod(gildedImplicitId);
            const corrupt = fossils.some((fossil) => fossil.effects.includes("CorruptedImplicit"));
            if (corrupt && !this.corruptedModifiers(item).length)
                throw new Error("No eligible corrupted implicit for this base and item level.");
            const fracture = fossils.some((fossil) => fossil.effects.includes("Fracture"));
            if (fracture && !this.canFractureWithFossil(item))
                throw new Error(
                    "Fractured Fossils require a fracturable base with no influence or fractured modifier.",
                );
            for (const fossil of fossils) {
                const matches = (rule: (typeof fossil.allowed)[number]) =>
                    (rule.tag && base.tags.includes(rule.tag)) ||
                    rule.itemClass === base.item_class;
                if (
                    (fossil.allowed.length && !fossil.allowed.some(matches)) ||
                    fossil.forbidden.some(matches)
                )
                    throw new Error(`${fossil.name} cannot be used on this base.`);
            }
            rare();
            this.reroll(
                item,
                random,
                {
                    fossils: method.ids,
                    logic: method.logic,
                    tangled: method.tangled,
                    ignoreMeta: true,
                },
                fossils.flatMap((fossil) => fossil.forced),
                false,
            );
            if (fracture)
                random.pick(item.mods.map((entry) => ({ value: entry, weight: 1 }))).fractured =
                    true;
            if (corrupt) this.replaceCorruptedImplicit(item, random);
            if (gilded && !item.implicits.some((entry) => entry.id === gildedImplicitId))
                item.implicits.push(this.rollMod(gildedImplicitId, random));
        } else {
            const recipe = this.catalog.crafting.harvest.find((entry) => entry.id === method.id);
            if (!recipe || recipe.gameMode === 2)
                throw new Error("Unknown or Ruthless-only Harvest recipe.");
            const tag = /^([a-z_]+) ON rare$/.exec(recipe.parameters)?.[1];
            if (recipe.command === "add_enchant_to_class" && recipe.enchantment) {
                if (!recipe.enchantment.itemClasses.includes(base.item_class))
                    throw new Error(
                        "This Harvest enchantment is not available on this item class.",
                    );
                item.enchantments = [this.rollMod(recipe.enchantment.mod, random)];
                if (item.anointments?.length) item.anointments = [];
            } else if (recipe.command === "convert_mod") {
                requireRarity("magic", "rare");
                const [types, conversion] = recipe.parameters.split(" CONVERT ");
                const [from, to] = conversion!.split(" ");
                const choices = item.mods.flatMap((entry) => {
                    const current = this.mod(entry.id);
                    if (this.protected(item, entry) || !types!.split(" ").includes(current.type))
                        return [];
                    const ids = new Set(
                        this.catalog.crafting.modEquivalencies
                            .filter((equivalency) => equivalency.mods.includes(entry.id))
                            .flatMap((equivalency) => equivalency.mods),
                    );
                    return [...ids].flatMap((id) => {
                        const mod = this.mod(id);
                        if (
                            id === entry.id ||
                            mod.domain !== current.domain ||
                            mod.generation_type !== current.generation_type ||
                            !mod.implicit_tags.includes(to!) ||
                            mod.implicit_tags.includes(from!)
                        )
                            return [];
                        const replacement = this.rollMod(id, seededRandom(0), {
                            crafted: entry.crafted,
                        });
                        const candidate = {
                            ...item,
                            mods: item.mods.map((value) => (value === entry ? replacement : value)),
                        };
                        try {
                            this.validateItem(candidate);
                            return [{ value: { entry, id }, weight: 1 }];
                        } catch {
                            return [];
                        }
                    });
                });
                const selected = random.pick(choices);
                item.mods = item.mods.map((entry) =>
                    entry === selected.entry
                        ? this.rollMod(selected.id, random, { crafted: entry.crafted })
                        : entry,
                );
            } else if (recipe.command === "reroll_with_mod" && tag) {
                requireRarity("rare");
                this.reroll(item, random, { tag });
            } else if (recipe.command === "reroll_influence_types") {
                requireRarity("rare");
                if (this.hasFixedInfluences(item))
                    throw new Error("This base has fixed influences that cannot be randomised.");
                if (!recipe.influenceRerollClasses?.includes(base.item_class))
                    throw new Error(
                        "This Harvest influence reroll is unavailable for this item class.",
                    );
                if (item.influences.length !== 1)
                    throw new Error("This influence-reroll model requires exactly one influence.");
                if (
                    item.mods.some(
                        (entry) =>
                            this.protected(item, entry) &&
                            this.catalog.crafting.modRules[entry.id]?.influence != null,
                    )
                )
                    throw new Error(
                        "Cannot randomise influence while an influenced modifier is protected.",
                    );
                const choices = this.catalog.crafting.influences.filter(
                    (rule) =>
                        rule.itemClass === base.item_class &&
                        !item.influences.includes(rule.influence),
                );
                item.influences = [
                    random.pick(choices.map((rule) => ({ value: rule.influence, weight: 1 }))),
                ];
                this.reroll(item, random);
            } else if (recipe.command === "reroll_with_influence_mod") {
                requireRarity("rare");
                if (!this.effectiveInfluences(item).length)
                    throw new Error("This Harvest reforge requires an influenced item.");
                this.reroll(item, random, { influence: "any" });
            } else if (
                recipe.command === "reroll_with_current_tags_affinity_multiplier" &&
                recipe.affinityMultiplier !== null
            ) {
                requireRarity("rare");
                this.reroll(item, random, {
                    affinity: {
                        types: [
                            ...new Set(item.mods.map((entry) => this.mod(entry.id).type)),
                        ].sort(),
                        multiplier: recipe.affinityMultiplier,
                    },
                });
            } else if (recipe.command === "remove_type_and_add_type_mod") {
                requireRarity("rare");
                const addedTag = /^ANY FOR ([a-z_]+) noinfluence$/.exec(recipe.parameters)?.[1];
                if (!addedTag || this.effectiveInfluences(item).length)
                    throw new Error("This Harvest augment requires a non-influenced item.");
                const added = random.pick(
                    this.pool(item, { tag: addedTag }).map((entry) => ({
                        value: entry.id,
                        weight: entry.weight,
                    })),
                );
                this.remove(item, random);
                item.mods.push(this.rollMod(added, random));
            } else throw new Error("This Harvest operation is not supported yet.");
        }
        if (item.reveal && !item.mods.some((entry) => entry.id === item.reveal!.mod))
            delete item.reveal;
        if (strands && consumption) {
            const remaining = random.pick(remainingStrandOutcomes(strands, consumption.maximum));
            if (remaining) item.memoryStrands = remaining;
            else delete item.memoryStrands;
        }
        return { item: this.validateItem(item), cost: this.costs(method, input) };
    }

    statTotals(item: CraftingItem, scope: "all" | "explicit" | "implicit" = "all") {
        const totals =
            scope === "all" ? socketedStats(this.catalog, item) : new Map<string, number>();
        if (scope === "all")
            for (const stat of mapQualityRecipe(this.catalog, item)?.stats ?? [])
                totals.set(stat, item.quality);
        if (scope === "all" && item.blight)
            for (const id of [
                item.blight,
                ...(item.anointments ?? []).map((id) => anointment(this.catalog, id).mod!),
            ])
                for (const stat of this.mod(id).stats)
                    totals.set(stat.id, (totals.get(stat.id) ?? 0) + stat.min);
        const mods =
            scope === "explicit"
                ? item.mods
                : scope === "implicit"
                  ? item.implicits
                  : [
                        ...item.mods,
                        ...item.implicits,
                        ...(item.enchantments ?? []).filter((entry) =>
                            this.mod(entry.id).generation_type.startsWith("flask_enchantment_"),
                        ),
                    ];
        for (const rolled of mods) {
            const values = scaledModValues(this.catalog, rolled, item);
            for (const [index, stat] of this.mod(rolled.id).stats.entries())
                totals.set(stat.id, (totals.get(stat.id) ?? 0) + values[index]!);
        }
        return totals;
    }

    matches(item: CraftingItem, input: CraftingTarget): boolean {
        if (item.allflameCopies)
            throw new Error("Choose an Allflame copy before checking item requirements.");
        if (item.destroyed || item.unidentified) return false;
        const target = input;
        if (target.expression) {
            const { operator, negated, operands } = target.expression;
            const matched =
                operator === "and"
                    ? operands.every((operand) => this.matches(item, operand))
                    : operands.some((operand) => this.matches(item, operand));
            if (negated ? matched : !matched) return false;
        }
        const mods = [...item.mods, ...item.implicits];
        const matched = target.groups.filter((group) => {
            const count = new Set(
                mods
                    .filter(
                        (entry) =>
                            group.mods.includes(entry.id) && (!group.fractured || entry.fractured),
                    )
                    .map((entry) => entry.id),
            ).size;
            return group.negated ? count < group.minimum : count >= group.minimum;
        }).length;
        const limits = this.limits(item);
        const counts = this.counts(item);
        const inRange = (count: number, range: CraftingTarget["affixCount"]) =>
            !range || (count >= range.min && count <= range.max);
        const statTotals = new Map<string, Map<string, number>>();
        return (
            (target.grantedPassives ?? []).every((id) =>
                item.mods.some((mod) => mod.grantedPassive === id),
            ) &&
            (target.anointments ?? []).every((id) =>
                (item.anointments ?? []).some(
                    (present) =>
                        anointmentKey(this.catalog, present) === anointmentKey(this.catalog, id),
                ),
            ) &&
            (target.enchantments ?? []).every((id) =>
                item.enchantments?.some((entry) => entry.id === id),
            ) &&
            (!target.rarity || item.rarity === target.rarity) &&
            (target.corrupted === undefined || item.corrupted === target.corrupted) &&
            (target.mirrored === undefined || item.mirrored === target.mirrored) &&
            (target.split === undefined || Boolean(item.split) === target.split) &&
            (target.sanctified === undefined || Boolean(item.sanctified) === target.sanctified) &&
            matchesBaseDefences(this.catalog, item, target) &&
            (!target.mapTier ||
                (Boolean(this.map(item)) && inRange(this.map(item)!.tier, target.mapTier))) &&
            (!target.waystoneTier ||
                (Boolean(this.waystone(item)) &&
                    inRange(this.waystone(item)!.tier, target.waystoneTier))) &&
            inRange(item.sockets ?? 0, target.sockets) &&
            matchesSocketLinks(item, target) &&
            (target.jewelSocket === undefined ||
                Boolean(item.jewelSocket) === target.jewelSocket) &&
            (target.socketedJewel === undefined ||
                Boolean(item.socketedJewel) === target.socketedJewel) &&
            inRange(item.quality, target.quality) &&
            (!target.quality?.mapType ||
                mapQualityRecipe(this.catalog, item)?.id === target.quality.mapType) &&
            inRange(item.memoryStrands ?? 0, target.memoryStrands) &&
            inRange(item.intangibility ?? 0, target.intangibility) &&
            (!target.intentions ||
                (Boolean(item.memoryMap) &&
                    inRange(item.memoryMap!.intentions, target.intentions))) &&
            (!target.catalyst ||
                ((!target.catalyst.id || item.catalyst?.id === target.catalyst.id) &&
                    inRange(item.catalyst?.quality ?? 0, target.catalyst))) &&
            (target.influences ?? []).every((influence) =>
                this.effectiveInfluences(item).includes(influence),
            ) &&
            inRange(item.mods.length, target.affixCount) &&
            inRange(counts.prefixes, target.prefixCount) &&
            inRange(counts.suffixes, target.suffixCount) &&
            inRange(this.unrevealedCount(item), target.unrevealedCount) &&
            Math.max(
                0,
                Math.min(
                    limits.max - item.mods.length,
                    Math.max(0, limits.prefixes - counts.prefixes) +
                        Math.max(0, limits.suffixes - counts.suffixes),
                ),
            ) >= (target.openAffixes ?? 0) &&
            matched >= (target.minimumGroups || target.groups.length) &&
            matchesItemProperties(this, item, target) &&
            Math.max(0, limits.prefixes - counts.prefixes) >= target.openPrefixes &&
            Math.max(0, limits.suffixes - counts.suffixes) >= target.openSuffixes &&
            (target.stats ?? []).every((stat) => {
                let totals = statTotals.get(stat.scope);
                if (!totals) {
                    totals = this.statTotals(item, stat.scope);
                    statTotals.set(stat.scope, totals);
                }
                const value = totals.get(stat.id) ?? 0;
                return (
                    (stat.min === undefined || value >= stat.min) &&
                    (stat.max === undefined || value <= stat.max)
                );
            })
        );
    }

    validateTarget(input: unknown): CraftingTarget {
        const target = craftingTargetSchema.parse(input);
        for (const operand of target.expression?.operands ?? []) this.validateTarget(operand);
        if (target.split !== undefined && this.catalog.game !== "poe1")
            throw new Error("Split requirements are only available in PoE 1.");
        if (target.sanctified !== undefined && this.catalog.game !== "poe2")
            throw new Error("Sanctification requirements are only available in PoE 2.");
        if (
            target.quality?.mapType &&
            (this.catalog.game !== "poe1" ||
                !this.catalog.crafting.mapQuality.some(
                    (entry) => entry.id === target.quality!.mapType,
                ))
        )
            throw new Error("Unknown map quality requirement.");
        if (this.catalog.game === "poe1" && (target.affixCount?.max ?? 0) > 8)
            throw new Error("PoE 1 affix-count requirements cannot exceed eight.");
        if (this.catalog.game === "poe1" && target.quality && target.quality.max > 40)
            throw new Error("PoE 1 base quality requirements cannot exceed 40%.");
        if (target.sockets && this.catalog.game === "poe1" && target.sockets.max > 6)
            throw new Error("PoE 1 socket requirements cannot exceed six.");
        if (target.linkedSockets && this.catalog.game !== "poe1")
            throw new Error("Gem socket link requirements are only available in PoE 1.");
        if (target.jewelSocket !== undefined && this.catalog.game !== "poe2")
            throw new Error("Jewel socket conversion requirements are only available in PoE 2.");
        if (target.socketedJewel !== undefined && this.catalog.game !== "poe2")
            throw new Error("Socketed Jewel requirements are only available in PoE 2.");
        if (target.memoryStrands && this.catalog.game !== "poe1")
            throw new Error("Memory-strand requirements are only available for PoE 1.");
        if (target.intangibility && this.catalog.game !== "poe1")
            throw new Error("Intangibility requirements are only available in PoE 1.");
        if (target.intentions) {
            if (this.catalog.game !== "poe1" || !this.catalog.crafting.memoryMaps)
                throw new Error("Orb of Intention requirements are only available for PoE 1.");
            if (target.intentions.max > this.catalog.crafting.memoryMaps.maximumUses)
                throw new Error("Orb of Intention requirements exceed the extracted map limit.");
        }
        if (
            target.mapTier &&
            (this.catalog.game !== "poe1" ||
                ![target.mapTier.min, target.mapTier.max].every((tier) =>
                    this.catalog.crafting.maps.some((entry) => entry.tier === tier),
                ))
        )
            throw new Error("Map tier requirements must use tiers from the extracted PoE 1 build.");
        if (
            target.waystoneTier &&
            (this.catalog.game !== "poe2" ||
                ![target.waystoneTier.min, target.waystoneTier.max].every((tier) =>
                    this.catalog.crafting.waystones.some((entry) => entry.tier === tier),
                ))
        )
            throw new Error(
                "Waystone tier requirements must use tiers from the extracted PoE 2 build.",
            );
        if (
            target.catalyst?.id &&
            !this.catalog.crafting.catalysts.some((entry) => entry.id === target.catalyst!.id)
        )
            throw new Error("Unknown target catalyst in the extracted game catalog.");
        if (
            target.influences?.some(
                (influence) =>
                    !this.catalog.crafting.influences.some((rule) => rule.influence === influence),
            )
        )
            throw new Error(
                "This influence requirement is unavailable in the extracted game catalog.",
            );
        if (target.minimumGroups > target.groups.length)
            throw new Error("Required group count exceeds the number of target groups.");
        for (const group of target.groups) {
            if (new Set(group.mods).size < group.minimum)
                throw new Error("Target group requires more modifiers than it contains.");
            for (const id of group.mods) this.mod(id);
        }
        for (const stat of target.stats ?? [])
            if (!this.statIds.has(stat.id)) throw new Error(`Unknown target stat: ${stat.id}`);
        for (const id of target.anointments ?? []) anointment(this.catalog, id);
        for (const id of target.grantedPassives ?? []) grantedPassive(this.catalog, id);
        for (const id of target.enchantments ?? [])
            if (!availableEnchantments(this.catalog).some((recipe) => recipe.mod === id))
                throw new Error("Unknown or unsupported target enchantment.");
        if (
            new Set((target.anointments ?? []).map((id) => anointmentKey(this.catalog, id)))
                .size !== (target.anointments?.length ?? 0)
        )
            throw new Error("Choose each anointment outcome only once.");
        return target;
    }
}

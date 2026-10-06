import {
    type CraftingItem,
    type CraftingTarget,
    craftingDefenceKeySchema,
    craftingPropertyKeySchema,
} from "../schemas/crafting";
import { baseDefenceValue } from "./crafting-defences";
import type { CraftingEngine } from "./crafting-engine";
import { scaledModValues } from "./crafting-text";

export type CraftingProperty = (typeof craftingPropertyKeySchema.options)[number];
export const itemPropertyNames: Record<CraftingProperty, string> = {
    armour: "Armour",
    evasion: "Evasion Rating",
    // biome-ignore lint/style/useNamingConvention: Matches the canonical extracted property key.
    energy_shield: "Energy Shield",
    ward: "Ward",
    physicalDps: "Physical DPS",
    elementalDps: "Elemental DPS",
    chaosDps: "Chaos DPS",
    totalDps: "Total DPS",
    attacksPerSecond: "Attacks per Second",
    reloadTime: "Reload Time (s)",
    criticalStrikeChance: "Critical Strike Chance (%)",
    blockChance: "Block Chance (%)",
    requiredLevel: "Required Character Level",
    strengthRequirement: "Strength Requirement",
    dexterityRequirement: "Dexterity Requirement",
    intelligenceRequirement: "Intelligence Requirement",
    lifeRecovery: "Life Recovery",
    manaRecovery: "Mana Recovery",
    flaskDuration: "Flask / Charm Duration (s)",
    maximumCharges: "Maximum Charges",
    chargesPerUse: "Charges per Use",
    elementalResistance: "Elemental Resistance (%)",
    totalResistance: "Total Resistance (%)",
    flatLife: "Flat Life",
};

const defenceStats = {
    armour: [
        "local_base_physical_damage_reduction_rating",
        "local_physical_damage_reduction_rating_+%",
        "local_armour_and_evasion_+%",
        "local_armour_and_energy_shield_+%",
    ],
    evasion: [
        "local_base_evasion_rating",
        "local_evasion_rating_+%",
        "local_armour_and_evasion_+%",
        "local_evasion_and_energy_shield_+%",
    ],
    // biome-ignore lint/style/useNamingConvention: Matches the canonical extracted property key.
    energy_shield: [
        "local_energy_shield",
        "local_energy_shield_+%",
        "local_armour_and_energy_shield_+%",
        "local_evasion_and_energy_shield_+%",
    ],
    ward: ["local_ward", "local_ward_+%"],
};

const round = (value: number) =>
    Math.round((value + Number.EPSILON * Math.max(1, value)) * 100) / 100;

function requiredCharacterLevel(engine: CraftingEngine, item: CraftingItem): number | undefined {
    const base = engine.base(item);
    const inventory = base.levelRules.inventory_type;
    if (base.levelRules.no_level_requirement === "true") return 0;
    if (!inventory || ["HeistNpcEquipment", "Leaguestone"].includes(inventory)) return undefined;
    const equipment =
        ["Weapon", "Helm", "BodyArmour", "Boots", "Gloves"].includes(inventory) ||
        (inventory === "Offhand" && base.item_class !== "Quiver");
    const minimum = inventory === "Flask" ? 2 : 4;
    const baseLevel =
        (equipment || inventory === "Flask") && base.drop_level > minimum ? base.drop_level : 0;
    const modifiers = [
        ...base.implicits,
        ...item.implicits.map((mod) => mod.id),
        ...item.mods.map((mod) => mod.id),
        ...(item.enchantments ?? []).map((mod) => mod.id),
    ];
    const level = Math.max(
        baseLevel,
        ...modifiers.map((id) => Math.floor((engine.mod(id).required_level * 4) / 5)),
        ...(item.augments ?? []).map(
            (id) =>
                engine.catalog.crafting.augments.find((augment) => augment.id === id)!
                    .requiredLevel,
        ),
        item.socketedJewel ? (requiredCharacterLevel(engine, item.socketedJewel) ?? 0) : 0,
    );
    return level > 1 ? level : 0;
}

export function itemProperties(engine: CraftingEngine, item: CraftingItem) {
    const values: Partial<Record<CraftingProperty, number | undefined>> = {};
    if (item.destroyed) return values;
    const requiredLevel = requiredCharacterLevel(engine, item);
    if (requiredLevel !== undefined) values.requiredLevel = requiredLevel;
    const stats = engine.statTotals(item);
    for (const rolled of item.enchantments ?? []) {
        const mod = engine.mod(rolled.id);
        if (mod.generation_type.startsWith("flask_enchantment_")) continue;
        const scaled = scaledModValues(engine.catalog, rolled, item);
        for (const [index, stat] of mod.stats.entries())
            stats.set(stat.id, (stats.get(stat.id) ?? 0) + scaled[index]!);
    }
    const stat = (id: string) => stats.get(id) ?? 0;
    const quality = Math.max(0, item.quality + stat("local_item_quality_+"));
    const flask = engine.base(item).flask;
    const floor = (value: number) => Math.floor(Math.max(0, value) + 1e-9);
    const requirements = engine.base(item).requirements;
    const attributes = ["strength", "dexterity", "intelligence"] as const;
    if (
        requirements ||
        attributes.some((attribute) => stat(`local_${attribute}_requirement_+`)) ||
        stat("local_strength_and_intelligence_requirement_+")
    ) {
        const converted = { strength: 0, dexterity: 0, intelligence: 0 };
        for (const source of attributes) {
            const destinations = attributes.filter((attribute) => attribute !== source);
            const total = destinations.reduce(
                (sum, destination) =>
                    sum + stat(`local_requirements_%_to_convert_to_${destination}`),
                0,
            );
            const amount = requirements?.[source] ?? 0;
            converted[source] += amount * (1 - Math.min(100, total) / 100);
            for (const destination of destinations)
                converted[destination] +=
                    (amount * stat(`local_requirements_%_to_convert_to_${destination}`)) /
                    Math.max(100, total);
        }
        for (const attribute of attributes) {
            const flat =
                stat(`local_${attribute}_requirement_+`) +
                (attribute === "dexterity"
                    ? 0
                    : stat("local_strength_and_intelligence_requirement_+"));
            values[`${attribute}Requirement`] = stat("local_no_attribute_requirements")
                ? 0
                : floor(
                      (converted[attribute] + flat) *
                          (1 +
                              (stat("local_attribute_requirements_+%") +
                                  stat(`local_${attribute}_requirement_+%`)) /
                                  100),
                  );
        }
    }
    if (flask.charges_max !== null)
        values.maximumCharges = floor(
            (flask.charges_max + stat("local_extra_max_charges")) *
                (1 + stat("local_max_charges_+%") / 100),
        );
    if (flask.charges_per_use !== null)
        values.chargesPerUse = floor(
            flask.charges_per_use * (1 + stat("local_charges_used_+%") / 100),
        );
    for (const resource of ["life", "mana"] as const) {
        const amount = flask[`${resource}_per_use`];
        if (amount !== null)
            values[resource === "life" ? "lifeRecovery" : "manaRecovery"] = Math.round(
                Math.max(
                    0,
                    amount *
                        (1 + quality / 100) *
                        (1 +
                            (stat("local_flask_amount_to_recover_+%") +
                                stat(`local_flask_${resource}_to_recover_+%`)) /
                                100),
                ),
            );
    }
    if (flask.duration !== null) {
        const recovery = (flask.life_per_use ?? 0) > 0 || (flask.mana_per_use ?? 0) > 0;
        const duration =
            (flask.duration / 10) *
            (1 + (stat("local_flask_duration_+%") + stat("local_charm_duration_+%")) / 100) *
            (1 + stat("local_flask_duration_+%_final") / 100) *
            (recovery ? 1 / (1 + stat("local_flask_recovery_speed_+%") / 100) : 1 + quality / 100);
        values.flaskDuration = Math.round(Math.max(0, duration) * 10) / 10;
    }
    const perQuality = (id: string, divisor: number) => Math.floor((quality * stat(id)) / divisor);
    const elemental =
        stat("base_cold_damage_resistance_%") +
        stat("base_fire_damage_resistance_%") +
        stat("base_lightning_damage_resistance_%") +
        2 *
            (stat("fire_and_lightning_damage_resistance_%") +
                stat("fire_and_cold_damage_resistance_%") +
                stat("cold_and_lightning_damage_resistance_%")) +
        stat("cold_and_chaos_damage_resistance_%") +
        stat("fire_and_chaos_damage_resistance_%") +
        stat("lightning_and_chaos_damage_resistance_%") +
        3 * (stat("base_resist_all_elements_%") + stat("resist_all_%")) +
        perQuality("local_fire_resistance_%_per_2%_quality", 2) +
        perQuality("local_cold_resistance_%_per_2%_quality", 2) +
        perQuality("local_lightning_resistance_%_per_2%_quality", 2);
    values.elementalResistance = elemental;
    values.totalResistance =
        elemental +
        stat("base_chaos_damage_resistance_%") +
        stat("cold_and_chaos_damage_resistance_%") +
        stat("fire_and_chaos_damage_resistance_%") +
        stat("lightning_and_chaos_damage_resistance_%") +
        stat("resist_all_%");
    values.flatLife =
        stat("base_maximum_life") + perQuality("local_maximum_life_per_2%_quality", 2);
    const qualityBonus = (property: "defences" | "physical_damage") =>
        stat(`local_quality_does_not_increase_${property}`) ? 1 : 1 + quality / 100;
    for (const key of craftingDefenceKeySchema.options) {
        const [flat, ...percentages] = defenceStats[key];
        if (!engine.base(item).defences[key] && !stat(flat!)) continue;
        const base = baseDefenceValue(engine.catalog, item, key);
        const increased =
            percentages.reduce((total, id) => total + stat(id!), 0) +
            (key === "ward" ? 0 : stat("local_armour_and_evasion_and_energy_shield_+%"));
        values[key] =
            base === undefined
                ? undefined
                : Math.max(
                      0,
                      Math.round(
                          (base + stat(flat!)) * (1 + increased / 100) * qualityBonus("defences"),
                      ),
                  );
    }
    const base = engine.base(item).combat;
    if (base.block !== null && (base.block > 0 || stat("local_additional_block_chance_%") > 0))
        values.blockChance = Math.floor(
            Math.max(
                0,
                (base.block + stat("local_additional_block_chance_%")) *
                    (1 + stat("local_block_chance_+%") / 100),
            ),
        );
    if (base.attack_time && base.attack_time > 0) {
        const speed =
            stat("local_attack_speed_+%") + perQuality("local_attack_speed_+%_per_8%_quality", 8);
        const attacks = round(Math.max(0, (1000 / base.attack_time) * (1 + speed / 100)));
        values.attacksPerSecond = attacks;
        if (base.reload_time && base.reload_time > 0)
            values.reloadTime = round(
                base.reload_time / 1000 / (1 + (speed + stat("local_reload_speed_+%")) / 100),
            );
        if (base.critical_strike_chance !== null)
            values.criticalStrikeChance = round(
                Math.max(
                    0,
                    ((base.critical_strike_chance + stat("local_critical_strike_chance")) / 100) *
                        (1 +
                            (stat("local_critical_strike_chance_+%") +
                                perQuality("local_critical_strike_chance_+%_per_4%_quality", 4)) /
                                100),
                ),
            );
        const damage = (type: string) => {
            const physical = type === "physical";
            const elemental = type !== "physical" && type !== "chaos";
            const increased =
                stat(`local_${type}_damage_+%`) +
                (elemental
                    ? stat("local_elemental_damage_+%") +
                      perQuality("local_elemental_damage_+%_per_2%_quality", 2)
                    : 0);
            const multiplier =
                (1 + increased / 100) * (physical ? qualityBonus("physical_damage") : 1);
            const min = Math.max(
                0,
                Math.round(
                    ((physical ? (base.physical_damage_min ?? 0) : 0) +
                        stat(`local_minimum_added_${type}_damage`)) *
                        multiplier,
                ),
            );
            const max = Math.max(
                0,
                Math.round(
                    ((physical ? (base.physical_damage_max ?? 0) : 0) +
                        stat(`local_maximum_added_${type}_damage`)) *
                        multiplier,
                ),
            );
            return ((min + max) / 2) * attacks;
        };
        const physical = damage("physical");
        const elemental = damage("fire") + damage("cold") + damage("lightning");
        const chaos = damage("chaos");
        values.physicalDps = round(physical);
        values.elementalDps = round(elemental);
        values.chaosDps = round(chaos);
        values.totalDps = round(physical + elemental + chaos);
    }
    return values;
}

export function matchesItemProperties(
    engine: CraftingEngine,
    item: CraftingItem,
    target: CraftingTarget,
) {
    if (!Object.keys(target.properties ?? {}).length) return true;
    const values = itemProperties(engine, item);
    return craftingPropertyKeySchema.options.every((key) => {
        const range = target.properties?.[key];
        if (!range) return true;
        if (Object.hasOwn(values, key) && values[key] === undefined)
            throw new Error(
                `Set the starting Base ${itemPropertyNames[key]} roll before checking final item properties.`,
            );
        const value = values[key] ?? 0;
        return (
            (range.min === undefined || value >= range.min) &&
            (range.max === undefined || value <= range.max)
        );
    });
}

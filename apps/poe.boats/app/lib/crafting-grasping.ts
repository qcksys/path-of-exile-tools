/** biome-ignore-all lint/style/useNamingConvention: Ring recipes retain canonical Breachlord names. */
import type { CraftingCatalog, CraftingItem } from "../schemas/crafting";

export const graspingMailBase = "Metadata/Items/Armours/BodyArmours/BodyStrDexInt2";
export const graspingMailSource =
    "https://www.poewiki.net/index.php?title=Grasping_Mail&oldid=1697822";
export const breachlords = ["Xoph", "Tul", "Esh", "Uul-Netol", "Chayula"] as const;
export type BreachRings = "legacy" | Record<(typeof breachlords)[number], number>;
export const mixedBreachRings = { Xoph: 12, Tul: 12, Esh: 12, "Uul-Netol": 12, Chayula: 12 };

// User-authorized wiki exception; identities, values and groups still resolve from the build.
export const graspingModifiers = [
    ["Xoph", "BreachBodyArmourIncreasedByUncappedFireResistance1____", 250],
    ["Xoph", "BreachBodyCoverInAshWhenHit1__", 1000],
    ["Xoph", "BreachBodyLifeGainedOnHittingIgnitedEnemies1", 1000],
    ["Tul", "BreachBodyEvasionIncreasedByUncappedColdResistance1", 250],
    ["Tul", "BreachBodyAddedColdDamagePerPowerCharge1", 1000],
    ["Tul", "BreachBodyOnHitBlindChilledEnemies1", 250],
    ["Tul", "BreachBodyArcticArmourReservationEfficiency1", 250],
    ["Tul", "BreachBodyChillEnemiesWhenHit1", 1000],
    ["Tul", "BreachBodyGainPowerChargeOnKillingFrozenEnemy1", 1000],
    ["Esh", "BreachBodyAddedLightningDamagePerShockedEnemyKilled1", 250],
    ["Esh", "BreachBodyChaosDamageDoesNotBypassESNotLowLifeOrMana1_", 1000],
    ["Esh", "BreachBodyCriticalChanceIncreasedByUncappedLightningResistance1", 250],
    ["Esh", "BreachBodyIncreasedAttackSpeedPerDexterity1", 250],
    ["Esh", "BreachBodyReflectsShocks1", 1000],
    ["Uul-Netol", "BreachBodyEnemiesBlockedAreIntimidated1", 1000],
    ["Uul-Netol", "BreachBodyVulnerabilityOnHit1", 250],
    ["Uul-Netol", "BreachBodyNoExtraBleedDamageWhileMoving1_", 1000],
    ["Uul-Netol", "BreachBodyPhysicalDamageReductionWhileNotMoving1", 1000],
    ["Chayula", "BreachBodyChaosDamageAsPortionOfFireDamage1_", 333],
    ["Chayula", "BreachBodyChaosDamageAsPortionOfColdDamage1", 333],
    ["Chayula", "BreachBodyChaosDamageAsPortionOfLightningDamage1", 333],
    ["Chayula", "BreachBodyMaximumLifeConvertedToEnergyShield1___", 1000],
    ["Chayula", "BreachBodyAllDefences1", 1000],
    ["Chayula", "BreachBodyGrantsEnvy1", 1000],
    ["Chayula", "BreachBodyMinionsPoisonEnemiesOnHit1_", 1000],
] as const;

const modifierIds = new Set<string>(graspingModifiers.map(([, id]) => id));
export function isBreachModifier(catalog: CraftingCatalog, item: CraftingItem, id: string) {
    return (
        catalog.game === "poe1" &&
        catalog.bases[item.baseId]?.item_class === "Body Armour" &&
        modifierIds.has(id)
    );
}

export function graspingPool(
    catalog: CraftingCatalog,
    item: CraftingItem,
    rings: BreachRings = mixedBreachRings,
) {
    if (catalog.game !== "poe1" || item.baseId !== graspingMailBase) return [];
    const occupied = item.mods.map((entry) => catalog.mods[entry.id]!);
    const entries = graspingModifiers.flatMap(([lord, id, weight]) => {
        const mod = catalog.mods[id];
        if (!mod) throw new Error(`Missing build modifier required by the wiki pool: ${id}`);
        if (
            occupied.some((entry) => entry.groups.some((group) => mod.groups.includes(group))) ||
            occupied.filter((entry) => entry.generation_type === mod.generation_type).length >= 3
        )
            return [];
        return [{ lord, id, mod, weight }];
    });
    if (rings === "legacy") return entries;
    return entries.flatMap((entry) =>
        rings[entry.lord] > 0
            ? [
                  {
                      ...entry,
                      weight:
                          (entry.weight * rings[entry.lord]) /
                          entries
                              .filter((other) => other.lord === entry.lord)
                              .reduce((sum, other) => sum + other.weight, 0),
                  },
              ]
            : [],
    );
}

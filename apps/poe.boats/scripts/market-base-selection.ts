import type { CraftingCatalog } from "../app/schemas/crafting";

const ARMOUR = new Set(["Helmet", "Body Armour", "Boots", "Gloves", "Shield"]);
const WEAPONS = new Set([
    "Two Hand Sword",
    "Wand",
    "Dagger",
    "Rune Dagger",
    "Claw",
    "One Hand Axe",
    "One Hand Sword",
    "Thrusting One Hand Sword",
    "One Hand Mace",
    "Sceptre",
    "Bow",
    "Staff",
    "Warstaff",
    "Two Hand Axe",
    "Two Hand Mace",
    "Quiver",
]);
/** Older bases are not crafted on, whatever their implicit. */
const MIN_DROP_LEVEL = 60;
const NEWEST_PER_GROUP = 2;

type Base = CraftingCatalog["bases"][string];

function implicitText(catalog: CraftingCatalog, base: Base) {
    return base.implicits
        .map((id) => catalog.mods[id]?.text?.replace(/\n/g, "; ") ?? id)
        .join(" | ");
}

/** An implicit with its numbers masked, so stronger rolls of one effect group together. */
function implicitShape(text: string) {
    return text
        .replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2")
        .replace(/\[([^\]]+)\]/g, "$1")
        .replace(/[+-]?\(?-?\d+(?:\.\d+)?(?:--?\d+(?:\.\d+)?)?\)?/g, "#");
}

function defenceTypes(base: Base) {
    return Object.entries(base.defences)
        .filter(([, range]) => range && range.max > 0)
        .map(([key]) => key)
        .sort()
        .join("/");
}

function newest(bases: Base[]) {
    return bases.toSorted((a, b) => b.drop_level - a.drop_level).slice(0, NEWEST_PER_GROUP);
}

function weaponStats({ combat }: Base) {
    return {
        damage: ((combat?.physical_damage_min ?? 0) + (combat?.physical_damage_max ?? 0)) / 2,
        speed: combat?.attack_time ? 1000 / combat.attack_time : 0,
        crit: combat?.critical_strike_chance ?? 0,
    };
}

/** No other base of the class is at least as good on damage, speed and crit, and better on one. */
function statWinners(bases: Base[]) {
    const stats = bases.map((base) => ({ base, ...weaponStats(base) }));
    return stats
        .filter(
            (one) =>
                !stats.some(
                    (other) =>
                        other.base !== one.base &&
                        other.damage >= one.damage &&
                        other.speed >= one.speed &&
                        other.crit >= one.crit &&
                        (other.damage > one.damage ||
                            other.speed > one.speed ||
                            other.crit > one.crit),
                ),
        )
        .map(({ base }) => base);
}

function largestImplicits(catalog: CraftingCatalog, bases: Base[]) {
    const size = (base: Base) =>
        Math.max(0, ...(implicitText(catalog, base).match(/\d+(?:\.\d+)?/g) ?? []).map(Number));
    const top = Math.max(...bases.map(size));
    return top ? bases.filter((base) => size(base) === top) : [];
}

/**
 * The armour and weapon base types listed as crafting base markets. Armour keeps the two newest
 * bases per class, defence types and implicit. Weapons, whose bases trade off damage, speed and
 * crit, keep those too, plus every base another cannot beat on all three and the largest roll of
 * each implicit.
 */
export function selectMarketBases(catalog: CraftingCatalog) {
    const unique = new Map<string, Base>();
    for (const [id, base] of Object.entries(catalog.bases))
        if (
            (ARMOUR.has(base.item_class) || WEAPONS.has(base.item_class)) &&
            base.drop_level >= MIN_DROP_LEVEL &&
            base.rarities.includes("rare") &&
            !base.corrupted &&
            !id.includes("Royale")
        )
            // Two-Toned Boots share a name across defence types, so each variant has its own key.
            unique.set(`${base.name}|${defenceTypes(base)}`, base);
    const bases = [...unique.values()];
    const groups = Map.groupBy(bases, (base) =>
        JSON.stringify([
            base.item_class,
            ARMOUR.has(base.item_class) ? defenceTypes(base) : "",
            implicitShape(implicitText(catalog, base)),
        ]),
    );
    const listed = [...groups.values()].flatMap((group) => [
        ...newest(group),
        ...(WEAPONS.has(group[0]!.item_class) ? largestImplicits(catalog, group) : []),
    ]);
    const weapons = Map.groupBy(
        bases.filter((base) => WEAPONS.has(base.item_class) && base.combat),
        (base) => base.item_class,
    );
    return new Set(
        [...listed, ...[...weapons.values()].flatMap(statWinners)].map((base) => base.name),
    );
}

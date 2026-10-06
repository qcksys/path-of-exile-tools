import type { CraftingCatalog, CraftingItem, CraftingMod } from "../schemas/crafting";

export const heistSources = {
    weapon: "https://www.poewiki.net/index.php?title=Tempering_Orb&oldid=1681190",
    armour: "https://www.poewiki.net/index.php?title=Tailoring_Orb&oldid=1681191",
};
const pools = new WeakMap<
    CraftingCatalog,
    { mod: string; itemClasses: string[]; recipe: string }[]
>();

// Wiki eligibility is an explicit source exception; modifier values remain build-derived.
export function heistEnchantmentKind(id: string, mod: Pick<CraftingMod, "stats">) {
    if (
        mod.stats.some((stat) =>
            [
                "local_has_X_white_sockets",
                "local_all_sockets_are_red",
                "local_all_sockets_are_green",
                "local_all_sockets_are_blue",
            ].includes(stat.id),
        )
    )
        return undefined;
    if (id.startsWith("WeaponEnchantmentHeist")) return "weapon";
    if (id.startsWith("ArmourEnchantmentHeist")) return "armour";
    return undefined;
}

export function heistEnchantments(
    catalog: CraftingCatalog,
    item?: Pick<CraftingItem, "baseId" | "level">,
) {
    if (catalog.game !== "poe1") return [];
    let pool = pools.get(catalog);
    if (!pool) {
        const weapons = [
            ...new Set(
                Object.values(catalog.bases)
                    .filter((base) => base.tags.includes("weapon"))
                    .map((base) => base.item_class),
            ),
        ];
        pool = Object.entries(catalog.mods).flatMap(([id, mod]) => {
            const kind = heistEnchantmentKind(id, mod);
            if (!kind) return [];
            const itemClasses = kind === "weapon" ? weapons : ["Body Armour"];
            return [
                {
                    mod: id,
                    itemClasses,
                    recipe: kind === "weapon" ? "Tempering Orb" : "Tailoring Orb",
                },
            ];
        });
        pools.set(catalog, pool);
    }
    return item
        ? pool.filter(
              (entry) =>
                  entry.itemClasses.includes(catalog.bases[item.baseId]!.item_class) &&
                  catalog.mods[entry.mod]!.required_level <= item.level,
          )
        : pool;
}

export function enchantmentStat(
    catalog: CraftingCatalog,
    item: Pick<CraftingItem, "enchantments">,
    statId: string,
) {
    return (item.enchantments ?? []).reduce(
        (sum, entry) =>
            sum +
            (catalog.mods[entry.id]?.stats ?? []).reduce(
                (value, stat, index) => value + (stat.id === statId ? entry.values[index]! : 0),
                0,
            ),
        0,
    );
}

export function heistModifierEffect(
    catalog: CraftingCatalog,
    item: CraftingItem,
    mod: CraftingMod,
) {
    if (catalog.game !== "poe1" || !["prefix", "suffix"].includes(mod.generation_type)) return 0;
    return mod.implicit_tags.reduce(
        (sum, tag) =>
            sum +
            enchantmentStat(
                catalog,
                item,
                `heist_enchantment_${tag === "defences" ? "defence" : tag === "caster_damage" ? "casterdamage" : tag}_mod_effect_+%`,
            ),
        0,
    );
}

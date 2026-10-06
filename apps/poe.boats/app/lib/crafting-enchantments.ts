import type { CraftingCatalog, CraftingItem } from "../schemas/crafting";
import { heistEnchantments } from "./crafting-heist";

export function flaskEnchantmentPool(
    catalog: CraftingCatalog,
    item: Pick<CraftingItem, "baseId" | "level">,
    currency: string,
) {
    const base = catalog.bases[item.baseId]!;
    const recipe = catalog.crafting.flaskEnchantments.find((entry) => entry.id === currency);
    if (catalog.game !== "poe1" || !recipe?.itemClasses.includes(base.item_class)) return [];
    return recipe.mods.flatMap((id) => {
        const mod = catalog.mods[id]!;
        const rule = catalog.crafting.modRules[id];
        if (
            (rule?.spawnLevel ?? mod.required_level) > item.level ||
            (mod.maximum_level > 0 && mod.maximum_level < item.level) ||
            rule?.gameMode === 2 ||
            (rule?.itemClasses.length && !rule.itemClasses.includes(base.item_class))
        )
            return [];
        const weight =
            ((mod.spawn_weights.find((entry) => base.tags.includes(entry.tag))?.weight ?? 0) *
                (mod.generation_weights.find((entry) => base.tags.includes(entry.tag))?.weight ??
                    100)) /
            100;
        return weight > 0 ? [{ id, mod, weight }] : [];
    });
}

export function availableEnchantments(
    catalog: CraftingCatalog,
    item?: Pick<CraftingItem, "baseId" | "level">,
) {
    const itemClass = item ? catalog.bases[item.baseId]!.item_class : undefined;
    const harvest = catalog.crafting.harvest.flatMap((recipe) =>
        recipe.gameMode !== 2 &&
        recipe.enchantment &&
        (!itemClass || recipe.enchantment.itemClasses.includes(itemClass))
            ? [{ ...recipe.enchantment, recipe: recipe.id }]
            : [],
    );
    const flasks = catalog.crafting.flaskEnchantments.flatMap((recipe) =>
        (item
            ? flaskEnchantmentPool(catalog, item, recipe.id).map((entry) => entry.id)
            : recipe.mods
        ).map((mod) => ({ mod, itemClasses: recipe.itemClasses, recipe: recipe.id })),
    );
    return [...harvest, ...flasks, ...heistEnchantments(catalog, item)];
}

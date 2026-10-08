import type { CraftingCatalog, CraftingItem } from "../schemas/crafting";

export const janusRarityModifier = "JunMasterVeiledItemRarityFromRareAndUniqueEnemies_";

export function isJanusRarityModifier(
    catalog: CraftingCatalog,
    item: Pick<CraftingItem, "baseId" | "level">,
    id: string,
) {
    const mod = catalog.mods[id];
    return (
        catalog.game === "poe1" &&
        id === janusRarityModifier &&
        catalog.bases[item.baseId]?.item_class === "Helmet" &&
        mod?.domain === "unveiled" &&
        item.level >= mod.required_level
    );
}

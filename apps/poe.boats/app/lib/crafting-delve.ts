import type { CraftingCatalog, CraftingItem } from "../schemas/crafting";

export const delveMinionModifier = "LocalIncreaseSocketedMinionGemLevelDelve";

export function isDelveMinionModifier(
    catalog: CraftingCatalog,
    item: Pick<CraftingItem, "baseId" | "level">,
    id: string,
) {
    const mod = catalog.mods[id];
    return (
        catalog.game === "poe1" &&
        id === delveMinionModifier &&
        catalog.bases[item.baseId]?.item_class === "Boots" &&
        mod != null &&
        item.level >= mod.required_level
    );
}

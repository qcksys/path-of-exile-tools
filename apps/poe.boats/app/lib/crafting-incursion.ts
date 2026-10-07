import type { CraftingCatalog, CraftingItem } from "../schemas/crafting";

export const incursionGloveModifiers = [
    "FireResistEnhancedModAilments",
    "ColdResistEnhancedModAilments__",
    "LightningResistEnhancedModAilments",
] as const;

export function isIncursionModifier(
    catalog: CraftingCatalog,
    item: Pick<CraftingItem, "baseId">,
    id: string,
) {
    return (
        catalog.game === "poe1" &&
        catalog.bases[item.baseId]?.item_class === "Gloves" &&
        incursionGloveModifiers.some((value) => value === id)
    );
}

export function incursionModifierPool(
    catalog: CraftingCatalog,
    item: Pick<CraftingItem, "baseId">,
) {
    return incursionGloveModifiers.flatMap((id) =>
        isIncursionModifier(catalog, item, id) && catalog.mods[id]
            ? [{ id, mod: catalog.mods[id]!, weight: 0 }]
            : [],
    );
}

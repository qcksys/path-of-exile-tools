import type { CraftingCatalog, CraftingItem } from "../schemas/crafting";
import { isPoe1From330 } from "./crafting-patch";

export const incursionGloveModifiers = [
    "FireResistEnhancedModAilments",
    "ColdResistEnhancedModAilments__",
    "LightningResistEnhancedModAilments",
] as const;

/**
 * Whether prepared gloves can carry the Incursion suffixes. They only drop from the Temple, and
 * 3.30.0 removed every source of Incursion Architect modifiers on magic and rare items.
 */
export function offersIncursionModifiers(
    catalog: CraftingCatalog,
    item: Pick<CraftingItem, "baseId">,
) {
    return (
        catalog.game === "poe1" &&
        !isPoe1From330(catalog) &&
        catalog.bases[item.baseId]?.item_class === "Gloves"
    );
}

export function isIncursionModifier(
    catalog: CraftingCatalog,
    item: Pick<CraftingItem, "baseId">,
    id: string,
) {
    return (
        offersIncursionModifiers(catalog, item) &&
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

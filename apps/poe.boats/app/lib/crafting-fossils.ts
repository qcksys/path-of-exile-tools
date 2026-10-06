import type { CraftingCatalog } from "../schemas/crafting";

export function tangledFossilOutcomes(catalog: CraftingCatalog) {
    const ids = new Set(catalog.crafting.fossils.flatMap((fossil) => fossil.randomOutcomes));
    return catalog.crafting.fossils.filter((fossil) => ids.has(fossil.id));
}

// The reference represents Gilded's vendor implicit with this extracted modifier.
export const gildedImplicitId = "DoubleModSellPrice1";

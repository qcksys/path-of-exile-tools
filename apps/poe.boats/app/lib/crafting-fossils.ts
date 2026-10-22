import type { CraftingCatalog } from "../schemas/crafting";

export function resonatorAvailability(id: string) {
    if (/^Metadata\/Items\/Delve\/DelveSocketableCurrency(?:Upgrade|Reroll)[1-4]$/.test(id))
        return "legacy";
    if (/^Metadata\/Items\/Delve\/DelveStackableSocketableCurrencyUpgrade[1-4]$/.test(id))
        return "ruthless";
    return undefined;
}

export function tangledFossilOutcomes(catalog: CraftingCatalog) {
    const ids = new Set(catalog.crafting.fossils.flatMap((fossil) => fossil.randomOutcomes));
    return catalog.crafting.fossils.filter((fossil) => ids.has(fossil.id));
}

// The reference represents Gilded's vendor implicit with this extracted modifier.
export const gildedImplicitId = "DoubleModSellPrice1";

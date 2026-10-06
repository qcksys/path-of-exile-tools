import type { CraftingCatalog, CraftingItem } from "../schemas/crafting";

// Reference operation model, not a client-extracted stat range or server probability table.
export const jewelCorruptionRange = { min: 78, max: 122 };
export const tabletCorruptionUses = 10;

export function supportsLocus(catalog: CraftingCatalog, item: Pick<CraftingItem, "baseId">) {
    return Boolean(
        catalog.game === "poe1" &&
            catalog.crafting.locus &&
            catalog.crafting.classes[catalog.bases[item.baseId]!.item_class]?.doubleCorrupt,
    );
}

export function supportsTempleCorruption(
    catalog: CraftingCatalog,
    item: Pick<CraftingItem, "baseId">,
    action: string,
) {
    const currency = catalog.crafting.currencies.find((entry) => entry.action === action);
    return Boolean(
        currency &&
            catalog.crafting.templeCorruption?.currencies
                .find((entry) => entry.id === currency.id)
                ?.itemClasses.includes(catalog.bases[item.baseId]!.item_class),
    );
}

export function supportsTabletCorruption(
    catalog: CraftingCatalog,
    item: Pick<CraftingItem, "baseId">,
) {
    return supportsTempleCorruption(catalog, item, "incursion_corrupt_tablet");
}

export function corruptionStatRange(
    catalog: CraftingCatalog,
    item: CraftingItem,
    id: string,
    index: number,
) {
    const stat = catalog.mods[id]!.stats[index]!;
    const extra =
        item.corrupted &&
        supportsTabletCorruption(catalog, item) &&
        catalog.bases[item.baseId]!.implicits[0] === id &&
        index === 0;
    return { min: stat.min, max: stat.max + (extra ? tabletCorruptionUses : 0) };
}

export function supportsJewelCorruption(
    catalog: CraftingCatalog,
    item: Pick<CraftingItem, "baseId">,
) {
    const base = catalog.bases[item.baseId]!;
    return (
        catalog.game === "poe2" &&
        base.item_class === "Jewel" &&
        catalog.crafting.classes[base.item_class]?.corrupt
    );
}

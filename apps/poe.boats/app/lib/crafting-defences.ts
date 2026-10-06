import {
    type CraftingCatalog,
    type CraftingItem,
    type CraftingTarget,
    craftingDefenceKeySchema,
} from "../schemas/crafting";

export const baseDefenceNames = {
    armour: "Armour",
    evasion: "Evasion Rating",
    // biome-ignore lint/style/useNamingConvention: Matches the canonical extracted property key.
    energy_shield: "Energy Shield",
    ward: "Ward",
};

export function baseDefenceEntries(catalog: CraftingCatalog, item: Pick<CraftingItem, "baseId">) {
    const defences = catalog.bases[item.baseId]!.defences;
    return craftingDefenceKeySchema.options.flatMap((key) =>
        defences[key] ? [{ key, range: defences[key]!, name: baseDefenceNames[key] }] : [],
    );
}

export function baseDefenceValue(
    catalog: CraftingCatalog,
    item: CraftingItem,
    key: keyof typeof baseDefenceNames,
) {
    const range = catalog.bases[item.baseId]!.defences[key];
    if (!range) return 0;
    return item.baseDefences?.[key] ?? (range.min === range.max ? range.min : undefined);
}

export function validateBaseDefences(catalog: CraftingCatalog, item: CraftingItem) {
    for (const key of craftingDefenceKeySchema.options) {
        const value = item.baseDefences?.[key];
        if (value === undefined) continue;
        const range = catalog.bases[item.baseId]!.defences[key];
        if (!range || value < range.min || value > range.max)
            throw new Error(
                `Base ${baseDefenceNames[key]} must be within this base's extracted range.`,
            );
    }
}

export function matchesBaseDefences(
    catalog: CraftingCatalog,
    item: CraftingItem,
    target: CraftingTarget,
) {
    return craftingDefenceKeySchema.options.every((key) => {
        const required = target.baseDefences?.[key];
        if (!required) return true;
        const value = baseDefenceValue(catalog, item, key);
        if (value === undefined)
            throw new Error(
                `Set the starting Base ${baseDefenceNames[key]} roll before checking this requirement.`,
            );
        return value >= required.min && value <= required.max;
    });
}

export function supportsSacredOrb(catalog: CraftingCatalog, item: CraftingItem) {
    const armourQuality = catalog.crafting.currencies.find(
        (entry) => entry.action === "add_armour_quality",
    );
    return (
        catalog.game === "poe1" &&
        baseDefenceEntries(catalog, item).length > 0 &&
        catalog.crafting.baseQuality.some(
            (entry) =>
                entry.id === armourQuality?.id &&
                entry.itemClasses.includes(catalog.bases[item.baseId]!.item_class),
        )
    );
}

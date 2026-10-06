import type { CraftingCatalog, CraftingItem, CraftingMethod } from "../schemas/crafting";
import { socketedStats } from "./crafting-augments";
import { cleanModText } from "./crafting-text";

export function blightedMap(catalog: CraftingCatalog, item: Pick<CraftingItem, "blight">) {
    return catalog.crafting.anointing.maps.find((entry) => entry.mod === item.blight);
}

export function blightedMapName(catalog: CraftingCatalog, item: Pick<CraftingItem, "blight">) {
    return blightedMap(catalog, item)?.ravaged ? "Blight-ravaged" : "Blighted";
}

export function anointingRecipes(method: Extract<CraftingMethod, { kind: "anoint" }>) {
    return [method.id, ...(method.additional ?? [])];
}

export function mapOilLimit(catalog: CraftingCatalog) {
    return catalog.crafting.anointing.maps.find((entry) => !entry.ravaged)?.maximumAnointments ?? 0;
}

export function validateAnointments(catalog: CraftingCatalog, item: CraftingItem) {
    const map = blightedMap(catalog, item);
    if (
        item.blight &&
        (!map || catalog.game !== "poe1" || catalog.bases[item.baseId]?.item_class !== "Map")
    )
        throw new Error("Blight requires an extracted PoE 1 Blighted Map modifier on a map.");
    if ((item.anointments?.length ?? 0) > (map?.maximumAnointments ?? 1))
        throw new Error("Anointment count exceeds this item's supported limit.");
    if (!item.anointments?.length) return;
    const allowed = new Set(availableAnointments(catalog, item).map((entry) => entry.id));
    for (const id of item.anointments ?? []) {
        if (!allowed.has(id))
            throw new Error("This anointment is not available on this item base.");
        if (
            map &&
            (item.anointments?.filter((entry) => entry === id).length ?? 0) > mapOilLimit(catalog)
        )
            throw new Error(
                `A Blighted Map cannot use more than ${mapOilLimit(catalog)} of the same oil.`,
            );
    }
}

export function anointment(catalog: CraftingCatalog, id: string) {
    const recipe = catalog.crafting.anointing.recipes.find((entry) => entry.id === id);
    if (!recipe || (!recipe.passive && !recipe.mod))
        throw new Error("This anointing recipe has no resolved outcome in the extracted build.");
    return recipe;
}

export function anointmentText(catalog: CraftingCatalog, id: string) {
    const recipe = anointment(catalog, id);
    return recipe.passive
        ? `Allocates ${catalog.crafting.anointing.passives[recipe.passive]!.name}`
        : cleanModText(catalog.mods[recipe.mod!]!.text ?? recipe.mod!);
}

export function anointmentKey(catalog: CraftingCatalog, id: string) {
    const recipe = anointment(catalog, id);
    return recipe.passive ? `passive:${recipe.passive}` : `mod:${recipe.mod}`;
}

export function availableAnointments(catalog: CraftingCatalog, item: CraftingItem) {
    const base = catalog.bases[item.baseId];
    if (base?.item_class === "Map" && blightedMap(catalog, item))
        return catalog.crafting.anointing.recipes.filter(
            (recipe) => recipe.type === "InfectedMap" && Boolean(recipe.mod),
        );
    const granted =
        (socketedStats(catalog, item).get("local_item_can_be_instilled") ?? 0) > 0 ||
        [...item.mods, ...item.implicits].some((rolled) =>
            catalog.mods[rolled.id]!.stats.some(
                (stat, index) =>
                    ["local_can_be_anointed", "local_item_can_be_instilled"].includes(stat.id) &&
                    (rolled.values[index] ?? 0) > 0,
            ),
        );
    return catalog.crafting.anointing.recipes.filter((recipe) => {
        if (recipe.passive)
            return (
                (catalog.game === "poe2" || recipe.type === "UniqueOrAmulet") &&
                (base?.item_class === "Amulet" || granted)
            );
        return (
            catalog.game === "poe1" &&
            recipe.mod &&
            recipe.type === "Ring" &&
            base?.item_class === "Ring"
        );
    });
}

export function anointingOils(catalog: CraftingCatalog, item: CraftingItem) {
    if (catalog.game !== "poe1") return [];
    return catalog.crafting.anointing.items
        .filter(
            (entry) =>
                (entry.useType === 1 && item.corrupted) || (entry.useType === 2 && item.mirrored),
        )
        .map((entry) => entry.id);
}

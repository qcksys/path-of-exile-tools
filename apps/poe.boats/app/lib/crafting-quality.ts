import type { CraftingCatalog, CraftingItem } from "../schemas/crafting";
import { augmentRule, augmentStats } from "./crafting-augments";

export function availableCatalysts(catalog: CraftingCatalog, item: Pick<CraftingItem, "baseId">) {
    const itemClass = catalog.bases[item.baseId]!.item_class;
    return catalog.crafting.catalysts.filter((entry) => entry.itemClasses.includes(itemClass));
}

export function availableBaseQuality(catalog: CraftingCatalog, item: Pick<CraftingItem, "baseId">) {
    const itemClass = catalog.bases[item.baseId]!.item_class;
    return catalog.crafting.baseQuality.filter(
        (entry) =>
            entry.itemClasses.includes(itemClass) && (catalog.game === "poe1" || !entry.corrupted),
    );
}

export function availableMapQuality(catalog: CraftingCatalog, item: Pick<CraftingItem, "baseId">) {
    if (catalog.game !== "poe1") return [];
    const itemClass = catalog.bases[item.baseId]!.item_class;
    return catalog.crafting.mapQuality.filter((entry) => entry.itemClasses.includes(itemClass));
}

export function mapQualityRecipe(
    catalog: CraftingCatalog,
    item: Pick<CraftingItem, "baseId" | "mapQuality">,
) {
    return availableMapQuality(catalog, item).find((entry) =>
        item.mapQuality
            ? entry.id === item.mapQuality
            : entry.stats.includes("map_item_drop_quantity_+%"),
    );
}

export function mapQualityIncrement(item: Pick<CraftingItem, "rarity">) {
    return item.rarity === "normal" ? 5 : item.rarity === "magic" ? 2 : 1;
}

export function baseQualityOutcomes(catalog: CraftingCatalog, item: CraftingItem, id: string) {
    const recipe = catalog.crafting.baseQuality.find((entry) => entry.id === id)!;
    return recipe.corrupted
        ? Array.from({ length: recipe.maximumQuality + 1 }, (_, value) => ({ value, weight: 1 }))
        : qualityIncrementOutcomes(catalog, item, recipe.maximumQuality);
}

export function baseQualityLimit(catalog: CraftingCatalog, item: CraftingItem) {
    let maximum =
        availableBaseQuality(catalog, item).find((entry) => !entry.corrupted)?.maximumQuality ?? 0;
    if (catalog.game !== "poe2") return maximum;
    let additional = 0;
    for (const id of item.augments ?? []) {
        const stats = augmentStats(catalog, item, id);
        maximum = stats.get("local_maximum_quality_is_%") ?? maximum;
        additional += stats.get("local_maximum_quality_+") ?? 0;
    }
    return maximum + additional;
}

export function retainedBaseQualityLimit(catalog: CraftingCatalog, item: CraftingItem) {
    if (catalog.game === "poe1")
        return item.corrupted && catalog.bases[item.baseId]!.domain === "flask" ? 40 : 30;
    const extra =
        availableQualityInfusers(catalog, item).find((entry) => entry.qualityType === "base")
            ?.extraMaximumQuality ?? 0;
    let maximum = Math.max(30, baseQualityLimit(catalog, item) + extra);
    const itemClass = catalog.bases[item.baseId]!.item_class;
    for (const entry of catalog.crafting.augments) {
        if (
            !augmentRule(catalog, item, entry)?.stats.some(
                (stat) => stat.id === "local_maximum_quality_is_%",
            )
        )
            continue;
        const previous = { ...item, augments: [entry.id] };
        maximum = Math.max(maximum, baseQualityLimit(catalog, previous) + extra);
        // The model retains quality after replacing its Rune or augment-effect essence modifier.
        for (const essence of catalog.crafting.poe2Essences) {
            for (const rule of essence.rules) {
                if (!rule.mod || !rule.itemClasses.includes(itemClass)) continue;
                const mod = catalog.mods[rule.mod]!;
                if (
                    !mod.stats.some(
                        (stat) =>
                            stat.id === entry.type.effectStat ||
                            stat.id === "local_socketed_items_effect_+%",
                    )
                )
                    continue;
                maximum = Math.max(
                    maximum,
                    baseQualityLimit(catalog, {
                        ...previous,
                        mods: [
                            ...item.mods.filter(
                                (rolled) =>
                                    !catalog.mods[rolled.id]!.groups.some((group) =>
                                        mod.groups.includes(group),
                                    ),
                            ),
                            {
                                id: rule.mod,
                                values: mod.stats.map((stat) => stat.max),
                                crafted: true,
                                fractured: false,
                            },
                        ],
                    }) + extra,
                );
            }
        }
    }
    return maximum;
}

export function availableQualityInfusers(
    catalog: CraftingCatalog,
    item: Pick<CraftingItem, "baseId">,
) {
    if (catalog.game !== "poe2") return [];
    const itemClass = catalog.bases[item.baseId]!.item_class;
    return catalog.crafting.qualityInfusers.filter((entry) =>
        entry.itemClasses.includes(itemClass),
    );
}

export function qualityInfuserState(catalog: CraftingCatalog, item: CraftingItem, id: string) {
    const recipe = availableQualityInfusers(catalog, item).find((entry) => entry.id === id);
    if (!recipe) return;
    const defaultMaximum =
        recipe.qualityType === "catalyst"
            ? availableCatalysts(catalog, item)[0]!.maximumQuality
            : availableBaseQuality(catalog, item).find((entry) => !entry.corrupted)!.maximumQuality;
    const maximum =
        recipe.qualityType === "catalyst"
            ? catalystLimit(catalog, item)
            : baseQualityLimit(catalog, item);
    const quality =
        recipe.qualityType === "catalyst" ? (item.catalyst?.quality ?? 0) : item.quality;
    return {
        recipe,
        quality,
        maximum,
        limit: maximum + recipe.extraMaximumQuality,
        increments: qualityIncrementOutcomes(catalog, item, defaultMaximum),
        // The reference rolls this chance using quality before the increment.
        corruptionChance: Math.min(100, Math.max(0, 5 * (quality - maximum))),
    };
}

export function catalystName(catalog: CraftingCatalog, id: string) {
    return catalog.crafting.currencies.find((entry) => entry.id === id)!.name;
}

export function catalystLimit(catalog: CraftingCatalog, item: CraftingItem) {
    let maximum = availableCatalysts(catalog, item)[0]?.maximumQuality ?? 0;
    let additional = 0;
    for (const rolled of [...item.implicits, ...item.mods]) {
        for (const [index, stat] of catalog.mods[rolled.id]!.stats.entries()) {
            const value = Math.round(
                (rolled.values[index]! * (rolled.sanctification ?? rolled.corruptionScale ?? 100)) /
                    100,
            );
            if (stat.id === "local_maximum_quality_is_%") maximum = value;
            if (stat.id === "local_maximum_quality_+") additional += value;
        }
    }
    return maximum + additional;
}

export function catalystQualityOutcomes(catalog: CraftingCatalog, item: CraftingItem) {
    const maximum = catalog.crafting.catalysts[0]?.maximumQuality ?? 0;
    return qualityIncrementOutcomes(catalog, item, maximum);
}

export function taintedCatalystOutcomes(catalog: CraftingCatalog, item: CraftingItem, id: string) {
    if (catalog.game !== "poe1") return [];
    const recipe = catalog.crafting.taintedCatalysts.find((entry) => entry.id === id);
    if (!recipe?.itemClasses.includes(catalog.bases[item.baseId]!.item_class)) return [];
    return availableCatalysts(catalog, item).flatMap((entry) =>
        Array.from({ length: recipe.maximumQuality }, (_, index) => ({
            value: { id: entry.id, quality: index + 1 },
            weight: 1,
        })),
    );
}

export function catalysingMultiplier(catalog: CraftingCatalog, item: CraftingItem) {
    if (catalog.game !== "poe2" || !item.catalyst?.quality) return 1;
    const maximum = catalog.crafting.catalysts.find(
        (entry) => entry.id === item.catalyst!.id,
    )!.maximumQuality;
    const quality = item.catalyst.quality;
    // Reference weighting model; these coefficients are not extracted server probabilities.
    return 1 + (20 * Math.min(quality, maximum) + 12 * Math.max(0, quality - maximum)) / 100;
}

function qualityIncrementOutcomes(catalog: CraftingCatalog, item: CraftingItem, maximum: number) {
    // The client does not expose this per-use curve; this is Craft of Exile's model.
    const amount = Math.round(
        Math.max(1, Math.min(30 * Math.exp(-item.level / 30) - 0.3, maximum)),
    );
    return catalog.game === "poe2" && amount === 1
        ? [
              { value: 1, weight: 4 },
              { value: 2, weight: 1 },
          ]
        : [{ value: amount, weight: 1 }];
}

export function retainedCatalystLimit(catalog: CraftingCatalog, item: CraftingItem) {
    if (catalog.game !== "poe2") return catalystLimit(catalog, item);
    const previous = {
        ...item,
        implicits: [
            ...item.implicits,
            ...catalog.bases[item.baseId]!.implicits.filter(
                (id) =>
                    !item.implicits.some((entry) => entry.id === id) &&
                    catalog.mods[id]!.stats.some((stat) =>
                        ["local_maximum_quality_+", "local_maximum_quality_is_%"].includes(stat.id),
                    ),
            ).map((id) => ({
                id,
                values: catalog.mods[id]!.stats.map((stat) => stat.max),
                crafted: false,
                fractured: false,
            })),
        ],
    };
    const current = catalystLimit(catalog, previous);
    const itemClass = catalog.bases[item.baseId]!.item_class;
    const limits = catalog.crafting.poe2Essences.flatMap((essence) =>
        essence.rules.flatMap((rule) => {
            if (!rule.mod || !rule.itemClasses.includes(itemClass)) return [];
            const mod = catalog.mods[rule.mod]!;
            if (!mod.stats.some((stat) => stat.id === "local_maximum_quality_+")) return [];
            // Quality remains after the essence modifier is removed.
            return catalystLimit(catalog, {
                ...previous,
                mods: [
                    ...item.mods.filter(
                        (entry) =>
                            !catalog.mods[entry.id]!.groups.some((group) =>
                                mod.groups.includes(group),
                            ),
                    ),
                    {
                        id: rule.mod,
                        values: mod.stats.map((stat) => stat.max),
                        crafted: true,
                        fractured: false,
                    },
                ],
            });
        }),
    );
    const infuser = availableQualityInfusers(catalog, item).find(
        (entry) => entry.qualityType === "catalyst",
    );
    return Math.max(current, ...limits) + (infuser?.extraMaximumQuality ?? 0);
}

export function catalystEffect(catalog: CraftingCatalog, item: CraftingItem, id: string) {
    if (!item.catalyst) return 0;
    const catalyst = catalog.crafting.catalysts.find((entry) => entry.id === item.catalyst!.id);
    const mod = catalog.mods[id]!;
    if (!catalyst) return 0;
    const explicit = ["prefix", "suffix"].includes(mod.generation_type);
    if (explicit ? !catalyst.explicit : !catalyst.implicit) return 0;
    if (catalyst.prefix || catalyst.suffix) {
        if (mod.generation_type === "prefix" ? !catalyst.prefix : !catalyst.suffix) return 0;
    }
    if (catalyst.tags.length && !catalyst.tags.some((tag) => mod.implicit_tags.includes(tag)))
        return 0;
    return item.catalyst.quality;
}

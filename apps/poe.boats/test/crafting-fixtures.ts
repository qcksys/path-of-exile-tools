import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CraftingEngine } from "../app/lib/crafting-engine";
import {
    type CraftingCatalog,
    type CraftingMethod,
    craftingCatalogSchema,
} from "../app/schemas/crafting";

export const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync(resolve("public/game-data/crafting-poe1.json"), "utf8")),
);
export const engine = new CraftingEngine(catalog);
let poe2Catalog: CraftingCatalog | undefined;
export function getCatalog(game: "poe1" | "poe2") {
    if (game === "poe1") return catalog;
    poe2Catalog ??= craftingCatalogSchema.parse(
        JSON.parse(readFileSync(resolve("public/game-data/crafting-poe2.json"), "utf8")),
    );
    return poe2Catalog;
}
export const baseId = "Metadata/Items/Armours/BodyArmours/BodyStr1";
// From 3.30 each prefix or suffix lock has a modifier per group of item classes.
export const lockRecipe = (side: "prefixes" | "suffixes", item: { baseId: string }) => {
    const recipe = catalog.crafting.bench.find(
        (entry) =>
            entry.mod &&
            entry.itemClasses.includes(catalog.bases[item.baseId]!.item_class) &&
            engine
                .mod(entry.mod)
                .stats.some((stat) => stat.id === `item_generation_cannot_change_${side}`),
    );
    if (!recipe) throw new Error(`Missing fixture ${side} lock for ${item.baseId}`);
    return recipe;
};
// Bench recipe IDs are client row positions that move between builds; look them up instead.
export const benchId = (mod: string, itemClass = "Body Armour") => {
    const recipe = engine.benchRecipeFor(mod, itemClass);
    if (!recipe) throw new Error(`Missing fixture bench craft: ${mod} on ${itemClass}`);
    return recipe.id;
};
export const currency = (action: string): Extract<CraftingMethod, { kind: "currency" }> => {
    const entry = catalog.crafting.currencies.find((entry) => entry.action === action);
    if (!entry) throw new Error(`Missing fixture currency: ${action}`);
    return { kind: "currency", id: entry.id };
};

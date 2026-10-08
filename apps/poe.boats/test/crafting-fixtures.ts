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
export const currency = (action: string): Extract<CraftingMethod, { kind: "currency" }> => {
    const entry = catalog.crafting.currencies.find((entry) => entry.action === action);
    if (!entry) throw new Error(`Missing fixture currency: ${action}`);
    return { kind: "currency", id: entry.id };
};

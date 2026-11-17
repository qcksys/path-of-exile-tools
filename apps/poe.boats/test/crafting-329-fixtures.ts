import { CraftingEngine } from "../app/lib/crafting-engine";
import { craftingCatalogSchema } from "../app/schemas/crafting";
import { historyIndex, retainedRevision } from "./crafting-history-fixtures";

// The PoE 1 3.29 catalog, published as r17. Tests of 3.29 mechanics use it, including market
// tests of prepared Temple suffixes, which 3.30 removed.
export const ruleset329 = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r17",
)!;
export const catalog329 = craftingCatalogSchema.parse((await retainedRevision(ruleset329)).catalog);
export const engine329 = new CraftingEngine(catalog329);

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { itemQuerySchema } from "@poe-tools/item-query";
import { CraftingEngine } from "../app/lib/crafting-engine";
import { loadCraftingRevision } from "../app/lib/crafting-ruleset-loader";
import { rulesetReference, validateRulesetIndex } from "../app/lib/crafting-rulesets";
import { craftingRuntimes } from "../app/lib/crafting-runtimes.generated";
import { craftingCatalogSchema } from "../app/schemas/crafting";
import { craftingGraphSchema } from "../app/schemas/crafting-graph";
import type { CraftingRuleset } from "../app/schemas/crafting-rulesets";

export const historyIndex = validateRulesetIndex(
    JSON.parse(readFileSync(new URL("../crafting-history/index.json", import.meta.url), "utf8")),
);
export const retainedRevision = (ruleset: CraftingRuleset) =>
    loadCraftingRevision(
        ruleset,
        async (path) => new Uint8Array(await readFile(`public${path}`)),
        async (entry) => craftingRuntimes[entry.engine]!,
    );

export function retainedTransmuteGraph(ruleset: CraftingRuleset, catalog: unknown) {
    const data = craftingCatalogSchema.parse(catalog);
    const engine = new CraftingEngine(data);
    const baseId = Object.entries(data.bases).find(
        ([, base]) =>
            base.item_class === "Ring" && !base.corrupted && base.rarities.includes("normal"),
    )![0];
    const currency = data.crafting.currencies.find(
        (entry) => entry.action === "transmute_to_magic",
    )!;
    const any = itemQuerySchema.parse({ game: ruleset.game });
    const magic = itemQuerySchema.parse({
        game: ruleset.game,
        groups: [{ type: "and", filters: [{ kind: "rarity", values: ["Magic"] }] }],
    });
    const price = (amount: number) => ({
        amount,
        currency: "chaos",
        source: "manual",
        confidence: null,
    });
    return craftingGraphSchema.parse({
        format: 1,
        id: "retained",
        name: "Retained transmutation",
        game: ruleset.game,
        ruleset: rulesetReference(ruleset),
        nodes: [
            {
                kind: "acquire",
                id: "buy",
                name: "Base",
                output: any,
                alternatives: [
                    {
                        kind: "purchase",
                        id: "base",
                        name: "Buy base",
                        item: engine.createItem(baseId, 86),
                        price: price(10),
                    },
                ],
            },
            {
                kind: "craft",
                id: "transmute",
                name: "Transmute",
                output: magic,
                inputs: [{ id: "base", name: "Base", source: "buy" }],
                method: { kind: "currency", id: currency.id },
            },
        ],
        entry: "transmute",
        outcomes: [{ id: "magic", name: "Magic ring", query: magic }],
        prices: { [currency.id]: price(1) },
        iterations: 3,
    });
}

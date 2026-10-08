import { itemQuerySchema } from "@poe-tools/item-query";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { historyIndex, retainedTransmuteGraph } from "./crafting-history-fixtures";
import { workbenchCatalog } from "./crafting-workbench-fixtures";

export function conditionalTransmuteGraph(game: "poe1" | "poe2") {
    const catalog = workbenchCatalog(game);
    const ruleset = historyIndex.revisions.find(
        (entry) => entry.game === game && entry.revision === "r7",
    )!;
    const graph = retainedTransmuteGraph(ruleset, catalog);
    const craft = graph.nodes.find((node) => node.kind === "craft")!;
    const purchase = graph.nodes[0]!;
    if (purchase.kind !== "acquire" || purchase.alternatives[0]!.kind !== "purchase")
        throw new Error("Fixture");
    purchase.alternatives[0]!.item = new CraftingEngine(catalog).apply(
        purchase.alternatives[0]!.item,
        craft.method,
        seededRandom(42),
    ).item;
    craft.applyWhen = itemQuerySchema.parse({
        game,
        groups: [{ type: "and", filters: [{ kind: "rarity", values: ["Normal"] }] }],
    });
    return graph;
}

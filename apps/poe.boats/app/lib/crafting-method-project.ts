import { itemQuerySchema } from "@poe-tools/item-query";
import type { z } from "zod";
import { craftingGraphSchema } from "../schemas/crafting-graph";
import type { projectFromMethodInputSchema } from "../schemas/crafting-method-project";
import type { CraftingRuleset } from "../schemas/crafting-rulesets";
import type { CraftingEngine } from "./crafting-engine";
import { projectFromItem } from "./crafting-graph-authoring";
import { graphInputCount } from "./crafting-graph-validation";
import { resolveRuleset, rulesetAllowsMethod } from "./crafting-rulesets";

export function projectFromMethod(
    engine: CraftingEngine,
    ruleset: CraftingRuleset,
    input: z.infer<typeof projectFromMethodInputSchema>,
) {
    resolveRuleset({ format: 1, revisions: [ruleset], latest: [] }, input.game, input.ruleset);
    if (
        engine.catalog.game !== input.game ||
        ruleset.game !== input.game ||
        engine.catalog.patch !== ruleset.patch ||
        engine.catalog.manifestSha256 !== ruleset.manifestSha256 ||
        engine.catalog.craftingSha256 !== ruleset.craftingSha256
    )
        throw new Error("The selected craft needs its matching game and catalog revision.");
    const item = engine.validateItem(input.item);
    const method = engine.validateMethod(input.method);
    if (!rulesetAllowsMethod(ruleset, method))
        throw new Error("This craft is unavailable in the selected era.");
    const graph = projectFromItem(ruleset, item, input.name, input.price);
    const base = graph.nodes[0]!;
    if (base.kind !== "acquire") throw new Error("Expected a purchased input.");
    base.choice = { mode: "pinned", alternativeId: "buy" };
    graph.prices = structuredClone(input.prices);
    for (const price of Object.values(graph.prices))
        if (price.currency !== graph.currency)
            throw new Error("Craft prices must use the project's comparison currency.");
    const inputs = [{ id: "item", name: "Item", source: base.id }];
    const donor =
        "donor" in method
            ? method.donor
            : method.kind === "socket_jewel"
              ? method.jewel
              : undefined;
    if (graphInputCount(engine.catalog, method) === 2) {
        if (!donor)
            throw new Error("Choose the second item before sending this craft to a project.");
        const priceId = `donor:${donor.id}`;
        graph.nodes.push({
            kind: "acquire",
            id: "donor",
            name: donor.name,
            output: itemQuerySchema.parse({ game: input.game }),
            choice: { mode: "pinned", alternativeId: "buy" },
            alternatives: [
                {
                    kind: "purchase",
                    id: "buy",
                    name: `Buy ${donor.name}`,
                    item: engine.validateItem(donor.item),
                    price: graph.prices[priceId] ?? null,
                },
            ],
        });
        delete graph.prices[priceId];
        inputs.push({
            id: "donor",
            name: method.kind === "socket_jewel" ? "Jewel" : "Donor",
            source: "donor",
        });
    } else if (donor) {
        throw new Error("This method does not consume a second item.");
    }
    const connectedMethod =
        "donor" in method
            ? { ...method, donor: undefined }
            : method.kind === "socket_jewel"
              ? { ...method, jewel: undefined }
              : method;
    graph.nodes.push({
        kind: "craft",
        id: "craft",
        name: engine.methodName(method),
        output: itemQuerySchema.parse({ game: input.game }),
        inputs,
        method: connectedMethod,
        branches: [],
        ordering: "automatic",
        fallback: { kind: "return" },
    });
    graph.entry = "craft";
    graph.outcomes[0]!.name = "Craft result";
    return craftingGraphSchema.parse(graph);
}

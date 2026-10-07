import type { z } from "zod";
import { craftingGraphSchema } from "../schemas/crafting-graph";
import type { replaceGraphMethodInputSchema } from "../schemas/crafting-graph-authoring";
import type { CraftingRuleset } from "../schemas/crafting-rulesets";
import type { CraftingEngine } from "./crafting-engine";
import { graphInputCount } from "./crafting-graph-validation";
import { resolveRuleset, rulesetAllowsMethod } from "./crafting-rulesets";

export function replaceGraphMethod(
    engine: CraftingEngine,
    ruleset: CraftingRuleset,
    input: z.infer<typeof replaceGraphMethodInputSchema>,
) {
    const graph = craftingGraphSchema.parse(input.graph);
    resolveRuleset({ format: 1, revisions: [ruleset], latest: [] }, graph.game, graph.ruleset);
    if (
        engine.catalog.game !== graph.game ||
        engine.catalog.patch !== ruleset.patch ||
        engine.catalog.manifestSha256 !== ruleset.manifestSha256 ||
        engine.catalog.craftingSha256 !== ruleset.craftingSha256
    )
        throw new Error("Method editing requires the project's matching catalog revision.");
    const node = graph.nodes.find((entry) => entry.id === input.nodeId);
    if (node?.kind !== "craft") throw new Error("Choose a crafting step.");
    if (JSON.stringify(node.method) !== JSON.stringify(engine.validateMethod(input.expectedMethod)))
        throw new Error(
            "This method changed while the editor was open. Reopen it before applying.",
        );
    const method = engine.validateMethod(input.method);
    if (!rulesetAllowsMethod(ruleset, method))
        throw new Error("This craft is unavailable in the selected era.");
    if (("donor" in method && method.donor) || (method.kind === "socket_jewel" && method.jewel))
        throw new Error(
            "Connect the second item through a graph input instead of an inventory snapshot.",
        );
    const count = graphInputCount(engine.catalog, method);
    const removed = new Set(node.inputs.slice(count).map((port) => port.id));
    for (const source of graph.nodes) {
        if (source.kind !== "craft") continue;
        for (const route of [
            source.fallback,
            ...source.branches.map((branch) => branch.destination),
        ])
            if (route.kind === "recover" && route.nodeId === node.id && removed.has(route.inputId))
                throw new Error("Reconnect recovery routes before removing their consuming input.");
    }
    node.inputs = node.inputs.slice(0, count);
    if (node.inputs.length < count) {
        let id = "input-2";
        while (node.inputs.some((port) => port.id === id)) id += "-2";
        node.inputs.push({ id, name: "Item 2", source: node.inputs[0]!.source });
    }
    node.method = method;
    return craftingGraphSchema.parse(graph);
}

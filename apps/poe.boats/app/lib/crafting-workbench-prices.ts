import type { CraftingProject } from "../schemas/crafting";
import type { CraftingGraph } from "../schemas/crafting-graph";
import type { CraftingRuleset } from "../schemas/crafting-rulesets";
import type { CraftingEngine } from "./crafting-engine";
import { projectFromItem } from "./crafting-graph-authoring";
import { assertCraftingSourcePrices } from "./crafting-sources";

export function workbenchPriceGraph(
    engine: CraftingEngine,
    project: CraftingProject,
    ruleset: CraftingRuleset,
    league: string,
): CraftingGraph {
    if (
        ruleset.game !== engine.catalog.game ||
        project.game !== engine.catalog.game ||
        ruleset.patch !== project.patch ||
        ruleset.patch !== engine.catalog.patch ||
        ruleset.manifestSha256 !== engine.catalog.manifestSha256 ||
        ruleset.craftingSha256 !== engine.catalog.craftingSha256
    )
        throw new Error("Price lookup requires the workbench's matching catalog revision.");
    return {
        ...projectFromItem(ruleset, project.item, "Workbench price lookup"),
        league: league.trim() || undefined,
        prices: Object.fromEntries(
            Object.entries(project.prices).map(([id, amount]) => [
                id,
                {
                    amount,
                    currency: "chaos",
                    source: "manual" as const,
                    confidence: null,
                },
            ]),
        ),
    };
}

export function copyWorkbenchMarketPrices(
    project: CraftingProject,
    graph: CraftingGraph,
    league: string,
    ids: string[],
): CraftingProject["prices"] {
    if (
        graph.game !== project.game ||
        graph.ruleset.patch !== project.patch ||
        graph.currency !== "chaos" ||
        graph.league !== league.trim()
    )
        throw new Error("The price lookup does not match this workbench's game, build or league.");
    const prices = { ...project.prices };
    assertCraftingSourcePrices({
        ...graph,
        prices: Object.fromEntries(
            ids.flatMap((id) => (graph.prices[id] ? [[id, graph.prices[id]]] : [])),
        ),
    });
    for (const id of ids) {
        const price = graph.prices[id];
        if (price?.source !== "market") continue;
        if (price.currency !== "chaos") throw new Error("Workbench prices must be in chaos.");
        prices[id] = price.amount;
    }
    return prices;
}

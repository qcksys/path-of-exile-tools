import { itemQuerySchema } from "@poe-tools/item-query";
import { seededRandom } from "../app/lib/crafting-engine";
import { CRAFTING_GRAPH_ENGINE } from "../app/lib/crafting-graph-validation";
import { purchaseSourceProfile } from "../app/lib/crafting-source-preparation";
import type { CraftingGraph } from "../app/schemas/crafting-graph";
import { craftingMarketCandidateSchema } from "../app/schemas/crafting-market";
import { catalog, engine } from "./crafting-fixtures";
import { marketCandidate, marketGraph } from "./crafting-market-fixtures";

const fractureId = "BreachBodyCriticalChanceIncreasedByUncappedLightningResistance1";
const baseId = Object.entries(catalog.bases).find(
    ([, base]) => base.name === "Conquest Lamellar",
)![0];

export function sourceMarketPurchase(graph: CraftingGraph) {
    const node = graph.nodes[0]!;
    if (node.kind !== "acquire" || node.alternatives[0]?.kind !== "purchase")
        throw new Error("Missing source purchase fixture.");
    return { node, alternative: node.alternatives[0] };
}

export function sourceMarketFixture(
    crafted = true,
    enchanted = true,
    ruleset?: CraftingGraph["ruleset"],
) {
    const graph = marketGraph();
    graph.ruleset = ruleset ?? { ...graph.ruleset, engine: CRAFTING_GRAPH_ENGINE, revision: "r11" };
    graph.iterations = 1;
    graph.seed = 42;
    const { node, alternative } = sourceMarketPurchase(graph);
    alternative.item = engine.validateItem({
        ...engine.createItem(baseId, 86),
        rarity: "rare",
        mods: [{ ...engine.rollMod(fractureId, seededRandom(1)), fractured: true }],
    });
    alternative.sourcePreparation = {
        kind: "fractured-fossil-v1",
        fractureId,
        crafted,
        enchanted,
        fossils: {
            kind: "fossils",
            ids: [catalog.crafting.fossils.find((entry) => entry.name === "Jagged Fossil")!.id],
            resonator: "Metadata/Items/Delve/DelveStackableSocketableCurrencyReroll1",
            logic: "additive",
        },
    };
    node.output = itemQuerySchema.parse({
        game: "poe1",
        groups: [{ type: "and", filters: [{ kind: "mod", ids: [fractureId], fractured: true }] }],
    });
    graph.outcomes[0]!.query = node.output;
    const profile = purchaseSourceProfile(alternative)!;
    const candidate = craftingMarketCandidateSchema.parse({
        ...structuredClone(marketCandidate),
        sourcePreparation: profile,
        definition: {
            ...marketCandidate.definition,
            id: `source:conquest:${crafted}:${enchanted}`,
            purpose: "fracture",
            query: {
                game: "poe1",
                sourcePreparation: profile,
                groups: [
                    {
                        type: "and",
                        filters: [
                            { kind: "base", field: "baseId", values: [baseId] },
                            { kind: "base", field: "baseType", values: ["Conquest Lamellar"] },
                            { kind: "rarity", values: ["Rare"] },
                            { kind: "range", field: "ilvl", value: { min: 86, max: 86 } },
                            { kind: "range", field: "prefixes", value: { min: 0, max: 0 } },
                            { kind: "range", field: "suffixes", value: { min: 1, max: 1 } },
                            {
                                kind: "mod",
                                ids: [fractureId],
                                side: "suffix",
                                fractured: true,
                                count: { min: 1, max: 1 },
                            },
                            { kind: "flag", field: "identified", value: true },
                            { kind: "flag", field: "fractured", value: true },
                            ...["corrupted", "mirrored", "synthesised", "influenced"].map(
                                (field) => ({ kind: "flag", field, value: false }),
                            ),
                        ],
                    },
                ],
            },
        },
        latest: {
            ...marketCandidate.latest,
            cohortId: `source:conquest:${crafted}:${enchanted}`,
        },
    });
    return { graph, candidate, profile };
}

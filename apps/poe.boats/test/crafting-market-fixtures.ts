import { itemQuerySchema } from "@poe-tools/item-query";
import { seededRandom } from "../app/lib/crafting-engine";
import { craftingGraphSchema } from "../app/schemas/crafting-graph";
import { craftingMarketCandidateSchema } from "../app/schemas/crafting-market";
import { baseId, engine } from "./crafting-fixtures";
import { graphFixture } from "./crafting-graph-fixtures";

export const marketCandidate = craftingMarketCandidateSchema.parse({
    definition: {
        id: "base:plate-vest:86-100:any-links",
        revision: "test-market",
        catalogHash: "a".repeat(64),
        name: "Plate Vest, ilvl 86–100",
        purpose: "base",
        query: {
            game: "poe1",
            groups: [
                {
                    type: "and",
                    filters: [
                        { kind: "base", field: "baseType", values: ["Plate Vest"] },
                        { kind: "rarity", values: ["Normal", "Magic", "Rare"] },
                        { kind: "range", field: "ilvl", value: { min: 86, max: 100 } },
                        ...["corrupted", "mirrored", "fractured", "synthesised", "influenced"].map(
                            (field) => ({ kind: "flag", field, value: false }),
                        ),
                    ],
                },
            ],
        },
    },
    latest: {
        realm: "pc",
        league: "Standard",
        hour: 1_790_899_200,
        revision: "test-market",
        cohortId: "base:plate-vest:86-100:any-links",
        listingCount: 10,
        uniqueSellers: 10,
        unknownCount: 0,
        prices: {
            chaos: { min: 10, median: 20, max: 30, count: 10, sellers: 10, confidence: 0.5 },
        },
        confidenceMethod: "asking-sellers-coverage-v1",
        firstSeenAt: "2026-10-01T00:00:00Z",
        lastSeenAt: "2026-10-01T00:00:00Z",
    },
    covered: true,
    reasons: [],
});
export function marketGraph() {
    const query = itemQuerySchema.parse({ game: "poe1" });
    return craftingGraphSchema.parse({
        ...graphFixture(),
        league: "Standard",
        entry: "base",
        name: "Market priced base",
        nodes: [
            {
                kind: "acquire",
                id: "base",
                name: "Acquire base",
                output: query,
                alternatives: [
                    {
                        kind: "purchase",
                        id: "buy",
                        name: "Buy base",
                        item: engine.createItem(baseId, 86),
                        price: null,
                    },
                ],
            },
        ],
        outcomes: [{ id: "target", name: "Base", query }],
    });
}

export function adaptiveMarketCandidate(median = 21) {
    const candidate = structuredClone(marketCandidate);
    candidate.window = "adaptive-v1";
    const hourly = candidate.latest.prices.chaos!;
    hourly.count = 1;
    hourly.sellers = 1;
    hourly.windows = {
        "6": {
            min: median - 1,
            median,
            max: median + 1,
            count: 12,
            sellers: 12,
            confidence: 0.5,
            listingCount: 12,
            unknownCount: 0,
            hourlyMedianMin: median - 1,
            hourlyMedianMax: median,
        },
    };
    return candidate;
}

export function donorFamilyMarketFixture() {
    const id = "ColdResistEnhancedModAilments__";
    const base = Object.entries(engine.catalog.bases).find(
        ([, base]) => base.name === "Slink Gloves",
    )![0];
    const graph = marketGraph();
    const node = graph.nodes[0]!;
    if (node.kind !== "acquire" || node.alternatives[0]?.kind !== "purchase")
        throw new Error("Fixture");
    node.alternatives[0].item = engine.validateItem({
        ...engine.createItem(base, 86),
        rarity: "rare",
        mods: [engine.rollMod(id, seededRandom(1))],
    });
    node.output = itemQuerySchema.parse({
        game: "poe1",
        groups: [{ type: "and", filters: [{ kind: "mod", ids: [id] }] }],
    });
    const candidate = structuredClone(marketCandidate);
    candidate.definition.id = "donor-family:test-cold";
    candidate.latest.cohortId = candidate.definition.id;
    candidate.definition.name = "Slink Gloves, isolated Temple cold, display-equivalent family";
    candidate.definition.purpose = "isolated-modifier";
    candidate.definition.query = itemQuerySchema.parse({
        game: "poe1",
        groups: [
            {
                type: "and",
                filters: [
                    { kind: "base", field: "baseType", values: ["Slink Gloves"] },
                    { kind: "rarity", values: ["Rare"] },
                    { kind: "range", field: "ilvl", value: { min: 86, max: 100 } },
                    {
                        kind: "mod",
                        ids: [id, "ColdResistEnhancedLevel50ModAilments"],
                        side: "suffix",
                    },
                    { kind: "range", field: "suffixes", value: { min: 1, max: 1 } },
                ],
            },
        ],
    });
    return { graph, candidate };
}

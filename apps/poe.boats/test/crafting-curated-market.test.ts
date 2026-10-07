import { readFileSync } from "node:fs";
import { itemQuerySchema, matchItem } from "@poe-tools/item-query";
import {
    cohortPriceCoverage,
    compileMarketCohorts,
    marketCohortManifestSchema,
} from "@poe-tools/market";
import { expect, it } from "vite-plus/test";
import { seededRandom } from "../app/lib/crafting-engine";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { bindCohortPurchasePrice } from "../app/lib/crafting-market";
import { catalog, engine } from "./crafting-fixtures";
import { historyIndex, retainedRevision } from "./crafting-history-fixtures";
import { marketCandidate, marketGraph } from "./crafting-market-fixtures";

const classifier = compileMarketCohorts(
    marketCohortManifestSchema.parse(
        JSON.parse(readFileSync("../../packages/poe-market/data/cohorts-poe1.json", "utf8")),
    ),
);
it("does not silently price an exact crafting modifier from a display-equivalent family", () => {
    const baseId = Object.entries(catalog.bases).find(
        ([, base]) => base.name === "Slink Gloves",
    )![0];
    const id = "ColdResistEnhancedModAilments__";
    const item = engine.validateItem({
        ...engine.createItem(baseId, 86),
        rarity: "rare",
        mods: [engine.rollMod(id, seededRandom(1))],
    });
    const record = createCraftingItemQuery(engine).record(item);
    const family = classifier.manifest.cohorts.find(
        (cohort) =>
            cohort.id.startsWith("donor-family:") &&
            cohort.purpose === "isolated-modifier" &&
            matchItem(record, cohort.query) === "match",
    )!;
    expect(family).toBeDefined();
    const coverage = cohortPriceCoverage(
        family,
        record,
        itemQuerySchema.parse({
            game: "poe1",
            groups: [{ type: "and", filters: [{ kind: "mod", ids: [id] }] }],
        }),
    );
    expect(coverage.covered).toBe(false);
    expect(coverage.reasons).toContain(
        "The cohort does not price every configured explicit modifier.",
    );
    expect(
        cohortPriceCoverage(
            family,
            record,
            itemQuerySchema.parse({
                game: "poe1",
                groups: [{ type: "and", filters: [{ kind: "mod", ids: [id] }] }],
            }),
            "display-equivalent-v1",
        ),
    ).toEqual({ covered: true, reasons: [] });
});

it.each([
    ["Exquisite Blade", "LocalIncreasedPhysicalDamagePercent8", true, false],
    ["Exquisite Blade", "LocalIncreasedPhysicalDamagePercent7", true, false],
    ["Slink Gloves", "ColdResistEnhancedModAilments__", false, false],
    ["Slink Gloves", "ColdResistEnhancedModAilments__", false, true],
    [
        "Grasping Mail",
        "BreachBodyCriticalChanceIncreasedByUncappedLightningResistance1",
        false,
        false,
    ],
] as const)("uses the %s modifier cohort as a complete graph acquisition price", async (name, modId, fractured, family) => {
    const baseId = Object.entries(catalog.bases).find(([, base]) => base.name === name)![0];
    const item = engine.validateItem({
        ...engine.createItem(baseId, 86),
        rarity: "rare",
        mods: [engine.rollMod(modId, seededRandom(1), { fractured })],
    });
    const record = createCraftingItemQuery(engine).record(item);
    const definition = classifier.manifest.cohorts.find(
        (cohort) =>
            cohort.purpose === (fractured ? "fracture" : "isolated-modifier") &&
            cohort.id.startsWith("donor-family:") === family &&
            matchItem(record, cohort.query) === "match",
    )!;
    expect(definition).toBeDefined();
    const graph = marketGraph();
    const node = graph.nodes[0]!;
    if (node.kind !== "acquire" || node.alternatives[0]?.kind !== "purchase")
        throw new Error("Fixture");
    node.alternatives[0].item = item;
    node.output = itemQuerySchema.parse({
        game: "poe1",
        groups: [{ type: "and", filters: [{ kind: "mod", ids: [modId], fractured }] }],
    });
    const next = bindCohortPurchasePrice(graph, engine, node.id, "buy", {
        ...marketCandidate,
        ...(family ? { assumption: "display-equivalent-v1" as const } : {}),
        definition: {
            ...definition,
            revision: classifier.manifest.revision,
            catalogHash: classifier.manifest.catalogHash,
        },
        latest: {
            ...marketCandidate.latest,
            cohortId: definition.id,
            revision: classifier.manifest.revision,
        },
    });
    const retained = await retainedRevision(
        historyIndex.revisions.find(
            (entry) => entry.game === "poe1" && entry.revision === next.ruleset.revision,
        )!,
    );
    const simulation = retained.runtime.createSimulation(retained.catalog, next, {
        estimateIterations: 3,
        workLimit: 1000,
    });
    while (!simulation.done) simulation.runBatch();
    expect(simulation.result().meanCost).toBe(20);
    expect(graph.nodes[0]).not.toEqual(next.nodes[0]);
});

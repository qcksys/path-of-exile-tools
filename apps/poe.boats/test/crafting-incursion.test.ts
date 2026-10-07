import { expect, it } from "vite-plus/test";
import { seededRandom } from "../app/lib/crafting-engine";
import { incursionGloveModifiers, incursionModifierPool } from "../app/lib/crafting-incursion";
import { recombinationOutcomes } from "../app/lib/crafting-recombination";
import { rulesetReference } from "../app/lib/crafting-rulesets";
import { engine } from "./crafting-fixtures";
import { historyIndex, retainedRevision } from "./crafting-history-fixtures";
import { marketGraph } from "./crafting-market-fixtures";
import { nnnBase } from "./crafting-nnn-fixtures";

it.each(
    incursionGloveModifiers,
)("accepts prepared %s on gloves without adding it to ordinary rolls", (id) => {
    const item = engine.addStartingMod(nnnBase("Slink Gloves"), id, seededRandom(1));
    expect(item.mods[0]!.id).toBe(id);
    expect(engine.pool({ ...item, mods: [] }).some((entry) => entry.id === id)).toBe(false);
    expect(() => engine.addStartingMod(nnnBase("Necrotic Armour"), id, seededRandom(1))).toThrow(
        "not available",
    );
    expect(incursionModifierPool(engine.catalog, nnnBase("Slink Gloves"))).toHaveLength(3);
    expect(incursionModifierPool(engine.catalog, nnnBase("Necrotic Armour"))).toEqual([]);
    const outcomes = recombinationOutcomes(engine, item, nnnBase("Sorcerer Gloves"));
    expect(outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBeCloseTo(1);
    expect(
        outcomes
            .filter(({ value }) => value.mods.some((mod) => mod.id === id))
            .reduce((sum, outcome) => sum + outcome.weight, 0),
    ).toBeCloseTo(0.59);
    for (const { value } of outcomes) expect(engine.validateItem(value)).toEqual(value);
});

it("keeps the r3 refusal while r4 can calculate a purchased Temple donor", async () => {
    const item = engine.addStartingMod(
        nnnBase("Slink Gloves"),
        incursionGloveModifiers[1],
        seededRandom(1),
    );
    for (const revision of ["r3", "r4"]) {
        const ruleset = historyIndex.revisions.find(
            (entry) => entry.game === "poe1" && entry.revision === revision,
        )!;
        const loaded = await retainedRevision(ruleset);
        const graph = { ...marketGraph(), ruleset: rulesetReference(ruleset) };
        const node = graph.nodes[0]!;
        if (node.kind !== "acquire" || node.alternatives[0]?.kind !== "purchase")
            throw new Error("Fixture");
        node.alternatives[0].item = item;
        node.alternatives[0].price = {
            amount: 20,
            currency: "chaos",
            source: "manual",
            confidence: null,
        };
        if (revision === "r3") {
            expect(() => loaded.runtime.createSimulation(loaded.catalog, graph)).toThrow(
                "not available",
            );
        } else {
            const simulation = loaded.runtime.createSimulation(loaded.catalog, graph, {
                estimateIterations: 2,
                workLimit: 1000,
            });
            while (!simulation.done) simulation.runBatch();
            expect(simulation.result().meanCost).toBe(20);
        }
    }
});

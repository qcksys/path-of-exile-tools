import { createHash } from "node:crypto";
import { expect, it } from "vite-plus/test";
import { discoverGraphCraftingCosts } from "../app/lib/crafting-cost-inputs";
import { seededRandom } from "../app/lib/crafting-engine";
import { craftingPresets, projectFromPreset } from "../app/lib/crafting-presets";
import { rulesetReference, validateRulesetGraph } from "../app/lib/crafting-rulesets";
import { estimateSourcePurchase } from "../app/lib/crafting-source-preparation";
import { currency, engine } from "./crafting-fixtures";
import { quote, runGraphTrial } from "./crafting-graph-fixtures";
import { historyIndex, retainedRevision } from "./crafting-history-fixtures";

const prior = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r15",
)!;
const ruleset = { ...prior, revision: "r16", engine: "crafting-graph-16" };
const sourceId = "shield-make-heat-influence-base";
const targetIds = ["block-make-base", "max-res-make-base"] as const;
const transmute = currency("transmute_to_magic").id;
const regal = currency("upgrade_magic_to_rare").id;
const shaper = "Metadata/Items/Currency/CurrencyAddModToRareShaper";
const scour = currency("convert_to_normal").id;
const partitions = [
    { id: "buy-scour", crafted: false, enchanted: false },
    { id: "buy-scour-crafted", crafted: true, enchanted: false },
    { id: "buy-scour-enchanted", crafted: false, enchanted: true },
    { id: "buy-scour-crafted-enchanted", crafted: true, enchanted: true },
] as const;
const historicalHashes = {
    r1: "3a39dedd07d72f9d4859ac9a3fa489b5e380815e3f4720968e97eb811ac148ad",
    r2: "fc2e0222abc2156631c4ade6f270278397097d8e88c302c2808f2860b22b3160",
    r3: "d9d1a5d93cc93c8e2bb60b5de8f35d53623dcad24d8c393366791423c10b7285",
    r4: "5525a2dfc303d70202d349e4dd829102a6dc6cfeff94bcf4f6a706bbfdcc9851",
    r5: "2f1cad99e2b5e2e0b5f1e2e90ae475b135963c81490f15880990f9509e8cf744",
    r6: "c506c4974c6cc935b146f04275577ae4c0044366f82f0522fa624e9d255a3bfa",
    r7: "6a9b79964c074375c65a0fec0a1ca7c071238014813c7b82eafaeacf3ad40bc5",
    r8: "950d223fbc2508be205a0000bc241c0529bbd537afc385e14c5859bb88c3e18d",
    r9: "39aad5445b78e2c92811ba03d4900ef272d610a227eb6119603f59b275322f1d",
    r10: "02e0039e1c2317ff328ba25319bbcfacdbe152eb68e83b933bca5577fe3dc583",
    r11: "49207b82aa72616447227e14e4390af10b3074d8e0a31e533463717d3d410689",
    r12: "84c513f7150d144a21cfd07d9f51e8856c81cf532cdccb54e00431ab959b63db",
    r13: "4a16c5d868106a1325a15937274eb19f143668c5a7ce400b234b3c50422615b5",
    r14: "d99f3557e4bd3dd2000bb7e2d9837b762fa318173f4953e7fa0466288567baf1",
    r15: "95716e2cddc06ae1ab7113cab6186af483090ed6d30c99ff989ed414cffa27be",
};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

it.each(
    Object.entries(historicalHashes),
)("preserves every %s preset projection", (revision, expected) => {
    const retained = historyIndex.revisions.find(
        (entry) => entry.game === "poe1" && entry.revision === revision,
    )!;
    const projections = craftingPresets.map(({ id: presetId }) => {
        try {
            const graph = projectFromPreset(engine, retained, presetId);
            return { revision, presetId, sha256: hash({ ...graph, id: "" }) };
        } catch (error) {
            return {
                revision,
                presetId,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    });
    expect(hash(projections)).toBe(expected);
});

it.each(craftingPresets)("changes only the two intended source families in $id", ({ id }) => {
    const before = projectFromPreset(engine, prior, id);
    const graph = projectFromPreset(engine, ruleset, id);
    if (id === "life-block-shield") {
        expect(
            graph.nodes.filter((node) => node.id.startsWith("shield-make-heat-influence-")),
        ).toHaveLength(5);
        graph.nodes = graph.nodes.filter(
            (node) => !node.id.startsWith("shield-make-heat-influence-"),
        );
        for (const node of graph.nodes)
            if (node.kind === "acquire" && targetIds.some((target) => target === node.id))
                node.alternatives = node.alternatives.filter(
                    (alternative) => alternative.id !== "make-shaper",
                );
    }
    if (id === "energy-shield-chest") {
        const target = graph.nodes.find((node) => node.id === "donor-0-make-base");
        if (target?.kind !== "acquire") throw new Error("Missing Vaal acquisition.");
        expect(target.alternatives).toHaveLength(5);
        target.alternatives = target.alternatives.filter((alternative) => alternative.id === "buy");
    }
    expect({ ...graph, id: before.id, ruleset: before.ruleset }).toEqual(before);
});

function heatFixture(targetId: string, alternativeId = "buy") {
    const graph = projectFromPreset(engine, ruleset, "life-block-shield");
    const source = graph.nodes.find((node) => node.id === sourceId);
    const target = graph.nodes.find((node) => node.id === targetId);
    if (source?.kind !== "acquire" || target?.kind !== "acquire")
        throw new Error("Missing Heat-attuned influence route.");
    const purchase = source.alternatives.find((alternative) => alternative.id === alternativeId);
    if (purchase?.kind !== "purchase" || target.alternatives[0]?.kind !== "purchase")
        throw new Error("Missing Heat-attuned source purchase.");
    source.choice = { mode: "pinned", alternativeId };
    target.choice = { mode: "pinned", alternativeId: "make-shaper" };
    purchase.price = quote(10);
    graph.entry = target.id;
    graph.outcomes[0]!.query = target.output;
    graph.prices = {
        [transmute]: quote(1),
        [regal]: quote(2),
        [shaper]: quote(3),
        [scour]: quote(4),
    };
    return { graph, source, target, purchase, checkpoint: target.alternatives[0].item };
}

it.each(targetIds)("constructs the exact %s checkpoint from one clean source", (targetId) => {
    const { graph, source, purchase, checkpoint } = heatFixture(targetId);
    expect(purchase.item).toEqual({ ...checkpoint, influences: [] });
    expect(purchase.sourcePreparation).toEqual({ kind: "influence-ready-v1" });
    expect(source.alternatives).toHaveLength(5);
    expect(checkpoint.implicits).toEqual([
        {
            id: "ChanceToInflictScorchOnEnemyOnBlockImplicitE1",
            values: [100],
            crafted: false,
            fractured: false,
        },
    ]);
    const result = runGraphTrial(graph, seededRandom(42));
    expect(result).toMatchObject({
        success: true,
        purchases: 1,
        actions: 4,
        cost: 20,
        missingPrices: [],
    });
    expect(result.item).toEqual(checkpoint);
    expect(result.spending).toMatchObject({ [transmute]: 1, [regal]: 1, [shaper]: 1, [scour]: 1 });
    expect(discoverGraphCraftingCosts(engine, graph).map((cost) => cost.id)).toContain(shaper);
});

it.each(
    targetIds.flatMap((targetId) => partitions.map((partition) => ({ targetId, ...partition }))),
)("pays every $id cleanup before constructing $targetId", ({
    targetId,
    id,
    crafted,
    enchanted,
}) => {
    const { graph, purchase, checkpoint } = heatFixture(targetId, id);
    expect(purchase.sourcePreparation).toEqual({ kind: "scour-v1", crafted, enchanted });
    const scours = 2 + Number(crafted) + 3 * Number(enchanted);
    const result = runGraphTrial(graph, seededRandom(42));
    expect(result).toMatchObject({
        success: true,
        purchases: 1,
        actions: 5 + Number(crafted) + Number(enchanted),
        cost: 16 + 4 * scours,
        missingPrices: [],
    });
    expect(result.item).toEqual(checkpoint);
    expect(result.spending[scour]).toBe(scours);
});

function vaalFixture(alternativeId = "buy-scour-crafted-enchanted") {
    const graph = projectFromPreset(engine, ruleset, "energy-shield-chest");
    const node = graph.nodes.find((entry) => entry.id === "donor-0-make-base");
    if (node?.kind !== "acquire") throw new Error("Missing Vaal acquisition.");
    const purchase = node.alternatives.find((alternative) => alternative.id === alternativeId);
    if (purchase?.kind !== "purchase") throw new Error("Missing Vaal source purchase.");
    purchase.price = quote(11);
    node.choice = { mode: "pinned", alternativeId };
    graph.entry = node.id;
    graph.outcomes[0]!.query = node.output;
    graph.prices = { [scour]: quote(2) };
    return { graph, node, purchase };
}

it.each(partitions)("prepares the exact Vaal Regalia checkpoint with $id and all cleanup costs", ({
    id,
    crafted,
    enchanted,
}) => {
    const { graph, node, purchase } = vaalFixture(id);
    expect(purchase.sourcePreparation).toEqual({ kind: "scour-v1", crafted, enchanted });
    const scours = 1 + Number(crafted) + 3 * Number(enchanted);
    expect(estimateSourcePurchase(engine, graph, node, purchase)).toMatchObject({
        expectedCost: 11 + 2 * scours,
        expectedActions: 1 + Number(crafted) + Number(enchanted),
        missingPrices: [],
    });
    const result = runGraphTrial(graph, seededRandom(42));
    expect(result).toMatchObject({
        success: true,
        purchases: 1,
        actions: 1 + Number(crafted) + Number(enchanted),
        cost: 11 + 2 * scours,
        missingPrices: [],
    });
    expect(result.item).toEqual(
        engine.createItem("Metadata/Items/Armours/BodyArmours/BodyInt17", 86),
    );
    expect(result.spending[scour]).toBe(scours);
});

it.each([shaper, scour])("keeps the Heat-attuned route cost unknown without %s", (missing) => {
    const { graph } = heatFixture(targetIds[0], "buy-scour-crafted-enchanted");
    delete graph.prices[missing];
    expect(runGraphTrial(graph, seededRandom(42))).toMatchObject({
        success: true,
        cost: null,
        missingPrices: [missing],
    });
});

it.each(["purchase", "scouring"])("keeps Vaal cleanup unknown without its %s price", (missing) => {
    const { graph, node, purchase } = vaalFixture();
    if (missing === "purchase") purchase.price = null;
    else delete graph.prices[scour];
    const key = missing === "purchase" ? `purchase:${node.id}:${purchase.id}` : scour;
    expect(runGraphTrial(graph, seededRandom(42))).toMatchObject({
        success: true,
        cost: null,
        missingPrices: [key],
    });
});

it("refuses both new source families in the retained r15 engine", async () => {
    const retained = await retainedRevision(prior);
    for (const { graph } of [heatFixture(targetIds[0]), vaalFixture()]) {
        graph.ruleset = rulesetReference(prior);
        expect(() => validateRulesetGraph(prior, graph)).toThrow(/16/);
        expect(() => retained.runtime.createSimulation(retained.catalog, graph)).toThrow();
    }
});

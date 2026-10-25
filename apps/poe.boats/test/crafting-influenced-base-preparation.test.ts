import { expect, it } from "vite-plus/test";
import { discoverGraphCraftingCosts } from "../app/lib/crafting-cost-inputs";
import { seededRandom } from "../app/lib/crafting-engine";
import { projectFromPreset } from "../app/lib/crafting-presets";
import { currency, engine } from "./crafting-fixtures";
import { quote, runGraphTrial } from "./crafting-graph-fixtures";
import { historyIndex } from "./crafting-history-fixtures";

const prior = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r14",
)!;
const ruleset = { ...prior, revision: "r15", engine: "crafting-graph-15" };
const transmute = currency("transmute_to_magic").id;
const regal = currency("upgrade_magic_to_rare").id;
const shaper = "Metadata/Items/Currency/CurrencyAddModToRareShaper";
const scour = currency("convert_to_normal").id;
const cases = [
    ["life-block-shield", "recovery-make-base"],
    ["es-block-shield", "flat-make-base"],
] as const;

it.each(
    cases,
)("%s can pay to add Shaper influence and return its exact unrolled base checkpoint", (presetId, nodeId) => {
    const graph = projectFromPreset(engine, ruleset, presetId);
    const target = graph.nodes.find((node) => node.id === nodeId);
    if (target?.kind !== "acquire" || target.alternatives[0]?.kind !== "purchase")
        throw new Error("Missing influenced base purchase.");
    const checkpoint = target.alternatives[0].item;
    expect(target.choice).toEqual({ mode: "pinned", alternativeId: "buy" });
    expect(target.alternatives).toContainEqual(
        expect.objectContaining({ kind: "production", id: "make-shaper" }),
    );
    target.choice = { mode: "pinned", alternativeId: "make-shaper" };
    const source = graph.nodes.find((node) => node.id === `${nodeId}-influence-base`);
    if (source?.kind !== "acquire" || source.alternatives[0]?.kind !== "purchase")
        throw new Error("Missing uninfluenced base purchase.");
    expect(source.choice).toEqual({ mode: "pinned", alternativeId: "buy" });
    expect(source.alternatives[0].item).toEqual({ ...checkpoint, influences: [] });
    expect(source.alternatives[0].sourcePreparation).toEqual({ kind: "influence-ready-v1" });
    source.alternatives[0].price = quote(10);
    graph.entry = target.id;
    graph.outcomes = [{ ...graph.outcomes[0]!, query: target.output }];
    graph.prices[transmute] = quote(1);
    graph.prices[regal] = quote(2);
    graph.prices[shaper] = quote(3);
    graph.prices[scour] = quote(4);
    expect(discoverGraphCraftingCosts(engine, graph).map((cost) => cost.id)).toContain(shaper);
    const result = runGraphTrial(graph, seededRandom(42));
    expect(result).toMatchObject({
        success: true,
        purchases: 1,
        actions: 4,
        cost: 20,
        missingPrices: [],
        item: checkpoint,
    });
    expect(result.item).toEqual(checkpoint);
    expect(result.spending).toMatchObject({ [transmute]: 1, [regal]: 1, [shaper]: 1, [scour]: 1 });
});

it.each(cases)("%s charges every source cleanup before adding influence", (presetId, nodeId) => {
    for (const [alternativeId, crafted, enchanted] of [
        ["buy-scour", false, false],
        ["buy-scour-crafted", true, false],
        ["buy-scour-enchanted", false, true],
        ["buy-scour-crafted-enchanted", true, true],
    ] as const) {
        const graph = projectFromPreset(engine, ruleset, presetId);
        const target = graph.nodes.find((node) => node.id === nodeId);
        const source = graph.nodes.find((node) => node.id === `${nodeId}-influence-base`);
        if (target?.kind !== "acquire" || source?.kind !== "acquire")
            throw new Error("Missing influence preparation.");
        const purchase = source.alternatives.find((entry) => entry.id === alternativeId);
        if (purchase?.kind !== "purchase" || target.alternatives[0]?.kind !== "purchase")
            throw new Error("Missing source purchase.");
        expect(source.alternatives).toHaveLength(5);
        expect(purchase.sourcePreparation).toEqual({ kind: "scour-v1", crafted, enchanted });
        purchase.price = quote(10);
        source.choice = { mode: "pinned", alternativeId };
        target.choice = { mode: "pinned", alternativeId: "make-shaper" };
        graph.entry = target.id;
        graph.outcomes[0]!.query = target.output;
        graph.prices[transmute] = quote(1);
        graph.prices[regal] = quote(2);
        graph.prices[shaper] = quote(3);
        graph.prices[scour] = quote(4);
        const result = runGraphTrial(graph, seededRandom(42));
        const scours = 2 + Number(crafted) + 3 * Number(enchanted);
        expect(result).toMatchObject({
            success: true,
            purchases: 1,
            actions: 5 + Number(crafted) + Number(enchanted),
            cost: 16 + 4 * scours,
            missingPrices: [],
        });
        expect(result.item).toEqual(target.alternatives[0].item);
        expect(result.spending[scour]).toBe(scours);
    }
});

it.each([shaper, scour])("keeps the influence preparation cost unknown without %s", (missing) => {
    const graph = projectFromPreset(engine, ruleset, "life-block-shield");
    const target = graph.nodes.find((node) => node.id === "recovery-make-base");
    const source = graph.nodes.find((node) => node.id === "recovery-make-base-influence-base");
    if (target?.kind !== "acquire" || source?.kind !== "acquire")
        throw new Error("Missing influence preparation.");
    const purchase = source.alternatives.find(
        (entry) => entry.id === "buy-scour-crafted-enchanted",
    );
    if (purchase?.kind !== "purchase") throw new Error("Missing source purchase.");
    source.choice = { mode: "pinned", alternativeId: purchase.id };
    target.choice = { mode: "pinned", alternativeId: "make-shaper" };
    purchase.price = quote(10);
    graph.entry = target.id;
    graph.outcomes[0]!.query = target.output;
    for (const id of [transmute, regal, shaper, scour])
        if (id !== missing) graph.prices[id] = quote(1);
    const result = runGraphTrial(graph, seededRandom(42));
    expect(result).toMatchObject({ success: true, cost: null, missingPrices: [missing] });
});

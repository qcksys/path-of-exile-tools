import { itemQuerySchema } from "@poe-tools/item-query";
import { describe, expect, it } from "vite-plus/test";
import { seededRandom } from "../app/lib/crafting-engine";
import { calculateCraftingGraph } from "../app/lib/crafting-graph-simulation";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { craftingGraphSchema } from "../app/schemas/crafting-graph";
import { catalog, currency, engine } from "./crafting-fixtures";
import { graphFixture, queryMods, quote, runGraphTrial } from "./crafting-graph-fixtures";
import { nnnBase } from "./crafting-nnn-fixtures";

const target = "LocalBaseEvasionRatingAndEnergyShield8___";
const transmute = currency("transmute_to_magic");
const alteration = currency("reroll_magic");
const sockets = catalog.crafting.bench.find((entry) => entry.socketCount === 6)!;
const links = catalog.crafting.bench.find((entry) => entry.linkCount === 6)!;
const beast = catalog.crafting.beasts.find((entry) => entry.maximumLinks)!;

function armourGraph() {
    const item = { ...nnnBase("Necrotic Armour"), sockets: 1 };
    const base = itemQuerySchema.parse({
        game: "poe1",
        groups: [
            {
                type: "and",
                filters: [
                    { kind: "base", field: "baseId", values: [item.baseId] },
                    { kind: "range", field: "ilvl", value: { min: 86 } },
                    ...["corrupted", "mirrored", "fractured", "influenced"].map((field) => ({
                        kind: "flag",
                        field,
                        value: false,
                    })),
                ],
            },
        ],
    });
    const linked = itemQuerySchema.parse({
        ...base,
        groups: [
            ...base.groups,
            {
                type: "and",
                filters: [{ kind: "range", field: "links", value: { min: 6 } }],
            },
        ],
    });
    const missing = itemQuerySchema.parse({
        game: "poe1",
        groups: [{ type: "not", filters: [{ kind: "mod", ids: [target] }] }],
    });
    const output = itemQuerySchema.parse({
        ...linked,
        groups: [...linked.groups, ...queryMods(target).groups],
    });
    const prices = Object.fromEntries(
        [...sockets.cost, ...links.cost].map((cost) => [cost.id, quote(0.1)]),
    );
    return craftingGraphSchema.parse({
        ...graphFixture(),
        id: "necrotic-armour",
        name: "Six-link Necrotic Armour with T1 flat evasion and ES",
        nodes: [
            {
                kind: "acquire",
                id: "base",
                name: "Unmodified ilvl 86 armour",
                output: base,
                alternatives: [
                    { kind: "purchase", id: "buy", name: "Buy base", item, price: quote(10) },
                ],
            },
            {
                kind: "craft",
                id: "sockets",
                name: "Six sockets",
                output: base,
                inputs: [{ id: "item", name: "Base", source: "base" }],
                method: { kind: "bench", id: sockets.id },
            },
            {
                kind: "craft",
                id: "bench",
                name: "Bench six-link",
                output: linked,
                inputs: [{ id: "item", name: "Six sockets", source: "sockets" }],
                method: { kind: "bench", id: links.id },
            },
            {
                kind: "craft",
                id: "beast",
                name: "Beast six-link",
                output: linked,
                inputs: [{ id: "item", name: "Six sockets", source: "sockets" }],
                method: { kind: "beast", id: beast.id },
            },
            {
                kind: "acquire",
                id: "linked",
                name: "Buy or make a six-link",
                output: linked,
                alternatives: [
                    {
                        kind: "purchase",
                        id: "buy",
                        name: "Buy six-link",
                        item: { ...item, sockets: 6, socketLinks: [true, true, true, true, true] },
                        price: quote(300),
                    },
                    { kind: "production", id: "bench", name: "Bench linking", nodeId: "bench" },
                    { kind: "production", id: "beast", name: "Beast linking", nodeId: "beast" },
                ],
            },
            {
                kind: "craft",
                id: "transmute",
                name: "Transmute once",
                output: linked,
                inputs: [{ id: "item", name: "Six-link", source: "linked" }],
                method: transmute,
            },
            {
                kind: "craft",
                id: "alter",
                name: "Alter until T1 flat ES",
                output,
                inputs: [
                    { id: "item", name: "Magic six-link", source: "transmute", query: linked },
                ],
                method: alteration,
                applyWhen: missing,
                branches: [
                    {
                        id: "retry",
                        name: "Keep the base and roll again",
                        query: missing,
                        destination: { kind: "recover", nodeId: "alter", inputId: "item" },
                    },
                ],
            },
        ],
        entry: "alter",
        outcomes: [{ id: "target", name: "T1 flat ES six-link", query: output }],
        prices: {
            ...prices,
            [beast.id]: quote(250),
            [transmute.id]: quote(0.2),
            [alteration.id]: quote(0.1),
        },
        iterations: 3,
        maxSteps: 10000,
    });
}

describe("Necrotic Armour complete process", () => {
    it("compares concrete linking recipes and a purchase, then preserves a pinned choice as prices change", () => {
        const graph = armourGraph();
        graph.entry = "linked";
        graph.nodes = graph.nodes.filter((node) => !["transmute", "alter"].includes(node.id));
        const linked = graph.nodes.find((node) => node.id === "linked" && node.kind === "acquire")!;
        graph.outcomes[0]!.query = linked.output;
        const calculate = () => calculateCraftingGraph(catalog, graph, { estimateIterations: 1 });
        const benchCost =
            10 + [...sockets.cost, ...links.cost].reduce((sum, cost) => sum + cost.amount * 0.1, 0);
        expect(links.cost[0]!.amount).toBe(1500);
        expect(calculate()).toMatchObject({
            complete: true,
            meanCost: benchCost,
            acquisitions: { linked: { selectedId: "bench" } },
        });
        graph.prices[beast.id] = quote(1);
        const beastCost = 10 + sockets.cost.reduce((sum, cost) => sum + cost.amount * 0.1, 0) + 1;
        expect(calculate()).toMatchObject({
            complete: true,
            meanCost: beastCost,
            acquisitions: { linked: { selectedId: "beast" } },
        });
        graph.prices["purchase:linked:buy"] = quote(5);
        expect(calculate()).toMatchObject({
            meanCost: 5,
            meanActions: 0,
            acquisitions: { linked: { selectedId: "buy" } },
        });
        if (linked.kind !== "acquire") throw new Error("Fixture");
        linked.choice = { mode: "pinned", alternativeId: "bench" };
        expect(calculate()).toMatchObject({
            meanCost: benchCost,
            acquisitions: { linked: { selectedId: "bench" } },
        });
    });

    it("retains the linked base through alteration misses and charges each consumed currency once", () => {
        const graph = armourGraph();
        const linked = graph.nodes.find((node) => node.id === "linked" && node.kind === "acquire")!;
        if (linked.kind !== "acquire") throw new Error("Fixture");
        linked.choice = { mode: "pinned", alternativeId: "bench" };
        const before = structuredClone(graph);
        expect(
            engine
                .pool({ ...nnnBase("Necrotic Armour"), rarity: "magic" })
                .some((entry) => entry.id === target),
        ).toBe(true);
        const result = runGraphTrial(graph, seededRandom(42));
        expect(result).toMatchObject({
            status: "terminal",
            success: true,
            purchases: 1,
            missingPrices: [],
        });
        expect(result.spending[transmute.id]).toBe(1);
        expect(result.spending[alteration.id]).toBeGreaterThan(1);
        expect(result.spending[links.cost[0]!.id]).toBe(1500);
        expect(result.visits.alter!.recovered).toBe(result.spending[alteration.id]! - 1);
        const expected =
            10 +
            [...sockets.cost, ...links.cost].reduce((sum, cost) => sum + cost.amount * 0.1, 0) +
            0.2 +
            result.spending[alteration.id]! * 0.1;
        expect(result.cost).toBeCloseTo(expected);
        expect(
            createCraftingItemQuery(engine).matches(result.item!, graph.outcomes[0]!.query),
        ).toBe("match");
        expect(craftingGraphSchema.parse(JSON.parse(JSON.stringify(graph)))).toEqual(before);
        expect(graph).toEqual(before);
    });

    it("does not charge an alteration when transmutation already meets the target", () => {
        const graph = armourGraph();
        const result = runGraphTrial(graph, {
            integer: (min) => min,
            pick: (choices) =>
                (choices.find((entry) => entry.value === target && entry.weight > 0) ??
                    choices.find((entry) => entry.weight > 0))!.value,
        });
        expect(result).toMatchObject({ success: true, purchases: 1, actions: 1, cost: 300.2 });
        expect(result.spending[alteration.id]).toBeUndefined();
        expect(result.visits.alter!.skipped).toBe(1);
    });
});

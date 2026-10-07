import { itemQuerySchema } from "@poe-tools/item-query";
import { describe, expect, it } from "vite-plus/test";
import { allflameQuote } from "../app/lib/crafting-allflame";
import { seededRandom } from "../app/lib/crafting-engine";
import { calculateCraftingGraph } from "../app/lib/crafting-graph-simulation";
import type { CraftingItem } from "../app/schemas/crafting";
import { craftingGraphSchema } from "../app/schemas/crafting-graph";
import { catalog, currency, engine } from "./crafting-fixtures";
import { anyItem, graphFixture, queryMods, quote, runGraphTrial } from "./crafting-graph-fixtures";
import { nnnBase } from "./crafting-nnn-fixtures";

const target = "LocalIncreasedPhysicalDamagePercent8";
const transmute = currency("transmute_to_magic");
const alteration = currency("reroll_magic");
const regal = currency("upgrade_magic_to_rare");
const exalt = currency("add_mod_to_rare");
const fracture = currency("fracture_random_mod");
const fractured = itemQuerySchema.parse({
    game: "poe1",
    groups: [{ type: "and", filters: [{ kind: "mod", ids: [target], fractured: true }] }],
});

function fractureGraph(allflame = false) {
    const missing = itemQuerySchema.parse({
        game: "poe1",
        groups: [{ type: "not", filters: [{ kind: "mod", ids: [target] }] }],
    });
    const short = itemQuerySchema.parse({
        game: "poe1",
        groups: [{ type: "and", filters: [{ kind: "mod", count: { max: 3 } }] }],
    });
    return craftingGraphSchema.parse({
        ...graphFixture(),
        id: "fractured-axe",
        name: "Roll and fracture T1 physical damage",
        nodes: [
            {
                kind: "acquire",
                id: "base",
                name: "Unfractured ilvl 86 Despot Axe",
                output: anyItem,
                alternatives: [
                    {
                        kind: "purchase",
                        id: "buy",
                        name: "Buy base",
                        item: nnnBase("Despot Axe"),
                        price: quote(5),
                    },
                ],
            },
            {
                kind: "craft",
                id: "transmute",
                name: "Transmute",
                output: anyItem,
                inputs: [{ id: "item", name: "Base", source: "base" }],
                method: transmute,
            },
            {
                kind: "craft",
                id: "alter",
                name: "Alter until T1 physical",
                output: queryMods(target),
                inputs: [{ id: "item", name: "Magic axe", source: "transmute" }],
                method: alteration,
                applyWhen: missing,
                branches: [
                    {
                        id: "retry",
                        name: "Try again",
                        query: missing,
                        destination: { kind: "recover", nodeId: "alter", inputId: "item" },
                    },
                ],
            },
            {
                kind: "craft",
                id: "regal",
                name: "Make rare",
                output: queryMods(target),
                inputs: [{ id: "item", name: "T1 axe", source: "alter" }],
                method: regal,
            },
            {
                kind: "craft",
                id: "fill",
                name: "Reach four modifiers",
                output: queryMods(target),
                inputs: [{ id: "item", name: "Rare axe", source: "regal" }],
                method: exalt,
                applyWhen: short,
                branches: [
                    {
                        id: "retry",
                        name: "Add another modifier",
                        query: short,
                        destination: { kind: "recover", nodeId: "fill", inputId: "item" },
                    },
                ],
            },
            {
                kind: "craft",
                id: "fracture",
                name: "Fracture target",
                output: fractured,
                inputs: [{ id: "item", name: "Prepared axe", source: "fill" }],
                method: { ...fracture, ...(allflame ? { allflame: true } : {}) },
                branches: [
                    {
                        id: "hit",
                        name: "Target fractured",
                        query: fractured,
                        destination: { kind: "return" },
                    },
                ],
                fallback: { kind: "discard" },
            },
        ],
        entry: "fracture",
        outcomes: [{ id: "target", name: "T1 physical fracture", query: fractured }],
        prices: {
            [transmute.id]: quote(0.1),
            [alteration.id]: quote(0.1),
            [regal.id]: quote(1),
            [exalt.id]: quote(2),
            [fracture.id]: quote(100),
            [catalog.crafting.allflame!.sulphur]: quote(0.001),
        },
        maxSteps: 10000,
        iterations: 3,
    });
}

describe("fractured physical axe process", () => {
    it("reacquires and prepares a new base after fracturing the wrong modifier, without crediting the rare miss", () => {
        const graph = fractureGraph();
        let fractures = 0;
        const result = runGraphTrial(graph, {
            integer: (min) => min,
            pick: (choices) => {
                const modifiers = choices.filter(
                    (entry) =>
                        typeof entry.value === "object" &&
                        entry.value !== null &&
                        "id" in entry.value,
                );
                if (modifiers.length) {
                    fractures++;
                    return modifiers.find(
                        ({ value }) =>
                            typeof value === "object" &&
                            value !== null &&
                            "id" in value &&
                            (fractures === 1 ? value.id !== target : value.id === target),
                    )!.value;
                }
                return (choices.find((entry) => entry.value === target && entry.weight > 0) ??
                    choices.find((entry) => entry.weight > 0))!.value;
            },
        });
        expect(result).toMatchObject({
            success: true,
            purchases: 2,
            excludedRecovery: 1,
            revenue: 0,
            missingPrices: [],
            cost: 220.2,
        });
        expect(result.spending).toMatchObject({
            "purchase:base:buy": 2,
            [transmute.id]: 2,
            [regal.id]: 2,
            [exalt.id]: 4,
            [fracture.id]: 2,
        });
        expect(result.spending[alteration.id]).toBeUndefined();
        expect(result.item!.mods.find((mod) => mod.id === target)?.fractured).toBe(true);
    });

    it("charges one Allflame recipe while selecting its successful copy, with no duplicated item output", () => {
        const graph = fractureGraph(true);
        const method = graph.nodes.find((node) => node.id === "fracture" && node.kind === "craft")!;
        if (method.kind !== "craft") throw new Error("Fixture");
        const result = runGraphTrial(graph, {
            integer: (min) => min,
            pick: (choices) =>
                (choices.find(
                    ({ value, weight }) =>
                        weight > 0 &&
                        (value === target ||
                            (typeof value === "object" &&
                                value !== null &&
                                "id" in value &&
                                value.id === target)),
                ) ?? choices.find((entry) => entry.weight > 0))!.value,
        });
        const sulphur = allflameQuote(catalog, nnnBase("Despot Axe"), method.method)!;
        expect(result).toMatchObject({
            success: true,
            purchases: 1,
            excludedRecovery: 0,
            missingPrices: [],
        });
        expect(result.spending[fracture.id]).toBe(1);
        expect(result.spending[sulphur.sulphur]).toBe(sulphur.amount);
        expect(result.cost).toBeCloseTo(110.1 + sulphur.amount * 0.001);
        expect(result.item!.allflameCopies).toBeUndefined();
        expect(
            result.trace.filter((entry) => entry.nodeId === "fracture" && entry.inputs.length),
        ).toMatchObject([{ outputs: [expect.any(String)] }]);
    });

    it("compares a prepared-input fracture process against buying the exact fracture", () => {
        const graph = fractureGraph();
        let item: CraftingItem = { ...nnnBase("Despot Axe"), rarity: "rare" };
        item = engine.addStartingMod(item, target, seededRandom(1));
        while (item.mods.length < 4)
            item = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(1));
        graph.nodes = graph.nodes.filter((node) => node.id === "fracture");
        const craft = graph.nodes[0]!;
        if (craft.kind !== "craft") throw new Error("Fixture");
        craft.inputs[0]!.source = "prepared";
        graph.nodes.unshift({
            kind: "acquire",
            id: "prepared",
            name: "Prepared four-mod input",
            output: queryMods(target),
            choice: { mode: "automatic" },
            alternatives: [
                { kind: "purchase", id: "buy", name: "Buy prepared", item, price: quote(10) },
            ],
        });
        graph.nodes.push({
            kind: "acquire",
            id: "result",
            name: "Buy or fracture",
            output: fractured,
            choice: { mode: "automatic" },
            alternatives: [
                {
                    kind: "purchase",
                    id: "buy",
                    name: "Buy target fracture",
                    item: {
                        ...item,
                        mods: item.mods.map((mod) => ({ ...mod, fractured: mod.id === target })),
                    },
                    price: quote(1),
                },
                { kind: "production", id: "craft", name: "Try fracturing", nodeId: "fracture" },
            ],
        });
        graph.entry = "result";
        const calculate = () => calculateCraftingGraph(catalog, graph, { estimateIterations: 5 });
        expect(calculate()).toMatchObject({
            complete: true,
            meanCost: 1,
            acquisitions: { result: { selectedId: "buy" } },
        });
        graph.prices["purchase:result:buy"] = quote(10000);
        const crafted = calculate();
        expect(crafted.acquisitions.result?.selectedId).toBe("craft");
        expect(crafted.meanCost).toBeGreaterThanOrEqual(110);
        expect(
            crafted.samples.every((sample) =>
                sample.item?.mods.some((mod) => mod.id === target && mod.fractured),
            ),
        ).toBe(true);
    });
});

/** biome-ignore-all lint/style/useNamingConvention: Ring recipes retain canonical Breachlord names. */
import { itemQuerySchema } from "@poe-tools/item-query";
import { describe, expect, it } from "vite-plus/test";
import { seededRandom } from "../app/lib/crafting-engine";
import { graspingMailBase } from "../app/lib/crafting-grasping";
import { craftingGraphSchema } from "../app/schemas/crafting-graph";
import { catalog, currency, engine } from "./crafting-fixtures";
import { anyItem, graphFixture, queryMods, quote, runGraphTrial } from "./crafting-graph-fixtures";
import { nnnDonor } from "./crafting-nnn-fixtures";

const target = "BreachBodyCriticalChanceIncreasedByUncappedLightningResistance1";
const split = { ...currency("split_to_single_explicit"), allflame: true as const };
const sulphur = catalog.crafting.allflame!.sulphur;

function graspingGraph() {
    const recipient = nnnDonor();
    const isolated = itemQuerySchema.parse({
        ...queryMods(target),
        groups: [
            ...queryMods(target).groups,
            { type: "and", filters: [{ kind: "mod", count: { min: 1, max: 1 } }] },
        ],
    });
    const output = itemQuerySchema.parse({
        ...queryMods(target),
        groups: [
            ...queryMods(target).groups,
            {
                type: "and",
                filters: [{ kind: "base", field: "baseId", values: [recipient.baseId] }],
            },
        ],
    });
    return craftingGraphSchema.parse({
        ...graphFixture(),
        id: "grasping-transfer",
        name: "Breach rings to isolated crit transfer",
        nodes: [
            {
                kind: "acquire",
                id: "recipe",
                name: "Recipe output configuration",
                output: anyItem,
                alternatives: [
                    {
                        kind: "purchase",
                        id: "template",
                        name: "Output template; rings charged by generation",
                        item: engine.createItem(graspingMailBase, 86),
                        price: quote(0),
                    },
                ],
            },
            {
                kind: "craft",
                id: "generate",
                name: "Vendor 60 eligible Esh rings",
                output: queryMods(target),
                inputs: [{ id: "item", name: "Recipe configuration", source: "recipe" }],
                method: {
                    kind: "generate",
                    id: "rare",
                    breachRings: { Xoph: 0, Tul: 0, Esh: 60, "Uul-Netol": 0, Chayula: 0 },
                },
                branches: [
                    {
                        id: "target",
                        name: "Has crit per lightning resistance",
                        query: queryMods(target),
                        destination: { kind: "return" },
                    },
                ],
                fallback: { kind: "discard" },
            },
            {
                kind: "craft",
                id: "isolate",
                name: "Keep one Kishara copy",
                output: isolated,
                inputs: [{ id: "item", name: "Crit donor", source: "generate" }],
                method: split,
                branches: [
                    {
                        id: "target",
                        name: "Isolated crit",
                        query: isolated,
                        destination: { kind: "return" },
                    },
                ],
                fallback: { kind: "discard" },
            },
            {
                kind: "acquire",
                id: "recipient",
                name: "Prepared Necrotic Armour",
                output: anyItem,
                alternatives: [
                    {
                        kind: "purchase",
                        id: "buy",
                        name: "Buy isolated NNN Strength",
                        item: recipient,
                        price: quote(8),
                    },
                ],
            },
            {
                kind: "craft",
                id: "combine",
                name: "Transfer onto desired base",
                output,
                inputs: [
                    { id: "left", name: "Crit donor", source: "isolate", query: queryMods(target) },
                    { id: "right", name: "Desired base", source: "recipient" },
                ],
                method: { kind: "recombine", id: "recombine" },
                branches: [
                    {
                        id: "success",
                        name: "Crit on Necrotic Armour",
                        query: output,
                        destination: { kind: "return" },
                    },
                    {
                        id: "recover",
                        name: "Retained crit donor",
                        query: queryMods(target),
                        destination: { kind: "recover", nodeId: "combine", inputId: "left" },
                    },
                ],
                fallback: { kind: "discard" },
            },
        ],
        entry: "combine",
        outcomes: [{ id: "target", name: "Transferred crit", query: output }],
        prices: {
            "generated:rare": quote(60 * 2),
            [split.id]: quote(12),
            [sulphur]: quote(0.001),
            "service:recombine": quote(1),
        },
        maxSteps: 10000,
        iterations: 3,
    });
}

describe("Grasping Mail recipe, isolation and NNN transfer", () => {
    it("charges each ring set and selected split, excludes unvalued misses, and produces one item per recombination", () => {
        const graph = graspingGraph();
        const before = structuredClone(graph);
        const random = seededRandom(42);
        let picks = 0;
        const result = runGraphTrial(graph, {
            integer: random.integer,
            pick: (choices) => {
                picks++;
                if (picks === 1)
                    return choices.find((entry) => entry.value === 1 && entry.weight > 0)!.value;
                if (picks === 2)
                    return choices.find((entry) => entry.value !== target && entry.weight > 0)!
                        .value;
                return random.pick(choices);
            },
        });
        expect(result).toMatchObject({ success: true, missingPrices: [], revenue: 0 });
        expect(result.item!.baseId).toBe(nnnDonor().baseId);
        expect(result.item!.mods.some((mod) => mod.id === target)).toBe(true);
        expect(result.spending["generated:rare"]).toBeGreaterThan(1);
        expect(result.excludedRecovery).toBeGreaterThan(0);
        expect(result.cost).toBeCloseTo(
            result.spending["generated:rare"]! * 120 +
                result.spending[split.id]! * 12 +
                result.spending[sulphur]! * 0.001 +
                result.spending["service:recombine"]! +
                result.spending["purchase:recipient:buy"]! * 8,
        );
        for (const trace of result.trace.filter(
            (entry) => entry.inputs.length && ["isolate", "combine"].includes(entry.nodeId),
        )) {
            expect(trace.outputs).toHaveLength(1);
            expect(trace.inputs).toHaveLength(trace.nodeId === "combine" ? 2 : 1);
        }
        const consumed = result.trace.flatMap((entry) => entry.inputs);
        expect(new Set(consumed).size).toBe(consumed.length);
        expect(graph).toEqual(before);
    });

    it("leaves the total unknown when the ring-recipe price is missing", () => {
        const graph = graspingGraph();
        delete graph.prices["generated:rare"];
        const result = runGraphTrial(graph, seededRandom(42));
        expect(result).toMatchObject({
            success: true,
            cost: null,
            missingPrices: ["generated:rare"],
        });
        expect(result.knownCost).toBeGreaterThan(0);
    });
});

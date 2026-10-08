import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { validateCraftingGraph } from "../app/lib/crafting-graph-validation";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { configureSimpleCraft, simpleCraftCapability } from "../app/lib/crafting-smart";
import type { CraftingItem, CraftingMethod } from "../app/schemas/crafting";
import { craftingGraphSchema, type GraphCraftNode } from "../app/schemas/crafting-graph";
import type { SimpleCraftGoal } from "../app/schemas/crafting-smart";
import { baseId, catalog, currency, engine, getCatalog } from "./crafting-fixtures";
import { anyItem, graphFixture, quote, runGraphTrial } from "./crafting-graph-fixtures";

function simpleGraph(item: CraftingItem, method: CraftingMethod, goal: SimpleCraftGoal) {
    const node: GraphCraftNode = {
        kind: "craft",
        id: "craft",
        name: "Simple craft",
        inputs: [{ id: "item", name: "Item", source: "base" }],
        method,
        output: anyItem,
        branches: [],
        ordering: "manual",
        fallback: { kind: "return" },
    };
    return craftingGraphSchema.parse({
        ...graphFixture(),
        iterations: 3,
        entry: "craft",
        nodes: [
            {
                kind: "acquire",
                id: "base",
                name: "Base",
                output: anyItem,
                choice: { mode: "pinned", alternativeId: "buy" },
                alternatives: [
                    { kind: "purchase", id: "buy", name: "Base", item, price: quote(1) },
                ],
            },
            configureSimpleCraft(engine, node, goal),
        ],
        outcomes: [{ id: "target", name: "Target", query: anyItem }],
    });
}

describe("simple crafting outcomes", () => {
    const normal = engine.createItem(baseId, 86);
    const remembrance = currency("apply_zana_influence");
    it("offers Remembrance only for normal equipment and locks its target to strands", () => {
        expect(simpleCraftCapability(engine, remembrance, normal)).toMatchObject({
            available: true,
            target: { field: "memoryStrands", maximum: 100 },
        });
        expect(
            simpleCraftCapability(engine, remembrance, { ...normal, rarity: "rare" }),
        ).toMatchObject({ available: false });
        expect(
            simpleCraftCapability(engine, remembrance, { ...normal, corrupted: true }),
        ).toMatchObject({ available: false });
        expect(() =>
            simpleGraph(normal, remembrance, { kind: "minimum", field: "quality", value: 20 }),
        ).toThrow("cannot be produced");
        expect(() =>
            simpleGraph(normal, currency("transmute_to_magic"), {
                kind: "minimum",
                field: "memoryStrands",
                value: 70,
            }),
        ).toThrow("cannot be produced");
    });
    it("reuses the same input on misses and stops at the minimum", () => {
        const graph = simpleGraph(normal, remembrance, {
            kind: "minimum",
            field: "memoryStrands",
            value: 70,
        });
        const strands = [10, 65, 70];
        const trial = runGraphTrial(graph, {
            integer: (min) => min,
            pick: (choices) => {
                const next = strands.shift();
                const chosen = choices.find(({ value }) => value === next);
                if (!chosen) throw new Error(`Unexpected random choice: ${next}`);
                return chosen.value;
            },
        });
        expect(trial.error).toBeNull();
        expect(trial.item?.memoryStrands).toBe(70);
        expect(trial.actions).toBe(3);
        expect(trial.purchases).toBe(1);
        expect(trial.visits.craft?.recovered).toBe(2);
    });
    it("does not spend currency when the input already satisfies the target", () => {
        const graph = simpleGraph({ ...normal, memoryStrands: 90 }, remembrance, {
            kind: "minimum",
            field: "memoryStrands",
            value: 70,
        });
        const trial = runGraphTrial(graph, seededRandom(1));
        expect(trial.error).toBeNull();
        expect(trial.actions).toBe(0);
        expect(trial.visits.craft?.skipped).toBe(1);
        expect(trial.item?.memoryStrands).toBe(90);
    });
    it("rejects edits that add unrelated outcomes to a smart node", () => {
        const graph = simpleGraph(normal, remembrance, {
            kind: "minimum",
            field: "memoryStrands",
            value: 70,
        });
        const node = graph.nodes[1]!;
        if (node.kind !== "craft") throw new Error("Missing craft");
        node.branches[0]!.query = anyItem;
        expect(() => validateCraftingGraph(catalog, graph)).toThrow(
            "generated from the selected goal",
        );
    });
    it("uses extracted quality caps and rejects an unreachable minimum without retrying", () => {
        const recipe = catalog.crafting.baseQuality.find(
            (entry) => entry.itemClasses.includes("Body Armour") && !entry.corrupted,
        )!;
        const method: CraftingMethod = { kind: "currency", id: recipe.id };
        expect(simpleCraftCapability(engine, method, normal)?.target?.maximum).toBe(
            recipe.maximumQuality,
        );
        const graph = simpleGraph(normal, method, { kind: "minimum", field: "quality", value: 20 });
        const trial = runGraphTrial(graph, seededRandom(1));
        expect(trial.error).toBeNull();
        expect(trial.item?.quality).toBe(20);
        expect(trial.purchases).toBe(1);
        const invalid = runGraphTrial(
            simpleGraph(normal, method, { kind: "minimum", field: "quality", value: 100 }),
            seededRandom(1),
        );
        expect(invalid.actions).toBe(0);
        expect(invalid.error).toContain("exceeds what this craft can reach");
    });
    it("does not treat a different catalyst's quality as success", () => {
        const ringId = Object.keys(catalog.bases).find(
            (id) =>
                catalog.bases[id]!.item_class === "Ring" &&
                !catalog.bases[id]!.corrupted &&
                catalog.bases[id]!.rarities.includes("normal"),
        )!;
        const catalysts = catalog.crafting.catalysts.filter((entry) =>
            entry.itemClasses.includes("Ring"),
        );
        const item = {
            ...engine.createItem(ringId, 86),
            catalyst: { id: catalysts[0]!.id, quality: 20 },
        };
        const graph = simpleGraph(
            item,
            { kind: "currency", id: catalysts[1]!.id },
            { kind: "minimum", field: "catalystQuality", value: 20 },
        );
        const trial = runGraphTrial(graph, seededRandom(1));
        expect(trial.error).toBeNull();
        expect(trial.actions).toBeGreaterThan(0);
        expect(trial.item?.catalyst).toEqual({ id: catalysts[1]!.id, quality: 20 });
        expect(createCraftingItemQuery(engine).matches(item, graph.nodes[1]!.output)).toBe(
            "no-match",
        );
    });
    it("applies rarity changes once and gives unsupported complex crafts custom outcomes", () => {
        const trial = runGraphTrial(
            simpleGraph(normal, currency("transmute_to_magic"), { kind: "once" }),
            seededRandom(1),
        );
        expect(trial.error).toBeNull();
        expect(trial.actions).toBe(1);
        expect(trial.item?.rarity).toBe("magic");
        expect(simpleCraftCapability(engine, { kind: "recombine", id: "recombine" })).toBeNull();
    });
    it("supports socket currencies in PoE 2 and fixed socket bench crafts in PoE 1", () => {
        const second = new CraftingEngine(getCatalog("poe2"));
        const id = Object.keys(second.catalog.bases).find(
            (id) =>
                second.catalog.bases[id]!.item_class === "Body Armour" &&
                second.catalog.bases[id]!.rarities.includes("normal") &&
                !second.catalog.bases[id]!.corrupted,
        )!;
        const item = second.createItem(id, 86);
        const socket = second.catalog.crafting.currencies.find(
            (entry) => entry.action === "add_equipment_socket",
        )!;
        expect(
            simpleCraftCapability(second, { kind: "currency", id: socket.id }, item),
        ).toMatchObject({ available: true, target: { field: "sockets" } });
        const bench = catalog.crafting.bench.find(
            (entry) => entry.socketCount === 6 && entry.itemClasses.includes("Body Armour"),
        )!;
        const trial = runGraphTrial(
            simpleGraph(normal, { kind: "bench", id: bench.id }, { kind: "once" }),
            seededRandom(1),
        );
        expect(trial.error).toBeNull();
        expect(trial.item?.sockets).toBe(6);
        expect(trial.actions).toBe(1);
    });
});

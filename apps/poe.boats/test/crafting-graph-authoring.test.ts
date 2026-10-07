import { describe, expect, it } from "vite-plus/test";
import {
    connectGraphInput,
    projectFromItem,
    removeGraphNode,
    replaceGraphPurchaseItem,
} from "../app/lib/crafting-graph-authoring";
import { firstItem, graphFixture, quote } from "./crafting-graph-fixtures";
import { historyIndex } from "./crafting-history-fixtures";

describe("graph authoring", () => {
    it("replaces a prepared purchase without losing routing or pinning, and clears only that item's quote", () => {
        const graph = graphFixture();
        const node = graph.nodes[0]!;
        if (node.kind !== "acquire") throw new Error("Fixture");
        node.choice = { mode: "pinned", alternativeId: "buy" };
        graph.prices["purchase:a:buy"] = quote(15);
        const item = { ...firstItem, quality: 20, sockets: 3, socketLinks: [true, false] };
        expect(replaceGraphPurchaseItem(graph, "a", "buy", firstItem, firstItem)).toEqual(graph);
        const next = replaceGraphPurchaseItem(graph, "a", "buy", firstItem, item);
        expect(next.nodes[0]).toMatchObject({
            ...node,
            alternatives: [{ ...node.alternatives[0], item, price: null }],
        });
        expect(next.nodes.slice(1)).toEqual(graph.nodes.slice(1));
        expect(next.outcomes).toEqual(graph.outcomes);
        expect(next.prices["purchase:a:buy"]).toBeUndefined();
        expect(graph.prices["purchase:a:buy"]).toEqual(quote(15));
        item.socketLinks[0] = false;
        expect(next.nodes[0]).toMatchObject({
            alternatives: [{ item: { socketLinks: [true, false] } }],
        });
    });
    it("refuses a disappeared purchase or stale item edit without overwriting it", () => {
        const graph = graphFixture();
        expect(() =>
            replaceGraphPurchaseItem(graph, "combine", "buy", firstItem, firstItem),
        ).toThrow("purchase alternative");
        expect(() =>
            replaceGraphPurchaseItem(graph, "a", "buy", { ...firstItem, quality: 20 }, firstItem),
        ).toThrow("changed while the workbench was open");
        expect(graph).toEqual(graphFixture());
    });
    it("preserves a handed-off item's full state without sharing mutable objects", () => {
        const item = structuredClone(firstItem);
        item.corrupted = true;
        const graph = projectFromItem(
            historyIndex.revisions.find(
                (entry) => entry.game === "poe1" && entry.revision === "r2",
            )!,
            item,
            "Donor",
            quote(12),
        );
        const node = graph.nodes[0]!;
        if (node.kind !== "acquire") throw new Error("Expected acquisition");
        const purchase = node.alternatives[0]!;
        if (purchase.kind !== "purchase") throw new Error("Expected purchase");
        expect(purchase.item).toEqual(item);
        expect(purchase.price).toEqual(quote(12));
        expect(purchase.item).not.toBe(item);
        item.mods.length = 0;
        expect(purchase.item.mods.length).toBeGreaterThan(0);
    });
    it("connects only the selected input and rejects cycles or missing sources", () => {
        const graph = graphFixture();
        const craft = graph.nodes.find((node) => node.kind === "craft")!;
        if (craft.kind !== "craft") throw new Error("Expected craft");
        const next = connectGraphInput(graph, craft.id, craft.inputs[0]!.id, "b");
        expect(next.nodes.find((node) => node.id === craft.id)).toMatchObject({
            inputs: [{ ...craft.inputs[0], source: "b" }, craft.inputs[1]],
        });
        expect(craft.inputs[0]!.source).toBe("a");
        expect(() => connectGraphInput(graph, craft.id, craft.inputs[0]!.id, craft.id)).toThrow(
            "cycle",
        );
        expect(() => connectGraphInput(graph, craft.id, craft.inputs[0]!.id, "missing")).toThrow(
            "Unknown production",
        );
        expect(() => connectGraphInput(graph, "a", "item", "b")).toThrow("crafting input");
    });
    it("refuses removing the final step or a consumed source", () => {
        const graph = graphFixture();
        expect(() => removeGraphNode(graph, graph.entry)).toThrow("final step");
        expect(() => removeGraphNode(graph, "a")).toThrow("consumers");
        const extra = { ...graph.nodes[0]!, id: "unused" };
        expect(removeGraphNode({ ...graph, nodes: [...graph.nodes, extra] }, "unused")).toEqual(
            graph,
        );
    });
});

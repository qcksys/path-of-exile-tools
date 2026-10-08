import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";
import { api } from "../app/api/router.server";
import { createDbConnection } from "../app/db/client";
import { CraftingEngine } from "../app/lib/crafting-engine";
import { replaceGraphMethod } from "../app/lib/crafting-graph-method";
import { configureSimpleCraft } from "../app/lib/crafting-smart";
import { handleMcpRequest } from "../app/mcp/server.server";
import type { OperationContext } from "../app/operations/operation";
import type { CraftingMethod } from "../app/schemas/crafting";
import { craftingGraphSchema } from "../app/schemas/crafting-graph";
import { conditionalTransmuteGraph } from "./crafting-conditional-fixtures";
import { currency, engine } from "./crafting-fixtures";
import { firstItem, graphFixture } from "./crafting-graph-fixtures";
import {
    historyIndex,
    retainedRevision,
    retainedTransmuteGraph,
} from "./crafting-history-fixtures";
import { workbenchCatalog } from "./crafting-workbench-fixtures";

vi.mock("~/services/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const ruleset = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r7",
)!;
const fossil: CraftingMethod = {
    kind: "fossils",
    ids: [engine.catalog.crafting.fossils.find((entry) => entry.name === "Pristine Fossil")!.id],
    resonator: engine.catalog.crafting.currencies.find(
        (entry) => entry.action === "delve_currency_reroll" && entry.id.endsWith("1"),
    )!.id,
    logic: "multiplicative",
};

describe("graph method editing", () => {
    it("preserves a selected minimum when saving an unchanged method", () => {
        const graph = retainedTransmuteGraph(ruleset, engine.catalog);
        const node = graph.nodes.find((entry) => entry.kind === "craft")!;
        node.method = currency("apply_zana_influence");
        Object.assign(
            node,
            configureSimpleCraft(engine, node, {
                kind: "minimum",
                field: "memoryStrands",
                value: 80,
            }),
        );
        expect(
            replaceGraphMethod(engine, ruleset, {
                graph,
                nodeId: node.id,
                expectedMethod: node.method,
                method: node.method,
            }),
        ).toEqual(graph);
    });
    it("keeps full method settings, prices, conditions and routes without mutating callers", () => {
        const graph = graphFixture();
        const node = graph.nodes.find((entry) => entry.kind === "craft")!;
        node.branches = node.branches.filter((branch) => branch.id !== "second");
        node.applyWhen = node.output;
        const original = structuredClone(graph);
        const next = replaceGraphMethod(engine, ruleset, {
            graph,
            nodeId: node.id,
            expectedMethod: node.method,
            method: fossil,
        });
        expect(next.nodes[2]).toEqual({ ...node, method: fossil, inputs: [node.inputs[0]] });
        expect(next.prices).toEqual(graph.prices);
        expect(next.nodes.slice(0, 2)).toEqual(graph.nodes.slice(0, 2));
        expect(graph).toEqual(original);
        const restored = replaceGraphMethod(engine, ruleset, {
            graph: next,
            nodeId: node.id,
            expectedMethod: fossil,
            method: node.method,
        });
        expect(restored.nodes[2]).toMatchObject({
            inputs: [node.inputs[0], { id: "input-2", name: "Item 2", source: "a" }],
        });
    });
    it("refuses removing recovery inputs, including routes from other steps and fallbacks", () => {
        const graph = graphFixture();
        const node = graph.nodes.find((entry) => entry.kind === "craft")!;
        const apply = () =>
            replaceGraphMethod(engine, ruleset, {
                graph,
                nodeId: node.id,
                expectedMethod: node.method,
                method: fossil,
            });
        expect(apply).toThrow("Reconnect recovery routes");
        const extra = structuredClone(node);
        extra.id = "other";
        extra.branches = [];
        extra.fallback = { kind: "recover", nodeId: node.id, inputId: "right" };
        graph.nodes.push(extra);
        node.branches = [];
        expect(apply).toThrow("Reconnect recovery routes");
    });
    it("refuses stale edits, inventory donors, wrong catalogs and disabled era methods", () => {
        const graph = graphFixture();
        const node = graph.nodes.find((entry) => entry.kind === "craft")!;
        const input = { graph, nodeId: node.id, expectedMethod: node.method, method: node.method };
        expect(() =>
            replaceGraphMethod(engine, ruleset, { ...input, expectedMethod: fossil }),
        ).toThrow("changed while");
        expect(() =>
            replaceGraphMethod(engine, ruleset, {
                ...input,
                method: {
                    kind: "recombine",
                    id: "recombine",
                    donor: { id: "donor", name: "Donor", item: firstItem },
                },
            }),
        ).toThrow("graph input");
        expect(() =>
            replaceGraphMethod(new CraftingEngine(workbenchCatalog("poe2")), ruleset, input),
        ).toThrow("matching catalog");
        expect(() =>
            replaceGraphMethod(
                engine,
                { ...ruleset, availability: { ...ruleset.availability, kinds: [] } },
                input,
            ),
        ).toThrow("unavailable");
        expect(() => replaceGraphMethod(engine, ruleset, { ...input, nodeId: "a" })).toThrow(
            "crafting step",
        );
    });
    for (const game of ["poe1", "poe2"] as const) {
        it.each([
            "valid",
            "stale",
            "invalid",
        ] as const)(`${game} shares %s method edits through HTTP and MCP`, async (scenario) => {
            const graph = conditionalTransmuteGraph(game);
            const node = graph.nodes.find((entry) => entry.kind === "craft")!;
            const method: CraftingMethod =
                game === "poe1" ? fossil : { kind: "generate", id: "rare" };
            const input = {
                graph,
                nodeId: node.id,
                expectedMethod: scenario === "stale" ? method : node.method,
                method: scenario === "invalid" ? { kind: "currency", id: "missing" } : method,
            };
            const context: OperationContext = {
                db: createDbConnection("mysql://test:test@localhost/poe_test"),
                loadCatalog: async () => {
                    throw new Error("Unused recombinator catalog");
                },
                loadWorkbenchCatalog: async (game) => workbenchCatalog(game),
                loadCraftingRulesets: async () => historyIndex,
                loadCraftingRevision: retainedRevision,
                origin: "https://poe.boats",
                caller: null,
            };
            const response = await api.request(
                "https://poe.boats/api/v1/crafting/graph/method",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(input),
                },
                { runtime: async () => context },
            );
            const rpc = await handleMcpRequest(
                new Request("https://poe.boats/mcp", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        accept: "application/json, text/event-stream",
                    },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        id: 1,
                        method: "tools/call",
                        params: { name: "replace_crafting_graph_method", arguments: input },
                    }),
                }),
                async () => context,
            );
            const result = CallToolResultSchema.parse(
                z.object({ result: z.unknown() }).parse(await rpc.json()).result,
            );
            if (scenario !== "valid") {
                expect(response.status).toBe(400);
                expect(result.isError).toBe(true);
            } else {
                expect(response.status, await response.clone().text()).toBe(200);
                expect(result.isError).not.toBe(true);
                const data = z.object({ graph: craftingGraphSchema }).parse(await response.json());
                expect(result.structuredContent).toEqual(data);
                expect(
                    data.graph.nodes.find((entry: { id: string }) => entry.id === node.id),
                ).toEqual({ ...node, method });
            }
        });
    }
});

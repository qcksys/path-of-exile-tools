import { readFileSync } from "node:fs";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";
import { api } from "../app/api/router.server";
import { createDbConnection } from "../app/db/client";
import { calculateCraftingGraph } from "../app/lib/crafting-graph-simulation";
import { validateCraftingGraph } from "../app/lib/crafting-graph-validation";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { projectFromRecombinatorPlan } from "../app/lib/recombinator-crafting-plan";
import { catalogExampleDraft } from "../app/lib/recombinator-plan";
import { handleMcpRequest } from "../app/mcp/server.server";
import type { OperationContext } from "../app/operations/operation";
import { recombinatorCatalogSchema } from "../app/schemas/recombinator-catalog";
import { recombinatorCraftingPlanSchema } from "../app/schemas/recombinator-crafting";
import { catalog, engine } from "./crafting-fixtures";
import { quote } from "./crafting-graph-fixtures";
import { historyIndex, retainedRevision } from "./crafting-history-fixtures";

afterEach(() => vi.restoreAllMocks());
vi.mock("~/services/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const recombinator = recombinatorCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/recombinator-poe1.json", "utf8")),
);
const ruleset = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r6",
)!;
function fixture() {
    const draft = catalogExampleDraft(recombinator);
    return recombinatorCraftingPlanSchema.parse({
        source: {
            patch: catalog.patch,
            manifestSha256: catalog.manifestSha256,
            craftingSha256: catalog.craftingSha256,
        },
        draft,
        finalStep: draft.steps.at(-1)!.id,
        inputs: Object.fromEntries(
            draft.items.map((entry) => [
                entry.id,
                {
                    baseId: recombinator.bases.find(
                        (base) =>
                            base.itemClass === entry.catalog!.base.itemClass &&
                            entry.catalog!.base.tags.every((tag) => base.tags.includes(tag)),
                    )!.id,
                    rarity: "rare",
                    rolls: "minimum",
                },
            ]),
        ),
    });
}
describe("connected recombinator plan handoff", () => {
    it.each([
        false,
        true,
    ])("shares graph creation and missing-input refusal through HTTP/MCP (invalid=%s)", async (invalid) => {
        vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
        const context: OperationContext = {
            db: createDbConnection("mysql://test:test@localhost/poe_test"),
            loadCatalog: async () => recombinator,
            loadWorkbenchCatalog: async () => catalog,
            loadCraftingRulesets: async () => historyIndex,
            loadCraftingRevision: retainedRevision,
            origin: "https://poe.boats",
            caller: null,
        };
        const input = fixture();
        if (invalid) delete input.inputs[input.draft.items[0]!.id];
        const response = await api.request(
            "https://poe.boats/api/v1/crafting/graph/from-recombinator",
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
                    params: {
                        name: "create_crafting_graph_from_recombinator_plan",
                        arguments: input,
                    },
                }),
            }),
            async () => context,
        );
        const result = CallToolResultSchema.parse(
            z.object({ result: z.unknown() }).parse(await rpc.json()).result,
        );
        if (invalid) {
            expect(response.status).toBe(400);
            expect(result.isError).toBe(true);
        } else {
            expect(response.status).toBe(200);
            expect(result.isError).not.toBe(true);
            const expected = {
                graph: projectFromRecombinatorPlan(engine, recombinator, ruleset, input),
            };
            expect(await response.json()).toEqual(expected);
            expect(result.structuredContent).toEqual(expected);
        }
    });
    it("preserves connected inputs and charges four purchases and three crafts exactly once", () => {
        const input = fixture();
        const before = structuredClone(input);
        const graph = projectFromRecombinatorPlan(engine, recombinator, ruleset, input);
        expect(graph.nodes.filter((node) => node.kind === "craft")).toHaveLength(3);
        for (const node of graph.nodes)
            if (node.kind === "acquire") {
                const purchase = node.alternatives[0]!;
                if (purchase.kind !== "purchase") throw new Error("Fixture");
                expect(purchase.price).toBeNull();
                purchase.price = quote(10);
            }
        graph.prices["service:recombine"] = quote(2);
        const result = calculateCraftingGraph(
            catalog,
            { ...graph, iterations: 3 },
            { estimateIterations: 1, workLimit: 10000 },
        );
        expect(result).toMatchObject({
            complete: true,
            probability: 1,
            meanCost: 46,
            meanActions: 3,
        });
        expect(input).toEqual(before);
    });
    it("retains targets and maps a generic required base to the chosen concrete inputs", () => {
        const input = fixture();
        const selection = input.draft.items[0]!;
        input.required = [...selection.catalog!.prefixes, ...selection.catalog!.suffixes].map(
            (mod) => mod.id,
        );
        input.exact = true;
        input.requiredBase = selection.catalog!.base.id;
        const graph = projectFromRecombinatorPlan(engine, recombinator, ruleset, input);
        const acquisition = graph.nodes[0]!;
        if (acquisition.kind !== "acquire" || acquisition.alternatives[0]?.kind !== "purchase")
            throw new Error("Fixture");
        const item = acquisition.alternatives[0].item;
        const matcher = createCraftingItemQuery(engine);
        expect(matcher.matches(item, graph.outcomes[0]!.query)).toBe("match");
        expect(matcher.matches({ ...item, mods: [] }, graph.outcomes[0]!.query)).toBe("no-match");
        validateCraftingGraph(catalog, graph);
    });
    it("adds explicit bench preparation and removes surviving crafts only when present", () => {
        const input = fixture();
        input.draft.items = input.draft.items.slice(0, 2);
        input.inputs = Object.fromEntries(
            input.draft.items.map((entry) => [entry.id, input.inputs[entry.id]!]),
        );
        for (const entry of input.draft.items) {
            entry.catalog!.prefixes = [];
            entry.catalog!.suffixes = [];
        }
        const recipe = recombinator.recipes!.find(
            (entry) =>
                entry.kind === "bench" &&
                entry.itemClasses.includes(input.draft.items[0]!.catalog!.base.itemClass) &&
                catalog.mods[entry.mod]?.implicit_tags.includes("unveiled_mod"),
        )!;
        input.draft.steps = [
            {
                id: "combine",
                name: "Combine",
                left: input.draft.items[0]!.id,
                right: input.draft.items[1]!.id,
                leftPreparation: recipe.id,
                removeCrafted: true,
            },
        ];
        input.finalStep = "combine";
        const graph = projectFromRecombinatorPlan(engine, recombinator, ruleset, input);
        expect(graph.entry).toBe("step-0-remove");
        expect(graph.nodes.find((node) => node.id === "step-0-left-bench")).toMatchObject({
            method: { kind: "bench", id: recipe.id },
        });
        expect(graph.nodes.at(-1)).toMatchObject({
            applyWhen: { groups: [{ filters: [{ kind: "mod", crafted: true }] }] },
        });
        validateCraftingGraph(catalog, graph);
        const result = calculateCraftingGraph(
            catalog,
            { ...graph, iterations: 10 },
            { estimateIterations: 1, workLimit: 10000 },
        );
        expect(result.errors).toEqual({});
        expect(result.probability).toBe(1);
    });
    it("refuses missing inputs, custom modifiers, stale source and idealized essence preparation", () => {
        const input = fixture();
        delete input.inputs[input.draft.items[0]!.id];
        expect(() => projectFromRecombinatorPlan(engine, recombinator, ruleset, input)).toThrow(
            "concrete base",
        );
        const stale = fixture();
        stale.source.manifestSha256 = "0".repeat(64);
        expect(() => projectFromRecombinatorPlan(engine, recombinator, ruleset, stale)).toThrow(
            "matching",
        );
        const essence = fixture();
        essence.draft.steps[0]!.leftPreparation = recombinator.recipes!.find(
            (entry) => entry.kind === "essence",
        )!.id;
        expect(() => projectFromRecombinatorPlan(engine, recombinator, ruleset, essence)).toThrow(
            /essence|recipe/,
        );
        const custom = fixture();
        custom.draft.items[0]!.prefixes = "Custom mod";
        expect(() => projectFromRecombinatorPlan(engine, recombinator, ruleset, custom)).toThrow(
            /custom|catalog/i,
        );
    });
});

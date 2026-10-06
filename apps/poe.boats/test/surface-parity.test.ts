import {
    CallToolResultSchema,
    InitializeResultSchema,
    ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";
import { api } from "~/api/router.server";
import { MAP_CRAFTING_OPTIONS } from "~/data/map-crafting-options";
import { MAP_DEVICE_UNLOCKS } from "~/data/map-device-unlocks";
import { SCARABS } from "~/data/scarab-data";
import { createDbConnection } from "~/db/client";
import { calculateRecipeScenario } from "~/lib/arbitrage";
import { calculateRecombinatorPlan } from "~/lib/recombinator";
import { exampleRecombinatorDraft, parseRecombinatorDraft } from "~/lib/recombinator-plan";
import { handleMcpRequest } from "~/mcp/server.server";
import { importPlannerShare } from "~/operations/import-share";
import type { OperationContext } from "~/operations/operation";
import { editPlanner, newPlannerSet } from "~/operations/planner";
import { operations } from "~/operations/registry.server";
import { STORAGE_VERSION, type StorageData } from "~/schemas/storage";
import { catalogFixture } from "./fixtures/recombinator-catalog";

vi.mock("~/services/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const context: OperationContext = {
    db: createDbConnection("mysql://test:test@localhost/poe_test"),
    loadCatalog: async () => catalogFixture,
    origin: "https://poe.boats",
    caller: null,
};
const runtime = async () => context;
const RpcSchema = z.object({ result: z.unknown().optional(), error: z.unknown().optional() });
const RouteSchema = z.object({
    operationId: z.string(),
    responses: z.record(
        z.string(),
        z.object({ content: z.record(z.string(), z.object({ schema: z.unknown() })) }),
    ),
    requestBody: z
        .object({ content: z.record(z.string(), z.object({ schema: z.unknown() })) })
        .optional(),
});
const DocumentSchema = z.object({ paths: z.record(z.string(), z.record(z.string(), RouteSchema)) });

async function mcp(method: string, params?: unknown, authenticated = false) {
    return handleMcpRequest(
        new Request("https://poe.boats/mcp", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                accept: "application/json, text/event-stream",
            },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        }),
        async () =>
            authenticated
                ? {
                      ...context,
                      caller: {
                          id: "owner",
                          name: "Test",
                          email: "test@example.com",
                          role: "user",
                      },
                  }
                : context,
    );
}

describe("transport parity", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("publishes every operation with complete input and output schemas", async () => {
        const response = await api.request("https://poe.boats/api/openapi.json");
        expect(response.status).toBe(200);
        const document = DocumentSchema.parse(await response.json());
        const published = Object.values(document.paths).flatMap((path) => Object.values(path));
        expect(published.map((route) => route.operationId).sort()).toEqual(
            operations.map((operation) => operation.name).sort(),
        );
        expect(new Set(operations.map((operation) => operation.name)).size).toBe(operations.length);
        for (const operation of operations) {
            const route =
                document.paths[
                    `/api/v1/${operation.family}${operation.path === "/" ? "" : operation.path}`
                ]?.[operation.method] ??
                document.paths[`/api/v1/${operation.family}${operation.path}`]?.[operation.method];
            expect(route, operation.name).toBeDefined();
            expect(route.responses[200].content["application/json"].schema).toBeDefined();
            if (operation.method === "post")
                expect(route.requestBody?.content["application/json"].schema).toBeDefined();
            expect(
                () => z.toJSONSchema(operation.input, { io: "input" }),
                operation.name,
            ).not.toThrow();
            expect(() => z.toJSONSchema(operation.output), operation.name).not.toThrow();
        }
    });

    it("speaks MCP initialization and advertises the same tools with matching schemas", async () => {
        const initialized = await mcp("initialize", {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test", version: "1" },
        });
        const initializedBody = RpcSchema.parse(await initialized.json());
        expect(initializedBody.result, JSON.stringify(initializedBody)).toBeDefined();
        expect(InitializeResultSchema.parse(initializedBody.result).serverInfo.name).toBe(
            "poe-boats",
        );
        const response = await mcp("tools/list", {}, true);
        expect(response.status).toBe(200);
        const result = ListToolsResultSchema.parse(RpcSchema.parse(await response.json()).result);
        expect(result.tools.map((tool: { name: string }) => tool.name).sort()).toEqual(
            operations.map((operation) => operation.name).sort(),
        );
        for (const tool of result.tools) {
            expect(tool.inputSchema.type).toBe("object");
            expect(tool.outputSchema?.type).toBe("object");
            expect(tool.annotations?.readOnlyHint).toBe(
                operations.find((operation) => operation.name === tool.name)?.readOnly,
            );
        }
        const anonymous = ListToolsResultSchema.parse(
            RpcSchema.parse(await (await mcp("tools/list")).json()).result,
        );
        expect(anonymous.tools.some((tool) => tool.name === "get_account")).toBe(false);
    });

    it.each([
        ["calculate_recipe_scenario", { inputCost: 10, outputValue: 18, buffer: 5 }],
        ["calculate_recombinator", parseRecombinatorDraft(exampleRecombinatorDraft)],
        ["get_idol_catalog", {}],
        ["list_idol_modifiers", { locale: "en" }],
        ["get_recombinator_catalog", {}],
        ["list_vendor_recipes", { game: "1" }],
        ["list_unique_idols", { locale: "en" }],
        ["search_idol_modifiers", { query: "scarab", bases: ["minor"] }],
        ["list_recombinator_bases", {}],
        ["list_preparation_recipes", { bases: catalogFixture.bases, kind: "bench" }],
        ["edit_favorite_modifiers", { favorites: ["one"], modId: "one", action: "toggle" }],
        ["update_trade_settings", { updates: { maxWeight: 100 } }],
    ])("%s gives the same result through HTTP and MCP", async (name, input) => {
        const operation = operations.find((entry) => entry.name === name)!;
        const query =
            operation.method === "get"
                ? `?${new URLSearchParams(input as Record<string, string>)}`
                : "";
        const request = new Request(
            `https://poe.boats/api/v1/${operation.family}${operation.path}${query}`,
            operation.method === "get"
                ? {}
                : {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(input),
                  },
        );
        const response = await api.fetch(request, { runtime });
        expect(response.status).toBe(200);
        const apiResult = await response.json();
        const rpc = RpcSchema.parse(
            await (await mcp("tools/call", { name, arguments: input })).json(),
        );
        expect(rpc.result, JSON.stringify(rpc)).toBeDefined();
        const result = CallToolResultSchema.parse(rpc.result);
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toEqual(apiResult);
        expect(operation.output.safeParse(apiResult).success).toBe(true);
        if (name === "calculate_recipe_scenario")
            expect(apiResult).toEqual({
                result: calculateRecipeScenario({ inputCost: 10, outputValue: 18, buffer: 5 }),
            });
        if (name === "calculate_recombinator")
            expect(apiResult).toEqual({
                results: calculateRecombinatorPlan(
                    parseRecombinatorDraft(exampleRecombinatorDraft),
                ),
            });
    });

    it("authenticates account routes before parsing invalid input", async () => {
        const response = await api.request(
            "https://poe.boats/api/v1/sets/create",
            { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" },
            { runtime },
        );
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "Authentication required." });
    });

    it("preserves prepared donor options through HTTP and MCP draft parsing", async () => {
        const draft = structuredClone(exampleRecombinatorDraft);
        draft.steps[0].leftPreparation = "donor";
        draft.steps[0].rightPreparation = "donor";
        draft.steps[0].leftKeepInputMods = true;
        draft.steps[0].rightKeepInputMods = false;
        const catalog = {
            ...catalogFixture,
            recipes: [
                {
                    id: "donor",
                    name: "Essence donor",
                    kind: "essence" as const,
                    mod: "Armour1",
                    itemClasses: ["Body Armour"],
                    cost: [],
                },
            ],
        };
        const input = { draft, catalog };
        const expected = { plan: parseRecombinatorDraft(draft, catalog) };
        expect(expected.plan.steps[0].leftPreparation?.keepInputMods).toBe(true);
        expect(expected.plan.steps[0].rightPreparation?.keepInputMods).toBe(false);
        const response = await api.request(
            "https://poe.boats/api/v1/recombinator/draft",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
            },
            { runtime },
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(expected);
        const rpc = RpcSchema.parse(
            await (
                await mcp("tools/call", {
                    name: "resolve_recombinator_draft",
                    arguments: input,
                })
            ).json(),
        );
        expect(CallToolResultSchema.parse(rpc.result).structuredContent).toEqual(expected);
    });

    it("rejects invalid inputs without leaking internal failures", async () => {
        const response = await api.request(
            "https://poe.boats/api/v1/arbitrage/scenario",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ inputCost: -1, outputValue: 5, buffer: 0 }),
            },
            { runtime },
        );
        expect(response.status).toBe(400);
        expect(
            z
                .object({ issues: z.array(z.object({ path: z.string() })) })
                .parse(await response.json()).issues[0].path,
        ).toBe("inputCost");
        const rpc = RpcSchema.parse(
            await (
                await mcp("tools/call", {
                    name: "calculate_recipe_scenario",
                    arguments: { inputCost: -1, outputValue: 5, buffer: 0 },
                })
            ).json(),
        );
        expect(
            (rpc.result && CallToolResultSchema.parse(rpc.result).isError) || rpc.error,
        ).toBeTruthy();
    });

    it("rejects cross-origin requests, oversized bodies, and unsupported methods", async () => {
        const response = await api.request(
            "https://poe.boats/api/v1/sets/create",
            { method: "POST", headers: { origin: "https://evil.example" } },
            { runtime },
        );
        expect(response.status).toBe(403);
        const large = await api.request(
            "https://poe.boats/api/v1/arbitrage/scenario",
            { method: "POST", body: "x".repeat(1024 * 1024 + 1) },
            { runtime },
        );
        expect(large.status).toBe(413);
        const wrongMethod = await api.request(
            "https://poe.boats/api/v1/arbitrage/scenario",
            {},
            { runtime },
        );
        expect(wrongMethod.status).toBe(405);
        expect(wrongMethod.headers.get("Allow")).toBe("POST");
        expect((await handleMcpRequest(new Request("https://poe.boats/mcp"), runtime)).status).toBe(
            405,
        );
    });
});

describe("planner shared operations", () => {
    const idol = {
        id: "idol",
        baseType: "minor" as const,
        itemLevel: 80,
        rarity: "rare" as const,
        prefixes: [],
        suffixes: [],
    };
    function populated(): StorageData {
        const set = newPlannerSet("Example", "set");
        set.inventory = [{ id: "inventory", idol, source: "manual", importedAt: 0, usageCount: 1 }];
        set.placements = [
            { id: "placement", inventoryIdolId: "inventory", position: { x: 1, y: 1 } },
        ];
        return { version: STORAGE_VERSION, sets: [set], activeSetId: set.id };
    }
    it("duplicates inventory and placement references together", () => {
        const result = editPlanner({
            state: populated(),
            command: { action: "duplicate", setId: "set" },
        });
        const copy = result.state.sets[1];
        expect(copy.placements[0].inventoryIdolId).toBe(copy.inventory[0].id);
        expect(copy.inventory[0].id).not.toBe("inventory");
        expect(copy.inventory[0].usageCount).toBe(1);
    });
    it("detects duplicate shares and remaps references when a second copy is requested", () => {
        const state = populated();
        const shared = {
            version: 1 as const,
            set: state.sets[0],
            idols: state.sets[0].inventory,
            createdAt: 0,
        };
        expect(importPlannerShare({ state, shared }).duplicateSetId).toBe("set");
        const result = importPlannerShare({ state, shared, force: true });
        const imported = result.state.sets[1];
        expect(imported.id).toBe(result.importedSetId);
        expect(imported.inventory[0].source).toBe("shared");
        expect(imported.placements[0].inventoryIdolId).toBe(imported.inventory[0].id);
    });
    it("honors the picker limits and grid unlock rules", () => {
        const state = populated();
        const scarab = SCARABS.find((item) => item.limit === 1)!;
        const first = editPlanner({
            state,
            command: { action: "setSlot", setId: "set", slotIndex: 0, scarabId: scarab.id },
        });
        expect(() =>
            editPlanner({
                state: first.state,
                command: { action: "setSlot", setId: "set", slotIndex: 1, scarabId: scarab.id },
            }),
        ).toThrow("limit");
        const imbued = MAP_CRAFTING_OPTIONS.find((option) => option.imbued)!;
        expect(() =>
            editPlanner({
                state,
                command: { action: "setCraft", setId: "set", craftingOptionId: imbued.id },
            }),
        ).toThrow("unavailable");
        state.sets[0].unlockedConditions = [];
        expect(() =>
            editPlanner({
                state,
                command: {
                    action: "move",
                    setId: "set",
                    placementId: "placement",
                    position: MAP_DEVICE_UNLOCKS[0].positions[0],
                },
            }),
        ).toThrow("Cannot place");
    });
    it("refuses cross-set children and blocked or duplicate placements", () => {
        const state = populated();
        expect(() =>
            editPlanner({
                state,
                command: { action: "removeIdols", setId: "set", ids: ["other-set-idol"] },
            }),
        ).toThrow("Idol not found");
        expect(() =>
            editPlanner({
                state,
                command: {
                    action: "move",
                    setId: "set",
                    placementId: "other-set-placement",
                    position: { x: 2, y: 1 },
                },
            }),
        ).toThrow("Placement not found");
        expect(() =>
            editPlanner({
                state,
                command: {
                    action: "place",
                    setId: "set",
                    idolId: "inventory",
                    position: { x: 2, y: 1 },
                },
            }),
        ).toThrow("Cannot place");
        expect(() =>
            editPlanner({
                state,
                command: {
                    action: "move",
                    setId: "set",
                    placementId: "placement",
                    position: { x: 0, y: 0 },
                },
            }),
        ).toThrow("Cannot place");
    });
    it("removes placements with their inventory and keeps the final set", () => {
        const state = populated();
        const result = editPlanner({
            state,
            command: { action: "removeIdols", setId: "set", ids: ["inventory"] },
        });
        expect(result.state.sets[0].placements).toEqual([]);
        expect(state.sets[0].placements).toHaveLength(1);
        expect(() => editPlanner({ state, command: { action: "delete", setId: "set" } })).toThrow(
            "Keep at least one set",
        );
    });
});

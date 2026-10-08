import {
    CallToolResultSchema,
    InitializeResultSchema,
    ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { itemQuerySchema, normalizeApiItem } from "@poe-tools/item-query";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";
import { api } from "~/api/router.server";
import { MAP_CRAFTING_OPTIONS } from "~/data/map-crafting-options";
import { MAP_DEVICE_UNLOCKS } from "~/data/map-device-unlocks";
import { SCARABS } from "~/data/scarab-data";
import { createDbConnection } from "~/db/client";
import * as craftingExchangeQueries from "~/db/queries/crafting-exchange.queries";
import * as craftingMarketQueries from "~/db/queries/crafting-market.queries";
import { calculateRecipeScenario } from "~/lib/arbitrage";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import { bindExchangePrice } from "~/lib/crafting-exchange";
import { calculateCraftingGraph } from "~/lib/crafting-graph-simulation";
import { createCraftingItemQuery } from "~/lib/crafting-item-query";
import { exportCraftingItemText } from "~/lib/crafting-item-text";
import { bindCohortPurchasePrice } from "~/lib/crafting-market";
import { FossilOptimizer, fossilOptimizationSchema } from "~/lib/crafting-optimizer";
import { craftingPresets, listCraftingPresets, projectFromPreset } from "~/lib/crafting-presets";
import { rulesetReference } from "~/lib/crafting-rulesets";
import { CraftingProcess } from "~/lib/crafting-simulation";
import { bindCraftingSourcePrice } from "~/lib/crafting-sources";
import {
    CraftingWorkbenchCalculation,
    editCraftingStartingItem,
    emulateCraftingItem,
} from "~/lib/crafting-workbench";
import { parseCraftingWorkspace } from "~/lib/crafting-workspace";
import { calculateRecombinatorPlan } from "~/lib/recombinator";
import { exampleRecombinatorDraft, parseRecombinatorDraft } from "~/lib/recombinator-plan";
import { handleMcpRequest } from "~/mcp/server.server";
import { importPlannerShare } from "~/operations/import-share";
import type { OperationContext } from "~/operations/operation";
import { editPlanner, newPlannerSet } from "~/operations/planner";
import { operations } from "~/operations/registry.server";
import { craftingCatalogSchema, craftingMethodSchema } from "~/schemas/crafting";
import { craftingItemQueryTextResultSchema } from "~/schemas/crafting-item-query-text";
import { craftingSourceQuoteSchema } from "~/schemas/crafting-sources";
import type { CraftingItemEdit } from "~/schemas/crafting-workbench";
import { STORAGE_VERSION, type StorageData } from "~/schemas/storage";
import * as craftingSources from "~/services/crafting-sources.server";
import { conditionalTransmuteGraph } from "./crafting-conditional-fixtures";
import {
    exchangeGraph,
    exchangeQuote,
    exchangeSnapshot,
    transmuteId,
} from "./crafting-exchange-fixtures";
import { catalog as craftingCatalog, engine as fixtureEngine } from "./crafting-fixtures";
import { firstItem, graphFixture, quote } from "./crafting-graph-fixtures";
import {
    historyIndex,
    retainedRevision,
    retainedTransmuteGraph,
} from "./crafting-history-fixtures";
import {
    adaptiveMarketCandidate,
    donorFamilyMarketFixture,
    marketCandidate,
    marketGraph,
} from "./crafting-market-fixtures";
import { nnnGraph } from "./crafting-nnn-fixtures";
import {
    fossilOptimizationFixture,
    workbenchCatalog,
    workbenchProject,
} from "./crafting-workbench-fixtures";
import { catalogFixture } from "./fixtures/recombinator-catalog";

vi.mock("~/services/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const context: OperationContext = {
    db: createDbConnection("mysql://test:test@localhost/poe_test"),
    loadCatalog: async () => catalogFixture,
    loadWorkbenchCatalog: async (game) => workbenchCatalog(game),
    loadCraftingRulesets: async () => historyIndex,
    loadCraftingRevision: retainedRevision,
    origin: "https://poe.boats",
    caller: null,
};
const runtime = async () => context;
const workspaceFixture = () =>
    parseCraftingWorkspace({
        format: 1,
        projects: [{ graph: graphFixture(), revision: 2, updatedAt: "2026-10-07T00:00:00.000Z" }],
        builds: [
            {
                id: "build",
                name: "Axe build",
                game: "poe1",
                revision: 1,
                updatedAt: "2026-10-07T00:00:00.000Z",
                members: [{ id: "axe", kind: "reference", projectId: graphFixture().id }],
            },
        ],
        tabs: [graphFixture().id],
        activeProjectId: graphFixture().id,
    });
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

    it.each([
        "poe1",
        "poe2",
    ] as const)("lists %s common crafts identically over HTTP and MCP", async (game) => {
        const input = { game };
        const response = await api.request(
            "https://poe.boats/api/v1/crafting/presets",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
            },
            { runtime },
        );
        const expected = { presets: listCraftingPresets(game) };
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(expected);
        const rpc = RpcSchema.parse(
            await (
                await mcp("tools/call", { name: "list_crafting_presets", arguments: input })
            ).json(),
        );
        expect(CallToolResultSchema.parse(rpc.result).structuredContent).toEqual(expected);
    });

    it.each(craftingPresets)("creates $name identically over HTTP and MCP", async (preset) => {
        const ruleset = historyIndex.revisions.find(
            (entry) => entry.game === "poe1" && entry.revision === "r7",
        )!;
        const input = { game: "poe1", ruleset: rulesetReference(ruleset), presetId: preset.id };
        const expected = projectFromPreset(fixtureEngine, ruleset, preset.id);
        const response = await api.request(
            "https://poe.boats/api/v1/crafting/graph/from-preset",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
            },
            { runtime },
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ graph: { ...expected, id: expect.any(String) } });
        const rpc = RpcSchema.parse(
            await (
                await mcp("tools/call", {
                    name: "create_crafting_graph_from_preset",
                    arguments: input,
                })
            ).json(),
        );
        expect(CallToolResultSchema.parse(rpc.result).structuredContent).toEqual({
            graph: { ...expected, id: expect.any(String) },
        });
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("publishes the same current %s workbench catalog on both transports", async (game) => {
        const response = await api.request(
            `https://poe.boats/api/v1/crafting/workbench/catalog?game=${game}`,
            {},
            { runtime },
        );
        expect(response.status).toBe(200);
        const http = z.object({ catalog: craftingCatalogSchema }).parse(await response.json());
        const rpc = RpcSchema.parse(
            await (
                await mcp("tools/call", {
                    name: "get_crafting_workbench_catalog",
                    arguments: { game },
                })
            ).json(),
        );
        const result = CallToolResultSchema.parse(rpc.result);
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toEqual(http);
        expect(http.catalog.game).toBe(game);
        expect(http.catalog.patch).toBe(workbenchCatalog(game).patch);
        expect(Object.keys(http.catalog.bases)).toEqual(Object.keys(workbenchCatalog(game).bases));
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("shares %s workbench calculation and emulation through HTTP and MCP", async (game) => {
        const project = workbenchProject(game);
        const catalog = workbenchCatalog(game);
        const cases: [string, string, unknown, unknown][] = [];
        for (const mode of ["calculate", "sample", "process"] as const) {
            const calculation = new CraftingWorkbenchCalculation(catalog, project, mode);
            while (!calculation.runBatch()) {
                /* complete bounded fixture */
            }
            cases.push([
                "calculate_crafting_workbench",
                "calculate",
                { project, mode },
                { result: calculation.result() },
            ]);
        }
        const process = new CraftingProcess(
            new CraftingEngine(catalog),
            project,
            seededRandom(project.seed),
        );
        while (!process.done) process.advance();
        cases.push([
            "emulate_crafting_process",
            "process",
            { project },
            { result: process.result() },
        ]);
        const command = { kind: "apply", method: project.method } as const;
        cases.push([
            "emulate_crafting_item",
            "emulate",
            {
                game,
                patch: project.patch,
                item: project.item,
                command,
                seed: project.seed,
            },
            {
                result: emulateCraftingItem(
                    new CraftingEngine(catalog),
                    project.item,
                    command,
                    project.seed,
                ),
            },
        ]);
        for (const [name, path, input, expected] of cases) {
            const response = await api.request(
                `https://poe.boats/api/v1/crafting/workbench/${path}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(input),
                },
                { runtime },
            );
            expect(response.status, await response.clone().text()).toBe(200);
            expect(await response.json()).toEqual(JSON.parse(JSON.stringify(expected)));
            const rpc = RpcSchema.parse(
                await (await mcp("tools/call", { name, arguments: input })).json(),
            );
            const result = CallToolResultSchema.parse(rpc.result);
            expect(result.isError).not.toBe(true);
            expect(result.structuredContent).toEqual(JSON.parse(JSON.stringify(expected)));
        }
    });

    it.each([
        false,
        true,
    ])("shares seeded fossil rankings and unknown prices on HTTP and MCP (Allflame: %s)", async (allflame) => {
        const input = fossilOptimizationFixture(allflame);
        delete input.project.prices[input.options.fossils[0]!];
        const before = structuredClone(input);
        for (const partition of [undefined, { index: 1, count: 2 }]) {
            const options = { ...input.options, partition };
            const optimizer = new FossilOptimizer(
                fixtureEngine,
                input.project.item,
                input.project.target,
                input.project.prices,
                input.project.seed,
                options,
            );
            while (!optimizer.runBatch()) {
                /* Complete bounded fixture. */
            }
            const expected = { result: fossilOptimizationSchema.parse(optimizer.result()) };
            const request = { project: input.project, options };
            const response = await api.request(
                "https://poe.boats/api/v1/crafting/workbench/optimize-fossils",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(request),
                },
                { runtime },
            );
            expect(response.status, await response.clone().text()).toBe(200);
            expect(await response.json()).toEqual(JSON.parse(JSON.stringify(expected)));
            const rpc = RpcSchema.parse(
                await (
                    await mcp("tools/call", {
                        name: "optimize_crafting_fossils",
                        arguments: request,
                    })
                ).json(),
            );
            const result = CallToolResultSchema.parse(rpc.result);
            expect(result.isError).not.toBe(true);
            expect(result.structuredContent).toEqual(JSON.parse(JSON.stringify(expected)));
            expect(expected.result.byAttempts.some((entry) => entry.cost === null)).toBe(true);
        }
        expect(input).toEqual(before);
    });

    it("refuses stale, ineligible and oversized fossil searches on both transports", async () => {
        const input = fossilOptimizationFixture();
        const options = input.options;
        for (const request of [
            { ...input, project: { ...input.project, patch: "old" } },
            { ...input, project: { ...input.project, target: { groups: [] } } },
            { ...input, project: workbenchProject("poe2") },
            { ...input, options: { ...options, fossils: ["missing"] } },
            {
                ...input,
                options: { ...options, fossils: [options.fossils[0], options.fossils[0]] },
            },
            { ...input, options: { ...options, partition: { index: 2, count: 2 } } },
            { ...input, options: { ...options, trials: 5001 } },
            {
                ...input,
                options: {
                    ...options,
                    fossils: fixtureEngine
                        .availableFossils(input.project.item)
                        .slice(0, 8)
                        .map((entry) => entry.id),
                    maxSockets: 4,
                    trials: 1000,
                },
            },
        ]) {
            const response = await api.request(
                "https://poe.boats/api/v1/crafting/workbench/optimize-fossils",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(request),
                },
                { runtime },
            );
            expect(response.status).toBe(400);
            const rpc = RpcSchema.parse(
                await (
                    await mcp("tools/call", {
                        name: "optimize_crafting_fossils",
                        arguments: request,
                    })
                ).json(),
            );
            expect(CallToolResultSchema.parse(rpc.result).isError).toBe(true);
        }
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("shares %s starting-item editing and text export without mutating supplied state", async (game) => {
        const project = workbenchProject(game);
        const engine = new CraftingEngine(workbenchCatalog(game));
        const item = { ...project.item, rarity: "rare" as const };
        const id = engine.pool(item)[0]!.id;
        const added = engine.addStartingMod(item, id, seededRandom(17));
        const commands: CraftingItemEdit[] = [
            { kind: "create", baseId: item.baseId, level: item.level },
            { kind: "add-mod", item, id, source: "natural", seed: 17 },
            { kind: "flag", item: added, flag: "corrupted", enabled: true },
            { kind: "flag", item: { ...added, corrupted: true }, flag: "mirrored", enabled: true },
            { kind: "validate", item: { ...added, level: 100 } },
        ];
        if (game === "poe2") {
            const baseId = Object.entries(engine.catalog.bases).find(
                ([, base]) => base.name === "Rusted Cuirass",
            )![0];
            commands.push({ kind: "passive", item: engine.createItem(baseId), id: "elemental32" });
        }
        const before = structuredClone(commands);
        for (const command of commands) {
            const input = { game, patch: project.patch, command };
            const expected = { item: editCraftingStartingItem(engine, command) };
            const response = await api.request(
                "https://poe.boats/api/v1/crafting/workbench/item",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(input),
                },
                { runtime },
            );
            expect(response.status, await response.clone().text()).toBe(200);
            expect(await response.json()).toEqual(JSON.parse(JSON.stringify(expected)));
            const rpc = RpcSchema.parse(
                await (
                    await mcp("tools/call", {
                        name: "edit_crafting_starting_item",
                        arguments: input,
                    })
                ).json(),
            );
            const result = CallToolResultSchema.parse(rpc.result);
            expect(result.isError).not.toBe(true);
            expect(result.structuredContent).toEqual(JSON.parse(JSON.stringify(expected)));
        }
        const input = { game, patch: project.patch, item: added };
        const expected = { text: exportCraftingItemText(engine, added) };
        const response = await api.request(
            "https://poe.boats/api/v1/crafting/workbench/item-text",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
            },
            { runtime },
        );
        expect(response.status, await response.clone().text()).toBe(200);
        expect(await response.json()).toEqual(expected);
        const rpc = RpcSchema.parse(
            await (
                await mcp("tools/call", { name: "export_crafting_item_text", arguments: input })
            ).json(),
        );
        const result = CallToolResultSchema.parse(rpc.result);
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toEqual(expected);
        expect(commands).toEqual(before);
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("refuses stale and invalid %s starting-item edits and text exports", async (game) => {
        const project = workbenchProject(game);
        const input = { game, patch: project.patch };
        const engine = new CraftingEngine(workbenchCatalog(game));
        const item = { ...project.item, rarity: "rare" as const };
        const id = engine.pool(item)[0]!.id;
        const roll = engine.rollMod(id, seededRandom(1));
        const forged = { ...item, mods: [{ ...roll, values: roll.values.map(() => 99999999) }] };
        const cases: [string, string, unknown][] = [
            [
                "edit_crafting_starting_item",
                "item",
                {
                    ...input,
                    patch: "old",
                    command: { kind: "create", baseId: item.baseId, level: 86 },
                },
            ],
            [
                "edit_crafting_starting_item",
                "item",
                {
                    ...input,
                    command: {
                        kind: "flag",
                        item,
                        flag: game === "poe1" ? "sanctified" : "split",
                        enabled: true,
                    },
                },
            ],
            [
                "edit_crafting_starting_item",
                "item",
                { ...input, command: { kind: "validate", item: forged } },
            ],
            [
                "edit_crafting_starting_item",
                "item",
                {
                    ...input,
                    command: { kind: "add-mod", item, id: "missing", source: "natural", seed: 1 },
                },
            ],
            [
                "edit_crafting_starting_item",
                "item",
                { ...input, command: { kind: "passive", item, id: "missing" } },
            ],
            ["export_crafting_item_text", "item-text", { ...input, patch: "old", item }],
            ["export_crafting_item_text", "item-text", { ...input, item: forged }],
        ];
        for (const [name, path, request] of cases) {
            const response = await api.request(
                `https://poe.boats/api/v1/crafting/workbench/${path}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(request),
                },
                { runtime },
            );
            expect(response.status).toBe(400);
            const rpc = RpcSchema.parse(
                await (await mcp("tools/call", { name, arguments: request })).json(),
            );
            expect(CallToolResultSchema.parse(rpc.result).isError).toBe(true);
        }
    });

    it("refuses stale workbench builds, unbounded work and illegal item choices on both transports", async () => {
        const project = workbenchProject("poe1");
        const cases: [string, string, unknown][] = [
            [
                "calculate_crafting_workbench",
                "calculate",
                { project: { ...project, patch: "old" } },
            ],
            [
                "calculate_crafting_workbench",
                "calculate",
                { project: { ...project, target: { groups: [] } } },
            ],
            [
                "calculate_crafting_workbench",
                "calculate",
                { project: { ...project, iterations: 5001 } },
            ],
            [
                "calculate_crafting_workbench",
                "calculate",
                { project: { ...project, iterations: 100, maxActions: 10000 }, mode: "process" },
            ],
            [
                "calculate_crafting_workbench",
                "calculate",
                { project: { ...project, simulationLimit: { kind: "manual" } }, mode: "sample" },
            ],
            ["emulate_crafting_process", "process", { project: { ...project, steps: [] } }],
            [
                "emulate_crafting_item",
                "emulate",
                {
                    game: project.game,
                    patch: "old",
                    item: project.item,
                    command: { kind: "apply", method: project.method },
                    seed: 1,
                },
            ],
            [
                "emulate_crafting_item",
                "emulate",
                {
                    game: project.game,
                    patch: project.patch,
                    item: project.item,
                    command: { kind: "choose-allflame", index: 0 },
                    seed: 1,
                },
            ],
        ];
        for (const [name, path, input] of cases) {
            const response = await api.request(
                `https://poe.boats/api/v1/crafting/workbench/${path}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(input),
                },
                { runtime },
            );
            expect(response.status).toBe(400);
            const rpc = RpcSchema.parse(
                await (await mcp("tools/call", { name, arguments: input })).json(),
            );
            expect(CallToolResultSchema.parse(rpc.result).isError).toBe(true);
        }
    });

    it.each([
        "lookup",
        "binding",
        "refresh",
        "wrong league",
        "incomplete recipe",
    ] as const)("shares supplemental %s through HTTP and MCP", async (scenario) => {
        const graph = exchangeGraph();
        const id = "EinharMasterCraftMorrigan7";
        const sourceQuote = craftingSourceQuoteSchema.parse({
            source: "poe.ninja",
            game: "poe1",
            realm: "pc",
            league: graph.league,
            currency: "chaos",
            id,
            assumption: "rare-beast-mountain-lynx-v1",
            fetchedAt: "2026-10-08T04:00:00.000Z",
            amount: 607,
            components: [
                ["craicic-sand-spitter", 1, 1],
                ["black-morrigan", 1, 600],
                ["mountain-lynx", 2, 3],
            ].map(([detailsId, quantity, unitPrice]) => ({
                detailsId,
                name: detailsId,
                quantity,
                unitPrice,
                listingCount: 100,
                sourceUrl:
                    "https://poe.ninja/poe1/api/economy/stash/current/item/overview?league=Standard&type=Beast",
            })),
        });
        const prices = { quotes: { [id]: sourceQuote }, missing: {} };
        const lookup = vi
            .spyOn(craftingSources, "findCraftingSourcePrices")
            .mockResolvedValue(prices);
        const bound = bindCraftingSourcePrice(graph, fixtureEngine, id, sourceQuote);
        const cases = {
            lookup: [
                "find_crafting_source_prices",
                "/market/sources",
                { graph, ids: [id], realm: "pc", assumption: sourceQuote.assumption },
                prices,
            ],
            binding: [
                "bind_crafting_source_price",
                "/market/sources/bind",
                { graph, id, quote: sourceQuote },
                { graph: bound },
            ],
            refresh: [
                "refresh_crafting_item_prices",
                "/market/refresh",
                { graph: bound },
                { graph: bound, issues: [] },
            ],
            "wrong league": [
                "bind_crafting_source_price",
                "/market/sources/bind",
                { graph, id, quote: { ...sourceQuote, league: "Other" } },
                null,
            ],
            "incomplete recipe": [
                "bind_crafting_source_price",
                "/market/sources/bind",
                {
                    graph,
                    id,
                    quote: { ...sourceQuote, components: sourceQuote.components.slice(0, 2) },
                },
                null,
            ],
        } as const;
        const [name, path, input, expected] = cases[scenario];
        const response = await api.request(
            `https://poe.boats/api/v1/crafting${path}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
            },
            { runtime },
        );
        expect(response.status).toBe(expected === null ? 400 : 200);
        const rpc = RpcSchema.parse(
            await (await mcp("tools/call", { name, arguments: input })).json(),
        );
        const result = CallToolResultSchema.parse(rpc.result);
        if (expected === null) expect(result.isError).toBe(true);
        else {
            expect(await response.json()).toEqual(expected);
            expect(result.structuredContent).toEqual(expected);
        }
        lookup.mockRestore();
    });

    it.each([
        undefined,
        "adaptive-v1",
    ] as const)("shares both-game exchange lookup, history, binding and refresh through HTTP and MCP (%s)", async (window) => {
        const lookup = vi.spyOn(craftingExchangeQueries, "findCraftingExchangePrices");
        const history = vi.spyOn(craftingExchangeQueries, "craftingExchangeHistory");
        for (const game of ["poe1", "poe2"] as const) {
            const realm = game === "poe2" ? "poe2" : "pc";
            const ruleset = historyIndex.revisions.find(
                (entry) => entry.game === game && entry.revision === "r3",
            )!;
            const retained = await retainedRevision(ruleset);
            const graph =
                game === "poe1"
                    ? exchangeGraph()
                    : { ...retainedTransmuteGraph(ruleset, retained.catalog), league: "Standard" };
            const quote = {
                ...exchangeQuote,
                realm,
                ...(window
                    ? {
                          window,
                          windowStart: exchangeQuote.hour! - 5 * 3600,
                          estimator: "adaptive-volume-ratio-v1" as const,
                      }
                    : {}),
            } as const;
            const prices = { quotes: { [transmuteId]: quote }, missing: {} };
            const historical = {
                history: [{ ...exchangeSnapshot, realm } as const],
                nextBefore: null,
            };
            lookup.mockResolvedValue(prices);
            history.mockResolvedValue(historical);
            const bound = bindExchangePrice(graph, transmuteId, quote);
            const cases = [
                [
                    "find_crafting_exchange_prices",
                    "/market/exchange",
                    {
                        game,
                        realm,
                        league: "Standard",
                        currency: "chaos",
                        itemIds: [transmuteId],
                        window,
                    },
                    prices,
                ],
                [
                    "get_crafting_exchange_price_history",
                    "/market/exchange/history",
                    {
                        realm,
                        league: "Standard",
                        itemId: transmuteId,
                        quoteId: exchangeQuote.quoteId,
                    },
                    historical,
                ],
                [
                    "bind_crafting_exchange_price",
                    "/market/exchange/bind",
                    { graph, id: transmuteId, quote },
                    { graph: bound },
                ],
                [
                    "refresh_crafting_item_prices",
                    "/market/refresh",
                    { graph: bound },
                    { graph: bound, issues: [] },
                ],
            ] as const;
            for (const [name, path, input, expected] of cases) {
                const response = await api.request(
                    `https://poe.boats/api/v1/crafting${path}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(input),
                    },
                    { runtime },
                );
                expect(response.status, name).toBe(200);
                expect(await response.json()).toEqual(expected);
                const rpc = RpcSchema.parse(
                    await (await mcp("tools/call", { name, arguments: input })).json(),
                );
                expect(CallToolResultSchema.parse(rpc.result).structuredContent, name).toEqual(
                    expected,
                );
            }
            const invalid = { graph, id: transmuteId, quote: { ...quote, league: "Other" } };
            expect(
                (
                    await api.request(
                        "https://poe.boats/api/v1/crafting/market/exchange/bind",
                        {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(invalid),
                        },
                        { runtime },
                    )
                ).status,
            ).toBe(400);
            const rpc = RpcSchema.parse(
                await (
                    await mcp("tools/call", {
                        name: "bind_crafting_exchange_price",
                        arguments: invalid,
                    })
                ).json(),
            );
            expect(CallToolResultSchema.parse(rpc.result).isError).toBe(true);
        }
    });

    it.each([
        undefined,
        "adaptive-v1",
        "display-equivalent-v1",
    ] as const)("shares %s cohort lookup, history, binding and refresh through HTTP and MCP", async (policy) => {
        const window = policy === "adaptive-v1" ? policy : undefined;
        const family = policy === "display-equivalent-v1" ? donorFamilyMarketFixture() : undefined;
        const candidate =
            family?.candidate ?? (window ? adaptiveMarketCandidate() : marketCandidate);
        if (family) candidate.assumption = "display-equivalent-v1";
        const graph = family?.graph ?? marketGraph();
        const node = graph.nodes[0]!;
        if (node.kind !== "acquire" || node.alternatives[0]?.kind !== "purchase")
            throw new Error("Fixture");
        const item = node.alternatives[0].item;
        const lookup = { candidates: [candidate], truncated: false, message: null };
        const history = { history: [candidate.latest], nextBefore: null };
        vi.spyOn(craftingMarketQueries, "findCraftingMarketPrices").mockResolvedValue(lookup);
        vi.spyOn(craftingMarketQueries, "craftingMarketHistory").mockResolvedValue(history);
        const bound = bindCohortPurchasePrice(graph, fixtureEngine, "base", "buy", candidate);
        const cases = [
            [
                "find_crafting_item_prices",
                "/market/cohorts",
                {
                    item: createCraftingItemQuery(fixtureEngine).record(item),
                    requirements: graph.nodes[0]!.output,
                    realm: "pc",
                    league: "Standard",
                    currency: "chaos",
                    window,
                    assumption: candidate.assumption,
                },
                lookup,
            ],
            [
                "get_crafting_item_price_history",
                "/market/history",
                {
                    realm: "pc",
                    league: "Standard",
                    revision: candidate.definition.revision,
                    cohortId: candidate.definition.id,
                },
                history,
            ],
            [
                "bind_crafting_item_price",
                "/market/bind",
                { graph, nodeId: "base", alternativeId: "buy", candidate },
                { graph: bound },
            ],
            [
                "refresh_crafting_item_prices",
                "/market/refresh",
                { graph: bound },
                { graph: bound, issues: [] },
            ],
        ] as const;
        for (const [name, path, input, expected] of cases) {
            const response = await api.request(
                `https://poe.boats/api/v1/crafting${path}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(input),
                },
                { runtime },
            );
            expect(response.status, name).toBe(200);
            expect(await response.json()).toEqual(expected);
            const rpc = RpcSchema.parse(
                await (await mcp("tools/call", { name, arguments: input })).json(),
            );
            expect(CallToolResultSchema.parse(rpc.result).structuredContent, name).toEqual(
                expected,
            );
        }
        const invalid = {
            graph: family ? graph : { ...graph, league: "Other" },
            nodeId: "base",
            alternativeId: "buy",
            candidate: { ...candidate, assumption: undefined },
        };
        const response = await api.request(
            "https://poe.boats/api/v1/crafting/market/bind",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(invalid),
            },
            { runtime },
        );
        expect(response.status).toBe(400);
        const rpc = RpcSchema.parse(
            await (
                await mcp("tools/call", { name: "bind_crafting_item_price", arguments: invalid })
            ).json(),
        );
        expect(CallToolResultSchema.parse(rpc.result).isError).toBe(true);
    });

    it("shares revision-following refresh and incompatible-definition refusals through HTTP and MCP", async () => {
        const graph = bindCohortPurchasePrice(
            marketGraph(),
            fixtureEngine,
            "base",
            "buy",
            marketCandidate,
        );
        const candidate = structuredClone(marketCandidate);
        candidate.definition.revision = "next-market";
        candidate.latest.revision = "next-market";
        candidate.latest.hour += 3600;
        candidate.latest.prices.chaos!.median = 27;
        const lookup = vi.spyOn(craftingMarketQueries, "findCraftingMarketPrices");
        vi.spyOn(craftingMarketQueries, "craftingMarketDefinition").mockResolvedValue(
            marketCandidate.definition,
        );
        for (const compatible of [true, false]) {
            candidate.definition.purpose = compatible ? "base" : "transfer-donor";
            lookup.mockResolvedValue({ candidates: [candidate], truncated: false, message: null });
            const response = await api.request(
                "https://poe.boats/api/v1/crafting/market/refresh",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ graph }),
                },
                { runtime },
            );
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result).toMatchObject({
                graph: compatible
                    ? bindCohortPurchasePrice(graph, fixtureEngine, "base", "buy", candidate)
                    : graph,
                issues: compatible ? [] : [expect.stringContaining("no usable price")],
            });
            const rpc = RpcSchema.parse(
                await (
                    await mcp("tools/call", {
                        name: "refresh_crafting_item_prices",
                        arguments: { graph },
                    })
                ).json(),
            );
            expect(CallToolResultSchema.parse(rpc.result).structuredContent).toEqual(result);
        }
    });

    it("shares historical snapshots through HTTP and MCP without changing the input graph", async () => {
        vi.spyOn(craftingMarketQueries, "findCraftingMarketPrices").mockResolvedValue({
            candidates: [marketCandidate],
            truncated: false,
            message: null,
        });
        const graph = bindCohortPurchasePrice(
            marketGraph(),
            fixtureEngine,
            "base",
            "buy",
            marketCandidate,
        );
        const input = { graph, hours: [marketCandidate.latest.hour] };
        const expected = { points: [{ at: marketCandidate.latest.hour, graph, issues: [] }] };
        const response = await api.request(
            "https://poe.boats/api/v1/crafting/market/snapshots",
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
                await mcp("tools/call", { name: "get_crafting_price_snapshots", arguments: input })
            ).json(),
        );
        expect(CallToolResultSchema.parse(rpc.result).structuredContent).toEqual(expected);
    });

    it("refuses excessive or invalid historical snapshot hours through HTTP and MCP", async () => {
        for (const hours of [[], [1], Array.from({ length: 25 }, (_, index) => index * 3600)]) {
            const input = { graph: marketGraph(), hours };
            const response = await api.request(
                "https://poe.boats/api/v1/crafting/market/snapshots",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(input),
                },
                { runtime },
            );
            expect(response.status).toBe(400);
            const rpc = RpcSchema.parse(
                await (
                    await mcp("tools/call", {
                        name: "get_crafting_price_snapshots",
                        arguments: input,
                    })
                ).json(),
            );
            expect(CallToolResultSchema.parse(rpc.result).isError).toBe(true);
        }
    });

    it("serves the Scalar reference without requiring an operation runtime", async () => {
        const response = await api.request("https://poe.boats/api/docs");
        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toContain("text/html");
        const html = await response.text();
        expect(html).toContain("<title>API Reference · POE.BOATS</title>");
        expect(html).toContain("https://cdn.jsdelivr.net/npm/@scalar/api-reference");
        expect(html).toContain('"url": "/api/openapi.json"');
    });

    it("publishes every operation with complete input and output schemas", async () => {
        const response = await api.request("https://poe.boats/api/openapi.json");
        expect(response.status).toBe(200);
        const source = await response.text();
        expect(source.length).toBeLessThan(4_000_000);
        expect(source.includes('"$ref":"#/components/schemas/ItemQuery"')).toBe(true);
        expect(source.includes('"$ref":"#/components/schemas/CraftingMethod"')).toBe(true);
        const document = DocumentSchema.parse(JSON.parse(source));
        for (const path of [
            "/api/v1/crafting/workbench/item",
            "/api/v1/crafting/workbench/item-text",
        ])
            expect(
                JSON.stringify(
                    document.paths[path]!.post!.requestBody!.content["application/json"]!.schema,
                ),
            ).toContain('"$ref":"#/components/schemas/CraftingWorkbenchItem"');
        const graphRequest = z.object({ properties: z.object({ graph: z.unknown() }) });
        for (const path of [
            "/api/v1/crafting/graph/calculate",
            "/api/v1/crafting/rulesets/correction",
            "/api/v1/crafting/rulesets/adopt",
        ])
            expect(
                JSON.stringify(
                    graphRequest.parse(
                        document.paths[path]!.post!.requestBody!.content["application/json"]!
                            .schema,
                    ).properties.graph,
                ),
            ).toContain('"$ref":"#/components/schemas/CraftingGraph"');
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
        [
            "create_item_query",
            {
                item: normalizeApiItem("poe1", "stash", {
                    baseType: "Iron Ring",
                    ilvl: 86,
                    identified: true,
                }),
                selection: { modifiers: false },
            },
        ],
        [
            "build_crafting_trade_search",
            {
                query: itemQuerySchema.parse({
                    game: "poe2",
                    groups: [
                        {
                            type: "and",
                            filters: [{ kind: "range", field: "ilvl", value: { min: 80 } }],
                        },
                    ],
                }),
                ruleset: rulesetReference(
                    historyIndex.revisions.find(
                        (entry) => entry.game === "poe2" && entry.revision === "r3",
                    )!,
                ),
                league: "Standard",
            },
        ],
        [
            "build_crafting_trade_search",
            {
                query: graphFixture().nodes[0]!.output,
                ruleset: graphFixture().ruleset,
                league: "Standard",
            },
        ],
        [
            "calculate_crafting_graph",
            { graph: nnnGraph(), options: { estimateIterations: 2, workLimit: 1000 } },
        ],
        [
            "calculate_crafting_graph",
            {
                graph: conditionalTransmuteGraph("poe1"),
                options: { estimateIterations: 1, workLimit: 1000 },
            },
        ],
        [
            "calculate_crafting_graph",
            {
                graph: conditionalTransmuteGraph("poe2"),
                options: { estimateIterations: 1, workLimit: 1000 },
            },
        ],
        [
            "list_non_native_essences",
            { game: "poe1", ruleset: graphFixture().ruleset, item: firstItem },
        ],
        [
            "edit_crafting_graph",
            {
                graph: graphFixture(),
                command: { action: "connect", targetId: "combine", inputId: "left", source: "b" },
            },
        ],
        [
            "create_crafting_graph_from_item",
            {
                game: "poe1",
                ruleset: graphFixture().ruleset,
                item: firstItem,
                name: "Donor process",
                price: quote(10),
            },
        ],
        [
            "create_crafting_graph_from_method",
            {
                game: "poe1",
                ruleset: graphFixture().ruleset,
                item: firstItem,
                name: "Prepared recombination",
                price: quote(10),
                method: {
                    kind: "recombine",
                    id: "recombine",
                    donor: { id: "other", name: "Other donor", item: firstItem },
                },
                prices: { "donor:other": quote(15), "service:recombine": quote(2) },
            },
        ],
        [
            "replace_crafting_purchase_item",
            {
                graph: graphFixture(),
                nodeId: "a",
                alternativeId: "buy",
                expectedItem: firstItem,
                item: { ...firstItem, quality: 20 },
            },
        ],
        [
            "calculate_crafting_graph",
            { graph: graphFixture(), options: { estimateIterations: 3, workLimit: 1000 } },
        ],
        [
            "match_crafting_item",
            {
                item: normalizeApiItem("poe1", "stash", { baseType: "Iron Ring", ilvl: 86 }),
                query: itemQuerySchema.parse({
                    game: "poe1",
                    groups: [{ type: "and", filters: [{ kind: "mod", ids: ["unknown-mod"] }] }],
                }),
            },
        ],
        ["calculate_recombinator", parseRecombinatorDraft(exampleRecombinatorDraft)],
        [
            "match_crafting_item",
            {
                item: normalizeApiItem(
                    "poe1",
                    "stash",
                    { baseType: "Slink Gloves", ilvl: 86 },
                    {
                        modifiers: [
                            {
                                possibleIds: ["temple", "legacy-temple"],
                                side: "suffix",
                                fractured: false,
                                crafted: false,
                            },
                        ],
                    },
                ),
                query: itemQuerySchema.parse({
                    game: "poe1",
                    groups: [
                        {
                            type: "and",
                            filters: [{ kind: "mod", ids: ["temple", "legacy-temple"] }],
                        },
                    ],
                }),
            },
        ],
        ["get_idol_catalog", {}],
        [
            "describe_simple_crafting_method",
            {
                graph: graphFixture(),
                method: { kind: "currency", id: transmuteId },
                item: firstItem,
            },
        ],
        [
            "configure_simple_crafting_outcome",
            {
                graph: conditionalTransmuteGraph("poe1"),
                nodeId: "transmute",
                goal: { kind: "once" },
            },
        ],
        ["list_idol_modifiers", { locale: "en" }],
        ["get_recombinator_catalog", {}],
        ["list_crafting_rulesets", { game: "poe1" }],
        ["get_crafting_correction", { graph: graphFixture() }],
        [
            "edit_crafting_workspace",
            {
                state: workspaceFixture(),
                command: { action: "closeProject", projectId: graphFixture().id },
            },
        ],
        [
            "export_crafting_bundle",
            { state: workspaceFixture(), selection: { kind: "build", id: "build" } },
        ],
        ["freeze_crafting_build", { state: workspaceFixture(), buildId: "build" }],
        ["adopt_crafting_ruleset", { graph: graphFixture(), era: "3.29", revision: "r1" }],
        ["list_vendor_recipes", { game: "1" }],
        ["list_unique_idols", { locale: "en" }],
        ["search_idol_modifiers", { query: "scarab", bases: ["minor"] }],
        ["list_recombinator_bases", {}],
        ["list_preparation_recipes", { bases: catalogFixture.bases, kind: "bench" }],
        ["edit_favorite_modifiers", { favorites: ["one"], modId: "one", action: "toggle" }],
        ["update_trade_settings", { updates: { maxWeight: 100 } }],
    ])("%s gives the same result through HTTP and MCP", async (name, input) => {
        if (
            name === "create_crafting_graph_from_item" ||
            name === "create_crafting_graph_from_method"
        )
            vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
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
        if (
            name === "calculate_crafting_graph" &&
            "graph" in input &&
            input.graph.name === graphFixture().name
        )
            expect(apiResult).toEqual({
                result: calculateCraftingGraph(craftingCatalog, graphFixture(), {
                    estimateIterations: 3,
                    workLimit: 1000,
                }),
            });
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("creates %s pasted-item queries through both transports", async (game) => {
        const ruleset = historyIndex.revisions.find(
            (entry) => entry.game === game && entry.revision === "r3",
        )!;
        const loaded = await retainedRevision(ruleset);
        const engine = new CraftingEngine(craftingCatalogSchema.parse(loaded.catalog));
        const base = Object.entries(engine.catalog.bases).find(
            ([, entry]) => entry.item_class === "Body Armour" && entry.drop_level === 1,
        )![0];
        const text = exportCraftingItemText(engine, engine.createItem(base, 86));
        const input = { game, ruleset: rulesetReference(ruleset), text };
        const response = await api.request(
            "https://poe.boats/api/v1/crafting/items/query-from-text",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
            },
            { runtime },
        );
        expect(response.status).toBe(200);
        const result = craftingItemQueryTextResultSchema.parse(await response.json());
        expect(result.matches[0]!.query.groups[0]!.filters).toContainEqual({
            kind: "base",
            field: "baseId",
            values: [base],
        });
        const rpc = RpcSchema.parse(
            await (
                await mcp("tools/call", { name: "create_item_queries_from_text", arguments: input })
            ).json(),
        );
        const tool = CallToolResultSchema.parse(rpc.result);
        expect(tool.isError).not.toBe(true);
        expect(tool.structuredContent).toEqual(result);
    });

    it("refuses unresolved item text through both transports", async () => {
        const input = { game: "poe1", ruleset: graphFixture().ruleset, text: "Not an item" };
        const response = await api.request(
            "https://poe.boats/api/v1/crafting/items/query-from-text",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
            },
            { runtime },
        );
        expect(response.status).toBe(400);
        const rpc = RpcSchema.parse(
            await (
                await mcp("tools/call", { name: "create_item_queries_from_text", arguments: input })
            ).json(),
        );
        expect(CallToolResultSchema.parse(rpc.result).isError).toBe(true);
    });

    it("refuses a trade query with the wrong game's crafting revision through HTTP and MCP", async () => {
        const input = {
            query: itemQuerySchema.parse({ game: "poe2" }),
            ruleset: graphFixture().ruleset,
            league: "Standard",
        };
        const response = await api.request(
            "https://poe.boats/api/v1/crafting/items/trade",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
            },
            { runtime },
        );
        expect(response.status).toBe(400);
        const rpc = RpcSchema.parse(
            await (
                await mcp("tools/call", { name: "build_crafting_trade_search", arguments: input })
            ).json(),
        );
        expect(CallToolResultSchema.parse(rpc.result).isError).toBe(true);
    });

    it("refuses invalid NNN source items through HTTP and MCP", async () => {
        const input = {
            game: "poe1",
            ruleset: graphFixture().ruleset,
            item: { ...firstItem, baseId: "missing" },
        };
        const response = await api.request(
            "https://poe.boats/api/v1/crafting/items/nnn-essences",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
            },
            { runtime },
        );
        expect(response.status).toBe(400);
        const rpc = RpcSchema.parse(
            await (
                await mcp("tools/call", { name: "list_non_native_essences", arguments: input })
            ).json(),
        );
        expect(CallToolResultSchema.parse(rpc.result).isError).toBe(true);
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

    it.each([
        [
            "create_crafting_graph_from_preset",
            "/graph/from-preset",
            { game: "poe2", ruleset: graphFixture().ruleset, presetId: "tailwind-boots" },
        ],
        [
            "configure_simple_crafting_outcome",
            "/graph/simple-outcome",
            {
                graph: conditionalTransmuteGraph("poe1"),
                nodeId: "transmute",
                goal: { kind: "minimum", field: "memoryStrands", value: 70 },
            },
        ],
        [
            "create_crafting_graph_from_preset",
            "/graph/from-preset",
            { game: "poe1", ruleset: graphFixture().ruleset, presetId: "unknown" },
        ],
        [
            "edit_crafting_graph",
            "/graph/edit",
            {
                graph: graphFixture(),
                command: {
                    action: "connect",
                    targetId: "combine",
                    inputId: "left",
                    source: "combine",
                },
            },
        ],
        [
            "edit_crafting_graph",
            "/graph/edit",
            { graph: graphFixture(), command: { action: "removeNode", nodeId: "a" } },
        ],
        [
            "create_crafting_graph_from_item",
            "/graph/from-item",
            {
                game: "poe1",
                ruleset: graphFixture().ruleset,
                item: { ...firstItem, baseId: "missing" },
                name: "Invalid item",
            },
        ],
        [
            "replace_crafting_purchase_item",
            "/graph/purchase-item",
            {
                graph: graphFixture(),
                nodeId: "a",
                alternativeId: "buy",
                expectedItem: { ...firstItem, quality: 20 },
                item: firstItem,
            },
        ],
        [
            "replace_crafting_purchase_item",
            "/graph/purchase-item",
            {
                graph: graphFixture(),
                nodeId: "a",
                alternativeId: "buy",
                expectedItem: firstItem,
                item: { ...firstItem, baseId: "missing" },
            },
        ],
        [
            "create_crafting_graph_from_method",
            "/graph/from-method",
            {
                game: "poe1",
                ruleset: graphFixture().ruleset,
                item: firstItem,
                name: "Missing donor",
                method: { kind: "recombine", id: "recombine" },
            },
        ],
        [
            "create_crafting_graph_from_method",
            "/graph/from-method",
            {
                game: "poe1",
                ruleset: { ...graphFixture().ruleset, engine: "unknown" },
                item: firstItem,
                name: "Altered pin",
                method: { kind: "recombine", id: "recombine" },
            },
        ],
    ])("refuses invalid authoring through %s and HTTP: %j", async (name, path, input) => {
        const response = await api.request(
            `https://poe.boats/api/v1/crafting${path}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
            },
            { runtime },
        );
        expect(response.status).toBe(400);
        const rpc = RpcSchema.parse(
            await (await mcp("tools/call", { name, arguments: input })).json(),
        );
        expect(CallToolResultSchema.parse(rpc.result).isError).toBe(true);
    });

    it.each([
        [{ action: "updateProject", graph: graphFixture(), expectedRevision: 1 }, 409],
        [{ action: "deleteProject", projectId: graphFixture().id }, 409],
        [{ action: "removeMember", buildId: "build", memberId: "foreign" }, 400],
    ])("refuses conflicting or foreign workspace edits through both transports: %j", async (command, status) => {
        const input = { state: workspaceFixture(), command };
        const response = await api.request(
            "https://poe.boats/api/v1/crafting/workspace/edit",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
            },
            { runtime },
        );
        expect(response.status).toBe(status);
        const rpc = RpcSchema.parse(
            await (
                await mcp("tools/call", { name: "edit_crafting_workspace", arguments: input })
            ).json(),
        );
        expect(CallToolResultSchema.parse(rpc.result).isError).toBe(true);
    });

    it("documents crafting method choices despite their preprocessing guard", () => {
        const schema = z.toJSONSchema(craftingMethodSchema, { io: "input" });
        expect(schema.oneOf).toBeDefined();
        expect(JSON.stringify(schema)).toContain('"recombine"');
    });

    it.each([
        "catalog",
        "ports",
        "budget",
        "condition-game",
        "condition-revision",
    ])("refuses an invalid graph %s through both transports", async (failure) => {
        const graph = graphFixture();
        if (failure === "catalog") graph.ruleset.craftingSha256 = "0".repeat(64);
        if (failure === "ports") graph.nodes.find((node) => node.kind === "craft")!.inputs.pop();
        if (failure.startsWith("condition-")) {
            graph.nodes.find((node) => node.kind === "craft")!.applyWhen = itemQuerySchema.parse({
                game: failure === "condition-game" ? "poe2" : "poe1",
            });
            if (failure === "condition-revision")
                graph.ruleset = rulesetReference(
                    historyIndex.revisions.find(
                        (entry) => entry.game === "poe1" && entry.revision === "r4",
                    )!,
                );
        }
        const input = { graph, options: { workLimit: failure === "budget" ? 100_001 : 100 } };
        const response = await api.request(
            "https://poe.boats/api/v1/crafting/graph/calculate",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
            },
            { runtime },
        );
        expect(response.status).toBe(400);
        const rpc = RpcSchema.parse(
            await (
                await mcp("tools/call", { name: "calculate_crafting_graph", arguments: input })
            ).json(),
        );
        expect(CallToolResultSchema.parse(rpc.result).isError).toBe(true);
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

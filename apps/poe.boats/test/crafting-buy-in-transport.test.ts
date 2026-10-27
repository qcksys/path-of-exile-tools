import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";
import { api } from "~/api/router.server";
import { createDbConnection } from "~/db/client";
import { seededRandom } from "~/lib/crafting-engine";
import { handleMcpRequest } from "~/mcp/server.server";
import type { OperationContext } from "~/operations/operation";
import { operations } from "~/operations/registry.server";
import { buyInComparisonSchema, buyInStageSchema } from "~/schemas/crafting-buy-in";
import { craftingGraphSchema } from "~/schemas/crafting-graph";
import { engine } from "./crafting-fixtures";
import { firstItem, graphFixture, secondMod } from "./crafting-graph-fixtures";
import { historyIndex, retainedRevision } from "./crafting-history-fixtures";
import { workbenchCatalog } from "./crafting-workbench-fixtures";
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
const RpcSchema = z.object({ result: z.unknown().optional(), error: z.unknown().optional() });

async function http(name: string, input: unknown) {
    const operation = operations.find((entry) => entry.name === name)!;
    return api.fetch(
        new Request(`https://poe.boats/api/v1/${operation.family}${operation.path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        }),
        { runtime },
    );
}

async function mcp(name: string, input: unknown) {
    const response = await handleMcpRequest(
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
                params: { name, arguments: input },
            }),
        }),
        async () => context,
    );
    return CallToolResultSchema.parse(RpcSchema.parse(await response.json()).result);
}

const pricedSchema = z.object({ graph: craftingGraphSchema, stage: buyInStageSchema });
const graph = () => ({ ...graphFixture(), league: "Standard" });
const both = {
    rarity: "Rare",
    name: "Doom Bane",
    typeLine: "Plate Vest",
    baseType: "Plate Vest",
    ilvl: 86,
    identified: true,
    explicitMods: ["+7 to maximum Life", "23% increased Armour"],
};
const priceInput = () => ({
    graph: graph(),
    stageId: "combine",
    instant: {
        listings: [
            {
                id: "one",
                indexed: "2026-10-27T10:00:00Z",
                price: { amount: 2, currency: "divine" },
                sale: "instant",
                item: both,
            },
            {
                id: "two",
                indexed: null,
                price: { amount: 250, currency: "chaos" },
                sale: "instant",
                item: both,
            },
        ],
        results: 2,
        available: 2,
        fetches: 1,
    },
    rates: { chaos: 1, divine: 150 },
    observedAt: "2026-10-27T11:00:00.000Z",
});

describe("buy-in operations", () => {
    it.each([
        ["list_crafting_buy_in_stages", () => ({ graph: graph() })],
        ["price_crafting_buy_in_stage", priceInput],
    ])("%s gives the same result through HTTP and MCP", async (name, input) => {
        const response = await http(name, input());
        expect(response.status).toBe(200);
        const apiResult = await response.json();
        const result = await mcp(name, input());
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toEqual(apiResult);
    });

    it("lists stages with their instant-buyout trade search", async () => {
        const result = z
            .object({ stages: z.array(z.record(z.string(), z.unknown())) })
            .parse(await (await http("list_crafting_buy_in_stages", { graph: graph() })).json());
        expect(result.stages).toHaveLength(1);
        expect(result.stages[0]).toMatchObject({
            stageId: "combine",
            searchable: true,
            price: null,
            freshness: null,
            inPerson: null,
            instant: { payload: { query: { status: { option: "securable" } } } },
        });
    });

    it("prices a stage, saves it on the returned graph and compares buying in", async () => {
        const priced = pricedSchema.parse(
            await (await http("price_crafting_buy_in_stage", priceInput())).json(),
        );
        expect(priced.stage).toMatchObject({
            status: "priced",
            price: { amount: 250, currency: "chaos" },
            sale: "instant",
            confidence: "high",
            counts: { matching: 2, fetched: 2 },
        });
        expect(priced.graph.buyIn?.stages.combine).toEqual(priced.stage);
        const input = { graph: priced.graph, options: { estimateIterations: 2, workLimit: 5000 } };
        const response = await http("compare_crafting_buy_in", input);
        expect(response.status).toBe(200);
        const { comparison } = z
            .object({ comparison: buyInComparisonSchema })
            .parse(await response.json());
        expect(comparison.stages[0]).toMatchObject({ stageId: "combine", total: 250 });
        const viaMcp = await mcp("compare_crafting_buy_in", input);
        expect(viaMcp.isError).not.toBe(true);
        expect(
            buyInComparisonSchema.parse(
                (viaMcp.structuredContent as { comparison: unknown }).comparison,
            ).stages[0]?.total,
        ).toBe(250);
    });

    it("refuses unknown stages and listings for another game on both transports", async () => {
        for (const input of [
            { ...priceInput(), stageId: "missing" },
            { ...priceInput(), stageId: "a" },
        ]) {
            expect((await http("price_crafting_buy_in_stage", input)).status).toBe(400);
            expect((await mcp("price_crafting_buy_in_stage", input)).isError).toBe(true);
        }
        const wrongGame = { graph: { ...graph(), game: "poe2" } };
        expect((await http("compare_crafting_buy_in", wrongGame)).status).toBe(400);
        expect((await mcp("compare_crafting_buy_in", wrongGame)).isError).toBe(true);
    });

    it("keeps the representative listing's item for the purchase", async () => {
        const priced = pricedSchema.parse(
            await (await http("price_crafting_buy_in_stage", priceInput())).json(),
        );
        const expected = engine.addStartingMod(firstItem, secondMod, seededRandom(3));
        expect(priced.stage.item?.mods.map((mod) => mod.id).sort()).toEqual(
            expected.mods.map((mod) => mod.id).sort(),
        );
    });
});

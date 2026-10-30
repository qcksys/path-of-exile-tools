// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve the upstream API field names.
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { itemQuerySchema, normalizeApiItem } from "@poe-tools/item-query";
import {
    type CohortHourly,
    compileMarketCohorts,
    encodeCohortPriceReference,
    selectCohortPrice,
} from "@poe-tools/market";
import { MySqlContainer, type StartedMySqlContainer } from "@testcontainers/mysql";
import { eq, sql } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { type Connection, createConnection } from "mysql2/promise";
import { RouterContextProvider } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vite-plus/test";
import { z } from "zod";
import { api } from "~/api/router.server";
import { dbContext, envContext } from "~/context";
import type { TDatabase } from "~/db/client";
import { STASH_GAMES, stashGame } from "~/db/helpers/stash-game";
import {
    craftingExchangeHistory,
    findCraftingExchangePrices,
} from "~/db/queries/crafting-exchange.queries";
import { knownCraftingExchangeItems } from "~/db/queries/crafting-exchange-membership.queries";
import {
    craftingMarketHistory,
    findCraftingMarketPrices,
} from "~/db/queries/crafting-market.queries";
import { getMarketData } from "~/db/queries/market.queries";
import { writeStashCurrencyHourly } from "~/db/queries/stash-currency.queries";
import {
    COHORT_WINDOW_RETENTION_HOURS,
    upsertStashCohortHourly,
    upsertStashCurrencyHourly,
} from "~/db/queries/stash-ingest.queries";
import { recordStashLeagues } from "~/db/queries/stash-league.queries";
import { writeStashUniqueHourly } from "~/db/queries/stash-market.queries";
import { tIngestWorker } from "~/db/schema/ingest.worker";
import { tStashCheckpoint, tStashDailySample } from "~/db/schema/stash.checkpoint";
import { tStashCohort } from "~/db/schema/stash.cohort";
import { tStashCohortHourly } from "~/db/schema/stash.cohort-hourly";
import { tStashCohortRevision } from "~/db/schema/stash.cohort-revision";
import { tStashCohortWindow } from "~/db/schema/stash.cohort-window";
import {
    type TStashCurrencyHourlyI,
    tStashCurrencyHour,
    tStashCurrencyHourly,
} from "~/db/schema/stash.currency-hourly";
import { tStashCurrencyMarket } from "~/db/schema/stash.currency-market";
import { tStashHourCoverage } from "~/db/schema/stash.hour-coverage";
import { tStashLeague } from "~/db/schema/stash.league";
import { tStashMarketDaily } from "~/db/schema/stash.market-daily";
import {
    tStashMarket,
    tStashMarketHour,
    tStashUniqueHourly,
} from "~/db/schema/stash.unique-hourly";
import { seededRandom } from "~/lib/crafting-engine";
import { bindExchangePrice } from "~/lib/crafting-exchange";
import { calculateCraftingGraph } from "~/lib/crafting-graph-simulation";
import { createCraftingItemQuery } from "~/lib/crafting-item-query";
import { bindCohortPurchasePrice, livePurchasePrices } from "~/lib/crafting-market";
import {
    assertCraftingSourcePrices,
    bindCraftingSourcePrice,
    decodeCraftingSourceReference,
} from "~/lib/crafting-sources";
import { handleMcpRequest } from "~/mcp/server.server";
import {
    craftingMarketSnapshots,
    refreshCraftingMarketPrices,
} from "~/operations/crafting-market.server";
import type { OperationContext } from "~/operations/operation";
import { getServerStatus } from "~/operations/server-status.server";
import { action, loader } from "~/routes/api.stash-ingest";
import { craftingGraphSchema } from "~/schemas/crafting-graph";
import { craftingSourceResultSchema } from "~/schemas/crafting-sources";
import { marketFiltersSchema } from "~/schemas/market";
import { findCraftingSourcePrices } from "~/services/crafting-sources.server";
import { createClient } from "../../../../packages/poe-api-client/dist/index.mjs";
import { ingestCx } from "../../../../packages/poe-stash-ingest/src/cx/ingest.ts";
import { rollupCx } from "../../../../packages/poe-stash-ingest/src/cx/rollup.ts";
import { flushRollups } from "../../../../packages/poe-stash-ingest/src/pipeline.ts";
import { readArchivedPage } from "../../../../packages/poe-stash-ingest/src/ps/archive-payload.ts";
import {
    fetchCheckpoints,
    flushCheckpoints,
    probeSample,
    recordCheckpoint,
    validateSample,
} from "../../../../packages/poe-stash-ingest/src/ps/checkpoints.ts";
import { defaultEquipmentClassifier } from "../../../../packages/poe-stash-ingest/src/ps/equipment.ts";
import { rollupEquipment } from "../../../../packages/poe-stash-ingest/src/ps/equipment-rollup.ts";
import { ingestPs } from "../../../../packages/poe-stash-ingest/src/ps/ingest.ts";
import { rollupPs } from "../../../../packages/poe-stash-ingest/src/ps/rollup.ts";
import { evaluateSales } from "../../../../packages/poe-stash-ingest/src/ps/sales.ts";
import { getCursor, setCursor } from "../../../../packages/poe-stash-ingest/src/shared/cursor.ts";
import {
    type DbHandle,
    openDb,
    queryAll,
} from "../../../../packages/poe-stash-ingest/src/shared/db.ts";
import { deliverLeagues } from "../../../../packages/poe-stash-ingest/src/shared/leagues.ts";
import { push } from "../../../../packages/poe-stash-ingest/src/shared/remote/push.ts";
import type { UniqueHourlyRow } from "../../../../packages/poe-stash-ingest/src/shared/remote/types.ts";
import {
    commodityExchangeSnapshot,
    commodityQuote,
    essenceId,
    essenceName,
    unravellingId,
    unravellingName,
} from "../crafting-commodity-fixtures";
import {
    chaosId,
    exchangeGraph,
    exchangeSnapshot,
    transmuteId,
} from "../crafting-exchange-fixtures";
import { baseId, catalog, currency, engine } from "../crafting-fixtures";
import { quote } from "../crafting-graph-fixtures";
import { historyIndex, retainedRevision } from "../crafting-history-fixtures";
import {
    adaptiveMarketCandidate,
    donorFamilyMarketFixture,
    marketCandidate,
    marketGraph,
} from "../crafting-market-fixtures";
import {
    vendorCurrencyInputId,
    vendorCurrencyOutputId,
    vendorCurrencyQuote,
    vendorCurrencySnapshot,
    vendorInputId,
    vendorOutputId,
    vendorQuote,
    vendorSnapshot,
} from "../crafting-vendor-upgrade-fixtures";

const HOUR = 1_790_899_200;
const TOKEN = "inert-e2e-ingest-token";

/** Stores exchange market hours, as ingest does, without refreshing the rollups that read them. */
async function insertCurrency(rows: TStashCurrencyHourlyI | TStashCurrencyHourlyI[]) {
    for (const [game, gameRows] of Map.groupBy([rows].flat(), (row) => stashGame(row.realm)))
        await writeStashCurrencyHourly(mysql as unknown as TDatabase, game, gameRows);
}
// Chaos first, so the `${MARKET_ID}-${index}` variants stay markets with a price currency.
const CHAOS = "Metadata/Items/Currency/CurrencyRerollRare";
const CARD = "Metadata/Items/DivinationCards/DivinationCardTheMetalsmithsGift";
const MARKET_ID = `${CHAOS}|${CARD}`;
const item = {
    id: "item-1",
    verified: true,
    w: 2,
    h: 1,
    icon: `https://web.poecdn.com/gen/image/${Buffer.from(JSON.stringify([1, 2, { f: "2DItems/Belts/Headhunter" }])).toString("base64url")}`,
    name: "Headhunter",
    typeLine: "Leather Belt",
    baseType: "Leather Belt",
    ilvl: 85,
    identified: true,
    frameType: 3,
    note: "~price 10 divine",
};
const stash = {
    id: "stash-1",
    public: true,
    accountName: "seller-1",
    league: "Standard",
    stash: "Sales",
    stashType: "TradeStash",
    items: [item],
};
const market = {
    league: "Standard",
    market_id: MARKET_ID,
    // The digest keys each map by the market's two items.
    lowest_ratio: { [CHAOS]: 100, [CARD]: 1 },
    highest_ratio: { [CHAOS]: 110, [CARD]: 1 },
    volume_traded: { [CHAOS]: 1000, [CARD]: 10 },
    lowest_stock: { [CHAOS]: 100, [CARD]: 1 },
    highest_stock: { [CHAOS]: 1000, [CARD]: 10 },
};

let container: StartedMySqlContainer;
let connection: Connection;
let mysql: MySql2Database;
let local: DbHandle;
let server: Server;
let baseUrl: string;
let upstreamResponses: Array<{ status?: number; body: unknown }>;
let receiverStatus: number | undefined;

async function parity(
    path: string,
    name: string,
    input: Record<string, unknown>,
    method: "POST" | "GET" = "POST",
): Promise<unknown> {
    const unused = async (): Promise<never> => {
        throw new Error("Unexpected unrelated catalog lookup");
    };
    const runtime = async (): Promise<OperationContext> => ({
        db: mysql as unknown as TDatabase,
        caller: null,
        origin: "https://poe.boats",
        loadCatalog: unused,
        loadWorkbenchCatalog: unused,
        loadCraftingRulesets: async () => historyIndex,
        loadCraftingRevision: retainedRevision,
    });
    const query = new URLSearchParams(
        Object.entries(input).map(([key, value]) => [key, String(value)]),
    );
    const response = await api.request(
        `https://poe.boats/api/v1/${path}${method === "GET" ? `?${query}` : ""}`,
        {
            method,
            headers: { "Content-Type": "application/json" },
            ...(method === "POST" ? { body: JSON.stringify(input) } : {}),
        },
        { runtime },
    );
    expect(response.status).toBe(200);
    const http: unknown = await response.json();
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
                params: { name, arguments: input },
            }),
        }),
        runtime,
    );
    const envelope = z.object({ result: CallToolResultSchema }).parse(await rpc.json());
    expect(envelope.result.isError).not.toBe(true);
    expect(envelope.result.structuredContent).toEqual(http);
    return http;
}

it("refuses a previously issued stash quote for a known exchange item in both HTTP and MCP", async () => {
    await insertCurrency({
        ...commodityExchangeSnapshot,
        marketId: `${essenceId}|${chaosId}`,
        hour: HOUR,
        volumeTraded: { [essenceId]: 0, [chaosId]: 0 },
    });
    const graph = exchangeGraph();
    const quote = { ...commodityQuote, hour: HOUR };
    const input = { graph, id: essenceId, quote };
    const unused = async (): Promise<never> => {
        throw new Error("Unexpected catalog lookup");
    };
    const runtime = async (): Promise<OperationContext> => ({
        db: mysql as unknown as TDatabase,
        caller: null,
        origin: "https://poe.boats",
        loadCatalog: unused,
        loadWorkbenchCatalog: unused,
        loadCraftingRulesets: async () => historyIndex,
        loadCraftingRevision: retainedRevision,
    });
    const response = await api.request(
        "https://poe.boats/api/v1/crafting/market/sources/bind",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        },
        { runtime },
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Use an exchange quote");
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
                params: { name: "bind_crafting_source_price", arguments: input },
            }),
        }),
        runtime,
    );
    const envelope = z.object({ result: CallToolResultSchema }).parse(await rpc.json());
    expect(envelope.result.isError).toBe(true);
    expect(JSON.stringify(envelope.result.content)).toContain("Use an exchange quote");
    const lookup = craftingSourceResultSchema.parse(
        await parity("crafting/market/sources", "find_crafting_source_prices", {
            graph,
            realm: "pc",
            ids: [essenceId],
        }),
    );
    expect(lookup.quotes[essenceId]).toBeUndefined();
    expect(lookup.missing[essenceId]).toMatch(/exchange market/);
});

it.skipIf(process.env.EXCHANGE_MEMBERSHIP_BENCHMARK !== "1")(
    "uses the primary index to discover markets on a realistic retained history",
    async () => {
        await connection.query(
            `INSERT INTO qsPoeBoats__stash_poe1_currency_hourly (realm, league, marketId, hour, volumeTraded)
        WITH RECURSIVE a(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM a WHERE n < 999),
        b(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM b WHERE n < 129)
        SELECT 'pc', 'Standard', CONCAT('market-', LPAD(a.n + part.n * 1000, 4, '0'), '|chaos'),
        ? - b.n * 3600, JSON_OBJECT()
        FROM a CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1) AS part CROSS JOIN b
        WHERE a.n + part.n * 1000 < 1500`,
            [HOUR],
        );
        await connection.query("ANALYZE TABLE qsPoeBoats__stash_poe1_currency_hourly");
        let query = "";
        let params: unknown[] = [];
        const measured = drizzle({
            client: connection,
            logger: {
                logQuery: (statement, values) => {
                    query = statement;
                    params = values;
                },
            },
        });
        const started = performance.now();
        const known = await knownCraftingExchangeItems(
            measured as unknown as TDatabase,
            "Standard",
            HOUR,
        );
        const elapsed = performance.now() - started;
        expect(known?.size).toBe(1501);
        const [plan] = await connection.query(`EXPLAIN ANALYZE ${query}`, params);
        const detail = JSON.stringify(plan);
        expect(detail).toMatch(/index.*group|group.*index/i);
        expect(detail).toMatch(/PRIMARY/);
        process.stdout.write(
            `Exchange membership, 195000 rows: ${elapsed.toFixed(2)} ms; ${detail}\n`,
        );
    },
    120000,
);

beforeAll(async () => {
    container = await new MySqlContainer("mysql:8.4").withDatabase("ingest_test").start();
    connection = await createConnection(container.getConnectionUri());
    mysql = drizzle({ client: connection });
    await migrate(mysql, {
        migrationsFolder: fileURLToPath(new URL("../../app/db/migrations", import.meta.url)),
    });
    server = createServer(async (incoming, outgoing) => {
        try {
            if (new URL(incoming.url!, baseUrl).pathname !== "/api/stash-ingest") {
                const next = upstreamResponses.shift();
                outgoing.writeHead(next?.status ?? (next ? 200 : 500), {
                    "content-type": "application/json",
                });
                outgoing.end(JSON.stringify(next?.body ?? { error: "No seeded response" }));
                return;
            }
            if (receiverStatus) {
                outgoing.writeHead(receiverStatus);
                outgoing.end("Injected receiver failure");
                return;
            }
            const chunks: Buffer[] = [];
            for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
            const context = new RouterContextProvider();
            // Use the production SQL queries with MySQL's TCP transport in the test container.
            context.set(dbContext, mysql as unknown as TDatabase);
            context.set(envContext, { STASH_INGEST_TOKEN: TOKEN } as CloudflareBindings);
            const handler = incoming.method === "GET" ? loader : action;
            const response = await handler({
                request: new Request(`${baseUrl}${incoming.url}`, {
                    method: incoming.method,
                    headers: { authorization: incoming.headers.authorization ?? "" },
                    ...(incoming.method === "GET"
                        ? {}
                        : { body: Buffer.concat(chunks).toString() }),
                }),
                context,
                params: {},
                unstable_pattern: "/api/stash-ingest",
                unstable_url: new URL(`${baseUrl}/api/stash-ingest`),
            });
            outgoing.writeHead(response.status, Object.fromEntries(response.headers));
            outgoing.end(await response.text());
        } catch (error) {
            outgoing.writeHead(500);
            outgoing.end(String(error));
        }
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server port");
    baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
    for (const game of STASH_GAMES) {
        await mysql.delete(tStashDailySample[game]);
        await mysql.delete(tStashCheckpoint[game]);
        await mysql.delete(tStashCurrencyHour[game]);
        // Crafting's exchange membership reads each market's first hour from here.
        await mysql.delete(tStashCurrencyMarket[game]);
        await mysql.delete(tStashMarketHour[game]);
        await mysql.delete(tStashMarket[game]);
        // Market seasons read coverage, so it must not outlive the hourly rows it counts.
        await mysql.delete(tStashHourCoverage[game]);
        await mysql.delete(tStashLeague[game]);
    }
    await mysql.delete(tIngestWorker);
    await mysql.delete(tStashCohortHourly);
    await mysql.delete(tStashCohortWindow);
    await mysql.delete(tStashCohortRevision);
    await mysql.delete(tStashCohort);
    local = await openDb(":memory:");
    upstreamResponses = [];
    receiverStatus = undefined;
    vi.stubEnv("POE_BOATS_INGEST_URL", `${baseUrl}/api/stash-ingest`);
    vi.stubEnv("POE_BOATS_INGEST_TOKEN", TOKEN);
});

afterEach(async () => {
    await local?.close();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

afterAll(async () => {
    if (server?.listening)
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
        );
    await connection?.end();
    await container?.stop();
});

it("durably retries immutable cursor metadata and one daily sample, with authenticated reads", async () => {
    const page = { next_change_id: "second", stashes: [stash] };
    const scope = {
        realm: "pc" as const,
        league: "Standard",
        cursor: "first",
        capturedAt: HOUR * 1000,
    };
    await recordCheckpoint(local.conn, page, scope);
    await recordCheckpoint(
        local.conn,
        { ...page, next_change_id: "third" },
        { ...scope, cursor: "second", capturedAt: scope.capturedAt + 1000 },
    );
    receiverStatus = 503;
    await expect(flushCheckpoints(local.conn)).rejects.toThrow("503");
    expect(await queryAll(local.conn, "SELECT id FROM ps_checkpoint WHERE delivered")).toEqual([]);
    receiverStatus = undefined;
    expect(await flushCheckpoints(local.conn)).toBe(2);
    const original = await mysql.select().from(tStashDailySample.poe1);
    expect(original).toHaveLength(1);
    await local.conn.run("UPDATE ps_checkpoint SET delivered = FALSE");
    expect(await flushCheckpoints(local.conn)).toBe(2);
    expect(await mysql.select().from(tStashDailySample.poe1)).toEqual(original);
    expect(await mysql.select().from(tStashCheckpoint.poe1)).toHaveLength(2);
    const query = {
        kind: "checkpoints" as const,
        realm: "pc" as const,
        league: "Standard",
        from: HOUR * 1000,
        to: (HOUR + 3600) * 1000,
    };
    const rows = await fetchCheckpoints(query);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.responseGzip === null)).toBe(true);
    expect(
        await fetchCheckpoints({ ...query, afterTime: rows[0]!.capturedAt, afterId: rows[0]!.id }),
    ).toHaveLength(1);
    expect(await fetchCheckpoints({ ...query, league: "Other" })).toEqual([]);
    expect((await fetch(`${baseUrl}/api/stash-ingest?kind=sample`)).status).toBe(401);
    const client = createClient({ baseUrl, userAgent: "checkpoint-test", token: TOKEN });
    upstreamResponses.push({ body: page }, { body: { ...page, stashes: [] } });
    expect(await validateSample(client, query)).toMatchObject({
        status: "matched",
        originalStashes: 1,
    });
    expect(await validateSample(client, query)).toMatchObject({
        status: "changed",
        fetchedStashes: 0,
    });
    expect(await mysql.select().from(tStashUniqueHourly.poe1)).toEqual([]);
});

it("probes selected-field hashes across pages without modifying capture or market history", async () => {
    const second = { ...stash, id: "second" };
    const scope = {
        realm: "pc" as const,
        league: "Standard",
        cursor: "start",
        capturedAt: HOUR * 1000,
    };
    await recordCheckpoint(
        local.conn,
        { next_change_id: "old-boundary", stashes: [stash, second] },
        scope,
    );
    await flushCheckpoints(local.conn);
    const checkpoints = await mysql.select().from(tStashCheckpoint.poe1);
    const samples = await mysql.select().from(tStashDailySample.poe1);
    const query = {
        kind: "sample" as const,
        realm: "pc" as const,
        league: "Standard",
        from: HOUR * 1000,
        to: (HOUR + 3600) * 1000,
    };
    const client = createClient({ baseUrl, userAgent: "probe-test", token: TOKEN });
    upstreamResponses.push(
        {
            body: {
                next_change_id: "new-boundary",
                stashes: [{ ...stash, lastCharacterName: "new-character" }],
            },
        },
        { body: { next_change_id: "end", stashes: [second, { ...stash, id: "extra" }] } },
    );
    expect(await probeSample(client, query, { pages: 2, delayMs: 0 })).toMatchObject({
        status: "selected-fields-matched",
        version: "listing-v1",
        fullMatched: 1,
        selectedMatched: 2,
        missing: 0,
        extraStashes: 1,
        pages: [
            { page: 1, missing: 1 },
            { page: 2, missing: 0 },
        ],
    });
    upstreamResponses.push({ body: { next_change_id: "start", stashes: [] } });
    expect(await probeSample(client, query, { pages: 5, delayMs: 0 })).toMatchObject({
        status: "incomplete",
        stopped: "cursor-repeated",
        missing: 2,
    });
    await expect(probeSample(client, query, { pages: 26 })).rejects.toThrow("1 and 25");
    upstreamResponses.push({ status: 400, body: { error: { message: "Cursor unavailable" } } });
    expect(await probeSample(client, query, { pages: 2, delayMs: 0 })).toMatchObject({
        status: "incomplete",
        stopped: "source-unavailable",
        sourceError: { status: 400 },
        pages: [],
    });
    expect(await mysql.select().from(tStashCheckpoint.poe1)).toEqual(checkpoints);
    expect(await mysql.select().from(tStashDailySample.poe1)).toEqual(samples);
    expect(await mysql.select().from(tStashUniqueHourly.poe1)).toEqual([]);
    expect(await queryAll(local.conn, "SELECT * FROM ps_listing")).toEqual([]);
    expect(await getCursor(local.conn, "psapi")).toBeUndefined();
});

it.each([
    "psapi-replay",
    "equipment-replay",
])("rejects retired restore stream %s", async (stream) => {
    const response = await fetch(`${baseUrl}/api/stash-ingest`, {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ stream, rows: [] }),
    });
    expect(response.status).toBe(400);
    expect(await mysql.select().from(tStashUniqueHourly.poe1)).toEqual([]);
    expect(await mysql.select().from(tStashCohortHourly)).toEqual([]);
});

it.each([
    "pending",
    "validated",
])("refuses retired %s replay databases for capture and publication", async (state) => {
    await local.conn.run("INSERT INTO pipeline_config VALUES ('replay', $1)", [state]);
    const client = createClient({ baseUrl, userAgent: "retired-replay-test", token: TOKEN });
    await expect(ingestPs(local.conn, client, { pages: 1 })).rejects.toThrow("retired");
    await expect(rollupPs(local.conn, { hour: HOUR })).rejects.toThrow("retired");
    await expect(rollupEquipment(local.conn, { hour: HOUR })).rejects.toThrow("retired");
    expect(await mysql.select().from(tStashUniqueHourly.poe1)).toEqual([]);
    expect(await mysql.select().from(tStashCohortHourly)).toEqual([]);
});

it("keeps Ruthless, solo self-found and private leagues in the worker database only", async () => {
    const leagues = ["Ruthless Standard", "SSF Standard", "Chiba league (PL87141)"];
    const stashes = ["Standard", ...leagues].map((league, n) => ({
        ...stash,
        id: `league-stash-${n}`,
        accountName: `league-seller-${n}`,
        league,
        items: [{ ...item, id: `league-item-${n}` }],
    }));
    upstreamResponses.push({ body: { next_change_id: "leagues-1", stashes } });
    const client = createClient({ baseUrl, userAgent: "leagues-e2e", token: TOKEN });
    await ingestPs(local.conn, client, { pages: 1 });
    const hour = Math.floor(Date.now() / 3600000) * 3600;
    await rollupPs(local.conn, { hour });
    expect(
        (
            await queryAll<{ league: string }>(
                local.conn,
                "SELECT DISTINCT league FROM ps_listing_hour ORDER BY league",
            )
        ).map((row) => row.league),
    ).toEqual(["Chiba league (PL87141)", "Ruthless Standard", "SSF Standard", "Standard"]);
    // Every league's hour counts as delivered, so it is not pushed again.
    expect(
        (
            await queryAll<{ league: string }>(
                local.conn,
                "SELECT league FROM rollup_state WHERE stream_name = 'psapi' ORDER BY league",
            )
        ).map((row) => row.league),
    ).toEqual(["Chiba league (PL87141)", "Ruthless Standard", "SSF Standard", "Standard"]);
    const stored = async () =>
        (
            await mysql.selectDistinct({ league: tStashMarket.poe1.league }).from(tStashMarket.poe1)
        ).map((row) => row.league);
    expect(await stored()).toEqual(["Standard"]);

    // Ruthless exchange pairs outside the price currencies stay with the worker too.
    const exchange = {
        next_change_id: HOUR + 3600,
        markets: [
            market,
            { ...market, league: "Ruthless Standard", market_id: "Mirror|Fragment" },
            { ...market, league: "Chiba league (PL87141)" },
        ],
    };
    upstreamResponses.push({ body: exchange });
    await ingestCx(local.conn, client, { fromHour: HOUR, catchUp: false });
    await rollupCx(local.conn, { hour: HOUR });
    expect(
        (
            await queryAll<{ league: string }>(
                local.conn,
                "SELECT DISTINCT league FROM cx_market_hour ORDER BY league",
            )
        ).map((row) => row.league),
    ).toEqual(["Chiba league (PL87141)", "Ruthless Standard", "Standard"]);
    expect(
        await mysql
            .selectDistinct({ league: tStashCurrencyHourly.poe1.league })
            .from(tStashCurrencyHourly.poe1),
    ).toEqual([{ league: "Standard" }]);

    // The receiver also drops them from an older worker, acknowledging the whole batch.
    await push({
        stream: "psapi",
        rows: leagues.map((league) => ({
            realm: "pc",
            league,
            hour: hour - 3600,
            itemKey: "Headhunter",
            corrupted: false,
            links: 0,
            tab: "merchant",
            signatureKind: "",
            signatureValue: "",
            signatureData: null,
            iconAsset: null,
            name: "Headhunter",
            baseType: "Leather Belt",
            frameType: 3,
            identified: true,
            listingCount: 1,
            uniqueSellers: 1,
            prices: {},
            firstSeenAt: new Date(hour * 1000).toISOString(),
            lastSeenAt: new Date(hour * 1000).toISOString(),
        })),
    });
    expect(await stored()).toEqual(["Standard"]);
});

it("accepts authenticated worker heartbeats and exposes real coverage through HTTP and MCP", async () => {
    const now = Date.now();
    const heartbeat = {
        workerId: "local-Allflame",
        realm: "pc",
        league: "Allflame",
        state: "running",
        stage: "currency",
        startedAt: now,
        reportedAt: now,
        progressAt: now,
        completedAt: null,
        lastSuccessAt: null,
        failedStages: [],
        cycles: 1,
        pages: 5,
        equipmentObserved: 15,
        stashCaughtUp: false,
        currencyNextHour: HOUR,
        deliveredHours: 0,
        deliveredRows: 0,
    };
    const body = JSON.stringify({ stream: "status", rows: [heartbeat] });
    expect((await fetch(`${baseUrl}/api/stash-ingest`, { method: "POST", body })).status).toBe(401);
    expect(
        (
            await fetch(`${baseUrl}/api/stash-ingest`, {
                method: "POST",
                headers: { authorization: `Bearer ${TOKEN}` },
                body,
            })
        ).status,
    ).toBe(200);
    await upsertStashCurrencyHourly(mysql as unknown as TDatabase, [
        { realm: "pc", league: "Allflame", hour: HOUR, marketId: "first" },
        { realm: "pc", league: "Allflame", hour: HOUR, marketId: "second" },
        { realm: "pc", league: "Allflame", hour: HOUR + 7200, marketId: "first" },
    ]);
    const unused = async (): Promise<never> => {
        throw new Error("Unexpected catalog lookup");
    };
    const runtime = async (): Promise<OperationContext> => ({
        db: mysql as unknown as TDatabase,
        caller: null,
        origin: "https://poe.boats",
        loadCatalog: unused,
        loadWorkbenchCatalog: unused,
        loadCraftingRulesets: unused,
        loadCraftingRevision: unused,
    });
    const expected = await getServerStatus(mysql as unknown as TDatabase, { league: "Allflame" });
    expect(expected.workers).toMatchObject([{ health: "running", stage: "currency", pages: 5 }]);
    expect(expected.coverage).toEqual([
        {
            stream: "currency",
            realm: "pc",
            league: "Allflame",
            firstHour: HOUR,
            latestHour: HOUR + 7200,
            hours: 2,
            rows: 3,
        },
    ]);
    const http = await api.request(
        "https://poe.boats/api/v1/server/status?league=Allflame",
        undefined,
        { runtime },
    );
    expect(http.status).toBe(200);
    expect(await http.json()).toMatchObject({
        workers: expected.workers,
        coverage: expected.coverage,
    });
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
                params: { name: "get_server_status", arguments: { league: "Allflame" } },
            }),
        }),
        runtime,
    );
    const result = CallToolResultSchema.parse(((await rpc.json()) as { result: unknown }).result);
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
        workers: expected.workers,
        coverage: expected.coverage,
    });
    expect(
        (
            await api.request("https://poe.boats/api/v1/server/status?realm=invalid", undefined, {
                runtime,
            })
        ).status,
    ).toBe(400);
    expect(
        (await getServerStatus(mysql as unknown as TDatabase, { league: "Other" })).workers,
    ).toEqual([]);
    const invalid = await fetch(`${baseUrl}/api/stash-ingest`, {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ stream: "status", rows: [{ ...heartbeat, pages: -1 }] }),
    });
    expect(invalid.status).toBe(400);
});

it("converts captured indirect pairs only with positive matching-hour legs and preserves historical scope", async () => {
    const divine = "Metadata/Items/Currency/CurrencyModValues";
    const db = mysql as unknown as TDatabase;
    await insertCurrency([
        {
            realm: "pc",
            league: "Standard",
            hour: HOUR,
            marketId: `${transmuteId}|${divine}`,
            volumeTraded: { [transmuteId]: 100, [divine]: 2 },
        },
        {
            realm: "pc",
            league: "Standard",
            hour: HOUR,
            marketId: `${divine}|${chaosId}`,
            volumeTraded: { [divine]: 10, [chaosId]: 3600 },
        },
        {
            realm: "pc",
            league: "Standard",
            hour: HOUR + 3600,
            marketId: `${divine}|${chaosId}`,
            volumeTraded: { [divine]: 10, [chaosId]: 4000 },
        },
    ]);
    const input = {
        game: "poe1" as const,
        realm: "pc" as const,
        league: "Standard",
        currency: "chaos",
        itemIds: [transmuteId],
        at: HOUR,
    };
    expect((await findCraftingExchangePrices(db, input)).quotes).toEqual({});
    const converted = await findCraftingExchangePrices(db, {
        ...input,
        conversion: "reference-currency-v1",
    });
    expect(converted.quotes[transmuteId]).toMatchObject({
        amount: 7.2,
        estimator: "cross-rate-v1",
        hour: HOUR,
    });
    const unavailable = await findCraftingExchangePrices(db, {
        ...input,
        at: HOUR + 3600,
        conversion: "reference-currency-v1",
    });
    expect(unavailable.quotes[transmuteId]).toBeUndefined();
    expect(unavailable.missing[transmuteId]).toContain("selected completed hour");
    for (const wrong of [
        { at: HOUR - 1 },
        { at: HOUR + 24 * 3600 },
        { league: "Other" },
        { realm: "xbox" as const },
    ])
        expect(
            (
                await findCraftingExchangePrices(db, {
                    ...input,
                    ...wrong,
                    conversion: "reference-currency-v1",
                })
            ).quotes,
        ).toEqual({});
    const bound = bindExchangePrice(exchangeGraph(), transmuteId, converted.quotes[transmuteId]!);
    expect(
        (await craftingMarketSnapshots(db, bound, engine, [HOUR])).points[0]?.graph?.prices[
            transmuteId
        ]?.amount,
    ).toBe(7.2);
});

it("uses a bounded same-hour non-reference exchange bridge without changing legacy bindings", async () => {
    const item = "Metadata/Items/Currency/CurrencyHellscapeUpgradeModTier";
    const bridge = "Metadata/Items/Currency/CurrencyHellscapeAddModToRare";
    await insertCurrency([
        {
            realm: "pc",
            league: "Standard",
            hour: HOUR,
            marketId: `${item}|${bridge}`,
            volumeTraded: { [item]: 6, [bridge]: 6 },
        },
        {
            realm: "pc",
            league: "Standard",
            hour: HOUR,
            marketId: `${bridge}|${chaosId}`,
            volumeTraded: { [bridge]: 1, [chaosId]: 320 },
        },
        {
            realm: "pc",
            league: "Standard",
            hour: HOUR + 3600,
            marketId: `${bridge}|${chaosId}`,
            volumeTraded: { [bridge]: 1, [chaosId]: 400 },
        },
    ]);
    const input = {
        game: "poe1" as const,
        realm: "pc" as const,
        league: "Standard",
        currency: "chaos",
        itemIds: [item],
        at: HOUR,
    };
    const db = mysql as unknown as TDatabase;
    const legacy = await findCraftingExchangePrices(db, {
        ...input,
        conversion: "reference-currency-v1",
    });
    expect(legacy.quotes[item]).toBeUndefined();
    const converted = await findCraftingExchangePrices(db, {
        ...input,
        conversion: "two-leg-exchange-v1",
    });
    expect(converted.quotes[item]).toMatchObject({
        amount: 320,
        hour: HOUR,
        conversion: "two-leg-exchange-v1",
        legs: [
            { itemId: item, quoteId: bridge },
            { itemId: bridge, quoteId: chaosId },
        ],
    });
    const bound = bindExchangePrice(exchangeGraph(), item, converted.quotes[item]!);
    const refreshed = await refreshCraftingMarketPrices(db, bound, engine, HOUR);
    expect(refreshed.issues).toEqual([]);
    expect(refreshed.graph.prices[item]?.amount).toBe(320);
    const request = { ...input, conversion: "two-leg-exchange-v1" as const };
    expect(
        await parity("crafting/market/exchange", "find_crafting_exchange_prices", request),
    ).toEqual(converted);
    const next = await findCraftingExchangePrices(db, {
        ...input,
        at: HOUR + 3600,
        conversion: "two-leg-exchange-v1",
    });
    expect(next.quotes[item]).toBeUndefined();
    await insertCurrency({
        realm: "pc",
        league: "Standard",
        hour: HOUR,
        marketId: `${bridge}|${item}`,
        volumeTraded: { [item]: 6, [bridge]: 3 },
    });
    const conflict = await findCraftingExchangePrices(db, request);
    expect(conflict.quotes[item]).toBeUndefined();
});

it("fails closed when there are too many same-hour markets to discover conversion paths", async () => {
    const item = "Metadata/Items/Currency/LimitTest";
    const rows = Array.from({ length: 5001 }, (_, index) => ({
        realm: "pc",
        league: "LimitTest",
        hour: HOUR,
        marketId: `${item}|Metadata/Items/Currency/Bridge${index}`,
    }));
    for (let offset = 0; offset < rows.length; offset += 500)
        await insertCurrency(rows.slice(offset, offset + 500));
    const result = await findCraftingExchangePrices(mysql as unknown as TDatabase, {
        game: "poe1",
        realm: "pc",
        league: "LimitTest",
        currency: "chaos",
        itemIds: [item],
        at: HOUR,
        conversion: "two-leg-exchange-v1",
    });
    expect(result.quotes[item]).toBeUndefined();
    expect(result.missing[item]).toContain("Too many exchange markets");
});

it("shares explicit vendor ingredient two-leg conversion across HTTP and MCP", async () => {
    const bridge = "Metadata/Items/Currency/CurrencyHellscapeAddModToRare";
    await insertCurrency([
        {
            realm: "pc",
            league: "Standard",
            hour: HOUR,
            marketId: `${vendorInputId}|${bridge}`,
            volumeTraded: { [vendorInputId]: 3, [bridge]: 2 },
        },
        {
            realm: "pc",
            league: "Standard",
            hour: HOUR,
            marketId: `${bridge}|${chaosId}`,
            volumeTraded: { [bridge]: 4, [chaosId]: 40 },
        },
        {
            realm: "pc",
            league: "Standard",
            hour: HOUR + 3600,
            marketId: `${bridge}|${chaosId}`,
            volumeTraded: { [bridge]: 4, [chaosId]: 80 },
        },
    ]);
    const graph = exchangeGraph();
    const request = {
        graph,
        realm: "pc",
        ids: [vendorOutputId],
        at: HOUR,
        vendorUpgrade: { inputId: vendorInputId, conversion: "two-leg-exchange-v1" },
    };
    const result = craftingSourceResultSchema.parse(
        await parity("crafting/market/sources", "find_crafting_source_prices", request),
    );
    const quote = result.quotes[vendorOutputId];
    expect(quote).toMatchObject({
        source: "vendor-upgrade",
        conversion: "two-leg-exchange-v1",
        ingredient: {
            hour: HOUR,
            legs: [
                { quoteId: bridge, hour: HOUR },
                { itemId: bridge, hour: HOUR },
            ],
        },
    });
    expect(quote?.amount).toBeCloseTo(60);
    const bound = z.object({ graph: craftingGraphSchema }).parse(
        await parity("crafting/market/sources/bind", "bind_crafting_source_price", {
            graph,
            id: vendorOutputId,
            quote,
        }),
    ).graph;
    expect(bound.prices[vendorOutputId]?.amount).toBeCloseTo(60);
    const history = await parity("crafting/market/snapshots", "get_crafting_price_snapshots", {
        graph: bound,
        hours: [HOUR, HOUR + 3600],
    });
    expect(history).toMatchObject({
        points: [
            { graph: { prices: { [vendorOutputId]: { amount: expect.closeTo(60) } } }, issues: [] },
            { graph: null, issues: [expect.any(String)] },
        ],
    });
    const missing = craftingSourceResultSchema.parse(
        await parity("crafting/market/sources", "find_crafting_source_prices", {
            ...request,
            at: HOUR + 3600,
        }),
    );
    expect(missing.quotes).toEqual({});
    expect(missing.missing[vendorOutputId]).toBeTruthy();
});

it("waits for a saved exchange hour to complete without fetching an upstream 404 or advancing its cursor", async () => {
    const hour = Math.floor(Date.now() / 3_600_000) * 3600;
    await setCursor(local.conn, "cxapi", String(hour));
    const client = createClient({ baseUrl, userAgent: "hour-boundary-test", token: TOKEN });
    expect(await ingestCx(local.conn, client, { catchUp: true, league: "Standard" })).toEqual([]);
    expect(await getCursor(local.conn, "cxapi")).toBe(String(hour));
    expect(await queryAll(local.conn, "SELECT * FROM cx_market_hour")).toEqual([]);
});

it("numbers equipment revisions in first-seen order across batches and repeated pushes", async () => {
    // 450 rows span three upsert batches but only two revisions.
    const rows = Array.from({ length: 450 }, (_, index) => ({
        ...marketCandidate.latest,
        cohortId: `cohort:${String(index).padStart(3, "0")}`,
        revision: index % 2 ? "odd-revision" : "even-revision",
        hour: marketCandidate.latest.hour + (index < 225 ? 0 : 3600),
    }));
    const post = () =>
        fetch(`${baseUrl}/api/stash-ingest`, {
            method: "POST",
            headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
            body: JSON.stringify({ stream: "equipment", rows }),
        });
    for (let attempt = 0; attempt < 2; attempt++) {
        const response = await post();
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ stream: "equipment", written: 450 });
    }
    const revisions = await mysql
        .select({ seq: tStashCohortRevision.seq, revision: tStashCohortRevision.revision })
        .from(tStashCohortRevision)
        .orderBy(tStashCohortRevision.seq);
    expect(revisions.map((row) => row.revision)).toEqual(["even-revision", "odd-revision"]);
    const seqs = new Map(revisions.map((row) => [row.revision, row.seq]));
    const stored = await mysql.select().from(tStashCohortHourly);
    expect(stored).toHaveLength(450);
    for (const row of stored)
        expect(row.revisionSeq).toBe(
            seqs.get(Number(row.cohortId.slice(-3)) % 2 ? "odd-revision" : "even-revision"),
        );
});

it("keeps each cohort hour's newest revision and merges its recent windows into history", async () => {
    const db = mysql as unknown as TDatabase;
    const { hour, cohortId } = marketCandidate.latest;
    const clock = vi.spyOn(Date, "now").mockReturnValue((hour + 3600) * 1000);
    const row = (revision: string, median: number, at = hour, id = cohortId) => {
        const latest = adaptiveMarketCandidate(median).latest;
        latest.prices.chaos!.median = median;
        return { ...latest, revision, hour: at, cohortId: id };
    };
    const { windows: _windows, ...unwindowed } = row("first", 20).prices.chaos!;
    // Older than the retained window hours, so only the hourly row is stored.
    const expired = {
        ...row("first", 20, hour - COHORT_WINDOW_RETENTION_HOURS * 3600),
        prices: { chaos: unwindowed },
    };
    await upsertStashCohortHourly(db, [
        row("first", 20),
        row("first", 20, hour, "other-cohort"),
        { ...expired, prices: row("first", 20).prices },
    ]);
    await upsertStashCohortHourly(db, [row("second", 30)]);
    // An older revision delivered later leaves the newer row and its windows unchanged.
    await upsertStashCohortHourly(db, [row("first", 40)]);
    const seqs = new Map(
        (await mysql.select().from(tStashCohortRevision)).map((value) => [
            value.revision,
            value.seq,
        ]),
    );
    expect(seqs.get("first")!).toBeLessThan(seqs.get("second")!);
    const stored = await mysql
        .select()
        .from(tStashCohortHourly)
        .orderBy(tStashCohortHourly.hour, tStashCohortHourly.cohortId);
    expect(stored).toMatchObject([
        { hour: expired.hour, cohortId, revisionSeq: seqs.get("first") },
        { hour, cohortId, revisionSeq: seqs.get("second"), prices: { chaos: { median: 30 } } },
        { hour, cohortId: "other-cohort", revisionSeq: seqs.get("first") },
    ]);
    expect(stored.every((value) => value.prices.chaos!.windows === undefined)).toBe(true);
    const windows = await mysql
        .select()
        .from(tStashCohortWindow)
        .orderBy(tStashCohortWindow.cohortId);
    expect(windows).toEqual([
        {
            realm: "pc",
            league: "Standard",
            hour,
            cohortId,
            revisionSeq: seqs.get("second"),
            windows: { chaos: row("second", 30).prices.chaos!.windows },
        },
        {
            realm: "pc",
            league: "Standard",
            hour,
            cohortId: "other-cohort",
            revisionSeq: seqs.get("first"),
            windows: { chaos: row("first", 20).prices.chaos!.windows },
        },
    ]);
    const historyInput = { realm: "pc" as const, league: "Standard", cohortId, limit: 10 };
    expect((await craftingMarketHistory(db, historyInput)).history).toEqual([
        row("second", 30),
        expired,
    ]);
    // Once the hour leaves the retained range, the next delivery deletes its windows.
    clock.mockReturnValue((hour + (COHORT_WINDOW_RETENTION_HOURS + 2) * 3600) * 1000);
    const later = hour + COHORT_WINDOW_RETENTION_HOURS * 3600;
    await upsertStashCohortHourly(db, [row("second", 35, later)]);
    expect(
        await mysql
            .select({ hour: tStashCohortWindow.hour, cohortId: tStashCohortWindow.cohortId })
            .from(tStashCohortWindow),
    ).toEqual([{ hour: later, cohortId }]);
    const { windows: _secondWindows, ...secondUnwindowed } = row("second", 30).prices.chaos!;
    expect((await craftingMarketHistory(db, historyInput)).history).toEqual([
        row("second", 35, later),
        { ...row("second", 30), prices: { chaos: secondUnwindowed } },
        expired,
    ]);
});

it("stores only priced cohort hours and falls back to the latest priced hour", async () => {
    const db = mysql as unknown as TDatabase;
    const { hour, cohortId } = marketCandidate.latest;
    vi.spyOn(Date, "now").mockReturnValue((hour + 3600) * 1000);
    const row = (
        revision: string,
        median: number | null,
        at = hour,
        id = cohortId,
    ): CohortHourly => {
        const latest = adaptiveMarketCandidate(median ?? 20).latest;
        return {
            ...latest,
            revision,
            hour: at,
            cohortId: id,
            ...(median === null
                ? { listingCount: 0, uniqueSellers: 0, unknownCount: 12, prices: {} }
                : { prices: { chaos: { ...latest.prices.chaos!, median } } }),
        };
    };
    const stored = () =>
        mysql
            .select({
                hour: tStashCohortHourly.hour,
                cohortId: tStashCohortHourly.cohortId,
                median: sql<number>`json_extract(${tStashCohortHourly.prices}, '$.chaos.median')`,
            })
            .from(tStashCohortHourly)
            .orderBy(tStashCohortHourly.hour, tStashCohortHourly.cohortId);
    await upsertStashCohortHourly(db, [
        row("first", 20, hour - 3600),
        row("first", 25),
        // Unknown-only matches never create a row.
        row("first", null, hour, "unknown-only"),
    ]);
    expect(await stored()).toEqual([
        { hour: hour - 3600, cohortId, median: 20 },
        { hour, cohortId, median: 25 },
    ]);
    // A later delivery of the hour without prices deletes the earlier row and its windows.
    await upsertStashCohortHourly(db, [row("first", null)]);
    expect(await stored()).toEqual([{ hour: hour - 3600, cohortId, median: 20 }]);
    expect(
        await mysql
            .select({ hour: tStashCohortWindow.hour, cohortId: tStashCohortWindow.cohortId })
            .from(tStashCohortWindow),
    ).toEqual([{ hour: hour - 3600, cohortId }]);
    await mysql.insert(tStashCohort).values(marketCandidate.definition);
    const lookup = await findCraftingMarketPrices(
        db,
        {
            item: createCraftingItemQuery(engine).record(engine.createItem(baseId, 86)),
            requirements: { format: 1, game: "poe1", groups: [] },
            realm: "pc",
            league: "Standard",
            currency: "chaos",
            at: hour,
        },
        cohortId,
    );
    expect(lookup.candidates.map(({ covered, latest }) => [latest.hour, covered])).toEqual([
        [hour - 3600, true],
    ]);
    // An older revision's unpriced delivery leaves a newer revision's row.
    await upsertStashCohortHourly(db, [row("second", 30)]);
    await upsertStashCohortHourly(db, [row("first", null)]);
    expect(await stored()).toEqual([
        { hour: hour - 3600, cohortId, median: 20 },
        { hour, cohortId, median: 30 },
    ]);
});

it("refreshes a saved cohort to its newest revision and recovers earlier prices without rewriting history", async () => {
    const current = structuredClone(marketCandidate);
    current.definition.revision = "next-market";
    current.definition.catalogHash = "b".repeat(64);
    current.latest.revision = "next-market";
    current.latest.hour += 3600;
    current.latest.prices.chaos!.median = 27;
    vi.spyOn(Date, "now").mockReturnValue((current.latest.hour + 3600) * 1000);
    // One definition per cohort ID: the newer revision's definition replaces the older one.
    await mysql.insert(tStashCohort).values(current.definition);
    const db = mysql as unknown as TDatabase;
    await upsertStashCohortHourly(db, [marketCandidate.latest, current.latest]);
    const graph = bindCohortPurchasePrice(marketGraph(), engine, "base", "buy", marketCandidate);
    const node = graph.nodes[0]!;
    if (node.kind !== "acquire") throw new Error("Fixture");
    const purchase = node.alternatives[0];
    if (purchase?.kind !== "purchase" || purchase.price?.source !== "market")
        throw new Error("Fixture");
    node.choice = { mode: "pinned", alternativeId: "buy" };
    const refreshed = await refreshCraftingMarketPrices(db, graph, engine);
    expect(refreshed.issues).toEqual([]);
    expect(livePurchasePrices(refreshed.graph)[0]).toMatchObject({
        reference: { cohortId: marketCandidate.definition.id },
        alternative: { price: { amount: 27 } },
        node: { choice: node.choice },
    });
    expect(livePurchasePrices(refreshed.graph)[0]!.reference).not.toHaveProperty("revision");
    const snapshots = await craftingMarketSnapshots(db, refreshed.graph, engine, [
        marketCandidate.latest.hour,
        current.latest.hour,
    ]);
    for (const [index, amount] of [
        [0, 20],
        [1, 27],
    ] as const) {
        const point = snapshots.points[index]!;
        expect(point.issues).toEqual([]);
        expect(livePurchasePrices(point.graph!)[0]).toMatchObject({
            alternative: { price: { amount } },
        });
        expect(point.graph!.ruleset).toEqual(graph.ruleset);
        expect(
            calculateCraftingGraph(catalog, point.graph!, {
                estimateIterations: 2,
                workLimit: 1000,
            }).meanCost,
        ).toBe(amount);
    }
    const history = await craftingMarketHistory(db, {
        realm: "pc",
        league: "Standard",
        cohortId: marketCandidate.definition.id,
        limit: 10,
    });
    expect(history.history).toEqual([current.latest, marketCandidate.latest]);
    // A reference saved while cohorts were scoped by revision still refreshes by cohort ID.
    const reference = livePurchasePrices(graph)[0]!.reference;
    purchase.price.cohortId = `cohort:v1:${encodeURIComponent(
        JSON.stringify({ ...reference, revision: "test-market" }),
    )}`;
    expect(livePurchasePrices(graph)[0]!.reference).toEqual(reference);
    const legacy = await refreshCraftingMarketPrices(db, graph, engine);
    expect(legacy.issues).toEqual([]);
    expect(livePurchasePrices(legacy.graph)[0]).toMatchObject({
        alternative: { price: { amount: 27 } },
    });
});

it("offers stored donor-family quotes only under an explicit representative assumption", async () => {
    const { graph, candidate } = donorFamilyMarketFixture();
    await mysql.insert(tStashCohort).values([candidate.definition, marketCandidate.definition]);
    await upsertStashCohortHourly(mysql as unknown as TDatabase, [
        candidate.latest,
        marketCandidate.latest,
    ]);
    const node = graph.nodes[0]!;
    if (node.kind !== "acquire" || node.alternatives[0]?.kind !== "purchase")
        throw new Error("Fixture");
    const input = {
        item: createCraftingItemQuery(engine).record(node.alternatives[0].item),
        requirements: node.output,
        realm: "pc" as const,
        league: "Standard",
        currency: "chaos",
        at: candidate.latest.hour,
    };
    const db = mysql as unknown as TDatabase;
    const exact = await findCraftingMarketPrices(db, input);
    expect(exact.candidates).toHaveLength(1);
    expect(exact.candidates[0]).toMatchObject({ covered: false });
    expect(exact.candidates[0]?.assumption).toBeUndefined();
    const family = await findCraftingMarketPrices(db, {
        ...input,
        assumption: "display-equivalent-v1",
    });
    expect(family.candidates).toHaveLength(1);
    expect(family.candidates[0]).toMatchObject({
        covered: true,
        assumption: "display-equivalent-v1",
    });
    const bound = bindCohortPurchasePrice(graph, engine, "base", "buy", family.candidates[0]!);
    const historical = await craftingMarketSnapshots(db, bound, engine, [candidate.latest.hour]);
    expect(historical.points[0]?.issues).toEqual([]);
    expect(historical.points[0]?.graph?.nodes[0]).toMatchObject({
        alternatives: [{ price: { amount: 20 } }],
    });
    const ordinary = await findCraftingMarketPrices(db, {
        ...input,
        item: createCraftingItemQuery(engine).record(
            engine.createItem("Metadata/Items/Armours/BodyArmours/BodyStr1", 86),
        ),
        requirements: itemQuerySchema.parse({ game: "poe1" }),
        assumption: "display-equivalent-v1",
    });
    expect(ordinary.candidates).toHaveLength(1);
    expect(ordinary.candidates[0]?.covered).toBe(true);
    expect(ordinary.candidates[0]?.assumption).toBeUndefined();
});

it("reuses only acknowledged equipment definitions for the same connection and receiver", async () => {
    const client = createClient({ baseUrl, userAgent: "definition-e2e", token: TOKEN });
    const page = {
        next_change_id: "definitions-next",
        stashes: [
            {
                ...stash,
                items: [
                    {
                        ...item,
                        name: "",
                        baseType: "Necrotic Armour",
                        typeLine: "Necrotic Armour",
                        ilvl: 86,
                        frameType: 0,
                        sockets: [],
                        explicitMods: [],
                        note: "~price 20 chaos",
                    },
                ],
            },
        ],
    };
    const capture = async (conn: DbHandle["conn"]) => {
        upstreamResponses.push({ body: page });
        await ingestPs(conn, client, { pages: 1, observedAt: new Date(HOUR * 1000) });
    };
    await capture(local.conn);
    const requests = vi.spyOn(globalThis, "fetch");
    const definitionsSent = () =>
        requests.mock.calls.filter(
            ([, init]) =>
                typeof init?.body === "string" &&
                JSON.parse(init.body).stream === "equipment-definitions",
        ).length;
    await rollupEquipment(local.conn, { hour: HOUR, dryRun: true });
    expect(definitionsSent()).toBe(0);
    receiverStatus = 503;
    await expect(rollupEquipment(local.conn, { hour: HOUR })).rejects.toThrow("503");
    expect(definitionsSent()).toBe(1);
    receiverStatus = undefined;
    await rollupEquipment(local.conn, { hour: HOUR });
    expect(definitionsSent()).toBe(2);
    await rollupEquipment(local.conn, { hour: HOUR });
    expect(definitionsSent()).toBe(2);
    vi.stubEnv("POE_BOATS_INGEST_URL", `${baseUrl}/api/stash-ingest?receiver=other`);
    await rollupEquipment(local.conn, { hour: HOUR });
    expect(definitionsSent()).toBe(3);
    // Delivery is recorded in the database, so a restarted worker does not resend it.
    expect(
        await queryAll(
            local.conn,
            "SELECT count(DISTINCT url)::INTEGER AS receivers FROM ps_equipment_cohort_delivered",
        ),
    ).toEqual([{ receivers: 2 }]);
    const another = await openDb(":memory:");
    try {
        await capture(another.conn);
        await rollupEquipment(another.conn, { hour: HOUR });
        expect(definitionsSent()).toBe(4);
    } finally {
        await another.close();
    }
});

it("persists deduplicated equipment windows while retaining hourly history and historical cutoffs", async () => {
    // Windows are kept only for recent hours, so the captured hours must be recent.
    vi.spyOn(Date, "now").mockReturnValue((HOUR + 6 * 3600) * 1000);
    const client = createClient({ baseUrl, userAgent: "window-e2e", token: TOKEN });
    const equipment = {
        ...item,
        name: "",
        baseType: "Necrotic Armour",
        typeLine: "Necrotic Armour",
        ilvl: 86,
        frameType: 0,
        sockets: [],
        explicitMods: [],
        note: "~price 20 chaos",
    };
    for (let offset = 0; offset < 6; offset++) {
        upstreamResponses.push({
            body: {
                next_change_id: `window-${offset}`,
                stashes: [
                    { ...stash, items: [equipment] },
                    {
                        ...stash,
                        id: `other-${offset}`,
                        accountName: `seller-${offset + 2}`,
                        items: [
                            { ...equipment, id: `item-${offset + 2}`, note: "~price 21 chaos" },
                        ],
                    },
                ],
            },
        });
        await ingestPs(local.conn, client, {
            pages: 1,
            observedAt: new Date((HOUR + offset * 3600) * 1000),
        });
        await rollupEquipment(local.conn, { hour: HOUR + offset * 3600, league: "Standard" });
    }
    await rollupEquipment(local.conn, { hour: HOUR + 5 * 3600, league: "Standard" });
    const database = mysql as unknown as TDatabase;
    const input = {
        item: normalizeApiItem("poe1", "stash", equipment),
        requirements: itemQuerySchema.parse({ game: "poe1" }),
        realm: "pc" as const,
        league: "Standard",
        currency: "chaos",
        window: "adaptive-v1" as const,
        at: HOUR + 5 * 3600,
    };
    const result = await findCraftingMarketPrices(database, input);
    const broad = result.candidates.find((row) => row.definition.id.startsWith("base:"))!;
    expect(broad.covered).toBe(false);
    expect(broad.reasons).toContain("The cohort does not guarantee the configured rarity.");
    const candidate = result.candidates.find((row) => row.covered)!;
    expect(candidate).toBeDefined();
    expect(candidate.window).toBe("adaptive-v1");
    expect(candidate.latest.prices.chaos).toMatchObject({
        count: 2,
        median: 20.5,
        windows: { "6": { count: 7, sellers: 7, median: 21 } },
    });
    expect(selectCohortPrice(candidate.latest, "chaos", candidate.window)).toMatchObject({
        hours: 6,
        median: 21,
    });
    const earlier = (
        await findCraftingMarketPrices(database, { ...input, at: HOUR + 4 * 3600 })
    ).candidates.find((row) => row.covered)!;
    expect(selectCohortPrice(earlier.latest, "chaos", earlier.window)).toMatchObject({
        hours: 1,
        median: 20.5,
    });
    const graph = marketGraph();
    const node = graph.nodes[0]!;
    if (node.kind !== "acquire" || node.alternatives[0]?.kind !== "purchase")
        throw new Error("Fixture");
    const baseId = Object.entries(catalog.bases).find(
        ([, base]) => base.name === equipment.baseType,
    )![0];
    node.alternatives[0].item = engine.createItem(baseId, equipment.ilvl);
    const bound = bindCohortPurchasePrice(
        graph,
        engine,
        node.id,
        node.alternatives[0].id,
        candidate,
    );
    const snapshots = await craftingMarketSnapshots(database, bound, engine, [
        HOUR + 4 * 3600,
        input.at,
    ]);
    expect(snapshots.points.every((point) => point.issues.length === 0)).toBe(true);
    for (const [index, amount] of [20.5, 21].entries()) {
        const acquire = snapshots.points[index]!.graph!.nodes[0]!;
        expect(acquire).toMatchObject({ alternatives: [{ price: { amount } }] });
    }
    const history = await craftingMarketHistory(database, {
        realm: "pc",
        league: "Standard",
        cohortId: candidate.definition.id,
        limit: 10,
    });
    expect(history.history).toHaveLength(6);
    expect(
        history.history.every(
            (row) => row.prices.chaos!.median === 20.5 && row.prices.chaos!.count === 2,
        ),
    ).toBe(true);
    expect(
        (await findCraftingMarketPrices(database, { ...input, realm: "sony" })).candidates,
    ).toEqual([]);
});

it("replays broad equipment prices through capture, retry and history without pricing prepared purchases", async () => {
    vi.spyOn(Date, "now").mockReturnValue((HOUR + 30 * 24 * 3600) * 1000);
    const client = createClient({ baseUrl, userAgent: "cohort-e2e", token: TOKEN });
    const equipment = {
        ...item,
        name: "",
        baseType: "Necrotic Armour",
        typeLine: "Necrotic Armour",
        frameType: 2,
        sockets: Array.from({ length: 6 }, () => ({ group: 0 })),
        explicitMods: ["+100 to maximum Life"],
    };
    for (const [phase, offset, price] of [
        ["early", 0, 20],
        ["middle", 21 * 24 * 3600, 5],
    ] as const) {
        upstreamResponses.push({
            body: {
                next_change_id: phase,
                stashes: Array.from({ length: 10 }, (_, seller) => ({
                    ...stash,
                    id: `equipment-${seller}`,
                    accountName: `seller-${seller}`,
                    items: Array.from({ length: 100 }, (_, index) => ({
                        ...equipment,
                        id: `equipment-${seller}-${index}`,
                        note: `~price ${price} chaos`,
                    })),
                })),
            },
        });
        await ingestPs(local.conn, client, {
            pages: 1,
            observedAt: new Date((HOUR + offset) * 1000),
        });
        if (phase === "early") {
            receiverStatus = 503;
            await expect(
                rollupEquipment(local.conn, { hour: HOUR, league: "Standard" }),
            ).rejects.toThrow("503");
            expect(
                await queryAll(
                    local.conn,
                    "SELECT * FROM rollup_state WHERE stream_name = 'equipment'",
                ),
            ).toEqual([]);
            receiverStatus = undefined;
        }
        await rollupEquipment(local.conn, { hour: HOUR + offset, league: "Standard" });
        await rollupEquipment(local.conn, { hour: HOUR + offset, league: "Standard" });
    }
    // Donor cohorts saw only unknown matches, so their unpriced hours are not stored.
    const rows = await mysql.select().from(tStashCohortHourly);
    expect(rows).toHaveLength(4);
    const definitions = await mysql.select().from(tStashCohort);
    expect(definitions).toHaveLength(6);
    expect(
        definitions.every(
            (definition) =>
                definition.query.game === "poe1" && definition.catalogHash.length === 64,
        ),
    ).toBe(true);
    const baseRows = rows.filter((row) => row.cohortId.startsWith("base:"));
    expect(baseRows).toHaveLength(4);
    for (const row of baseRows)
        expect(row).toMatchObject({
            realm: "pc",
            league: "Standard",
            listingCount: 1000,
            uniqueSellers: 10,
            unknownCount: 0,
            prices: { chaos: { count: 1000, median: row.hour === HOUR ? 20 : 5, confidence: 0.5 } },
        });
    expect(await mysql.select().from(tStashUniqueHourly.poe1)).toEqual([]);
    const lookupInput = {
        item: normalizeApiItem("poe1", "stash", { ...equipment, explicitMods: [] }),
        requirements: itemQuerySchema.parse({ game: "poe1" }),
        realm: "pc" as const,
        league: "Standard",
        currency: "chaos",
        at: HOUR + 21 * 24 * 3600,
    };
    const database = mysql as unknown as TDatabase;
    const latestPrices = await findCraftingMarketPrices(database, lookupInput);
    expect(latestPrices.candidates).toHaveLength(2);
    expect(
        latestPrices.candidates.every((candidate) => candidate.latest.prices.chaos?.median === 5),
    ).toBe(true);
    const earlyPrices = await findCraftingMarketPrices(database, { ...lookupInput, at: HOUR });
    expect(
        earlyPrices.candidates.every((candidate) => candidate.latest.prices.chaos?.median === 20),
    ).toBe(true);
    expect(
        (await findCraftingMarketPrices(database, { ...lookupInput, realm: "sony" })).candidates,
    ).toEqual([]);
    expect(
        (await findCraftingMarketPrices(database, { ...lookupInput, league: "Other" })).candidates,
    ).toEqual([]);
    expect(
        (
            await findCraftingMarketPrices(database, { ...lookupInput, currency: "divine" })
        ).candidates.every((candidate) => !candidate.covered),
    ).toBe(true);
    expect(latestPrices.candidates.every((candidate) => !candidate.covered)).toBe(true);
    expect(earlyPrices.candidates.every((candidate) => !candidate.covered)).toBe(true);
    const chosen = latestPrices.candidates[0]!;
    expect(chosen.reasons).toContain("The cohort does not guarantee the configured rarity.");
    const baseId = Object.entries(catalog.bases).find(
        ([, base]) => base.name === "Necrotic Armour",
    )![0];
    const method = currency("transmute_to_magic");
    if (method.kind !== "currency") throw new Error("Fixture");
    const graph = marketGraph();
    const acquisition = graph.nodes[0]!;
    if (acquisition.kind !== "acquire" || acquisition.alternatives[0]?.kind !== "purchase")
        throw new Error("Fixture");
    acquisition.alternatives[0].item = {
        ...engine.createItem(baseId, equipment.ilvl),
        sockets: 6,
        socketLinks: [true, true, true, true, true],
    };
    const process = craftingGraphSchema.parse({
        ...graph,
        entry: "transmute",
        prices: { [method.id]: quote(2) },
        nodes: [
            ...graph.nodes,
            {
                kind: "craft",
                id: "transmute",
                name: "Transmute",
                output: lookupInput.requirements,
                method,
                inputs: [{ id: "item", name: "Base", source: "base" }],
            },
        ],
    });
    for (const prices of [earlyPrices, latestPrices]) {
        const candidate = prices.candidates.find(
            (entry) => entry.definition.id === chosen.definition.id,
        )!;
        expect(() => bindCohortPurchasePrice(process, engine, "base", "buy", candidate)).toThrow(
            "The cohort does not guarantee the configured rarity.",
        );
    }
    expect(calculateCraftingGraph(catalog, process, { estimateIterations: 3 }).meanCost).toBeNull();
    const legacy = structuredClone(process);
    const legacyAcquisition = legacy.nodes[0]!;
    if (
        legacyAcquisition.kind !== "acquire" ||
        legacyAcquisition.alternatives[0]?.kind !== "purchase"
    )
        throw new Error("Fixture");
    legacyAcquisition.alternatives[0].price = {
        ...quote(5),
        source: "market",
        cohortId: encodeCohortPriceReference({
            realm: "pc",
            league: "Standard",
            cohortId: chosen.definition.id,
        }),
    };
    const refreshed = await refreshCraftingMarketPrices(database, legacy, engine, lookupInput.at);
    expect(refreshed.graph).toEqual(legacy);
    expect(refreshed.issues).toHaveLength(1);
    expect(refreshed.issues[0]).toContain("does not guarantee the configured rarity");
    const snapshots = await craftingMarketSnapshots(database, legacy, engine, [
        HOUR - 3600,
        HOUR,
        HOUR + 21 * 24 * 3600,
    ]);
    expect(snapshots.points.map((point) => point.graph)).toEqual([null, null, null]);
    expect(snapshots.points.every((point) => point.issues.length === 1)).toBe(true);
    const historyInput = {
        realm: "pc" as const,
        league: "Standard",
        cohortId: chosen.definition.id,
        limit: 1,
    };
    const firstPage = await craftingMarketHistory(database, historyInput);
    expect(firstPage.history[0]?.prices.chaos?.median).toBe(5);
    expect(firstPage.nextBefore).not.toBeNull();
    const secondPage = await craftingMarketHistory(database, {
        ...historyInput,
        before: firstPage.nextBefore!,
    });
    expect(secondPage.history[0]?.prices.chaos?.median).toBe(20);
    expect(secondPage.nextBefore).toBeNull();
    expect(await queryAll(local.conn, "SELECT count(*)::INTEGER AS n FROM ps_listing")).toEqual([
        { n: 0 },
    ]);
    // Correcting a past hour to no matching listings must remove its old remote price.
    upstreamResponses.push({
        body: {
            next_change_id: "correction",
            stashes: Array.from({ length: 10 }, (_, seller) => ({
                ...stash,
                id: `equipment-${seller}`,
                accountName: `seller-${seller}`,
                items: Array.from({ length: 100 }, (_, index) => ({
                    ...equipment,
                    id: `equipment-${seller}-${index}`,
                    baseType: "Rusted Sword",
                    note: "~price 1 chaos",
                })),
            })),
        },
    });
    await ingestPs(local.conn, client, { pages: 1, observedAt: new Date(HOUR * 1000) });
    await flushRollups(local.conn, { league: "Standard" });
    const corrected = await mysql.select().from(tStashCohortHourly);
    expect(corrected.filter((row) => row.hour === HOUR)).toEqual([]);
    expect(corrected).toHaveLength(2);
    expect(
        corrected.every(
            (row) => row.cohortId.startsWith("base:") && row.prices.chaos?.median === 5,
        ),
    ).toBe(true);
    // The corrected hour no longer prices the cohort, so its history keeps only the later hour.
    expect(
        (await craftingMarketHistory(database, { ...historyInput, limit: 10 })).history.map(
            (row) => row.hour,
        ),
    ).toEqual([HOUR + 21 * 24 * 3600]);
}, 60_000);

it("prices fractured and isolated donor acquisitions from source observations stored in MySQL", async () => {
    vi.spyOn(Date, "now").mockReturnValue((HOUR + 30 * 24 * 3600) * 1000);
    const fixtures = [
        {
            base: "Exquisite Blade",
            modId: "LocalIncreasedPhysicalDamagePercent8",
            fractured: true,
            mods: [
                {
                    description: "179% increased Physical Damage",
                    flags: { fractured: true },
                    mods: [{ name: "Merciless", tier: "P1", level: 83 }],
                },
            ],
        },
        {
            base: "Slink Gloves",
            modId: "ColdResistEnhancedModAilments__",
            fractured: false,
            mods: [
                "+47% to Cold Resistance",
                "40% increased Damage with Hits against Chilled Enemies",
            ].map((description) => ({
                description,
                mods: [{ name: "of Puhuarte", tier: "S0", level: 1 }],
            })),
        },
        {
            base: "Grasping Mail",
            modId: "BreachBodyCriticalChanceIncreasedByUncappedLightningResistance1",
            fractured: false,
            mods: [
                {
                    description:
                        "Critical Strike Chance is increased by Overcapped Lightning Resistance",
                    mods: [{ name: "of Esh", tier: "S0", level: 1 }],
                },
            ],
        },
    ];
    const client = createClient({ baseUrl, userAgent: "curated-e2e", token: TOKEN });
    const database = mysql as unknown as TDatabase;
    const defaults = await defaultEquipmentClassifier();
    const classifier = compileMarketCohorts({
        ...defaults.manifest,
        revision: "exact-donor-e2e",
        cohorts: [
            ...defaults.manifest.cohorts,
            ...fixtures.map((fixture, index) => ({
                id: `exact-donor:${index}`,
                name: `Exact prepared ${fixture.base}`,
                purpose: fixture.fractured ? ("fracture" as const) : ("isolated-modifier" as const),
                query: itemQuerySchema.parse({
                    game: "poe1",
                    groups: [
                        {
                            type: "and",
                            filters: [
                                { kind: "base", field: "baseType", values: [fixture.base] },
                                { kind: "rarity", values: ["Rare"] },
                                { kind: "range", field: "ilvl", value: { min: 86, max: 86 } },
                                ...["prefix", "suffix"].map((side) => {
                                    const count =
                                        engine.mod(fixture.modId).generation_type === side ? 1 : 0;
                                    return {
                                        kind: "range",
                                        field: `${side}es`,
                                        value: { min: count, max: count },
                                    };
                                }),
                                { kind: "flag", field: "identified", value: true },
                                { kind: "flag", field: "fractured", value: fixture.fractured },
                                ...["corrupted", "mirrored", "synthesised", "influenced"].map(
                                    (field) => ({ kind: "flag", field, value: false }),
                                ),
                                { kind: "mod", ids: [fixture.modId], fractured: fixture.fractured },
                            ],
                        },
                    ],
                }),
            })),
        ],
    });
    for (const [offset, price] of [
        [0, 100],
        [21 * 24 * 3600, 40],
    ] as const) {
        upstreamResponses.push({
            body: {
                next_change_id: `curated-${offset}`,
                stashes: [
                    {
                        ...stash,
                        items: fixtures.flatMap((fixture, index) => {
                            const source = {
                                ...item,
                                id: `curated-${index}`,
                                name: "",
                                baseType: fixture.base,
                                typeLine: fixture.base,
                                frameType: 2,
                                ilvl: 86,
                                note: `~price ${price} chaos`,
                                explicitMods: fixture.mods,
                            };
                            return [
                                source,
                                {
                                    ...source,
                                    id: `unresolved-${index}`,
                                    note: "~price 1 chaos",
                                    explicitMods: fixture.fractured
                                        ? []
                                        : fixture.mods.map((mod) => mod.description),
                                    ...(fixture.fractured
                                        ? {
                                              fracturedMods: fixture.mods.map(
                                                  (mod) => mod.description,
                                              ),
                                          }
                                        : {}),
                                },
                            ];
                        }),
                    },
                ],
            },
        });
        await ingestPs(local.conn, client, {
            pages: 1,
            equipment: classifier,
            observedAt: new Date((HOUR + offset) * 1000),
        });
        await rollupEquipment(local.conn, { hour: HOUR + offset, league: "Standard" });
    }
    for (const fixture of fixtures) {
        const baseId = Object.entries(catalog.bases).find(
            ([, base]) => base.name === fixture.base,
        )![0];
        const prepared = engine.validateItem({
            ...engine.createItem(baseId, 86),
            rarity: "rare",
            mods: [
                engine.rollMod(fixture.modId, seededRandom(1), { fractured: fixture.fractured }),
            ],
        });
        const requirements = itemQuerySchema.parse({
            game: "poe1",
            groups: [
                {
                    type: "and",
                    filters: [{ kind: "mod", ids: [fixture.modId], fractured: fixture.fractured }],
                },
            ],
        });
        const graph = marketGraph();
        const acquisition = graph.nodes[0]!;
        if (acquisition.kind !== "acquire" || acquisition.alternatives[0]?.kind !== "purchase")
            throw new Error("Fixture");
        acquisition.alternatives[0].item = prepared;
        acquisition.output = requirements;
        for (const [offset, price] of [
            [0, 100],
            [21 * 24 * 3600, 40],
        ] as const) {
            const result = await findCraftingMarketPrices(database, {
                item: createCraftingItemQuery(engine).record(prepared),
                requirements,
                realm: "pc",
                league: "Standard",
                currency: "chaos",
                at: HOUR + offset,
            });
            const candidate = result.candidates.find(
                (entry) =>
                    entry.covered &&
                    entry.definition.purpose ===
                        (fixture.fractured ? "fracture" : "isolated-modifier"),
            );
            expect(candidate).toBeDefined();
            expect(candidate!.definition.id).toMatch(/^exact-donor:/);
            expect(
                result.candidates
                    .filter((entry) => !entry.definition.id.startsWith("exact-donor:"))
                    .every((entry) => !entry.covered),
            ).toBe(true);
            expect(candidate!.latest).toMatchObject({
                hour: HOUR + offset,
                listingCount: 1,
                unknownCount: 1,
                prices: { chaos: { count: 1, min: price, median: price, max: price } },
            });
            const priced = bindCohortPurchasePrice(graph, engine, "base", "buy", candidate!);
            expect(
                calculateCraftingGraph(catalog, priced, { estimateIterations: 3 }).meanCost,
            ).toBe(price);
            const refreshed = await refreshCraftingMarketPrices(
                database,
                priced,
                engine,
                HOUR + 21 * 24 * 3600,
            );
            expect(refreshed.issues).toEqual([]);
            expect(
                calculateCraftingGraph(catalog, refreshed.graph, { estimateIterations: 3 })
                    .meanCost,
            ).toBe(40);
        }
        expect(acquisition.alternatives[0].price).toBeNull();
    }
}, 60_000);

it("delivers inferred sales through HTTP and exposes season-isolated price history", async () => {
    const peers = [2, 3, 4].map((n) => ({
        ...stash,
        id: `stash-${n}`,
        accountName: `seller-${n}`,
        items: [{ ...item, id: `item-${n}` }],
    }));
    upstreamResponses.push({ body: { next_change_id: "market-1", stashes: [...peers, stash] } });
    const client = createClient({ baseUrl, userAgent: "market-e2e", token: TOKEN });
    await ingestPs(local.conn, client, { pages: 1 });
    await evaluateSales(local.conn, true);
    upstreamResponses.push({
        body: { next_change_id: "market-2", stashes: [{ ...stash, items: [] }] },
    });
    await ingestPs(local.conn, client, { pages: 1 });
    const start = Date.now();
    for (let seconds = 0; seconds <= 3600; seconds += 240)
        await evaluateSales(local.conn, true, new Date(start + seconds * 1000));
    const hour = Math.floor(start / 3600000) * 3600;
    await rollupPs(local.conn, { hour });
    const database = mysql as unknown as TDatabase;
    const filters = marketFiltersSchema.parse({ league: "Standard", item: "Headhunter" });
    const data = await getMarketData(database, filters);
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]).toMatchObject({
        realm: "pc",
        periodSales: 1,
        periodRemovals: 1,
        periodPending: 0,
    });
    expect(data.history[0]).toMatchObject({
        likelySales: 1,
        prices: { divine: { count: 4, median: 10, mean: 10, p10: 10, p90: 10 } },
        salesPrices: { divine: { median: 10 } },
        // History merges into chaos, and this league has no divine exchange rate to convert at.
        merged: null,
        mergedSales: null,
        priceRates: { chaos: 1 },
    });
    expect((await getMarketData(database, { ...filters, league: "Other Season" })).rows).toEqual(
        [],
    );
    expect((await getMarketData(database, { ...filters, realm: "poe2" })).rows).toEqual([]);
    upstreamResponses.push({
        body: {
            next_change_id: "market-3",
            stashes: [{ ...stash, id: "relisted-stash", items: [item] }],
        },
    });
    await ingestPs(local.conn, client, { pages: 1 });
    await rollupPs(local.conn, { hour });
    expect((await getMarketData(database, filters)).history[0]).toMatchObject({
        likelySales: 0,
        relistedCount: 1,
    });
});

it("records each realm's league list, ends leagues that leave it and defaults markets to listed leagues", async () => {
    const listed = (id: string, endAt?: string) => ({
        id,
        realm: "pc",
        category: { id: "Allflame", current: true },
        rules: [{ id: "Hardcore", name: "Hardcore" }],
        startAt: "2026-10-01T20:00:00Z",
        ...(endAt ? { endAt } : {}),
    });
    const client = createClient({ baseUrl, userAgent: "league-e2e", token: TOKEN });
    const listedAt = 1_800_000_000;
    vi.spyOn(Date, "now").mockReturnValue(listedAt * 1000);
    upstreamResponses.push({
        body: {
            leagues: [
                listed("Allflame"),
                listed("Old League"),
                listed("Finished Event", "2020-01-01T00:00:00Z"),
            ],
        },
    });
    expect(await deliverLeagues(client)).toBe(3);
    expect(
        await mysql
            .select({
                league: tStashLeague.poe1.league,
                category: tStashLeague.poe1.category,
                rules: tStashLeague.poe1.rules,
                startAt: tStashLeague.poe1.startAt,
                endedAt: tStashLeague.poe1.endedAt,
            })
            .from(tStashLeague.poe1)
            .orderBy(tStashLeague.poe1.league),
    ).toEqual([
        {
            league: "Allflame",
            category: "Allflame",
            rules: ["Hardcore"],
            startAt: 1_790_884_800,
            endedAt: null,
        },
        {
            league: "Finished Event",
            category: "Allflame",
            rules: ["Hardcore"],
            startAt: 1_790_884_800,
            endedAt: 1_577_836_800,
        },
        {
            league: "Old League",
            category: "Allflame",
            rules: ["Hardcore"],
            startAt: 1_790_884_800,
            endedAt: null,
        },
    ]);

    // Seasons come from hour coverage; the ended league has the newest hour.
    await mysql.insert(tStashHourCoverage.poe1).values([
        { stream: "uniques", realm: "pc", league: "Allflame", hour: HOUR, rowCount: 1 },
        { stream: "uniques", realm: "pc", league: "Old League", hour: HOUR + 3600, rowCount: 1 },
    ]);
    const database = mysql as unknown as TDatabase;
    const filters = marketFiltersSchema.parse({});
    expect((await getMarketData(database, filters)).filters.league).toBe("Old League");

    vi.spyOn(Date, "now").mockReturnValue((listedAt + 3600) * 1000);
    upstreamResponses.push({ body: { leagues: [listed("Allflame")] } });
    expect(await deliverLeagues(client)).toBe(1);
    const ended = async () =>
        Object.fromEntries(
            (
                await mysql
                    .select({
                        league: tStashLeague.poe1.league,
                        endedAt: tStashLeague.poe1.endedAt,
                    })
                    .from(tStashLeague.poe1)
            ).map((row) => [row.league, row.endedAt]),
        );
    expect(await ended()).toEqual({
        Allflame: null,
        "Finished Event": 1_577_836_800,
        "Old League": listedAt + 3600,
    });
    const data = await getMarketData(database, filters);
    expect(data.filters.league).toBe("Allflame");
    expect(data.seasons.map((season) => season.league)).toEqual(["Allflame", "Old League"]);

    // A list delivered late neither revives nor ends a league listed more recently.
    await recordStashLeagues(database, {
        realm: "pc",
        listedAt: listedAt - 60,
        rows: [{ id: "Old League", category: null, rules: [], startAt: null, endAt: null }],
    });
    expect(await ended()).toEqual({
        Allflame: null,
        "Finished Event": 1_577_836_800,
        "Old League": listedAt + 3600,
    });
    // Each game keeps its own list.
    expect(await mysql.select().from(tStashLeague.poe2)).toEqual([]);
});

it("updates a seeded currency market with a long ID through HTTP to MySQL", async () => {
    await insertCurrency({
        realm: "pc",
        league: "Standard",
        marketId: MARKET_ID,
        hour: HOUR,
        volumeTraded: { [CHAOS]: 1, [CARD]: 1 },
    });
    upstreamResponses.push({ body: { next_change_id: HOUR + 3600, markets: [market] } });
    const client = createClient({ baseUrl, userAgent: "ingest-e2e", token: "inert-token" });
    await ingestCx(local.conn, client, { fromHour: HOUR, catchUp: false });
    await rollupCx(local.conn, { hour: HOUR });
    await rollupCx(local.conn, { hour: HOUR });
    const rows = await mysql.select().from(tStashCurrencyHourly.poe1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
        league: "Standard",
        marketId: MARKET_ID,
        hour: HOUR,
        lowestRatio: { [CHAOS]: 100, [CARD]: 1 },
        volumeTraded: { [CHAOS]: 1000, [CARD]: 10 },
    });
});

it("bounds historical exchange cycles and resumes the next committed hour", async () => {
    for (let offset = 1; offset <= 3; offset++)
        upstreamResponses.push({
            body: { next_change_id: HOUR + offset * 3600, markets: [market] },
        });
    const client = createClient({ baseUrl, userAgent: "backfill-e2e", token: TOKEN });
    const progress: number[] = [];
    const first = await ingestCx(local.conn, client, {
        fromHour: HOUR,
        catchUp: true,
        maxHours: 2,
        onProgress: async (result) => {
            progress.push(result.nextHour);
        },
    });
    expect(first.map((result) => result.hour)).toEqual([HOUR, HOUR + 3600]);
    expect(progress).toEqual([HOUR + 3600, HOUR + 7200]);
    expect(await getCursor(local.conn, "cxapi")).toBe(String(HOUR + 7200));
    expect(upstreamResponses).toHaveLength(1);
    const resumed = await ingestCx(local.conn, client, { catchUp: true, maxHours: 1 });
    expect(resumed.map((result) => result.hour)).toEqual([HOUR + 7200]);
    expect(await getCursor(local.conn, "cxapi")).toBe(String(HOUR + 10800));
});

it("captures a full exchange snapshot atomically, for every league and tolerating replay", async () => {
    const markets = Array.from({ length: 1000 }, (_, index) => ({
        ...market,
        market_id: `${MARKET_ID}-${index}`,
    }));
    const snapshot = {
        next_change_id: HOUR + 3600,
        markets: [...markets, { ...market, league: "Other league" }],
    };
    upstreamResponses.push({ body: snapshot }, { body: snapshot });
    const client = createClient({ baseUrl, userAgent: "snapshot-e2e", token: TOKEN });
    for (let replay = 0; replay < 2; replay++) {
        const [result] = await ingestCx(local.conn, client, {
            fromHour: HOUR,
            catchUp: false,
            league: "Standard",
        });
        expect(result).toMatchObject({ leagues: 2, markets: 1001, nextHour: HOUR + 3600 });
    }
    expect(
        await queryAll(
            local.conn,
            `SELECT league, count(*)::INTEGER AS count,
            min(observed_hour)::INTEGER AS hour FROM cx_market_hour GROUP BY league ORDER BY league`,
        ),
    ).toEqual([
        { league: "Other league", count: 1, hour: HOUR },
        { league: "Standard", count: 1000, hour: HOUR },
    ]);
    upstreamResponses.push({
        body: {
            next_change_id: HOUR + 7200,
            markets: [...markets, { ...market, market_id: null }],
        },
    });
    await expect(
        ingestCx(local.conn, client, { catchUp: false, league: "Standard" }),
    ).rejects.toThrow();
    expect(await getCursor(local.conn, "cxapi")).toBe(String(HOUR + 3600));
    expect(
        await queryAll(local.conn, "SELECT count(*)::INTEGER AS count FROM cx_market_hour"),
    ).toEqual([{ count: 1001 }]);
});

it("prices a whole craft from replayed exchange hours without mixing realms, leagues or zero-volume markets", async () => {
    vi.spyOn(Date, "now").mockReturnValue((HOUR + 30 * 24 * 3600) * 1000);
    const client = createClient({
        baseUrl,
        userAgent: "exchange-e2e",
        token: () => {
            throw new Error("Exchange must be public");
        },
    });
    const database = mysql as unknown as TDatabase;
    const input = {
        game: "poe1",
        realm: "pc",
        league: "Standard",
        currency: "chaos",
        itemIds: [transmuteId, chaosId, "service:recombine"],
    } as const;
    const lookup = (at: number) =>
        findCraftingExchangePrices(database, { ...input, itemIds: [...input.itemIds], at });
    for (const [offset, amount] of [
        [0, 2],
        [21 * 24 * 3600, 0.5],
    ] as const) {
        const hour = HOUR + offset;
        upstreamResponses.push({
            body: {
                next_change_id: hour + 3600,
                markets: [
                    {
                        league: "Standard",
                        market_id: exchangeSnapshot.marketId,
                        market_pair: [transmuteId, chaosId],
                        volume_traded: { [transmuteId]: 100, [chaosId]: 100 * amount },
                        lowest_ratio: { [transmuteId]: 2, [chaosId]: amount },
                        highest_ratio: { [transmuteId]: 1, [chaosId]: amount * 2 },
                        lowest_stock: {},
                        highest_stock: {},
                    },
                ],
            },
        });
        await ingestCx(local.conn, client, { fromHour: hour, catchUp: false });
        await rollupCx(local.conn, { hour });
        const result = await lookup(hour);
        expect(result.quotes[transmuteId]?.amount).toBe(amount);
        expect(result.quotes[chaosId]?.amount).toBe(1);
        expect(result.missing["service:recombine"]).toContain("manual");
        const graph = bindExchangePrice(exchangeGraph(), transmuteId, result.quotes[transmuteId]!);
        expect(calculateCraftingGraph(catalog, graph, { estimateIterations: 3 }).meanCost).toBe(
            10 + amount,
        );
    }
    const lastHour = HOUR + 21 * 24 * 3600;
    await push({
        stream: "cxapi",
        rows: [
            {
                realm: "poe2",
                league: "Standard",
                hour: lastHour,
                marketId: exchangeSnapshot.marketId,
                volumeTraded: { [transmuteId]: 100, [chaosId]: 900 },
                lowestRatio: {},
                highestRatio: {},
                lowestStock: {},
                highestStock: {},
            },
        ],
    });
    expect((await lookup(lastHour)).quotes[transmuteId]?.amount).toBe(0.5);
    expect(
        (
            await findCraftingExchangePrices(database, {
                ...input,
                itemIds: [transmuteId],
                game: "poe2",
                realm: "poe2",
                at: lastHour,
            })
        ).quotes[transmuteId]?.amount,
    ).toBe(9);
    expect(
        (
            await findCraftingExchangePrices(database, {
                ...input,
                itemIds: [transmuteId],
                league: "Other",
                at: lastHour,
            })
        ).quotes,
    ).toEqual({});
    expect((await lookup(HOUR)).quotes[transmuteId]?.amount).toBe(2);
    const historyInput = {
        realm: "pc",
        league: "Standard",
        itemId: transmuteId,
        quoteId: chaosId,
        limit: 1,
    } as const;
    const first = await craftingExchangeHistory(database, historyInput);
    expect(first.history.map((row) => row.hour)).toEqual([lastHour]);
    expect(first.nextBefore).toBe(lastHour);
    const second = await craftingExchangeHistory(database, {
        ...historyInput,
        before: first.nextBefore!,
    });
    expect(second.history.map((row) => row.hour)).toEqual([HOUR]);
    expect(second.nextBefore).toBeNull();
    await push({
        stream: "cxapi",
        rows: [
            {
                realm: "pc",
                league: "Standard",
                hour: lastHour + 3600,
                marketId: exchangeSnapshot.marketId,
                volumeTraded: { [transmuteId]: 0, [chaosId]: 0 },
                lowestRatio: {},
                highestRatio: {},
                lowestStock: {},
                highestStock: {},
            },
        ],
    });
    expect((await lookup(lastHour + 3600)).quotes[transmuteId]).toBeUndefined();
    expect((await lookup(lastHour + 3600)).missing[transmuteId]).toContain(
        "No positive traded volume",
    );
    expect((await lookup(HOUR)).quotes[transmuteId]?.amount).toBe(2);
});

it.each([
    "pc",
    "poe2",
] as const)("loads adaptive exchange windows from persisted %s hours without replacing hourly history", async (realm) => {
    const database = mysql as unknown as TDatabase;
    const end = HOUR + 23 * 3600;
    const rows = Array.from({ length: 24 }, (_, offset) => ({
        realm,
        league: "Standard",
        hour: HOUR + offset * 3600,
        marketId: exchangeSnapshot.marketId,
        volumeTraded: { [transmuteId]: 20, [chaosId]: 40 },
        lowestRatio: {},
        highestRatio: {},
        lowestStock: {},
        highestStock: {},
    }));
    rows[23]!.volumeTraded = { [transmuteId]: 10, [chaosId]: 21 };
    await push({ stream: "cxapi", rows });
    const input = {
        game: realm === "poe2" ? ("poe2" as const) : ("poe1" as const),
        realm,
        league: "Standard",
        currency: "chaos",
        itemIds: [transmuteId],
        at: end,
        window: "adaptive-v1" as const,
    };
    const result = await findCraftingExchangePrices(database, input);
    expect(result.quotes[transmuteId]).toMatchObject({
        amount: 221 / 110,
        itemVolume: 110,
        quoteVolume: 221,
        hour: end,
        windowStart: end - 5 * 3600,
        window: "adaptive-v1",
    });
    expect(
        (await findCraftingExchangePrices(database, { ...input, window: undefined })).quotes[
            transmuteId
        ]?.amount,
    ).toBe(2.1);
    expect(
        (await findCraftingExchangePrices(database, { ...input, at: HOUR })).quotes[transmuteId],
    ).toMatchObject({ amount: 2, windowStart: HOUR });
    await push({
        stream: "cxapi",
        rows: [
            {
                ...rows[23]!,
                hour: end + 3600,
                volumeTraded: { [transmuteId]: 0, [chaosId]: 0 },
            },
        ],
    });
    expect(
        (await findCraftingExchangePrices(database, { ...input, at: end + 3600 })).quotes,
    ).toEqual({});
    expect((await findCraftingExchangePrices(database, input)).quotes).toEqual(result.quotes);
    const historical = await craftingExchangeHistory(database, {
        realm,
        league: "Standard",
        itemId: transmuteId,
        quoteId: chaosId,
        limit: 100,
    });
    expect(historical.history).toHaveLength(25);
    expect(historical.history[1]!.volumeTraded).toEqual({ [transmuteId]: 10, [chaosId]: 21 });
    expect(historical.nextBefore).toBeNull();
    if (realm === "pc") {
        const graph = bindExchangePrice(exchangeGraph(), transmuteId, result.quotes[transmuteId]!);
        expect(
            calculateCraftingGraph(catalog, graph, { estimateIterations: 3 }).meanCost,
        ).toBeCloseTo(10 + 221 / 110);
        const series = await craftingMarketSnapshots(database, graph, engine, [
            HOUR,
            end,
            end + 3600,
        ]);
        expect(series.points[0]!.graph!.prices[transmuteId]!.amount).toBe(2);
        expect(series.points[1]!.graph!.prices[transmuteId]!.amount).toBe(221 / 110);
        expect(series.points[2]!.graph).toBeNull();
        expect(series.points[2]!.issues[0]).toContain("No positive traded volume");
        expect(
            calculateCraftingGraph(catalog, series.points[0]!.graph!, { estimateIterations: 3 })
                .meanCost,
        ).toBe(12);
    }
});

it("stores hourly exchange deliveries for each game in that game's table", async () => {
    const rows = [
        { realm: "pc" as const, league: "Allflame" },
        { realm: "poe2" as const, league: "Forbidden Rites" },
    ].map(({ realm, league }) => ({
        realm,
        league,
        hour: HOUR,
        marketId: exchangeSnapshot.marketId,
        volumeTraded: { [transmuteId]: 10, [chaosId]: 20 },
        lowestRatio: {},
        highestRatio: {},
        lowestStock: {},
        highestStock: {},
    }));
    await push({ stream: "cxapi", rows });
    for (const [game, realm, league] of [
        ["poe1", "pc", "Allflame"],
        ["poe2", "poe2", "Forbidden Rites"],
    ] as const) {
        const table = tStashCurrencyHourly[game];
        expect(
            await mysql.select({ realm: table.realm, league: table.league }).from(table),
        ).toEqual([{ realm, league }]);
    }
});

it("stores each stash tab kind as its own market, and rows from older ingesters untabbed", async () => {
    const row = {
        realm: "pc",
        league: "Tab split",
        hour: HOUR,
        itemKey: "Headhunter",
        corrupted: false,
        links: 0,
        signatureKind: "",
        signatureValue: "",
        signatureData: null,
        iconAsset: null,
        name: "Headhunter",
        baseType: "Leather Belt",
        frameType: 3,
        identified: true,
        listingCount: 1,
        uniqueSellers: 1,
        likelySales: 1,
        prices: {},
        firstSeenAt: "2026-10-24T00:00:00Z",
        lastSeenAt: "2026-10-24T00:00:00Z",
    };
    await push({
        stream: "psapi",
        rows: [
            { ...row, tab: "merchant" },
            { ...row, tab: "other", likelySales: 2 },
            // An ingester from before the tab split sends no `tab`.
            row as UniqueHourlyRow,
        ],
    });
    const hourly = tStashUniqueHourly.poe1;
    expect(
        await mysql
            .select({ tab: hourly.tab, likelySales: hourly.likelySales })
            .from(hourly)
            .where(eq(hourly.league, "Tab split"))
            .orderBy(hourly.tab),
    ).toEqual([
        { tab: "", likelySales: 1 },
        { tab: "merchant", likelySales: 1 },
        { tab: "other", likelySales: 2 },
    ]);
    const daily = tStashMarketDaily.poe1;
    expect(
        await mysql
            .select({ tab: daily.tab, likelySales: daily.likelySales })
            .from(daily)
            .where(eq(daily.league, "Tab split"))
            .orderBy(daily.tab),
    ).toEqual([
        { tab: "", likelySales: 1 },
        { tab: "merchant", likelySales: 1 },
        { tab: "other", likelySales: 2 },
    ]);
});

it("preserves prior-hour prices after updates and unlisting, and retries upstream 503s", async () => {
    const currentHour = Math.floor(Date.now() / 3_600_000) * 3600;
    upstreamResponses.push(
        { status: 503, body: { error: { message: "Temporary outage" } } },
        {
            body: {
                next_change_id: "page-2",
                stashes: [
                    stash,
                    {
                        ...stash,
                        id: "stash-2",
                        accountName: "seller-2",
                        items: [{ ...item, id: "item-2", note: "~price 30 divine" }],
                    },
                ],
            },
        },
    );
    const client = createClient({ baseUrl, userAgent: "ingest-e2e", token: "inert-token" });
    await ingestPs(local.conn, client, { pages: 1 });
    await local.conn.run(
        "UPDATE ps_listing SET first_seen_at = to_timestamp($1), last_seen_at = to_timestamp($1)",
        [HOUR + 60],
    );
    await local.conn.run(
        "UPDATE ps_listing_hour SET observed_hour = $1, first_seen_at = to_timestamp($2), last_seen_at = to_timestamp($2)",
        [HOUR, HOUR + 60],
    );
    upstreamResponses.push({
        body: {
            next_change_id: "page-3",
            stashes: [
                { ...stash, items: [{ ...item, note: "~price 100 divine" }] },
                { id: "stash-2", public: false },
            ],
        },
    });
    expect(await ingestPs(local.conn, client, { pages: 1 })).toMatchObject({
        updated: 1,
        removed: 1,
    });
    await rollupPs(local.conn, { hour: HOUR });
    await rollupPs(local.conn, { hour: currentHour });
    await rollupPs(local.conn, { hour: HOUR });
    const rows = await mysql.select().from(tStashUniqueHourly.poe1);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.hour === HOUR)).toMatchObject({
        listingCount: 2,
        uniqueSellers: 2,
        prices: { divine: { count: 2, min: 10, median: 20, max: 30 } },
    });
    expect(rows.find((row) => row.hour === currentHour)).toMatchObject({
        listingCount: 1,
        prices: { divine: { count: 1, min: 100, median: 100, max: 100 } },
    });
    expect(await getCursor(local.conn, "psapi")).toBe("page-3");
});

it("rolls back a failed page and replays it without duplicate observations", async () => {
    const client = createClient({ baseUrl, userAgent: "ingest-e2e", token: "inert-token" });
    upstreamResponses.push({
        body: {
            next_change_id: "page-2",
            stashes: [stash, { ...stash, id: "stash-2", items: [{ ...item, baseType: null }] }],
        },
    });
    await expect(ingestPs(local.conn, client, { pages: 1 })).rejects.toThrow();
    expect(await getCursor(local.conn, "psapi")).toBeUndefined();
    expect(await queryAll(local.conn, "SELECT * FROM ps_listing_hour")).toEqual([]);
    expect(await queryAll(local.conn, "SELECT * FROM icon_basemap")).toEqual([]);
    expect(await queryAll(local.conn, "SELECT * FROM ps_checkpoint")).toEqual([]);
    const [captured] = await queryAll<{ hash: string; processed: boolean }>(
        local.conn,
        "SELECT response_hash AS hash, processed_at IS NOT NULL AS processed FROM ps_capture_page",
    );
    expect(captured?.processed).toBe(false);
    const archived = await readArchivedPage(local.conn, captured!.hash);
    expect(archived.stashes[1]!.items[0]!.baseType).toBeNull();
    upstreamResponses.push({ body: { next_change_id: "page-2", stashes: [stash] } });
    await ingestPs(local.conn, client, { pages: 1 });
    await rollupPs(local.conn, { hour: Math.floor(Date.now() / 3_600_000) * 3600 });
    const rows = await mysql.select().from(tStashUniqueHourly.poe1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ listingCount: 1, uniqueSellers: 1 });
});

it("records delivery only after a successful receiver write", async () => {
    upstreamResponses.push({ body: { next_change_id: HOUR + 3600, markets: [market] } });
    await ingestCx(
        local.conn,
        createClient({ baseUrl, userAgent: "ingest-e2e", token: "inert-token" }),
        { fromHour: HOUR, catchUp: false },
    );
    receiverStatus = 503;
    await expect(rollupCx(local.conn, { hour: HOUR })).rejects.toThrow("503");
    expect(await queryAll(local.conn, "SELECT * FROM rollup_state")).toEqual([]);
    expect(await mysql.select().from(tStashCurrencyHourly.poe1)).toEqual([]);
    receiverStatus = undefined;
    await rollupCx(local.conn, { hour: HOUR });
    expect(await queryAll(local.conn, "SELECT * FROM rollup_state")).toHaveLength(1);
    expect(await mysql.select().from(tStashCurrencyHourly.poe1)).toHaveLength(1);
});

it("stores a Watcher's Eye once for its item and once per mod for its mod count", async () => {
    const anger = "Gain 15% of Physical Damage as Extra Fire Damage while affected by Anger";
    const clarity =
        "Gain 10% of Maximum Mana as Extra Maximum Energy Shield while affected by Clarity";
    const determination =
        "You take 60% reduced Extra Damage from Critical Strikes while affected by Determination";
    const eye = (id: string, explicitMods: string[], overrides: Record<string, unknown> = {}) => ({
        ...item,
        id,
        name: "Watcher's Eye",
        explicitMods,
        ...overrides,
    });
    upstreamResponses.push({
        body: {
            next_change_id: "page-2",
            stashes: [
                {
                    ...stash,
                    items: [
                        eye("three", [anger, clarity, determination], { note: "~b/o 90 chaos" }),
                        // A foil shares its market, and another roll order the same mods.
                        eye("foil", [determination, clarity, anger], {
                            foilVariation: 3,
                            note: "~b/o 30 chaos",
                        }),
                        eye("two", [anger, clarity], { note: "~b/o 10 chaos" }),
                        // Unrecognised second mod: only the item's market.
                        eye("one", [anger, "+10 to Strength"], { note: "~b/o 5 chaos" }),
                        // Corrupted eyes have no market at all.
                        eye("corrupted", [anger, clarity, determination], {
                            corrupted: true,
                            note: "~b/o 900 chaos",
                        }),
                    ],
                },
            ],
        },
    });
    await ingestPs(
        local.conn,
        createClient({ baseUrl, userAgent: "ingest-e2e", token: "inert-token" }),
        { pages: 1 },
    );
    await rollupPs(local.conn, { hour: Math.floor(Date.now() / 3_600_000) * 3600 });
    const rows = await mysql.select().from(tStashUniqueHourly.poe1);
    const masked = {
        anger: "Anger: Gain #% of Physical Damage as Extra Fire Damage",
        clarity: "Clarity: Gain #% of Maximum Mana as Extra Maximum Energy Shield",
        determination: "Determination: You take #% reduced Extra Damage from Critical Strikes",
    };
    expect(
        rows
            .map((row) => [row.signatureValue, row.listingCount, row.prices?.chaos?.max])
            .sort(([a], [b]) => String(a).localeCompare(String(b))),
    ).toEqual(
        [
            ["", 4, 90],
            [`2 mods: ${masked.anger}`, 1, 10],
            [`2 mods: ${masked.clarity}`, 1, 10],
            [`3 mods: ${masked.anger}`, 2, 90],
            [`3 mods: ${masked.clarity}`, 2, 90],
            [`3 mods: ${masked.determination}`, 2, 90],
        ].sort(([a], [b]) => String(a).localeCompare(String(b))),
    );
    expect(rows.find((row) => row.signatureValue === `3 mods: ${masked.anger}`)).toMatchObject({
        signatureKind: "watchers-eye",
        signatureData: { kind: "watchers-eye", mod: masked.anger, modCount: 3 },
    });
    // Per-mod markets stay out of the daily rollup the list reads, which would count eyes repeatedly.
    const daily = await mysql
        .select()
        .from(tStashMarketDaily.poe1)
        .where(eq(tStashMarketDaily.poe1.itemKey, "Watcher's Eye"));
    expect(daily.map((row) => row.signatureValue)).toEqual([""]);
});

it("reads mods from Watcher's Eye signatures stored before rolls were masked", async () => {
    upstreamResponses.push({
        body: {
            next_change_id: "page-2",
            stashes: [
                {
                    ...stash,
                    items: [
                        {
                            ...item,
                            name: "Watcher's Eye",
                            explicitMods: [
                                "12% increased Movement Speed while affected by Haste",
                                "40% increased Critical Strike Chance while affected by Precision",
                            ],
                        },
                    ],
                },
            ],
        },
    });
    await ingestPs(
        local.conn,
        createClient({ baseUrl, userAgent: "ingest-e2e", token: "inert-token" }),
        { pages: 1 },
    );
    await local.conn.run(
        `UPDATE ps_listing_hour SET mod_signature = '{"kind":"watchers-eye","mods":[{"aura":"Haste","stat":"12% increased Movement Speed"},"Precision: 40.5% increased Critical Strike Chance"]}'`,
    );
    await rollupPs(local.conn, { hour: Math.floor(Date.now() / 3_600_000) * 3600 });
    const rows = await mysql.select().from(tStashUniqueHourly.poe1);
    expect(rows.map((row) => row.signatureValue).sort()).toEqual([
        "",
        "2 mods: Haste: #% increased Movement Speed",
        "2 mods: Precision: #% increased Critical Strike Chance",
    ]);
});

it("captures and prices the correct Two-Toned Boots variant while excluding other or unknown implicits", async () => {
    const defaults = await defaultEquipmentClassifier();
    const identities = defaults.manifest.baseIdentities!.filter(
        (base) => base.baseType === "Two-Toned Boots",
    );
    expect(identities).toHaveLength(3);
    upstreamResponses.push({
        body: {
            next_change_id: "canonical-boots",
            stashes: [
                {
                    ...stash,
                    items: [...identities, undefined].map((identity, index) => ({
                        ...item,
                        id: `boots-${index}`,
                        name: "",
                        typeLine: "Two-Toned Boots",
                        baseType: "Two-Toned Boots",
                        frameType: 0,
                        rarity: "Normal",
                        ilvl: 86,
                        influences: { hunter: true },
                        extended: { prefixes: 0, suffixes: 0 },
                        implicitMods:
                            identity?.implicits?.[0]?.map((description) => ({ description })) ?? [],
                        note: `~price ${identity?.id.endsWith("BootsAtlas1") ? 40 : 1} chaos`,
                    })),
                },
            ],
        },
    });
    await ingestPs(
        local.conn,
        createClient({ baseUrl, userAgent: "canonical-base-e2e", token: TOKEN }),
        { pages: 1, observedAt: new Date(HOUR * 1000) },
    );
    await rollupEquipment(local.conn, { hour: HOUR, league: "Standard" });
    const configured = {
        ...engine.createItem("Metadata/Items/Armours/Boots/BootsAtlas1", 86),
        influences: [4],
    };
    const graph = marketGraph();
    const node = graph.nodes[0]!;
    if (node.kind !== "acquire" || node.alternatives[0]?.kind !== "purchase")
        throw new Error("Fixture");
    node.alternatives[0].item = configured;
    const result = await findCraftingMarketPrices(mysql as unknown as TDatabase, {
        item: createCraftingItemQuery(engine).record(configured),
        requirements: node.output,
        realm: "pc",
        league: "Standard",
        currency: "chaos",
        at: HOUR,
    });
    const exact = result.candidates.find((candidate) => candidate.covered)!;
    expect(exact).toBeDefined();
    expect(exact.latest).toMatchObject({
        listingCount: 1,
        uniqueSellers: 1,
        unknownCount: 1,
        prices: { chaos: { median: 40, count: 1 } },
    });
    const bound = bindCohortPurchasePrice(graph, engine, "base", "buy", exact);
    expect(livePurchasePrices(bound)[0]?.alternative.price?.amount).toBe(40);
    const refreshed = await refreshCraftingMarketPrices(
        mysql as unknown as TDatabase,
        bound,
        engine,
        HOUR,
    );
    expect(refreshed.issues).toEqual([]);
    expect(refreshed.graph).toEqual(bound);
});

it("prices an explicit NPC Augmentation purchase from fresh Transmutation and refuses stale ingredient fallback", async () => {
    const database = mysql as unknown as TDatabase;
    const graph = exchangeGraph();
    await insertCurrency([
        { ...vendorCurrencySnapshot, hour: HOUR },
        {
            ...vendorCurrencySnapshot,
            hour: HOUR,
            marketId: `${vendorCurrencyOutputId}|${chaosId}`,
            volumeTraded: { [vendorCurrencyOutputId]: 0, [chaosId]: 0 },
        },
    ]);
    const direct = await findCraftingExchangePrices(database, {
        game: "poe1",
        realm: "pc",
        league: "Standard",
        currency: graph.currency,
        itemIds: [vendorCurrencyOutputId],
        at: HOUR,
    });
    expect(direct.quotes).toEqual({});
    expect(direct.missing[vendorCurrencyOutputId]).toBeTruthy();
    const options = { realm: "pc" as const, ids: [vendorCurrencyOutputId], at: HOUR };
    expect((await findCraftingSourcePrices(graph, engine, options, database)).quotes).toEqual({});
    const result = await findCraftingSourcePrices(
        graph,
        engine,
        { ...options, vendorUpgrade: { inputId: vendorCurrencyInputId } },
        database,
    );
    expect(result.missing).toEqual({});
    const source = result.quotes[vendorCurrencyOutputId]!;
    expect(source).toMatchObject({
        source: "vendor-upgrade",
        path: vendorCurrencyQuote.path,
        amount: 4 * (7 / 3150),
        ingredient: { hour: HOUR, itemVolume: 3150, quoteVolume: 7 },
    });
    const bound = bindCraftingSourcePrice(graph, engine, vendorCurrencyOutputId, source);
    expect(bound.prices[vendorCurrencyOutputId]).toMatchObject({
        source: "market",
        confidence: null,
        observedAt: new Date(HOUR * 1000).toISOString(),
    });
    expect(bound.prices[vendorCurrencyOutputId]).not.toHaveProperty("samples");
    expect(
        decodeCraftingSourceReference(bound.prices[vendorCurrencyOutputId]?.cohortId),
    ).toMatchObject({
        path: vendorCurrencyQuote.path,
        ingredient: { hour: HOUR, itemId: vendorCurrencyInputId },
    });
    await insertCurrency([
        {
            ...vendorCurrencySnapshot,
            hour: HOUR + 3600,
            volumeTraded: { [vendorCurrencyInputId]: 3150, [chaosId]: 14 },
        },
        {
            ...vendorCurrencySnapshot,
            hour: HOUR + 3600,
            marketId: `${vendorCurrencyOutputId}|${chaosId}`,
            volumeTraded: { [vendorCurrencyOutputId]: 1, [chaosId]: 99 },
        },
    ]);
    const refreshed = await refreshCraftingMarketPrices(database, bound, engine, HOUR + 3600);
    expect(refreshed.issues).toEqual([]);
    expect(refreshed.graph.prices[vendorCurrencyOutputId]).toMatchObject({
        amount: 4 * (14 / 3150),
        observedAt: new Date((HOUR + 3600) * 1000).toISOString(),
    });
    expect(
        decodeCraftingSourceReference(refreshed.graph.prices[vendorCurrencyOutputId]?.cohortId),
    ).toMatchObject({
        path: vendorCurrencyQuote.path,
        ingredient: { hour: HOUR + 3600, itemId: vendorCurrencyInputId },
    });
    await insertCurrency([
        {
            ...vendorCurrencySnapshot,
            hour: HOUR + 7200,
            volumeTraded: { [vendorCurrencyInputId]: 0, [chaosId]: 0 },
        },
        { ...vendorCurrencySnapshot, hour: HOUR + 7200, league: "Other" },
    ]);
    const unavailable = await refreshCraftingMarketPrices(
        database,
        refreshed.graph,
        engine,
        HOUR + 7200,
    );
    expect({ ...unavailable.graph, prices: refreshed.graph.prices }).toEqual(refreshed.graph);
    expect(unavailable.graph.prices[vendorCurrencyOutputId]).toMatchObject({
        amount: 4 * (14 / 3150),
        currency: "chaos",
        source: "market",
        observedAt: new Date((HOUR + 3600) * 1000).toISOString(),
    });
    expect(unavailable.graph.prices[vendorCurrencyOutputId]?.cohortId).not.toBe(
        refreshed.graph.prices[vendorCurrencyOutputId]?.cohortId,
    );
    expect(
        decodeCraftingSourceReference(unavailable.graph.prices[vendorCurrencyOutputId]?.cohortId),
    ).toEqual(
        decodeCraftingSourceReference(refreshed.graph.prices[vendorCurrencyOutputId]?.cohortId),
    );
    expect(() => assertCraftingSourcePrices(unavailable.graph)).toThrow(
        "vendor ingredient exchange price is unavailable",
    );
    expect(unavailable.issues).toEqual([expect.stringContaining(vendorCurrencyOutputId)]);
    expect(
        await craftingMarketSnapshots(database, unavailable.graph, engine, [
            HOUR,
            HOUR + 3600,
            HOUR + 7200,
        ]),
    ).toMatchObject({
        points: [
            {
                graph: { prices: { [vendorCurrencyOutputId]: { amount: 4 * (7 / 3150) } } },
                issues: [],
            },
            {
                graph: { prices: { [vendorCurrencyOutputId]: { amount: 4 * (14 / 3150) } } },
                issues: [],
            },
            { graph: null, issues: [expect.stringContaining(vendorCurrencyOutputId)] },
        ],
    });
});

it("captures only proven-empty Prime Chaotic Resonators for versioned source binding, refresh and same-hour conversion", async () => {
    const id = "Metadata/Items/Delve/DelveStackableSocketableCurrencyReroll4";
    const name = "Prime Chaotic Resonator";
    const variant = "empty-resonator-v1";
    const convertedHour = HOUR + 3600;
    const unpricedHour = HOUR + 7200;
    const clock = vi.spyOn(Date, "now").mockReturnValue((HOUR + 3600) * 1000);
    const client = createClient({ baseUrl, userAgent: "empty-resonator-e2e", token: TOKEN });
    const resonator = {
        ...item,
        icon: "https://web.poecdn.com/image/Art/2DItems/Currency/Delve/Resonator4.png",
        name: "",
        typeLine: name,
        baseType: name,
        frameType: 5,
        rarity: "Currency",
        sockets: Array.from({ length: 4 }, () => ({ group: 0, attr: "DV", sColour: "DV" })),
    };
    async function ingestHour(hour: number, notes: [string, string, string], modernOnly = false) {
        const listings = [
            ...notes.map((note, index) => ({
                ...resonator,
                frameType: modernOnly || index === 2 ? undefined : 5,
                socketedItems: [],
                note,
            })),
            { ...resonator, socketedItems: [{ ...item }], note: "~price 1 chaos" },
            { ...resonator, note: "~price 1/2 chaos" },
            {
                ...item,
                name: "",
                typeLine: essenceName,
                baseType: essenceName,
                frameType: 5,
                rarity: "Currency",
                note: "~price 15/2 chaos",
            },
        ];
        upstreamResponses.push({
            body: {
                next_change_id: `resonator-${hour}`,
                stashes: listings.map((listing, index) => ({
                    ...stash,
                    id: `resonator-stash-${index}`,
                    accountName: `resonator-seller-${index}`,
                    items: [{ ...listing, id: `resonator-${index}` }],
                })),
            },
        });
        await ingestPs(local.conn, client, { pages: 1 });
        // The native database clock is independent of Date.now; move only the new page's hour.
        await local.conn.run(
            `UPDATE ps_listing_hour SET observed_hour = $1,
                first_seen_at = to_timestamp($2), last_seen_at = to_timestamp($2)
             WHERE observed_hour > $3`,
            [hour, hour + 60, unpricedHour],
        );
        await rollupPs(local.conn, { hour, league: "Standard" });
        clock.mockReturnValue((hour + 3600) * 1000);
    }
    await ingestHour(HOUR, ["~price 5/2 chaos", "~b/o 9/2 c", "~price 7/2 chaos"]);
    const rows = await mysql.select().from(tStashUniqueHourly.poe1);
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.itemKey === name)).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                hour: HOUR,
                signatureKind: variant,
                signatureValue: "reroll:4",
                signatureData: {
                    kind: variant,
                    action: "delve_currency_reroll",
                    sockets: 4,
                    socketedItems: 0,
                },
                listingCount: 3,
                uniqueSellers: 3,
                prices: {
                    chaos: expect.objectContaining({ count: 3, min: 2.5, median: 3.5, max: 4.5 }),
                },
            }),
            expect.objectContaining({
                hour: HOUR,
                signatureKind: "",
                signatureValue: "",
                signatureData: null,
                listingCount: 2,
                uniqueSellers: 2,
                prices: {
                    chaos: expect.objectContaining({ count: 2, min: 0.5, median: 0.75, max: 1 }),
                },
            }),
        ]),
    );
    expect(rows.find((row) => row.itemKey === essenceName)).toMatchObject({
        signatureKind: "",
        signatureValue: "",
        listingCount: 1,
        prices: { chaos: { count: 1, median: 7.5 } },
    });
    const graph = exchangeGraph();
    const craft = graph.nodes.find((node) => node.kind === "craft")!;
    craft.method = {
        kind: "fossils",
        ids: catalog.crafting.fossils.slice(0, 4).map((fossil) => fossil.id),
        resonator: id,
        logic: "additive",
    };
    const lookup = { graph, realm: "pc", ids: [id], conversion: "exchange-v1" };
    async function sources(at: number, changes: Record<string, unknown> = {}) {
        return craftingSourceResultSchema.parse(
            await parity("crafting/market/sources", "find_crafting_source_prices", {
                ...lookup,
                at,
                ...changes,
            }),
        );
    }
    const result = await sources(HOUR);
    expect(result.missing).toEqual({});
    expect(result.quotes[id]).toMatchObject({
        source: "stash-commodity",
        variant,
        hour: HOUR,
        amount: 3.5,
        low: 2.5,
        high: 4.5,
        samples: 3,
        listingCount: 3,
    });
    const essence = (await sources(HOUR, { ids: [essenceId] })).quotes[essenceId];
    expect(essence).toMatchObject({
        amount: 7.5,
        baseType: essenceName,
    });
    expect(essence).not.toHaveProperty("variant");
    const source = result.quotes[id]!;
    if (source.source !== "stash-commodity") throw new Error("Expected captured commodity");
    expect(() =>
        bindCraftingSourcePrice(graph, engine, id, { ...source, variant: undefined }),
    ).toThrow();
    const bound = z.object({ graph: craftingGraphSchema }).parse(
        await parity("crafting/market/sources/bind", "bind_crafting_source_price", {
            graph,
            id,
            quote: source,
        }),
    ).graph;
    expect(decodeCraftingSourceReference(bound.prices[id]?.cohortId)).toMatchObject({
        source: "stash-commodity",
        id,
        baseType: name,
        variant,
        conversion: "exchange-v1",
    });
    expect(
        await parity(
            "market",
            "get_season_market",
            {
                realm: "pc",
                league: "Standard",
                item: name,
                currency: "chaos",
            },
            "GET",
        ),
    ).toMatchObject({
        history: [{ hour: HOUR, signatureKind: "", prices: { chaos: { median: 0.75 } } }],
    });
    const legacy = structuredClone(bound);
    legacy.prices[essenceId] = quote(123);
    legacy.prices[id]!.cohortId = `stash-commodity:v1:${encodeURIComponent(
        JSON.stringify({
            source: "stash-commodity",
            game: "poe1",
            realm: "pc",
            league: "Standard",
            currency: "chaos",
            id,
            baseType: name,
        }),
    )}`;
    expect(decodeCraftingSourceReference(legacy.prices[id]!.cohortId)).toBeNull();
    const withoutLegacy = structuredClone(legacy);
    delete withoutLegacy.prices[id];
    expect(
        await parity("crafting/market/refresh", "refresh_crafting_item_prices", { graph: legacy }),
    ).toEqual({
        graph: withoutLegacy,
        issues: [expect.stringContaining("no verified empty provenance")],
    });
    const manual = structuredClone(legacy);
    manual.prices[id] = quote(42);
    expect(
        await parity("crafting/market/refresh", "refresh_crafting_item_prices", { graph: manual }),
    ).toEqual({ graph: manual, issues: [] });
    expect(
        await parity("crafting/market/snapshots", "get_crafting_price_snapshots", {
            graph: legacy,
            hours: [HOUR],
        }),
    ).toMatchObject({
        points: [
            { graph: null, issues: [expect.stringContaining("no supported historical binding")] },
        ],
    });

    await ingestHour(
        convertedHour,
        ["~price 2 divine", "~price 2 divine", "~price 2 divine"],
        true,
    );
    expect(
        (await mysql.select().from(tStashUniqueHourly.poe1)).find(
            (row) =>
                row.itemKey === name && row.hour === convertedHour && row.signatureKind === variant,
        ),
    ).toMatchObject({ frameType: -1, listingCount: 3, prices: { divine: { count: 3 } } });
    await insertCurrency({ ...commodityExchangeSnapshot, hour: HOUR });
    expect((await sources(convertedHour)).quotes).toEqual({});
    expect((await sources(convertedHour, { conversion: undefined })).quotes).toEqual({});
    expect(
        await parity("crafting/market/refresh", "refresh_crafting_item_prices", { graph: bound }),
    ).toEqual({
        graph: bound,
        issues: [expect.stringContaining("matching-hour exchange conversion")],
    });
    await insertCurrency({ ...commodityExchangeSnapshot, hour: convertedHour });
    expect((await sources(convertedHour)).quotes[id]).toMatchObject({
        variant,
        hour: convertedHour,
        amount: 600,
        samples: 3,
        exchange: { currency: "divine", amount: 2, quote: { hour: convertedHour, amount: 300 } },
    });
    const refreshed = z.object({ graph: craftingGraphSchema, issues: z.array(z.string()) }).parse(
        await parity("crafting/market/refresh", "refresh_crafting_item_prices", {
            graph: bound,
        }),
    );
    expect(refreshed.issues).toEqual([]);
    expect(refreshed.graph.prices[id]).toMatchObject({
        amount: 600,
        observedAt: new Date(convertedHour * 1000).toISOString(),
    });
    expect(decodeCraftingSourceReference(refreshed.graph.prices[id]?.cohortId)).toMatchObject({
        variant,
        exchange: { quote: { hour: convertedHour } },
    });

    await ingestHour(unpricedHour, ["~price 0 chaos", "~price 0 chaos", "~price 0 chaos"]);
    expect(
        (await mysql.select().from(tStashUniqueHourly.poe1)).find(
            (row) =>
                row.itemKey === name && row.hour === unpricedHour && row.signatureKind === variant,
        ),
    ).toMatchObject({ listingCount: 3, prices: {} });
    const missing = await sources(unpricedHour);
    expect(missing.quotes).toEqual({});
    expect(missing.missing[id]).toContain("No positive");
    expect(
        await parity("crafting/market/refresh", "refresh_crafting_item_prices", {
            graph: refreshed.graph,
        }),
    ).toEqual({ graph: refreshed.graph, issues: [expect.stringContaining("No positive")] });
    expect(
        await parity("crafting/market/snapshots", "get_crafting_price_snapshots", {
            graph: refreshed.graph,
            hours: [HOUR, convertedHour, unpricedHour],
        }),
    ).toMatchObject({
        points: [
            { at: HOUR, graph: { prices: { [id]: { amount: 3.5 } } }, issues: [] },
            { at: convertedHour, graph: { prices: { [id]: { amount: 600 } } }, issues: [] },
            { at: unpricedHour, graph: null, issues: [expect.stringContaining("No positive")] },
        ],
    });
});

it.each([
    { id: essenceId, name: essenceName, kind: "essence" as const },
    { id: unravellingId, name: unravellingName, kind: "currency" as const },
])("ingests fractional $name unit asks into MySQL and shares source binding and history without reusing a newer zero price", async ({
    id: essenceId,
    name: essenceName,
    kind,
}) => {
    const client = createClient({ baseUrl, userAgent: "commodity-e2e", token: TOKEN });
    const essenceStashes = ["~price 5/2 chaos", "~b/o 9/2 c"].map((note, index) => ({
        ...stash,
        id: `essence-stash-${index}`,
        accountName: `essence-seller-${index}`,
        items: [
            {
                ...item,
                id: `essence-${index}`,
                icon: "https://web.poecdn.com/image/Art/2DItems/Currency/Essence/Rage3.png",
                name: "",
                typeLine: essenceName,
                baseType: essenceName,
                frameType: 5,
                rarity: "Currency",
                stackSize: 20,
                maxStackSize: 30,
                note,
            },
        ],
    }));
    async function ingestHour(hour: number, zero = false) {
        upstreamResponses.push({
            body: {
                next_change_id: `essence-${hour}`,
                stashes: essenceStashes.map((entry) => ({
                    ...entry,
                    items: entry.items.map((listing) => ({
                        ...listing,
                        note: zero ? "~price 0 chaos" : listing.note,
                    })),
                })),
            },
        });
        await ingestPs(local.conn, client, { pages: 1 });
        // Commodity capture uses the database clock; move only this page's rows to the fixture hour.
        await local.conn.run(
            `UPDATE ps_listing_hour SET observed_hour = $1,
                first_seen_at = to_timestamp($2), last_seen_at = to_timestamp($2)
            WHERE observed_hour <> $3`,
            [hour, hour + 60, HOUR],
        );
        await rollupPs(local.conn, { hour, league: "Standard" });
    }
    await ingestHour(HOUR);
    expect(await mysql.select().from(tStashUniqueHourly.poe1)).toMatchObject([
        {
            realm: "pc",
            league: "Standard",
            hour: HOUR,
            itemKey: essenceName,
            baseType: essenceName,
            frameType: 5,
            listingCount: 2,
            uniqueSellers: 2,
            prices: { chaos: { count: 2, min: 2.5, median: 3.5, max: 4.5 } },
        },
    ]);
    const graph = exchangeGraph();
    const craft = graph.nodes.find((node) => node.kind === "craft")!;
    craft.name = `Apply ${essenceName}`;
    craft.method = { kind, id: essenceId };
    const lookup = { graph, realm: "pc", ids: [essenceId], at: HOUR };
    const result = craftingSourceResultSchema.parse(
        await parity("crafting/market/sources", "find_crafting_source_prices", lookup),
    );
    expect(result.missing).toEqual({});
    expect(result.quotes[essenceId]).toMatchObject({
        source: "stash-commodity",
        hour: HOUR,
        amount: 3.5,
        low: 2.5,
        high: 4.5,
        samples: 2,
    });
    const { graph: bound } = z.object({ graph: craftingGraphSchema }).parse(
        await parity("crafting/market/sources/bind", "bind_crafting_source_price", {
            graph,
            id: essenceId,
            quote: result.quotes[essenceId],
        }),
    );
    expect(bound.prices[essenceId]).toMatchObject({
        amount: 3.5,
        source: "market",
        samples: 2,
        confidence: null,
        observedAt: new Date(HOUR * 1000).toISOString(),
    });
    expect(decodeCraftingSourceReference(bound.prices[essenceId]!.cohortId)).toEqual({
        source: "stash-commodity",
        game: "poe1",
        realm: "pc",
        league: "Standard",
        currency: "chaos",
        id: essenceId,
        baseType: essenceName,
    });
    await ingestHour(HOUR + 3600, true);
    const missing = craftingSourceResultSchema.parse(
        await parity("crafting/market/sources", "find_crafting_source_prices", {
            ...lookup,
            at: HOUR + 3600,
        }),
    );
    expect(missing.quotes).toEqual({});
    expect(missing.missing[essenceId]).toContain("No positive");
    expect(
        await parity("crafting/market/snapshots", "get_crafting_price_snapshots", {
            graph: bound,
            hours: [HOUR, HOUR + 3600],
        }),
    ).toMatchObject({
        points: [
            { at: HOUR, graph: { prices: { [essenceId]: { amount: 3.5 } } }, issues: [] },
            { at: HOUR + 3600, graph: null, issues: [expect.stringContaining("No positive")] },
        ],
    });
    expect(
        await parity(
            "market",
            "get_season_market",
            {
                realm: "pc",
                league: "Standard",
                item: essenceName,
                currency: "chaos",
            },
            "GET",
        ),
    ).toMatchObject({
        history: [
            { hour: HOUR, prices: { chaos: { count: 2, min: 2.5, median: 3.5, max: 4.5 } } },
            { hour: HOUR + 3600, listingCount: 2, prices: {} },
        ],
    });
    const convertedHour = HOUR + 7200;
    await writeStashUniqueHourly(mysql as unknown as TDatabase, "poe1", [
        {
            realm: "pc",
            league: "Standard",
            hour: convertedHour,
            itemKey: essenceName,
            baseType: essenceName,
            name: "",
            frameType: 5,
            identified: true,
            tab: "merchant",
            listingCount: 33,
            uniqueSellers: 30,
            prices: { divine: { count: 1, min: 2, median: 2, max: 2 } },
            firstSeenAt: new Date(convertedHour * 1000).toISOString(),
            lastSeenAt: new Date(convertedHour * 1000).toISOString(),
        },
    ]);
    await insertCurrency({ ...commodityExchangeSnapshot, hour: convertedHour });
    const current = { ...lookup, at: convertedHour };
    expect(
        craftingSourceResultSchema.parse(
            await parity("crafting/market/sources", "find_crafting_source_prices", current),
        ).quotes,
    ).toEqual({});
    const converted = craftingSourceResultSchema.parse(
        await parity("crafting/market/sources", "find_crafting_source_prices", {
            ...current,
            conversion: "exchange-v1",
        }),
    );
    expect(converted.quotes[essenceId]).toMatchObject({
        amount: 600,
        samples: 1,
        listingCount: 33,
        uniqueSellers: 30,
        conversion: "exchange-v1",
        exchange: { currency: "divine", amount: 2, quote: { hour: convertedHour, amount: 300 } },
    });
    const convertedBound = z.object({ graph: craftingGraphSchema }).parse(
        await parity("crafting/market/sources/bind", "bind_crafting_source_price", {
            graph,
            id: essenceId,
            quote: converted.quotes[essenceId],
        }),
    ).graph;
    expect(decodeCraftingSourceReference(convertedBound.prices[essenceId]?.cohortId)).toMatchObject(
        {
            conversion: "exchange-v1",
            exchange: { currency: "divine", amount: 2, quote: { hour: convertedHour } },
        },
    );
    expect(
        await parity("crafting/market/snapshots", "get_crafting_price_snapshots", {
            graph: convertedBound,
            hours: [HOUR, convertedHour],
        }),
    ).toMatchObject({
        points: [
            { graph: { prices: { [essenceId]: { amount: 3.5 } } }, issues: [] },
            { graph: { prices: { [essenceId]: { amount: 600 } } }, issues: [] },
        ],
    });
    await mysql.delete(tStashCurrencyHour.poe1);
    await insertCurrency({ ...commodityExchangeSnapshot, hour: convertedHour - 3600 });
    expect(
        craftingSourceResultSchema.parse(
            await parity("crafting/market/sources", "find_crafting_source_prices", {
                ...current,
                conversion: "exchange-v1",
            }),
        ).quotes,
    ).toEqual({});

    await insertCurrency({ ...vendorSnapshot, hour: HOUR });
    const vendorLookup = {
        graph,
        realm: "pc",
        ids: [vendorOutputId],
        at: HOUR,
        vendorUpgrade: { inputId: vendorInputId },
    };
    const vendorResult = craftingSourceResultSchema.parse(
        await parity("crafting/market/sources", "find_crafting_source_prices", vendorLookup),
    );
    expect(vendorResult.quotes[vendorOutputId]).toMatchObject({
        source: "vendor-upgrade",
        amount: 18,
        path: vendorQuote.path,
        ingredient: { hour: HOUR, itemVolume: 3, quoteVolume: 6 },
    });
    const vendorBound = z.object({ graph: craftingGraphSchema }).parse(
        await parity("crafting/market/sources/bind", "bind_crafting_source_price", {
            graph,
            id: vendorOutputId,
            quote: vendorResult.quotes[vendorOutputId],
        }),
    ).graph;
    expect(vendorBound.prices[vendorOutputId]).toMatchObject({ amount: 18, confidence: null });
    expect(vendorBound.prices[vendorOutputId]).not.toHaveProperty("samples");
    await insertCurrency({
        ...vendorSnapshot,
        hour: HOUR + 3600,
        volumeTraded: { [vendorInputId]: 0, [chaosId]: 0 },
    });
    const missingVendor = craftingSourceResultSchema.parse(
        await parity("crafting/market/sources", "find_crafting_source_prices", {
            ...vendorLookup,
            at: HOUR + 3600,
        }),
    );
    expect(missingVendor.quotes).toEqual({});
    expect(missingVendor.missing[vendorOutputId]).toBeTruthy();
    expect(
        await parity("crafting/market/snapshots", "get_crafting_price_snapshots", {
            graph: vendorBound,
            hours: [HOUR, HOUR + 3600],
        }),
    ).toMatchObject({
        points: [
            { graph: { prices: { [vendorOutputId]: { amount: 18 } } }, issues: [] },
            { graph: null, issues: [expect.any(String)] },
        ],
    });
});

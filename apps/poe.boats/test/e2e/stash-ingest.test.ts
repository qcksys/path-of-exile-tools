// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve the upstream API field names.
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { MySqlContainer, type StartedMySqlContainer } from "@testcontainers/mysql";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { type Connection, createConnection } from "mysql2/promise";
import { RouterContextProvider } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vite-plus/test";
import { dbContext, envContext } from "~/context";
import type { TDatabase } from "~/db/client";
import { getMarketData } from "~/db/queries/market.queries";
import { tStashCurrencyHourly } from "~/db/schema/stash.currency-hourly";
import { tStashUniqueHourly } from "~/db/schema/stash.unique-hourly";
import { action } from "~/routes/api.stash-ingest";
import { marketFiltersSchema } from "~/schemas/market";
import { createClient } from "../../../../packages/poe-api-client/src/client.ts";
import { ingestCx } from "../../../../packages/poe-stash-ingest/src/cx/ingest.ts";
import { rollupCx } from "../../../../packages/poe-stash-ingest/src/cx/rollup.ts";
import { ingestPs } from "../../../../packages/poe-stash-ingest/src/ps/ingest.ts";
import { rollupPs } from "../../../../packages/poe-stash-ingest/src/ps/rollup.ts";
import { evaluateSales } from "../../../../packages/poe-stash-ingest/src/ps/sales.ts";
import { getCursor } from "../../../../packages/poe-stash-ingest/src/shared/cursor.ts";
import {
    type DbHandle,
    openDb,
    queryAll,
} from "../../../../packages/poe-stash-ingest/src/shared/db.ts";

const HOUR = 1_790_899_200;
const TOKEN = "inert-e2e-ingest-token";
const MARKET_ID =
    "Metadata/Items/DivinationCards/DivinationCardTheMetalsmithsGift|Metadata/Items/DivinationCards/DivinationCardTheEnlightened";
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
    stashType: "PremiumStash",
    items: [item],
};
const market = {
    league: "Standard",
    market_id: MARKET_ID,
    lowest_ratio: { chaos: 100, divine: 1 },
    highest_ratio: { chaos: 110, divine: 1 },
    volume_traded: { chaos: 1000, divine: 10 },
    lowest_stock: { chaos: 100, divine: 1 },
    highest_stock: { chaos: 1000, divine: 10 },
};

let container: StartedMySqlContainer;
let connection: Connection;
let mysql: MySql2Database;
let local: DbHandle;
let server: Server;
let baseUrl: string;
let upstreamResponses: Array<{ status?: number; body: unknown }>;
let receiverStatus: number | undefined;

beforeAll(async () => {
    container = await new MySqlContainer("mysql:8.4").withDatabase("ingest_test").start();
    connection = await createConnection(container.getConnectionUri());
    mysql = drizzle({ client: connection });
    await migrate(mysql, {
        migrationsFolder: fileURLToPath(new URL("../../app/db/migrations", import.meta.url)),
    });
    server = createServer(async (incoming, outgoing) => {
        try {
            if (incoming.url !== "/api/stash-ingest") {
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
            const response = await action({
                request: new Request(`${baseUrl}/api/stash-ingest`, {
                    method: incoming.method,
                    headers: { authorization: incoming.headers.authorization ?? "" },
                    body: Buffer.concat(chunks).toString(),
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
    await mysql.delete(tStashCurrencyHourly);
    await mysql.delete(tStashUniqueHourly);
    local = await openDb(":memory:");
    upstreamResponses = [];
    receiverStatus = undefined;
    vi.stubEnv("POE_BOATS_INGEST_URL", `${baseUrl}/api/stash-ingest`);
    vi.stubEnv("POE_BOATS_INGEST_TOKEN", TOKEN);
});

afterEach(async () => {
    await local?.close();
    vi.unstubAllEnvs();
});

afterAll(async () => {
    if (server?.listening)
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
        );
    await connection?.end();
    await container?.stop();
});

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
        prices: { divine: { median: 10 } },
        salesPrices: { divine: { median: 10 } },
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

it("updates a seeded currency market with a long ID through HTTP to MySQL", async () => {
    await mysql.insert(tStashCurrencyHourly).values({
        league: "Standard",
        marketId: MARKET_ID,
        hour: HOUR,
        volumeTraded: { chaos: 1, divine: 1 },
    });
    upstreamResponses.push({ body: { next_change_id: HOUR + 3600, markets: [market] } });
    const client = createClient({ baseUrl, userAgent: "ingest-e2e", token: "inert-token" });
    await ingestCx(local.conn, client, { fromHour: HOUR, catchUp: false });
    await rollupCx(local.conn, { hour: HOUR });
    await rollupCx(local.conn, { hour: HOUR });
    const rows = await mysql.select().from(tStashCurrencyHourly);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
        league: "Standard",
        marketId: MARKET_ID,
        hour: HOUR,
        lowestRatio: { chaos: 100, divine: 1 },
        volumeTraded: { chaos: 1000, divine: 10 },
    });
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
    const rows = await mysql.select().from(tStashUniqueHourly);
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
    upstreamResponses.push({ body: { next_change_id: "page-2", stashes: [stash] } });
    await ingestPs(local.conn, client, { pages: 1 });
    await rollupPs(local.conn, { hour: Math.floor(Date.now() / 3_600_000) * 3600 });
    const rows = await mysql.select().from(tStashUniqueHourly);
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
    expect(await mysql.select().from(tStashCurrencyHourly)).toEqual([]);
    receiverStatus = undefined;
    await rollupCx(local.conn, { hour: HOUR });
    expect(await queryAll(local.conn, "SELECT * FROM rollup_state")).toHaveLength(1);
    expect(await mysql.select().from(tStashCurrencyHourly)).toHaveLength(1);
});

it("stores a three-mod Watcher's Eye and groups equivalent mod orders", async () => {
    const mods = [
        "Gain 15% of Physical Damage as Extra Fire Damage while affected by Anger",
        "Gain 10% of Maximum Mana as Extra Maximum Energy Shield while affected by Clarity",
        "You take 60% reduced Extra Damage from Critical Strikes while affected by Determination",
    ];
    upstreamResponses.push({
        body: {
            next_change_id: "page-2",
            stashes: [
                {
                    ...stash,
                    items: [
                        { ...item, name: "Watcher's Eye", explicitMods: mods },
                        {
                            ...item,
                            id: "item-2",
                            name: "Watcher's Eye",
                            explicitMods: [...mods].reverse(),
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
    await rollupPs(local.conn, { hour: Math.floor(Date.now() / 3_600_000) * 3600 });
    const rows = await mysql.select().from(tStashUniqueHourly);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
        listingCount: 2,
        signatureKind: "watchers-eye",
        signatureData: { mods: expect.any(Array) },
    });
    expect(rows[0]?.signatureData?.mods).toHaveLength(3);
    expect(rows[0]?.signatureValue.length).toBeLessThanOrEqual(255);
});

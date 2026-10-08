// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve the upstream API field names.
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { itemQuerySchema, normalizeApiItem } from "@poe-tools/item-query";
import { selectCohortPrice } from "@poe-tools/market";
import { MySqlContainer, type StartedMySqlContainer } from "@testcontainers/mysql";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { type Connection, createConnection } from "mysql2/promise";
import { RouterContextProvider } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vite-plus/test";
import { dbContext, envContext } from "~/context";
import type { TDatabase } from "~/db/client";
import {
    craftingExchangeHistory,
    findCraftingExchangePrices,
} from "~/db/queries/crafting-exchange.queries";
import {
    craftingMarketHistory,
    findCraftingMarketPrices,
} from "~/db/queries/crafting-market.queries";
import { getMarketData } from "~/db/queries/market.queries";
import { tStashCohort } from "~/db/schema/stash.cohort";
import { tStashCohortHourly } from "~/db/schema/stash.cohort-hourly";
import { tStashCurrencyHourly } from "~/db/schema/stash.currency-hourly";
import { tStashUniqueHourly } from "~/db/schema/stash.unique-hourly";
import { seededRandom } from "~/lib/crafting-engine";
import { bindExchangePrice } from "~/lib/crafting-exchange";
import { calculateCraftingGraph } from "~/lib/crafting-graph-simulation";
import { createCraftingItemQuery } from "~/lib/crafting-item-query";
import { bindCohortPurchasePrice, livePurchasePrices } from "~/lib/crafting-market";
import {
    craftingMarketSnapshots,
    refreshCraftingMarketPrices,
} from "~/operations/crafting-market.server";
import { action } from "~/routes/api.stash-ingest";
import { craftingGraphSchema } from "~/schemas/crafting-graph";
import { marketFiltersSchema } from "~/schemas/market";
import { createClient } from "../../../../packages/poe-api-client/src/client.ts";
import { ingestCx } from "../../../../packages/poe-stash-ingest/src/cx/ingest.ts";
import { rollupCx } from "../../../../packages/poe-stash-ingest/src/cx/rollup.ts";
import { flushRollups } from "../../../../packages/poe-stash-ingest/src/pipeline.ts";
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
import { push } from "../../../../packages/poe-stash-ingest/src/shared/remote/push.ts";
import {
    chaosId,
    exchangeGraph,
    exchangeSnapshot,
    transmuteId,
} from "../crafting-exchange-fixtures";
import { catalog, currency, engine } from "../crafting-fixtures";
import { quote } from "../crafting-graph-fixtures";
import {
    donorFamilyMarketFixture,
    marketCandidate,
    marketGraph,
} from "../crafting-market-fixtures";

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
    await mysql.delete(tStashCohortHourly);
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

it("converts captured indirect pairs only with positive matching-hour legs and preserves historical scope", async () => {
    const divine = "Metadata/Items/Currency/CurrencyModValues";
    const db = mysql as unknown as TDatabase;
    await mysql.insert(tStashCurrencyHourly).values([
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
    for (const wrong of [
        { at: HOUR - 1 },
        { at: HOUR + 3600 },
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

it("waits for a saved exchange hour to complete without fetching an upstream 404 or advancing its cursor", async () => {
    const hour = Math.floor(Date.now() / 3_600_000) * 3600;
    await setCursor(local.conn, "cxapi", String(hour));
    const client = createClient({ baseUrl, userAgent: "hour-boundary-test", token: TOKEN });
    expect(await ingestCx(local.conn, client, { catchUp: true, league: "Standard" })).toEqual([]);
    expect(await getCursor(local.conn, "cxapi")).toBe(String(hour));
    expect(await queryAll(local.conn, "SELECT * FROM cx_market_hour")).toEqual([]);
});

it("refreshes across compatible persisted revisions and recovers earlier prices without rewriting history", async () => {
    const current = structuredClone(marketCandidate);
    current.definition.revision = "next-market";
    current.definition.catalogHash = "b".repeat(64);
    current.latest.revision = "next-market";
    current.latest.hour += 3600;
    current.latest.prices.chaos!.median = 27;
    await mysql.insert(tStashCohort).values([marketCandidate.definition, current.definition]);
    await mysql.insert(tStashCohortHourly).values([marketCandidate.latest, current.latest]);
    const db = mysql as unknown as TDatabase;
    const graph = bindCohortPurchasePrice(marketGraph(), engine, "base", "buy", marketCandidate);
    const node = graph.nodes[0]!;
    if (node.kind !== "acquire") throw new Error("Fixture");
    node.choice = { mode: "pinned", alternativeId: "buy" };
    const refreshed = await refreshCraftingMarketPrices(db, graph, engine);
    expect(refreshed.issues).toEqual([]);
    expect(livePurchasePrices(refreshed.graph)[0]).toMatchObject({
        reference: { revision: "next-market" },
        alternative: { price: { amount: 27 } },
        node: { choice: node.choice },
    });
    const snapshots = await craftingMarketSnapshots(db, refreshed.graph, engine, [
        marketCandidate.latest.hour,
        current.latest.hour,
    ]);
    for (const [index, revision, amount] of [
        [0, "test-market", 20],
        [1, "next-market", 27],
    ] as const) {
        const point = snapshots.points[index]!;
        expect(point.issues).toEqual([]);
        expect(livePurchasePrices(point.graph!)[0]).toMatchObject({
            reference: { revision },
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
        revision: "test-market",
        cohortId: marketCandidate.definition.id,
        limit: 10,
    });
    expect(history.history).toEqual([marketCandidate.latest]);
    expect(livePurchasePrices(graph)[0]?.reference.revision).toBe("test-market");
});

it("offers stored donor-family quotes only under an explicit representative assumption", async () => {
    const { graph, candidate } = donorFamilyMarketFixture();
    await mysql.insert(tStashCohort).values([candidate.definition, marketCandidate.definition]);
    await mysql.insert(tStashCohortHourly).values([candidate.latest, marketCandidate.latest]);
    const node = graph.nodes[0]!;
    if (node.kind !== "acquire" || node.alternatives[0]?.kind !== "purchase")
        throw new Error("Fixture");
    const input = {
        item: createCraftingItemQuery(engine).record(node.alternatives[0].item),
        requirements: node.output,
        realm: "pc" as const,
        league: "Standard",
        currency: "chaos",
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

it("persists deduplicated equipment windows while retaining hourly history and historical cutoffs", async () => {
    const client = createClient({ baseUrl, userAgent: "window-e2e", token: TOKEN });
    const equipment = {
        ...item,
        name: "",
        baseType: "Necrotic Armour",
        typeLine: "Necrotic Armour",
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
    const candidate = (await findCraftingMarketPrices(database, input)).candidates.find(
        (row) => row.covered,
    )!;
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
        revision: candidate.definition.revision,
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

it("replays equipment prices from early and middle league through capture, retry and permanent storage", async () => {
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
    const rows = await mysql.select().from(tStashCohortHourly);
    expect(rows).toHaveLength(12);
    const definitions = await mysql.select().from(tStashCohort);
    expect(definitions).toHaveLength(6);
    expect(
        definitions.every(
            (definition) =>
                definition.query.game === "poe1" && definition.catalogHash.length === 64,
        ),
    ).toBe(true);
    const baseRows = rows.filter((row) => row.cohortId.startsWith("base:"));
    const donorRows = rows.filter((row) => row.cohortId.startsWith("donor:"));
    expect(baseRows).toHaveLength(4);
    expect(donorRows).toHaveLength(8);
    for (const row of donorRows)
        expect(row).toMatchObject({ listingCount: 0, unknownCount: 1000, prices: {} });
    for (const row of baseRows)
        expect(row).toMatchObject({
            realm: "pc",
            league: "Standard",
            listingCount: 1000,
            uniqueSellers: 10,
            unknownCount: 0,
            prices: { chaos: { count: 1000, median: row.hour === HOUR ? 20 : 5, confidence: 0.5 } },
        });
    expect(await mysql.select().from(tStashUniqueHourly)).toEqual([]);
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
    expect(latestPrices.candidates.filter((candidate) => candidate.covered)).toHaveLength(1);
    const chosen = latestPrices.candidates.find((candidate) => candidate.covered)!;
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
    for (const [prices, expected] of [
        [earlyPrices, 22],
        [latestPrices, 7],
    ] as const) {
        const candidate = prices.candidates.find(
            (entry) => entry.definition.id === chosen.definition.id,
        )!;
        const priced = bindCohortPurchasePrice(process, engine, "base", "buy", candidate);
        expect(calculateCraftingGraph(catalog, priced, { estimateIterations: 3 }).meanCost).toBe(
            expected,
        );
    }
    const liveProcess = bindCohortPurchasePrice(process, engine, "base", "buy", chosen);
    const snapshots = await craftingMarketSnapshots(database, liveProcess, engine, [
        HOUR - 3600,
        HOUR,
        HOUR + 21 * 24 * 3600,
    ]);
    expect(
        snapshots.points.map((point) =>
            point.graph
                ? calculateCraftingGraph(catalog, point.graph, { estimateIterations: 3 }).meanCost
                : null,
        ),
    ).toEqual([null, 22, 7]);
    expect(calculateCraftingGraph(catalog, liveProcess, { estimateIterations: 3 }).meanCost).toBe(
        7,
    );
    const historyInput = {
        realm: "pc" as const,
        league: "Standard",
        revision: chosen.definition.revision,
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
    // Correcting a past hour must resend an empty cohort rather than leave its old remote price.
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
    expect(corrected.filter((row) => row.hour === HOUR)).toHaveLength(6);
    expect(
        corrected
            .filter((row) => row.hour === HOUR)
            .every((row) => row.listingCount === 0 && Object.keys(row.prices).length === 0),
    ).toBe(true);
    expect(
        corrected
            .filter((row) => row.hour !== HOUR && row.cohortId.startsWith("base:"))
            .every((row) => row.prices.chaos?.median === 5),
    ).toBe(true);
    expect(
        corrected
            .filter((row) => row.hour !== HOUR && row.cohortId.startsWith("donor:"))
            .every((row) => row.unknownCount === 1000 && Object.keys(row.prices).length === 0),
    ).toBe(true);
}, 60_000);

it("prices fractured and isolated donor acquisitions from source observations stored in MySQL", async () => {
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

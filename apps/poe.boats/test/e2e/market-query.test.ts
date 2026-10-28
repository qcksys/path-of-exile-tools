import { fileURLToPath } from "node:url";
import marketBases from "@poe-tools/market/market-bases-poe1.json";
import { MySqlContainer, type StartedMySqlContainer } from "@testcontainers/mysql";
import { and, eq, getTableName, sql } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { type Connection, createConnection, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, expect, it, vi } from "vite-plus/test";
import type { TDatabase } from "~/db/client";
import {
    getMarketData,
    getMarketExchangeItem,
    getPoe2MarketExchange,
} from "~/db/queries/market.queries";
import {
    upsertStashCurrencyHourly,
    upsertStashUniqueHourly,
} from "~/db/queries/stash-ingest.queries";
import { refreshStashRollups, utcDay } from "~/db/queries/stash-rollups.queries";
import { tStashCohortHourly } from "~/db/schema/stash.cohort-hourly";
import { tStashCurrencyDaily } from "~/db/schema/stash.currency-daily";
import { tStashCurrencyHourly } from "~/db/schema/stash.currency-hourly";
import { tStashCurrencyMarket } from "~/db/schema/stash.currency-market";
import { tStashHourCoverage } from "~/db/schema/stash.hour-coverage";
import { tStashMarketDaily } from "~/db/schema/stash.market-daily";
import {
    tStashUniqueHourly as market,
    type TStashUniqueHourlyI,
} from "~/db/schema/stash.unique-hourly";
import { marketBasesSchema } from "~/lib/market-bases";
import { getServerStatus } from "~/operations/server-status.server";
import { marketFiltersSchema } from "~/schemas/market";

const hour = 1_792_836_000;
let container: StartedMySqlContainer;
let connection: Connection;
let db: MySql2Database;
const statements: Array<{ sql: string; params: unknown[] }> = [];
const rowsStatement = () => statements.find((query) => query.sql.includes("`latest_hour`"))!;

/** Seeds write hourly rows directly, so rebuild the rollups ingest keeps before reading. */
async function marketData(...args: Parameters<typeof getMarketData>) {
    const logged = statements.length;
    await refreshStashRollups(db as unknown as TDatabase);
    statements.length = logged;
    return getMarketData(...args);
}

beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date((hour + 3600) * 1000));
    container = await new MySqlContainer("mysql:8.4").withDatabase("market_query_test").start();
    connection = await createConnection(container.getConnectionUri());
    db = drizzle({
        client: connection,
        logger: { logQuery: (query, params) => statements.push({ sql: query, params }) },
    });
    await migrate(db, {
        migrationsFolder: fileURLToPath(new URL("../../app/db/migrations", import.meta.url)),
    });
    for (const realm of ["pc", "poe2"])
        for (const [league, latestHour] of [
            ["Current", hour],
            ["Previous", hour - 86400],
        ] as const)
            await db.insert(market).values(
                Array.from({ length: 400 }, (_, index) => ({
                    realm,
                    league,
                    hour: latestHour - Math.floor(index / 20) * 3600,
                    itemKey: `Item ${index % 20}`,
                    identified: true,
                    baseType: "Leather Belt",
                    frameType: 3,
                    listingCount: 1,
                    uniqueSellers: 1,
                    firstSeenAt: "2026-10-24T00:00:00Z",
                    lastSeenAt: "2026-10-24T00:00:00Z",
                })),
            );
    await db.execute(sql`ANALYZE TABLE ${market}`);
    statements.length = 0;
});

afterAll(async () => {
    await connection?.end();
    await container?.stop();
    vi.useRealTimers();
});

it("discovers season boundaries without scanning every hourly observation", async () => {
    statements.length = 0;
    const result = await marketData(
        db as unknown as TDatabase,
        marketFiltersSchema.parse({ league: "Missing" }),
    );
    expect(result.seasons).toEqual([
        { league: "Current", firstHour: hour - 19 * 3600, latestHour: hour },
        { league: "Previous", firstHour: hour - 86400 - 19 * 3600, latestHour: hour - 86400 },
    ]);
    expect(result.rows).toEqual([]);
    const query = statements[0]!;
    const [plan] = await connection.query<RowDataPacket[]>(`EXPLAIN ${query.sql}`, query.params);
    expect(plan.some((row) => String(row.Extra).includes("Using index for group-by"))).toBe(true);
});

it("fetches full item records by primary key only after selecting the market page", async () => {
    statements.length = 0;
    const result = await marketData(
        db as unknown as TDatabase,
        marketFiltersSchema.parse({ league: "Current" }),
    );
    expect(result.rows).toHaveLength(20);
    expect(result.rows.every((row) => row.hour === hour && row.rank === 1)).toBe(true);
    const query = rowsStatement();
    const [plan] = await connection.query<RowDataPacket[]>(`EXPLAIN ${query.sql}`, query.params);
    // A market's foil and non-foil rows share a primary key prefix, so each market joins its latest hour's rows.
    expect(
        plan.some((row) => row.type === "ref" && row.key === "PRIMARY" && Number(row.rows) === 1),
    ).toBe(true);
    const records = statements.find((entry) =>
        entry.sql.includes(`\`${getTableName(market)}\` FORCE INDEX (\`PRIMARY\`)`),
    )!;
    const [recordPlan] = await connection.query<RowDataPacket[]>(
        `EXPLAIN ${records.sql}`,
        records.params,
    );
    expect(recordPlan).toEqual([
        expect.objectContaining({ type: "range", key: "PRIMARY", rows: 20 }),
    ]);
});

it.each([
    {},
    { identification: "true" },
    { category: "accessories", identification: "true", corruption: "false" },
])("aggregates the period from daily rollups, not hourly rows (filters %j)", async (filters) => {
    statements.length = 0;
    await marketData(
        db as unknown as TDatabase,
        marketFiltersSchema.parse({ league: "Current", ...filters }),
    );
    const query = rowsStatement();
    const [plan] = await connection.query<RowDataPacket[]>(`EXPLAIN ${query.sql}`, query.params);
    const aggregate = plan.find((row) => row.select_type === "DERIVED");
    expect(aggregate?.table).toBe("qsPoeBoats__stash_market_daily");
});

it("reads one category's daily rows from the base-type index", async () => {
    await db.insert(market).values(
        Array.from({ length: 300 }, (_, index) =>
            observation({
                league: "Categories",
                itemKey: `Fossil ${index}`,
                baseType: index < 3 ? "Leather Belt" : "Jagged Fossil",
                frameType: index < 3 ? 3 : 5,
            }),
        ),
    );
    await refreshStashRollups(db as unknown as TDatabase);
    await db.execute(sql`ANALYZE TABLE ${tStashMarketDaily}`);
    statements.length = 0;
    const result = await marketData(
        db as unknown as TDatabase,
        marketFiltersSchema.parse({ league: "Categories", category: "accessories" }),
    );
    expect(result.rows.map((row) => row.itemKey)).toEqual(["Fossil 0", "Fossil 1", "Fossil 2"]);
    const query = rowsStatement();
    const [plan] = await connection.query<RowDataPacket[]>(`EXPLAIN ${query.sql}`, query.params);
    const aggregate = plan.find((row) => row.select_type === "DERIVED");
    expect(aggregate?.key).toBe("stash_market_daily_base_idx");
    expect(String(aggregate?.Extra)).toMatch(/Using index/);
});

it.each(["Item", "Leather"])("searches names, item keys and base types (%s)", async (q) => {
    const result = await marketData(
        db as unknown as TDatabase,
        marketFiltersSchema.parse({ league: "Current", q }),
    );
    expect(result.rows).toHaveLength(20);
});

it("reads status coverage from hourly rollups without scanning hourly tables", async () => {
    await refreshStashRollups(db as unknown as TDatabase);
    statements.length = 0;
    const result = await getServerStatus(db as unknown as TDatabase);
    expect(
        result.coverage.find(
            (row) => row.stream === "uniques" && row.realm === "pc" && row.league === "Current",
        ),
    ).toMatchObject({ firstHour: hour - 19 * 3600, latestHour: hour, hours: 20, rows: 400 });
    expect(statements.filter((query) => query.sql.includes("stash_hour_coverage"))).toHaveLength(3);
    expect(
        statements.some((query) => /stash_(unique|currency|cohort)_hourly/.test(query.sql)),
    ).toBe(false);
});

it("commits overlapping currency batches from separate connections without losing zero volumes", async () => {
    const other = await createConnection(container.getConnectionUri());
    const otherDb = drizzle({ client: other });
    const rows = Array.from({ length: 401 }, (_, index) => ({
        realm: "pc",
        league: "Concurrent",
        marketId: `pair:${String(index).padStart(4, "0")}`,
        hour,
        volumeTraded: { chaos: 0 },
        lowestRatio: { chaos: 1 },
    }));
    try {
        for (let run = 0; run < 3; run++) {
            const written = await Promise.all([
                upsertStashCurrencyHourly(db as unknown as TDatabase, rows),
                upsertStashCurrencyHourly(otherDb as unknown as TDatabase, rows.toReversed()),
            ]);
            expect(written).toEqual([401, 401]);
        }
        const stored = await db
            .select()
            .from(tStashCurrencyHourly)
            .where(eq(tStashCurrencyHourly.league, "Concurrent"));
        expect(stored).toHaveLength(401);
        expect(
            stored.every((row) => row.volumeTraded?.chaos === 0 && row.lowestRatio?.chaos === 1),
        ).toBe(true);
    } finally {
        await other.end();
    }
});

it("recovers an actual MySQL deadlock victim by replaying its autocommitted batch", async () => {
    const blocker = await createConnection(container.getConnectionUri());
    const observer = await createConnection(container.getConnectionUri(true));
    const rows = Array.from({ length: 30 }, (_, index) => ({
        realm: "pc",
        league: "Deadlock",
        hour,
        marketId: `pair:${String(index).padStart(4, "0")}`,
        volumeTraded: { chaos: 1 },
    }));
    await upsertStashCurrencyHourly(db as unknown as TDatabase, rows);
    let writer: Promise<number> | undefined;
    try {
        await blocker.beginTransaction();
        await blocker.query(
            "SELECT marketId FROM qsPoeBoats__stash_currency_hourly WHERE realm = 'pc' AND league = 'Deadlock' AND marketId >= 'pair:0001' FOR UPDATE",
        );
        writer = upsertStashCurrencyHourly(
            db as unknown as TDatabase,
            rows.slice(0, 2).map((row) => ({ ...row, volumeTraded: { chaos: 0 } })),
        );
        // Observe the first wait before closing the lock cycle; the smaller writer is the victim.
        await expect
            .poll(async () => {
                const [waits] = await observer.query<RowDataPacket[]>(
                    "SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits",
                );
                return Number(waits[0]?.n);
            })
            .toBeGreaterThan(0);
        await blocker.query(
            "UPDATE qsPoeBoats__stash_currency_hourly SET volumeTraded = JSON_OBJECT('chaos', 2) WHERE realm = 'pc' AND league = 'Deadlock' AND marketId = 'pair:0000'",
        );
        await blocker.commit();
        expect(await writer).toBe(2);
        const stored = await db
            .select()
            .from(tStashCurrencyHourly)
            .where(
                and(
                    eq(tStashCurrencyHourly.league, "Deadlock"),
                    eq(tStashCurrencyHourly.marketId, "pair:0000"),
                ),
            );
        expect(stored[0]?.volumeTraded).toEqual({ chaos: 0 });
    } finally {
        await blocker.rollback();
        await Promise.allSettled(writer ? [writer] : []);
        await blocker.end();
        await observer.end();
    }
});

it("starts list windows at UTC midnight of the window's first day", async () => {
    const firstDay = utcDay(hour - 7 * 86400 + 3600);
    await db
        .insert(market)
        .values([
            observation({ league: "Window", hour: firstDay - 3600, likelySales: 10 }),
            observation({ league: "Window", hour: firstDay + 3600, likelySales: 3 }),
            observation({ league: "Window", hour, likelySales: 1 }),
        ]);
    const result = await marketData(
        db as unknown as TDatabase,
        marketFiltersSchema.parse({ league: "Window" }),
    );
    expect(result.rows).toMatchObject([{ itemKey: "Example", periodSales: 4, hour }]);
});

it("keeps daily rollups, exchange markets and coverage current through the ingest writers", async () => {
    const read = (filters: Record<string, unknown>) =>
        getMarketData(
            db as unknown as TDatabase,
            marketFiltersSchema.parse({ league: "Ingested", ...filters }),
            "list",
        );
    const previousDay = utcDay(hour) - 3600;
    await upsertStashUniqueHourly(db as unknown as TDatabase, [
        observation({ league: "Ingested", hour: previousDay, likelySales: 2 }),
        observation({ league: "Ingested", hour, likelySales: 1 }),
    ]);
    expect((await read({})).rows).toMatchObject([{ periodSales: 3 }]);
    // A re-pushed hour replaces its totals, and a correction to an earlier day updates that day.
    await upsertStashUniqueHourly(db as unknown as TDatabase, [
        observation({ league: "Ingested", hour, likelySales: 5 }),
    ]);
    await upsertStashUniqueHourly(db as unknown as TDatabase, [
        observation({ league: "Ingested", hour: previousDay, likelySales: 0 }),
    ]);
    expect((await read({})).rows).toMatchObject([{ periodSales: 5 }]);

    await upsertStashCurrencyHourly(db as unknown as TDatabase, [
        { league: "Ingested", marketId: "chaos|divine", hour, volumeTraded: { chaos: 1 } },
    ]);
    await upsertStashCurrencyHourly(db as unknown as TDatabase, [
        {
            league: "Ingested",
            marketId: "chaos|divine",
            hour: hour - 7200,
            volumeTraded: { chaos: 1 },
        },
        { league: "Ingested", marketId: "chaos|divine", hour, volumeTraded: { chaos: 2 } },
    ]);
    const markets = await db
        .select()
        .from(tStashCurrencyMarket)
        .where(eq(tStashCurrencyMarket.league, "Ingested"));
    expect(markets).toMatchObject([{ marketId: "chaos|divine", firstHour: hour - 7200 }]);
    const coverage = await db
        .select()
        .from(tStashHourCoverage)
        .where(eq(tStashHourCoverage.league, "Ingested"));
    expect(
        coverage
            .map(({ stream, hour, rowCount }) => ({ stream, hour, rowCount }))
            .toSorted((a, b) => a.stream.localeCompare(b.stream) || a.hour - b.hour),
    ).toEqual([
        { stream: "currency", hour: hour - 7200, rowCount: 1 },
        { stream: "currency", hour, rowCount: 1 },
        { stream: "uniques", hour: previousDay, rowCount: 1 },
        { stream: "uniques", hour, rowCount: 1 },
    ]);

    // Daily exchange totals sum only hours where both sides traded; a re-pushed hour replaces its share.
    await upsertStashCurrencyHourly(db as unknown as TDatabase, [
        {
            league: "Ingested",
            marketId: "alpha|beta",
            hour: hour - 3600,
            volumeTraded: { alpha: 2, beta: 6 },
        },
        { league: "Ingested", marketId: "alpha|beta", hour, volumeTraded: { alpha: 1, beta: 0 } },
    ]);
    await upsertStashCurrencyHourly(db as unknown as TDatabase, [
        { league: "Ingested", marketId: "alpha|beta", hour, volumeTraded: { alpha: 1, beta: 4 } },
    ]);
    const totals = await db
        .select()
        .from(tStashCurrencyDaily)
        .where(eq(tStashCurrencyDaily.league, "Ingested"));
    expect(
        totals
            .map(({ marketId, day, firstVolume, secondVolume, tradedHours, latestHour }) => ({
                marketId,
                day,
                firstVolume,
                secondVolume,
                tradedHours,
                latestHour,
            }))
            .toSorted((a, b) => a.marketId.localeCompare(b.marketId)),
    ).toEqual([
        {
            marketId: "alpha|beta",
            day: utcDay(hour),
            firstVolume: 3,
            secondVolume: 10,
            tradedHours: 2,
            latestHour: hour,
        },
        {
            marketId: "chaos|divine",
            day: utcDay(hour),
            firstVolume: 0,
            secondVolume: 0,
            tradedHours: 0,
            latestHour: null,
        },
    ]);
});

function observation(overrides: Partial<TStashUniqueHourlyI>): TStashUniqueHourlyI {
    return {
        realm: "pc",
        league: "Variants",
        hour,
        itemKey: "Example",
        name: "Example",
        identified: true,
        baseType: "Leather Belt",
        frameType: 3,
        listingCount: 1,
        uniqueSellers: 1,
        firstSeenAt: "2026-10-24T00:00:00Z",
        lastSeenAt: "2026-10-24T00:00:00Z",
        ...overrides,
    };
}

it("preserves variant totals, the latest listed observation, and exact item history", async () => {
    const variants = [
        {},
        { identified: false },
        { corrupted: true },
        { signatureKind: "watchers-eye" },
        { signatureValue: "alternate" },
    ];
    await db.insert(market).values(
        variants.flatMap((variant) => [
            observation({
                ...variant,
                hour: hour - 7200,
                name: "Older name",
                likelySales: 3,
                removedCount: 5,
                pendingCount: 7,
            }),
            observation({
                ...variant,
                hour: hour - 3600,
                likelySales: 2,
                prices: { chaos: { count: 1, min: 20, median: 20, max: 20 } },
            }),
            observation({ ...variant, listingCount: 0, likelySales: 4 }),
        ]),
    );
    await db
        .insert(market)
        .values([
            observation({ realm: "poe2", likelySales: 100 }),
            observation({ league: "Other", likelySales: 100 }),
            observation({ hour: utcDay(hour - 7 * 86400 + 3600) - 3600, likelySales: 100 }),
            observation({ itemKey: "Empty", hour: hour - 3600, listingCount: 0 }),
            observation({ itemKey: "Empty", listingCount: 0 }),
        ]);
    const filters = marketFiltersSchema.parse({ league: "Variants", item: "Example" });
    const result = await marketData(db as unknown as TDatabase, filters);
    expect(result.rows).toHaveLength(6);
    const examples = result.rows.filter((row) => row.itemKey === "Example");
    expect(examples).toHaveLength(5);
    for (const row of examples)
        expect(row).toMatchObject({
            hour: hour - 3600,
            rank: 1,
            periodSales: 9,
            periodRemovals: 5,
            periodPending: 7,
            prices: { chaos: { median: 20 } },
        });
    expect(result.rows.find((row) => row.itemKey === "Empty")?.hour).toBe(hour);
    expect(result.history.map((row) => row.hour)).toEqual([hour - 7200, hour - 3600, hour]);
    // Daily rollups keep one name per day (the greatest), so a match reports the whole window.
    const searched = await marketData(db as unknown as TDatabase, { ...filters, q: "Older" });
    expect(searched.rows).toHaveLength(5);
    expect(searched.rows.every((row) => row.hour === hour - 3600 && row.periodSales === 9)).toBe(
        true,
    );
});

it("merges foil and non-foil listings into one market for the list, variants and history", async () => {
    const foil = (foilVariation: number, overrides: Partial<TStashUniqueHourlyI>) =>
        observation({ league: "Foils", foilVariation, ...overrides });
    const chaos = (count: number, median: number) => ({
        chaos: { count, min: median, median, max: median },
    });
    await db
        .insert(market)
        .values([
            foil(-1, { listingCount: 9, likelySales: 1, prices: chaos(9, 5) }),
            foil(-1, { corrupted: true, listingCount: 1, prices: chaos(1, 6) }),
            foil(2, { hour: hour - 3600, listingCount: 2, likelySales: 3, prices: chaos(2, 40) }),
            foil(2, { listingCount: 1, uniqueSellers: 1, likelySales: 1, prices: chaos(1, 100) }),
            foil(7, { listingCount: 3, uniqueSellers: 2, likelySales: 2, prices: chaos(3, 20) }),
            foil(7, { corrupted: true, listingCount: 4, likelySales: 5, prices: chaos(4, 30) }),
        ]);
    const filters = marketFiltersSchema.parse({ league: "Foils", currency: "chaos" });
    const list = await marketData(db as unknown as TDatabase, filters, "list");
    expect(list.rows.map((row) => [row.corrupted, row.listingCount, row.hour])).toEqual([
        [false, 13, hour],
        [true, 5, hour],
    ]);
    expect(list.rows[0]).toMatchObject({
        uniqueSellers: 4,
        periodSales: 7,
        prices: { chaos: { count: 13, min: 5, max: 100 } },
    });
    const byListings = await marketData(
        db as unknown as TDatabase,
        { ...filters, order: "listings-desc", listingsMin: 5, listingsMax: 5 },
        "list",
    );
    expect(byListings.rows.map((row) => row.corrupted)).toEqual([true]);
    const byPrice = await marketData(
        db as unknown as TDatabase,
        { ...filters, order: "price-desc" },
        "list",
    );
    // Listing-weighted medians: corrupted (6 + 4 × 30) / 5 = 25.2, uncorrupted (9 × 5 + 100 + 3 × 20) / 13 ≈ 15.8.
    expect(byPrice.rows.map((row) => row.corrupted)).toEqual([true, false]);

    // An old link to one foil variation opens the merged market.
    const item = await marketData(
        db as unknown as TDatabase,
        marketFiltersSchema.parse({
            league: "Foils",
            currency: "chaos",
            item: "Example",
            foil: "7",
        }),
        "history",
    );
    expect(item.variants.map((row) => [row.corrupted, row.periodSales])).toEqual([
        [false, 7],
        [true, 5],
    ]);
    expect(item.history.map((row) => [row.hour, row.listingCount])).toEqual([
        [hour - 3600, 2],
        [hour, 13],
    ]);
    expect(item.history[1]!.merged).toMatchObject({ count: 13, min: 5, max: 100 });
});

it("lists a unique's markets in both identification states as variants of each other", async () => {
    const icon = "2DItems/Jewels/ElderJewel";
    const eye = (overrides: Partial<TStashUniqueHourlyI>) =>
        observation({
            league: "Identification",
            itemKey: "Watcher's Eye",
            name: "Watcher's Eye",
            iconAsset: icon,
            baseType: "Prismatic Jewel",
            ...overrides,
        });
    await db.insert(market).values([
        eye({ signatureKind: "watchers-eye", signatureValue: "Haste", likelySales: 3 }),
        eye({ itemKey: `unid:${icon}`, identified: false, likelySales: 2 }),
        eye({ itemKey: `unid:${icon}`, identified: false, corrupted: true, likelySales: 1 }),
        // A unique sharing the art shares the unidentified market, which is named after another.
        eye({ itemKey: "Replica Eye", name: "Replica Eye" }),
        eye({ itemKey: "unid:2DItems/Jewels/Other", name: "Other", identified: false }),
    ]);
    const variants = async (item: string) =>
        (
            await getMarketData(
                db as unknown as TDatabase,
                marketFiltersSchema.parse({ league: "Identification", item }),
                "history",
            )
        ).variants.map((row) => [row.itemKey, row.name, row.identified, row.corrupted]);
    const both = [
        ["Watcher's Eye", "Watcher's Eye", true, false],
        [`unid:${icon}`, "Watcher's Eye", false, false],
        [`unid:${icon}`, "Watcher's Eye", false, true],
    ];
    expect(await variants("Watcher's Eye")).toEqual(both);
    expect(await variants(`unid:${icon}`)).toEqual(both);
    expect(await variants("Replica Eye")).toEqual([["Replica Eye", "Replica Eye", true, false]]);
});

it("lists a mod pool unique once and values its mods on the item page", async () => {
    const haste = "Haste: #% increased Movement Speed";
    const precision = "Precision: #% increased Critical Strike Chance";
    const discipline = "Discipline: #% faster start of Energy Shield Recharge";
    const chaos = (median: number) => ({ chaos: { count: 1, min: median, median, max: median } });
    const eye = (mods: string[], overrides: Partial<TStashUniqueHourlyI> = {}) =>
        observation({
            league: "Mods",
            itemKey: "Watcher's Eye",
            name: "Watcher's Eye",
            baseType: "Prismatic Jewel",
            signatureKind: "watchers-eye",
            signatureValue: mods.join(" / "),
            signatureData: { kind: "watchers-eye", mods },
            ...overrides,
        });
    await db.insert(market).values([
        eye([haste, precision], { prices: chaos(30) }),
        // A roll captured before ingest masked rolls, under its old hashed signature and shape.
        eye([], {
            signatureValue: "old-hash",
            signatureData: {
                kind: "watchers-eye",
                mods: [
                    { aura: "Haste", stat: "12% increased Movement Speed" },
                    { aura: "Precision", stat: "40% increased Critical Strike Chance" },
                ],
            },
            prices: chaos(20),
        }),
        eye([discipline, haste], { prices: chaos(50) }),
        eye([discipline, haste], {
            hour: hour - 3600,
            listingCount: 0,
            likelySales: 2,
            salesPrices: chaos(55),
        }),
        // Earlier listings without sales are not current asks.
        eye([precision], { hour: hour - 3600, prices: chaos(1) }),
        eye([haste], { corrupted: true, prices: chaos(2) }),
    ]);

    // The category list shows the item once per corruption state, not once per combination.
    const list = await marketData(
        db as unknown as TDatabase,
        marketFiltersSchema.parse({ league: "Mods", currency: "chaos" }),
        "list",
    );
    expect(
        list.rows.map((row) => [
            row.corrupted,
            row.signatureKind,
            row.signatureValue,
            row.signatureData,
            row.listingCount,
            row.periodSales,
        ]),
    ).toEqual([
        [false, "watchers-eye", "", null, 3, 2],
        [true, "watchers-eye", "", null, 1, 0],
    ]);
    // The daily rollup already holds one row per market and day, not one per combination.
    const rolled = await db
        .select({ day: tStashMarketDaily.day, value: tStashMarketDaily.signatureValue })
        .from(tStashMarketDaily)
        .where(eq(tStashMarketDaily.league, "Mods"));
    expect(rolled).toHaveLength(2);
    expect(rolled.every((row) => row.value === "")).toBe(true);

    const filters = marketFiltersSchema.parse({
        league: "Mods",
        item: "Watcher's Eye",
        kind: "watchers-eye",
        currency: "chaos",
    });
    const result = await marketData(db as unknown as TDatabase, filters, "history");
    expect(
        result.variants.map((row) => [row.corrupted, row.signatureValue, row.periodSales]),
    ).toEqual([
        [false, "", 2],
        [true, "", 0],
    ]);
    expect(
        result.history.map((row) => [
            row.hour,
            row.signatureValue,
            row.listingCount,
            row.likelySales,
        ]),
    ).toEqual([
        [hour - 3600, "", 1, 2],
        [hour, "", 3, 0],
    ]);
    expect(result.modValues?.cheapest).toBe(20);
    expect(result.modValues?.mods.map((row) => [row.mod, row.cheapest, row.sales])).toEqual([
        [discipline, 50, 2],
        [haste, 20, 2],
        [precision, 20, 0],
    ]);
    expect(result.modValues?.mods[0]?.saleMedian).toBe(55);

    // One combination's page keeps its own history and still values every mod.
    const combination = await marketData(
        db as unknown as TDatabase,
        { ...filters, value: `${discipline} / ${haste}`, mods: discipline },
        "history",
    );
    expect(combination.history.map((row) => [row.hour, row.listingCount])).toEqual([
        [hour - 3600, 0],
        [hour, 1],
    ]);
    expect(combination.modValues?.matches.map((match) => [match.mods, match.cheapest])).toEqual([
        [[discipline, haste], 50],
    ]);

    const other = await marketData(
        db as unknown as TDatabase,
        { ...filters, kind: "", value: "" },
        "history",
    );
    expect(other.modValues).toBeNull();
});

it("keeps stable sales ordering and page boundaries when fetching full records", async () => {
    const observations = Array.from({ length: 65 }, (_, index) =>
        observation({
            league: "Paging",
            itemKey: `Item ${String(index).padStart(2, "0")}`,
            likelySales: index % 3,
        }),
    );
    await db.insert(market).values(observations);
    const expected = [...observations].sort(
        (a, b) =>
            Number(b.likelySales) - Number(a.likelySales) || a.itemKey.localeCompare(b.itemKey),
    );
    const filters = marketFiltersSchema.parse({ league: "Paging" });
    const first = await marketData(db as unknown as TDatabase, filters);
    const second = await marketData(db as unknown as TDatabase, { ...filters, page: 2 });
    expect(first.rows.map((row) => row.itemKey)).toEqual(
        expected.slice(0, 50).map((row) => row.itemKey),
    );
    expect(second.rows.map((row) => row.itemKey)).toEqual(
        expected.slice(50).map((row) => row.itemKey),
    );
    expect(first.hasMore).toBe(true);
    expect(second.hasMore).toBe(false);
});

it("filters categories and variant state before pagination and searches base types", async () => {
    await db.insert(market).values([
        ...Array.from({ length: 60 }, (_, index) =>
            observation({ league: "Categories", itemKey: `Belt ${index}`, likelySales: 100 }),
        ),
        observation({
            league: "Categories",
            itemKey: "Abberath's Hooves",
            name: "Abberath's Hooves",
            baseType: "Goathide Boots",
        }),
        observation({
            league: "Categories",
            itemKey: "Unidentified boots",
            baseType: "Goathide Boots",
            identified: false,
        }),
        observation({
            league: "Categories",
            itemKey: "Corrupted boots",
            baseType: "Goathide Boots",
            corrupted: true,
        }),
        observation({ league: "Categories", itemKey: "Unknown", baseType: "Future base" }),
    ]);
    const filters = marketFiltersSchema.parse({
        league: "Categories",
        category: "armour",
        identification: "true",
        corruption: "false",
        q: "Goathide",
    });
    const result = await marketData(db as unknown as TDatabase, filters);
    expect(result.rows.map((row) => [row.itemKey, row.category])).toEqual([
        ["Abberath's Hooves", "armour"],
    ]);
    expect(result.hasMore).toBe(false);
    const other = await marketData(
        db as unknown as TDatabase,
        marketFiltersSchema.parse({ league: "Categories", category: "other" }),
    );
    expect(other.rows.map((row) => row.itemKey)).toEqual(["Unknown"]);
});

it("sorts the latest asking price in the selected currency across page boundaries, with missing prices last", async () => {
    await db.insert(market).values([
        ...Array.from({ length: 55 }, (_, index) =>
            observation({
                league: "Prices",
                itemKey: `Item ${String(index).padStart(2, "0")}`,
                prices: { divine: { count: 1, min: index + 1, median: index + 1, max: index + 1 } },
            }),
        ),
        observation({
            league: "Prices",
            itemKey: "Item 00",
            hour: hour - 3600,
            prices: { divine: { count: 1, min: 999, median: 999, max: 999 } },
        }),
        observation({
            league: "Prices",
            itemKey: "Fraction",
            prices: { divine: { count: 1, min: 0.0002, median: 0.0002, max: 0.0002 } },
        }),
        observation({
            league: "Prices",
            itemKey: "Chaos only",
            prices: { chaos: { count: 1, min: 1, median: 1, max: 1 } },
        }),
        observation({ league: "Prices", itemKey: "Unpriced" }),
    ]);
    const filters = marketFiltersSchema.parse({ league: "Prices", order: "price-asc" });
    const first = await marketData(db as unknown as TDatabase, filters);
    const second = await marketData(db as unknown as TDatabase, { ...filters, page: 2 });
    expect(first.rows[0]?.itemKey).toBe("Fraction");
    expect(first.rows[1]?.prices?.divine?.median).toBe(1);
    expect(first.rows.at(-1)?.itemKey).toBe("Item 48");
    expect(second.rows.map((row) => row.itemKey)).toEqual([
        "Item 49",
        "Item 50",
        "Item 51",
        "Item 52",
        "Item 53",
        "Item 54",
        "Chaos only",
        "Unpriced",
    ]);
    const descending = await marketData(db as unknown as TDatabase, {
        ...filters,
        order: "price-desc",
    });
    expect(descending.rows[0]?.itemKey).toBe("Item 54");
    const chaos = await marketData(db as unknown as TDatabase, {
        ...filters,
        currency: "chaos",
    });
    expect(chaos.rows[0]?.itemKey).toBe("Chaos only");
});

it("filters and orders by table column ranges before pagination", async () => {
    await db.insert(market).values([
        ...Array.from({ length: 60 }, (_, index) => {
            const itemKey = `Item ${String(index).padStart(2, "0")}`;
            return [
                observation({
                    league: "Ranges",
                    itemKey,
                    listingCount: index + 1,
                    uniqueSellers: 60 - index,
                    likelySales: index % 5,
                    prices: { divine: { count: 1, min: index, median: index, max: index } },
                }),
                observation({
                    league: "Ranges",
                    itemKey,
                    hour: hour - 3600,
                    listingCount: 999,
                    uniqueSellers: 999,
                    likelySales: 1,
                }),
            ];
        }).flat(),
        observation({ league: "Ranges", itemKey: "Stale", hour: hour - 7200 }),
    ]);
    const read = async (filters: Record<string, unknown>) =>
        marketData(
            db as unknown as TDatabase,
            marketFiltersSchema.parse({ league: "Ranges", order: "name-asc", ...filters }),
        );
    const keys = (indexes: number[]) =>
        indexes.map((index) => `Item ${String(index).padStart(2, "0")}`);
    const range = (from: number, to: number) =>
        Array.from({ length: to - from + 1 }, (_, index) => from + index);
    const everyFifth = (offset: number) => range(0, 11).map((index) => index * 5 + offset);

    expect(
        (await read({ listingsMin: 10, listingsMax: 19 })).rows.map((row) => row.itemKey),
    ).toEqual(keys(range(9, 18)));
    expect((await read({ sellersMin: 55 })).rows.map((row) => row.itemKey)).toEqual(
        keys(range(0, 5)),
    );
    expect((await read({ priceMin: 50, priceMax: 59.5 })).rows.map((row) => row.itemKey)).toEqual(
        keys(range(50, 59)),
    );
    expect((await read({ salesMin: 5 })).rows.map((row) => row.itemKey)).toEqual(
        keys(everyFifth(4)),
    );
    expect((await read({ salesMax: 1 })).rows.map((row) => row.itemKey)).toEqual([
        ...keys(everyFifth(0)),
        "Stale",
    ]);
    const priced = await read({ priceMin: 0 });
    expect(priced.rows).toHaveLength(50);
    expect(priced.hasMore).toBe(true);
    expect((await read({ priceMin: 0, page: 2 })).rows.map((row) => row.itemKey)).toEqual(
        keys(range(50, 59)),
    );

    expect((await read({ order: "listings-desc" })).rows[0]?.itemKey).toBe("Item 59");
    expect((await read({ order: "listings-asc" })).rows[0]?.itemKey).toBe("Item 00");
    expect((await read({ order: "sellers-desc" })).rows[0]?.itemKey).toBe("Item 00");
    expect((await read({ order: "sales-asc" })).rows[0]?.itemKey).toBe("Stale");
    expect((await read({ order: "oldest" })).rows[0]?.itemKey).toBe("Stale");
    const listingsPage2 = await read({ order: "listings-desc", page: 2 });
    expect(listingsPage2.rows.map((row) => row.itemKey)).toEqual([
        ...keys(range(0, 9).reverse()),
        "Stale",
    ]);
});

it("keeps item history independent of browsing filters and skips the list query for detail routes", async () => {
    statements.length = 0;
    const result = await marketData(
        db as unknown as TDatabase,
        marketFiltersSchema.parse({
            league: "Current",
            item: "Item 0",
            category: "weapons",
            q: "not a match",
            corruption: "true",
        }),
        "history",
    );
    expect(result.history).toHaveLength(20);
    expect(result.rows).toEqual([]);
    expect(result.variants).toEqual([
        expect.objectContaining({ itemKey: "Item 0", identified: true, corrupted: false }),
    ]);
    expect(statements).toHaveLength(6);
    expect(statements.filter(({ sql: query }) => /\binner\s+join\b/i.test(query))).toEqual([]);
    expect(
        statements.filter(({ sql: query }) => query.includes(getTableName(tStashCurrencyHourly))),
    ).toHaveLength(2);
});

it("merges every listing currency into the display currency through same-league chaos rates", async () => {
    const chaosId = "Metadata/Items/Currency/CurrencyRerollRare";
    const divineId = "Metadata/Items/Currency/CurrencyModValues";
    await upsertStashCurrencyHourly(
        db as unknown as TDatabase,
        [
            ["Merged", 150],
            ["Other", 10],
        ].map(([league, chaosPerDivine]) => ({
            realm: "pc",
            league: league as string,
            marketId: `${divineId}|${chaosId}`,
            hour: hour - 3600,
            volumeTraded: { [divineId]: 10, [chaosId]: 10 * (chaosPerDivine as number) },
            lowestRatio: null,
            highestRatio: null,
            lowestStock: null,
            highestStock: null,
        })),
    );
    await db.insert(market).values([
        observation({
            league: "Merged",
            hour: hour - 3600,
            prices: {
                chaos: { count: 1, min: 300, median: 300, max: 300 },
                divine: {
                    count: 1,
                    min: 2,
                    mean: 2,
                    p10: 2,
                    p25: 2,
                    median: 2,
                    p75: 2,
                    p90: 2,
                    max: 2,
                },
                fragment: { count: 4, min: 1, median: 1, max: 1 },
            },
        }),
        observation({
            league: "Merged",
            prices: { divine: { count: 1, min: 3, median: 3, max: 3 } },
        }),
    ]);
    const filters = marketFiltersSchema.parse({ league: "Merged", item: "Example" });
    const inChaos = await marketData(
        db as unknown as TDatabase,
        { ...filters, currency: "chaos" },
        "history",
    );
    expect(inChaos.history.map((row) => row.merged)).toMatchObject([
        { count: 2, unconverted: 4, min: 300, median: 300, max: 300, mean: null },
        // An hour without its own exchange observation reuses the previous hour's rate.
        { count: 1, unconverted: 0, median: 450 },
    ]);
    const inDivine = await marketData(db as unknown as TDatabase, filters, "history");
    expect(inDivine.history[0]!.merged).toMatchObject({ count: 2, median: 2, max: 2 });
    expect(inDivine.history[1]!.merged).toMatchObject({ median: 3 });
    expect(inDivine.chaosRates).toEqual({});
    const list = await marketData(
        db as unknown as TDatabase,
        marketFiltersSchema.parse({ league: "Merged" }),
        "list",
    );
    // The list does not reuse a previous-hour divine rate for its exchange rows.
    expect(list.chaosRates).toEqual({});
});

it("uses the current exchange divine rate for list rows, leaving it absent when untraded", async () => {
    const chaosId = "Metadata/Items/Currency/CurrencyRerollRare";
    const divineId = "Metadata/Items/Currency/CurrencyModValues";
    const snapshot = (at: number, divineVolume: number, chaosVolume: number) => ({
        realm: "pc",
        league: "DivineRate",
        marketId: `${divineId}|${chaosId}`,
        hour: at,
        volumeTraded: { [divineId]: divineVolume, [chaosId]: chaosVolume },
        lowestRatio: null,
        highestRatio: null,
        lowestStock: null,
        highestStock: null,
    });
    await upsertStashCurrencyHourly(db as unknown as TDatabase, [
        snapshot(hour - 3600, 1, 150),
        snapshot(hour, 1, 200),
    ]);
    await db.insert(market).values(
        observation({
            league: "DivineRate",
            prices: { divine: { count: 1, min: 1, median: 1, max: 1 } },
        }),
    );
    const filters = marketFiltersSchema.parse({ league: "DivineRate" });
    const current = await marketData(db as unknown as TDatabase, filters, "list");
    expect(current.exchange).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "Divine Orb", price: 200 })]),
    );
    expect(current.chaosRates.divine).toBe(200);

    await upsertStashCurrencyHourly(db as unknown as TDatabase, [snapshot(hour, 0, 0)]);
    const untraded = await marketData(db as unknown as TDatabase, filters, "list");
    // The exchange row keeps the day's earlier rate, but stash prices do not convert at it.
    expect(untraded.exchange).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ name: "Divine Orb", price: 150, current: false }),
        ]),
    );
    expect(untraded.chaosRates).not.toHaveProperty("divine");
});

it("prices exchange-traded items from the exchange and leaves out their stash listings", async () => {
    const chaosId = "Metadata/Items/Currency/CurrencyRerollRare";
    const divineId = "Metadata/Items/Currency/CurrencyModValues";
    const wisdomId = "Metadata/Items/Currency/CurrencyIdentification";
    const portalId = "Metadata/Items/Currency/CurrencyPortal";
    const snapshot = (marketId: string, at: number, volumeTraded: Record<string, number>) => ({
        realm: "pc",
        league: "Exchange",
        marketId,
        hour: at,
        volumeTraded,
        lowestRatio: null,
        highestRatio: null,
        lowestStock: null,
        highestStock: null,
    });
    await upsertStashCurrencyHourly(db as unknown as TDatabase, [
        snapshot(`${divineId}|${chaosId}`, hour, { [divineId]: 10, [chaosId]: 2000 }),
        // Without trades in the latest completed hour, the newest traded day prices the pair.
        snapshot(`${wisdomId}|${chaosId}`, hour, { [wisdomId]: 0, [chaosId]: 0 }),
        snapshot(`${wisdomId}|${chaosId}`, hour - 7200, { [wisdomId]: 500, [chaosId]: 1 }),
        snapshot(`${wisdomId}|${chaosId}`, hour - 90000, { [wisdomId]: 1, [chaosId]: 1 }),
        // Listed but untraded items still come from the exchange, without a price.
        snapshot(`${portalId}|${chaosId}`, hour, { [portalId]: 0, [chaosId]: 0 }),
    ]);
    await db.insert(market).values([
        observation({ league: "Exchange", itemKey: "Example" }),
        ...["Scroll of Wisdom", "Portal Scroll"].map((name) =>
            observation({
                league: "Exchange",
                itemKey: name,
                name: "",
                baseType: name,
                frameType: 5,
            }),
        ),
    ]);
    const result = await marketData(
        db as unknown as TDatabase,
        marketFiltersSchema.parse({ league: "Exchange" }),
        "list",
    );
    expect(result.rows.map((row) => row.itemKey)).toEqual(["Example"]);
    // Dearest first. Volumes are chaos per hour since the league's first exchange hour (26 hours).
    expect(result.exchange).toEqual([
        expect.objectContaining({
            name: "Divine Orb",
            price: 200,
            current: true,
            volume: expect.closeTo((10 * 200) / 26, 9),
            pair: { quoteId: chaosId, name: "Chaos Orb", rate: 200 },
        }),
        expect.objectContaining({ name: "Chaos Orb", category: "currency", price: 1 }),
        expect.objectContaining({
            name: "Scroll of Wisdom",
            price: 0.002,
            current: false,
            hour: hour - 7200,
        }),
        expect.objectContaining({ name: "Portal Scroll", price: null, volume: null, hour: null }),
    ]);
    const searched = await marketData(
        db as unknown as TDatabase,
        marketFiltersSchema.parse({ league: "Exchange", q: "wisdom", category: "currency" }),
        "list",
    );
    expect(searched.exchange.map((row) => row.name)).toEqual(["Scroll of Wisdom"]);
});

it("lists exchange-only PoE 2 leagues in exalted, from the latest completed hour first", async () => {
    const chaosId = "Metadata/Items/Currency/CurrencyRerollRare";
    const divineId = "Metadata/Items/Currency/CurrencyModValues";
    const exaltedId = "Metadata/Items/Currency/CurrencyAddModToRare";
    const runeId = "Metadata/Items/SoulCores/RuneFire";
    const transmuteId = "Metadata/Items/Currency/CurrencyUpgradeToMagic";
    const snapshot = (marketId: string, at: number, volumeTraded: Record<string, number>) => ({
        realm: "poe2",
        league: "Forbidden Rites",
        marketId,
        hour: at,
        volumeTraded,
        lowestRatio: null,
        highestRatio: null,
        lowestStock: null,
        highestStock: null,
    });
    await upsertStashCurrencyHourly(db as unknown as TDatabase, [
        snapshot(`${divineId}|${exaltedId}`, hour, { [divineId]: 2, [exaltedId]: 800 }),
        // After the latest completed hour, so unused.
        snapshot(`${divineId}|${exaltedId}`, hour + 3600, { [divineId]: 1, [exaltedId]: 999 }),
        snapshot(`${chaosId}|${exaltedId}`, hour - 3600, { [chaosId]: 10, [exaltedId]: 5 }),
        snapshot(`${chaosId}|${exaltedId}`, hour, { [chaosId]: 0, [exaltedId]: 0 }),
        // Without an exalted pair, the rune converts through divine.
        snapshot(`${runeId}|${divineId}`, hour, { [runeId]: 10, [divineId]: 1 }),
        // Not traded against the rune, so its item page does not read this market.
        snapshot(`${transmuteId}|${exaltedId}`, hour, { [transmuteId]: 10, [exaltedId]: 1 }),
        // A public league trading in the same hour, with fewer snapshots.
        {
            ...snapshot(`${divineId}|${exaltedId}`, hour, { [divineId]: 1, [exaltedId]: 50 }),
            league: "Standard",
        },
        // A private league with the most snapshots, which is never listed.
        ...[
            hour - 7200,
            hour - 3600,
            hour,
            hour - 10800,
            hour - 14400,
            hour - 18000,
            hour - 21600,
        ].map((at) => ({
            ...snapshot(`${divineId}|${exaltedId}`, at, { [divineId]: 1, [exaltedId]: 50 }),
            league: "Chiba league (PL87141)",
        })),
    ]);
    const filters = { league: "", q: "", days: "7", category: "all" } as const;
    const result = await getPoe2MarketExchange(db as unknown as TDatabase, filters);
    expect(result.seasons.slice(0, 2)).toEqual([
        { league: "Forbidden Rites", firstHour: hour - 3600, latestHour: hour },
        { league: "Standard", firstHour: hour, latestHour: hour },
    ]);
    expect(result.seasons.some((season) => season.league.endsWith("(PL87141)"))).toBe(false);
    expect(result.filters.league).toBe("Forbidden Rites");
    const privateLeague = await getPoe2MarketExchange(db as unknown as TDatabase, {
        ...filters,
        league: "Chiba league (PL87141)",
    });
    expect(privateLeague).toMatchObject({ season: undefined, rows: [] });
    const rites = await getPoe2MarketExchange(db as unknown as TDatabase, {
        ...filters,
        league: "Forbidden Rites",
    });
    expect(rites).toMatchObject({ unit: "exalted", divine: 400 });
    // Dearest first.
    expect(rites.rows).toEqual([
        expect.objectContaining({ name: "Divine Orb", category: "currency", price: 400, hour }),
        expect.objectContaining({
            name: "Desert Rune",
            category: "runes",
            price: 40,
            current: true,
            via: { itemId: divineId, name: "Divine Orb" },
        }),
        expect.objectContaining({ name: "Exalted Orb", price: 1, current: true }),
        expect.objectContaining({
            name: "Chaos Orb",
            price: 0.5,
            hour: hour - 3600,
            current: false,
        }),
        expect.objectContaining({ itemId: transmuteId, price: 0.1 }),
    ]);
    const runes = await getPoe2MarketExchange(db as unknown as TDatabase, {
        ...filters,
        league: "Forbidden Rites",
        category: "runes",
        q: "desert",
    });
    expect(runes.rows.map((row) => row.name)).toEqual(["Desert Rune"]);
    // The PoE 1 market operation prices a poe2 realm's exchange in exalted too, without chaos rates.
    const legacy = await marketData(
        db as unknown as TDatabase,
        marketFiltersSchema.parse({ realm: "poe2", league: "Forbidden Rites" }),
        "list",
    );
    expect(legacy).toMatchObject({ exchangeUnit: "exalted", rows: [], chaosRates: {} });
    const item = await getMarketExchangeItem(db as unknown as TDatabase, {
        realm: "poe2",
        league: "Forbidden Rites",
        days: "7",
        itemId: runeId,
    });
    expect(item).toMatchObject({ unit: "exalted", divine: 400, item: { price: 40 } });
    expect(item.history.prices).toEqual([
        { hour, price: 40, low: null, high: null, via: divineId, units: 10 },
    ]);
    // Divine Orb trades against exalted itself, which must not pull in every exalted market.
    statements.length = 0;
    const divineItem = await getMarketExchangeItem(db as unknown as TDatabase, {
        realm: "poe2",
        league: "Forbidden Rites",
        days: "7",
        itemId: divineId,
    });
    expect(divineItem.item).toMatchObject({ price: 400, current: true });
    expect(
        statements.filter(({ params }) => params.includes(`${transmuteId}|${exaltedId}`)),
    ).toEqual([]);
});

it("retains old exchange identities without treating future-only markets as listed", async () => {
    const chaosId = "Metadata/Items/Currency/CurrencyRerollRare";
    const scourId = "Metadata/Items/Currency/CurrencyConvertToNormal";
    const alchemyId = "Metadata/Items/Currency/CurrencyUpgradeToRare";
    await upsertStashCurrencyHourly(db as unknown as TDatabase, [
        {
            realm: "pc",
            league: "IdentityLifetime",
            marketId: `${scourId}|${chaosId}`,
            hour: hour - 90000,
            volumeTraded: { [scourId]: 1, [chaosId]: 10 },
        },
        {
            realm: "pc",
            league: "IdentityLifetime",
            marketId: `${alchemyId}|${chaosId}`,
            hour: hour + 3600,
            volumeTraded: { [alchemyId]: 1, [chaosId]: 5 },
        },
    ]);
    await db.insert(market).values(
        ["Orb of Scouring", "Orb of Alchemy"].map((name) =>
            observation({
                league: "IdentityLifetime",
                itemKey: name,
                name: "",
                baseType: name,
                frameType: 5,
            }),
        ),
    );
    const result = await marketData(
        db as unknown as TDatabase,
        marketFiltersSchema.parse({ league: "IdentityLifetime" }),
        "list",
    );
    expect(result.rows.map((row) => row.itemKey)).toEqual(["Orb of Alchemy"]);
    expect(result.exchange).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                name: "Orb of Scouring",
                price: 10,
                hour: hour - 90000,
                current: false,
            }),
        ]),
    );
    expect(result.exchange.some((row) => row.name === "Orb of Alchemy")).toBe(false);
});

it("reads one exchange item's list row and hourly history through every pair", async () => {
    const chaosId = "Metadata/Items/Currency/CurrencyRerollRare";
    const divineId = "Metadata/Items/Currency/CurrencyModValues";
    const taintedId = "Metadata/Items/Currency/CurrencyHellscapeAddModToRare";
    const teardropId = "Metadata/Items/Currency/CurrencyHellscapeUpgradeModTier";
    const otherId = "Metadata/Items/Currency/CurrencyPortal";
    const snapshot = (marketId: string, at: number, volumeTraded: Record<string, number>) => ({
        realm: "pc",
        league: "ExchangeItem",
        marketId,
        hour: at,
        volumeTraded,
        lowestRatio: null,
        highestRatio: null,
        lowestStock: null,
        highestStock: null,
    });
    const yesterday = hour - 86400;
    await upsertStashCurrencyHourly(db as unknown as TDatabase, [
        // Before the 7-day period, so outside the history.
        snapshot(`${teardropId}|${taintedId}`, hour - 7 * 86400, {
            [teardropId]: 1,
            [taintedId]: 1,
        }),
        snapshot(`${teardropId}|${taintedId}`, yesterday, { [teardropId]: 6, [taintedId]: 12 }),
        snapshot(`${taintedId}|${chaosId}`, yesterday, { [taintedId]: 1, [chaosId]: 300 }),
        {
            ...snapshot(`${teardropId}|${taintedId}`, hour, { [teardropId]: 4, [taintedId]: 4 }),
            lowestRatio: { [teardropId]: 1, [taintedId]: 0.9 },
            highestRatio: { [teardropId]: 1, [taintedId]: 1.2 },
        },
        snapshot(`${taintedId}|${chaosId}`, hour, { [taintedId]: 1, [chaosId]: 320 }),
        snapshot(`${divineId}|${chaosId}`, hour, { [divineId]: 1, [chaosId]: 160 }),
        // Unrelated markets are not read.
        snapshot(`${otherId}|${chaosId}`, hour, { [otherId]: 10, [chaosId]: 1 }),
    ]);
    statements.length = 0;
    const result = await getMarketExchangeItem(db as unknown as TDatabase, {
        realm: "pc",
        league: "ExchangeItem",
        days: "7",
        itemId: teardropId,
    });
    expect(result).toMatchObject({
        league: "ExchangeItem",
        latestHour: hour,
        historyStart: hour - 7 * 86400 + 3600,
        unit: "chaos",
        divine: 160,
        item: {
            name: "Tainted Divine Teardrop",
            price: 320,
            current: true,
            via: { itemId: taintedId, name: "Tainted Exalted Orb" },
            pair: { quoteId: taintedId, name: "Tainted Exalted Orb", rate: 1 },
        },
        history: {
            prices: [
                {
                    hour: yesterday,
                    price: 600,
                    low: null,
                    high: null,
                    via: taintedId,
                    units: 6,
                },
                { hour, price: 320, low: 288, high: 384, via: taintedId, units: 4 },
            ],
            pairs: [
                {
                    quoteId: taintedId,
                    hours: [
                        { hour: yesterday, rate: 2, low: null, high: null, units: 6 },
                        { hour, rate: 1, low: 0.9, high: 1.2, units: 4 },
                    ],
                },
            ],
        },
    });
    expect(result.item?.history.slice(-2)).toEqual([600, 320]);
    expect(statements.filter(({ params }) => params.includes(`${otherId}|${chaosId}`))).toEqual([]);
    const unknown = await getMarketExchangeItem(db as unknown as TDatabase, {
        realm: "pc",
        league: "ExchangeItem",
        days: "7",
        itemId: "Metadata/Items/Unknown",
    });
    expect(unknown.item).toBeNull();
});

it("orders names in both directions and uses the latest observation for recency", async () => {
    await db
        .insert(market)
        .values([
            observation({ league: "Ordering", itemKey: "Alpha", hour: hour - 3600 }),
            observation({ league: "Ordering", itemKey: "Beta", hour: hour - 7200 }),
            observation({ league: "Ordering", itemKey: "Gamma", hour }),
        ]);
    for (const [order, expected] of [
        ["name-asc", ["Alpha", "Beta", "Gamma"]],
        ["name-desc", ["Gamma", "Beta", "Alpha"]],
        ["newest", ["Gamma", "Alpha", "Beta"]],
    ] as const) {
        const result = await marketData(
            db as unknown as TDatabase,
            marketFiltersSchema.parse({ league: "Ordering", order }),
        );
        expect(result.rows.map((row) => row.itemKey)).toEqual(expected);
    }
});

it("lists each crafting base cohort's latest hour in the period, preferring the current revision", async () => {
    const { revision } = marketBasesSchema.parse(marketBases);
    const cohort = (
        cohortId: string,
        at: number,
        listingCount: number,
        rowRevision = revision,
    ) => ({
        realm: "pc",
        league: "Bases",
        hour: at,
        revision: rowRevision,
        cohortId,
        listingCount,
        uniqueSellers: listingCount,
        unknownCount: 0,
        prices: {
            chaos: {
                count: listingCount,
                sellers: listingCount,
                min: 10,
                median: 10 * listingCount,
                max: 100,
                confidence: 0.5,
            },
        },
        confidenceMethod: "asking-sellers-coverage-v1",
        firstSeenAt: null,
        lastSeenAt: null,
    });
    await db.insert(market).values(observation({ league: "Bases" }));
    await db
        .insert(tStashCohortHourly)
        .values([
            cohort("base:titan-plate:86-100:6-link", hour - 3600, 1),
            cohort("base:titan-plate:86-100:6-link", hour, 3),
            cohort("base:titan-plate:86-100:6-link", hour, 9, "previous-revision"),
            cohort("base:titan-plate:86-100:any-links:q30", hour - 7200, 2),
            cohort("base:titan-plate:86-100:1-5-link", hour - 10 * 86400, 5),
            cohort("base:titan-plate:1-2:any-links", hour, 4),
            cohort("base:titan-plate:86-100:any-links", hour, 6),
        ]);
    const result = await marketData(
        db as unknown as TDatabase,
        marketFiltersSchema.parse({ league: "Bases", category: "armour-bases", currency: "chaos" }),
        "list",
    );
    expect(result.rows).toEqual([]);
    expect(result.exchange).toEqual([]);
    expect(
        result.bases.map((row) => [row.id, row.hour, row.listingCount, row.prices.chaos?.median]),
    ).toEqual([
        ["base:titan-plate:86-100:6-link", hour, 3, 30],
        ["base:titan-plate:86-100:any-links:q30", hour - 7200, 2, 20],
    ]);
    const weapons = await marketData(
        db as unknown as TDatabase,
        marketFiltersSchema.parse({ league: "Bases", category: "weapon-bases" }),
        "list",
    );
    expect(weapons.bases).toEqual([]);
    const unique = await marketData(
        db as unknown as TDatabase,
        marketFiltersSchema.parse({ league: "Bases", category: "accessories" }),
        "list",
    );
    expect(unique.bases).toEqual([]);
    expect(unique.rows.map((row) => row.itemKey)).toEqual(["Example"]);
});

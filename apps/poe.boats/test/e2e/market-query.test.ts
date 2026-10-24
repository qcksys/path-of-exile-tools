import { fileURLToPath } from "node:url";
import { MySqlContainer, type StartedMySqlContainer } from "@testcontainers/mysql";
import { sql } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { type Connection, createConnection, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import type { TDatabase } from "~/db/client";
import { getMarketData } from "~/db/queries/market.queries";
import {
    tStashUniqueHourly as market,
    type TStashUniqueHourlyI,
} from "~/db/schema/stash.unique-hourly";
import { marketFiltersSchema } from "~/schemas/market";

const hour = 1_792_836_000;
let container: StartedMySqlContainer;
let connection: Connection;
let db: MySql2Database;
const statements: Array<{ sql: string; params: unknown[] }> = [];

beforeAll(async () => {
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
});

it("discovers season boundaries without scanning every hourly observation", async () => {
    statements.length = 0;
    const result = await getMarketData(
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
    const result = await getMarketData(
        db as unknown as TDatabase,
        marketFiltersSchema.parse({ league: "Current" }),
    );
    expect(result.rows).toHaveLength(20);
    expect(result.rows.every((row) => row.hour === hour && row.rank === 1)).toBe(true);
    const query = statements[1]!;
    const [plan] = await connection.query<RowDataPacket[]>(`EXPLAIN ${query.sql}`, query.params);
    expect(
        plan.some(
            (row) => row.type === "eq_ref" && row.key === "PRIMARY" && Number(row.rows) === 1,
        ),
    ).toBe(true);
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
        { foilVariation: 1 },
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
            observation({ hour: hour - 7 * 86400, likelySales: 100 }),
            observation({ itemKey: "Empty", hour: hour - 3600, listingCount: 0 }),
            observation({ itemKey: "Empty", listingCount: 0 }),
        ]);
    const filters = marketFiltersSchema.parse({ league: "Variants", item: "Example" });
    const result = await getMarketData(db as unknown as TDatabase, filters);
    expect(result.rows).toHaveLength(7);
    const examples = result.rows.filter((row) => row.itemKey === "Example");
    expect(examples).toHaveLength(6);
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
    const searched = await getMarketData(db as unknown as TDatabase, { ...filters, q: "Older" });
    expect(searched.rows).toHaveLength(6);
    expect(searched.rows.every((row) => row.hour === hour - 7200 && row.periodSales === 3)).toBe(
        true,
    );
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
    const first = await getMarketData(db as unknown as TDatabase, filters);
    const second = await getMarketData(db as unknown as TDatabase, { ...filters, page: 2 });
    expect(first.rows.map((row) => row.itemKey)).toEqual(
        expected.slice(0, 50).map((row) => row.itemKey),
    );
    expect(second.rows.map((row) => row.itemKey)).toEqual(
        expected.slice(50).map((row) => row.itemKey),
    );
    expect(first.hasMore).toBe(true);
    expect(second.hasMore).toBe(false);
});

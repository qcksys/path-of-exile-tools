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
        observation({
            league: "Categories",
            itemKey: "Rare boots",
            baseType: "Goathide Boots",
            frameType: 2,
        }),
        observation({ league: "Categories", itemKey: "Unknown", baseType: "Future base" }),
    ]);
    const filters = marketFiltersSchema.parse({
        league: "Categories",
        category: "armour",
        rarity: "unique",
        identification: "true",
        corruption: "false",
        q: "Goathide",
    });
    const result = await getMarketData(db as unknown as TDatabase, filters);
    expect(result.rows.map((row) => [row.itemKey, row.category])).toEqual([
        ["Abberath's Hooves", "armour"],
    ]);
    expect(result.hasMore).toBe(false);
    const other = await getMarketData(
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
    const first = await getMarketData(db as unknown as TDatabase, filters);
    const second = await getMarketData(db as unknown as TDatabase, { ...filters, page: 2 });
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
    const descending = await getMarketData(db as unknown as TDatabase, {
        ...filters,
        order: "price-desc",
    });
    expect(descending.rows[0]?.itemKey).toBe("Item 54");
    const chaos = await getMarketData(db as unknown as TDatabase, {
        ...filters,
        currency: "chaos",
    });
    expect(chaos.rows[0]?.itemKey).toBe("Chaos only");
});

it("keeps item history independent of browsing filters and skips the list query for detail routes", async () => {
    statements.length = 0;
    const result = await getMarketData(
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
    expect(statements).toHaveLength(2);
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
        const result = await getMarketData(
            db as unknown as TDatabase,
            marketFiltersSchema.parse({ league: "Ordering", order }),
        );
        expect(result.rows.map((row) => row.itemKey)).toEqual(expected);
    }
});

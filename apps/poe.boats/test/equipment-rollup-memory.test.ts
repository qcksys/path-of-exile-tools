import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { equipmentHourly } from "../../../packages/poe-stash-ingest/src/ps/equipment-rollup";
import { type DbHandle, openDb } from "../../../packages/poe-stash-ingest/src/shared/db";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth.ts", () => ({ REALM: undefined }));
const HOUR = 1_792_681_200;
let db: DbHandle;
beforeEach(async () => {
    db = await openDb(":memory:");
});
afterEach(async () => {
    await db.close();
});

async function mark(revision: string, league = "Standard", cohort = "base", hour = HOUR) {
    await db.conn.run(
        "INSERT INTO ps_equipment_cohort_hour VALUES ($1, $2, $3, $4, current_timestamp) ON CONFLICT DO NOTHING",
        [revision, league, hour, cohort],
    );
}

async function observe({
    revision = "complete",
    league = "Standard",
    offset = 0,
    id = "item",
    matches = ["base"],
    unknown = [],
    price = 10,
    currency = "chaos",
}: {
    revision?: string;
    league?: string;
    offset?: number;
    id?: string;
    matches?: string[];
    unknown?: string[];
    price?: number | null;
    currency?: string | null;
} = {}) {
    const observed = HOUR - offset * 3600;
    await db.conn.run(
        `INSERT INTO ps_equipment_hour VALUES
        ($1, $2, 'stash', $3, $4, $5::JSON, $6::JSON, $7, $8, to_timestamp($9 + 60), $9)`,
        [
            league,
            id,
            league,
            revision,
            JSON.stringify(matches),
            JSON.stringify(unknown),
            price,
            currency,
            observed,
        ],
    );
}

it("uses complete revision and league pairs without filling their gaps from other histories", async () => {
    for (let offset = 0; offset < 24; offset++) {
        await observe({ offset });
        await observe({ revision: "new", league: offset < 3 ? "Standard" : "Other", offset });
        await mark("markers-only", "Standard", "base", HOUR - offset * 3600);
    }
    await mark("complete");
    await mark("new");
    await mark("new", "Other");
    const standard = await equipmentHourly(db.conn, HOUR, "Standard");
    const other = await equipmentHourly(db.conn, HOUR, "Other");
    const all = await equipmentHourly(db.conn, HOUR, null);
    expect(all).toEqual(
        [...standard, ...other].sort(
            (a, b) =>
                a.revision.localeCompare(b.revision) ||
                a.league.localeCompare(b.league) ||
                a.cohortId.localeCompare(b.cohortId),
        ),
    );
    expect(
        standard.find((row) => row.revision === "complete")?.prices.chaos?.windows,
    ).toMatchObject({
        6: { count: 1, median: 10, sellers: 1 },
        24: { count: 1, median: 10, sellers: 1 },
    });
    expect(standard.find((row) => row.revision === "new")?.prices.chaos?.windows).toBeUndefined();
    expect(standard.find((row) => row.revision === "markers-only")).toMatchObject({
        listingCount: 0,
        uniqueSellers: 0,
        unknownCount: 0,
        prices: {},
        firstSeenAt: null,
        lastSeenAt: null,
    });
    expect(other).toMatchObject([{ revision: "new", listingCount: 0, prices: {} }]);
});

it("counts unknown and empty source hours as coverage without reviving their older matches", async () => {
    for (let offset = 0; offset < 6; offset++) {
        await observe({
            offset,
            matches: offset === 0 ? ["base"] : [],
            unknown: offset === 5 ? ["base"] : [],
        });
    }
    await mark("complete");
    const [row] = await equipmentHourly(db.conn, HOUR, "Standard");
    expect(row?.prices.chaos?.windows).toMatchObject({
        6: { count: 1, sellers: 1, median: 10, unknownCount: 0 },
    });
    expect(row?.prices.chaos?.windows?.[24]).toBeUndefined();
    await observe({ id: "left", offset: 5, price: 1 });
    await observe({ id: "left", matches: [], price: 1 });
    expect(
        (await equipmentHourly(db.conn, HOUR, "Standard"))[0]?.prices.chaos?.windows?.[6],
    ).toMatchObject({
        count: 1,
        median: 10,
        listingCount: 1,
    });
});

it("keeps only current currencies and latest prices while emitting explicit empty cohorts", async () => {
    for (let offset = 0; offset < 6; offset++) {
        await observe({
            offset,
            currency: offset === 0 ? "divine" : "chaos",
            price: offset === 0 ? 2 : 200,
        });
        await observe({
            offset,
            id: "unpriced",
            price: offset === 0 ? null : 100,
            currency: offset === 0 ? null : "chaos",
        });
    }
    await mark("complete");
    await mark("complete", "Standard", "cleared");
    const [row, cleared] = await equipmentHourly(db.conn, HOUR, "Standard");
    expect(Object.keys(row!.prices)).toEqual(["divine"]);
    expect(row).toMatchObject({
        listingCount: 2,
        uniqueSellers: 1,
        prices: {
            divine: {
                count: 1,
                median: 2,
                windows: { 6: { count: 1, sellers: 1, median: 2, listingCount: 2 } },
            },
        },
    });
    expect(cleared).toMatchObject({
        listingCount: 0,
        unknownCount: 0,
        prices: {},
        firstSeenAt: null,
        lastSeenAt: null,
    });
});

it("rolls up a large incomplete history within bounded memory alongside a complete history", async () => {
    const cohorts = Array.from({ length: 100 }, (_, index) => `cohort-${index}`);
    await db.conn.run(
        `INSERT INTO ps_equipment_hour
        SELECT 'seller-' || (i % 50), 'item-' || i, 'stash', 'Standard', 'new',
            $1::JSON, '[]'::JSON, 10, 'chaos', to_timestamp($2 - h * 3600 + 60), $2 - h * 3600
        FROM range(20000) items(i), range(3) hours(h)`,
        [JSON.stringify(cohorts), HOUR],
    );
    for (const cohort of cohorts) await mark("new", "Standard", cohort);
    for (let offset = 0; offset < 24; offset++) await observe({ offset });
    await mark("complete");
    const expected = await equipmentHourly(db.conn, HOUR, "Standard");
    await db.conn.run("SET memory_limit = '128MB'");
    const actual = await equipmentHourly(db.conn, HOUR, "Standard");
    expect(actual).toEqual(expected);
    expect(actual).toHaveLength(101);
    expect(
        actual.find((row) => row.revision === "complete")?.prices.chaos?.windows?.[24],
    ).toMatchObject({ count: 1, median: 10 });
    for (const row of actual.filter((row) => row.revision === "new")) {
        expect(row).toMatchObject({
            listingCount: 20000,
            uniqueSellers: 50,
            prices: { chaos: { count: 20000, sellers: 50, median: 10 } },
        });
        expect(row.prices.chaos?.windows).toBeUndefined();
    }
});

// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve upstream field names.
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { applyStashChanges } from "../../../packages/poe-stash-ingest/src/ps/ingest";
import { type DbHandle, openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth", () => ({ REALM: undefined }));

type Changes = Parameters<typeof applyStashChanges>[1];
const HOUR = Date.UTC(2026, 9, 28, 10) / 1000;
const at = (minute: number) => new Date((HOUR + minute * 60) * 1000);
const item = (name: string, note: string) => ({
    id: "unique-1",
    verified: true,
    w: 2,
    h: 1,
    icon: `https://web.poecdn.com/gen/image/${Buffer.from(
        JSON.stringify([25, 14, { f: `2DItems/${name}` }]),
    ).toString("base64url")}/x/y.png`,
    name,
    typeLine: "Leather Belt",
    baseType: "Leather Belt",
    frameType: 3,
    identified: true,
    ilvl: 86,
    note,
});
const stash = (...items: ReturnType<typeof item>[]) =>
    [
        {
            id: "stash-1",
            public: true,
            accountName: "seller",
            league: "Standard",
            stashType: "TradeStash",
            items,
        },
    ] as unknown as Changes;

const listing = async (conn: DbHandle["conn"]) =>
    (
        await queryAll<{ rowId: string; itemKey: string; price: number; active: boolean }>(
            conn,
            `SELECT rowid::VARCHAR AS "rowId", item_key AS "itemKey", price_amount AS price,
                removed_at IS NULL AS active
            FROM ps_listing WHERE item_id = 'unique-1'`,
        )
    )[0];

let db: DbHandle;
beforeEach(async () => {
    db = await openDb(":memory:");
});
afterEach(async () => {
    await db.close();
});

it("updates a re-sent listing in place when its item key and icon are unchanged", async () => {
    await applyStashChanges(db.conn, stash(item("Headhunter", "~price 10 divine")), at(5));
    const before = await listing(db.conn);

    // DuckDB rewrites a row whose indexed columns are set, so every re-sent stash would leave a
    // dead copy of each of its listings behind.
    await applyStashChanges(db.conn, stash(item("Headhunter", "~price 12 divine")), at(10));
    expect(await listing(db.conn)).toEqual({ ...before, price: 12 });
});

it("moves a listing whose item key changed to its new key", async () => {
    await applyStashChanges(db.conn, stash(item("Headhunter", "~price 10 divine")), at(5));
    await applyStashChanges(db.conn, stash(item("Mageblood", "~price 90 divine")), at(10));
    expect(await listing(db.conn)).toMatchObject({ itemKey: "Mageblood", price: 90, active: true });
    expect(
        await queryAll(
            db.conn,
            "SELECT count(*)::INT AS n FROM ps_listing WHERE item_id = 'unique-1'",
        ),
    ).toEqual([{ n: 1 }]);
});

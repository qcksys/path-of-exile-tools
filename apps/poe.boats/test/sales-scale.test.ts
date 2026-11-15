import { expect, it } from "vite-plus/test";
import { recordRemovals } from "../../../packages/poe-stash-ingest/src/ps/sales";
import {
    openDb,
    queryAll,
    withTransaction,
} from "../../../packages/poe-stash-ingest/src/shared/db";

it("prices one removal within a bounded budget despite unrelated live listings", async () => {
    const db = await openDb(":memory:");
    try {
        await db.conn.run("SET memory_limit='128MB'");
        await db.conn.run("SET max_temp_directory_size='0B'");
        await withTransaction(db.conn, async () => {
            await db.conn.run(`INSERT INTO ps_listing BY NAME
                SELECT 'account-' || i AS account_name, 'stash-' || i AS stash_id,
                    'item-' || i AS item_id, 'Standard' AS league,
                    'common-item' AS item_key, true AS identified, 3 AS frame_type,
                    'Common Item' AS type_line, 'Common Item' AS base_type,
                    10.0 AS price_amount, 'chaos' AS price_currency,
                    '' AS signature_value, '{}'::JSON AS raw_item,
                    current_timestamp AS first_seen_at, current_timestamp AS last_seen_at,
                    CASE WHEN i = 0 THEN current_timestamp ELSE NULL END AS removed_at
                FROM range(4000) t(i)`);
            await db.conn.run(
                "INSERT INTO pipeline_health VALUES (1, current_timestamp, true, current_timestamp)",
            );
            await recordRemovals(db.conn, [
                { stashId: "stash-0", withdrawn: false },
                { stashId: "stash-with-no-removals", withdrawn: true },
            ]);
        });
        expect(
            await queryAll(
                db.conn,
                `SELECT item_id, status, market_price,
                market_sellers::INTEGER AS market_sellers FROM ps_sale`,
            ),
        ).toEqual([
            { item_id: "item-0", status: "pending", market_price: 10, market_sellers: 3999 },
        ]);
    } finally {
        await db.close();
    }
}, 20_000);

it("prices a removal only from other sellers' active, priced listings seen within a day", async () => {
    const db = await openDb(":memory:");
    try {
        await withTransaction(db.conn, async () => {
            // item-0 is the removal. Sellers 1, 2, 3 and 8 count; the rest are each left out once.
            await db.conn.run(`INSERT INTO ps_listing BY NAME
                SELECT 'account-' || i AS account_name, 'stash-' || i AS stash_id,
                    'item-' || i AS item_id, 'Standard' AS league,
                    'common-item' AS item_key, true AS identified, 3 AS frame_type,
                    'Common Item' AS type_line, 'Common Item' AS base_type,
                    CASE i WHEN 5 THEN 0 ELSE 10.0 + i END AS price_amount,
                    CASE i WHEN 6 THEN 'divine' ELSE 'chaos' END AS price_currency,
                    '' AS signature_value, '{}'::JSON AS raw_item,
                    current_timestamp AS first_seen_at,
                    CASE i WHEN 7 THEN current_timestamp - INTERVAL 25 HOUR
                        ELSE current_timestamp END AS last_seen_at,
                    CASE WHEN i IN (0, 4) THEN current_timestamp END AS removed_at
                FROM range(9) t(i)
                UNION ALL BY NAME
                SELECT 'Account-0' AS account_name, 'stash-own' AS stash_id,
                    'item-own' AS item_id, 'Standard' AS league,
                    'common-item' AS item_key, true AS identified, 3 AS frame_type,
                    'Common Item' AS type_line, 'Common Item' AS base_type,
                    1000.0 AS price_amount, 'chaos' AS price_currency,
                    '' AS signature_value, '{}'::JSON AS raw_item,
                    current_timestamp AS first_seen_at, current_timestamp AS last_seen_at,
                    NULL AS removed_at`);
            await db.conn.run(
                "INSERT INTO pipeline_health VALUES (1, current_timestamp, true, current_timestamp)",
            );
            await recordRemovals(db.conn, [{ stashId: "stash-0", withdrawn: false }]);
        });
        expect(
            await queryAll(
                db.conn,
                `SELECT market_price AS "marketPrice", market_sellers::INTEGER AS "marketSellers"
                FROM ps_sale`,
            ),
        ).toEqual([{ marketPrice: 12.5, marketSellers: 4 }]);
    } finally {
        await db.close();
    }
});

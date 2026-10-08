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
            await db.conn.run("INSERT INTO pipeline_health VALUES (1, current_timestamp, true)");
            await recordRemovals(db.conn, "stash-0", false);
            await recordRemovals(db.conn, "stash-with-no-removals", true);
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

import { isYellowBeast, yellowBeastNames } from "@poe-tools/market";
import { expect, it } from "vite-plus/test";
import { recordRemovals } from "../../../packages/poe-stash-ingest/src/ps/sales";
import {
    openDb,
    queryAll,
    withTransaction,
} from "../../../packages/poe-stash-ingest/src/shared/db";

it("compares a yellow beast sale with listings of every yellow species", async () => {
    const redBeast = "Vivid Vulture";
    expect(isYellowBeast(redBeast)).toBe(false);
    const [sold, ...peers] = yellowBeastNames.slice(0, 4);
    const listings = [
        { id: "sold", species: sold!, price: 10, removed: true },
        ...peers.map((species, index) => ({
            id: `peer-${index}`,
            species,
            price: 8 + index * 2,
            removed: false,
        })),
        { id: "red", species: redBeast, price: 10, removed: true },
    ];
    const db = await openDb(":memory:");
    try {
        await withTransaction(db.conn, async () => {
            for (const listing of listings)
                await db.conn.run(
                    `INSERT INTO ps_listing BY NAME SELECT
                        'account-' || $1 AS account_name, 'stash-' || $1 AS stash_id,
                        'item-' || $1 AS item_id, 'Standard' AS league, $2 AS item_key,
                        true AS identified, 2 AS frame_type, $2 AS type_line, $2 AS base_type,
                        $3::DOUBLE AS price_amount, 'chaos' AS price_currency,
                        '' AS signature_value, '{"kind":"beast"}'::JSON AS mod_signature,
                        '{}'::JSON AS raw_item, current_timestamp AS first_seen_at,
                        current_timestamp AS last_seen_at,
                        CASE WHEN $4 THEN current_timestamp END AS removed_at`,
                    [listing.id, listing.species, listing.price, listing.removed],
                );
            await db.conn.run(
                "INSERT INTO pipeline_health VALUES (1, current_timestamp, true, current_timestamp)",
            );
            await recordRemovals(db.conn, [
                { stashId: "stash-sold", withdrawn: false },
                { stashId: "stash-red", withdrawn: false },
            ]);
        });
        expect(
            await queryAll(
                db.conn,
                `SELECT item_key, market_price, market_sellers::INTEGER AS market_sellers
                FROM ps_sale ORDER BY item_id`,
            ),
        ).toEqual([
            { item_key: redBeast, market_price: null, market_sellers: 0 },
            { item_key: sold, market_price: 10, market_sellers: 3 },
        ]);
    } finally {
        await db.close();
    }
});

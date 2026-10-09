import type { DuckDBConnection } from "@duckdb/node-api";
import { withTransaction } from "#src/shared/db.ts";

export const SALE_POLICY = {
    graceSeconds: 3600,
    maxPollGapSeconds: 300,
    marketWindowSeconds: 86400,
    minimumSellers: 3,
    minimumPriceRatio: 0.75,
    maximumPriceRatio: 1.25,
} as const;

export async function recordRemovals(
    conn: DuckDBConnection,
    stashId: string,
    withdrawn: boolean,
): Promise<void> {
    if (withdrawn) {
        await conn.run(
            "UPDATE ps_sale SET status = 'withdrawn', updated_at = current_timestamp WHERE stash_id = $1 AND status = 'pending'",
            [stashId],
        );
    }
    await conn.run(
        `INSERT INTO ps_sale BY NAME
         WITH removed AS MATERIALIZED (
             SELECT * FROM ps_listing
             WHERE stash_id = $1 AND removed_at = current_timestamp
         )
         SELECT l.* EXCLUDE (raw_item),
            CASE WHEN $2 THEN 'withdrawn'
                WHEN NOT EXISTS (SELECT 1 FROM pipeline_health WHERE id = 1 AND caught_up
                    AND last_poll_at >= current_timestamp - INTERVAL ${SALE_POLICY.maxPollGapSeconds} SECOND)
                    THEN 'unobserved'
                ELSE 'pending' END AS status,
            NULL::TIMESTAMP AS eligible_since, m.price AS market_price,
            m.sellers AS market_sellers, current_timestamp::TIMESTAMP AS updated_at
         FROM removed l
         LEFT JOIN LATERAL (
             SELECT median(seller_price) AS price, count(*) AS sellers FROM (
                 SELECT lower(p.account_name), median(p.price_amount) AS seller_price
                 FROM ps_listing p
                 WHERE p.league = l.league AND p.item_key = l.item_key
                     AND p.identified = l.identified AND p.corrupted = l.corrupted
                     AND coalesce(p.foil_variation, -1) = coalesce(l.foil_variation, -1)
                     AND p.signature_value = l.signature_value
                     AND coalesce(p.mod_signature->>'kind', '') = coalesce(l.mod_signature->>'kind', '')
                     AND lower(p.account_name) <> lower(l.account_name)
                     AND p.removed_at IS NULL AND p.price_currency = l.price_currency
                     AND p.price_amount > 0
                     AND p.last_seen_at >= current_timestamp - INTERVAL ${SALE_POLICY.marketWindowSeconds} SECOND
                 GROUP BY lower(p.account_name)
             ) peers
         ) m ON TRUE
         ON CONFLICT DO NOTHING`,
        [stashId, withdrawn],
    );
}

export async function evaluateSales(
    conn: DuckDBConnection,
    caughtUp: boolean,
    now = new Date(),
): Promise<void> {
    const timestamp = now.toISOString();
    await withTransaction(conn, async () => {
        // A move to another stash, price change, or changed item ID must not count as a sale.
        // Matching the same variant with a new ID is deliberately conservative.
        await conn.run(
            `UPDATE ps_sale s SET status = 'relisted', updated_at = $1::TIMESTAMP
            WHERE s.status IN ('pending', 'likely-sold') AND EXISTS (
                SELECT 1 FROM ps_listing p
                WHERE p.league = s.league AND lower(p.account_name) = lower(s.account_name)
                    AND p.last_seen_at >= s.removed_at
                    AND (p.item_id = s.item_id OR (
                        p.item_key = s.item_key AND p.identified = s.identified
                        AND p.corrupted = s.corrupted
                        AND coalesce(p.foil_variation, -1) = coalesce(s.foil_variation, -1)
                        AND p.signature_value = s.signature_value
                        AND coalesce(p.mod_signature->>'kind', '') = coalesce(s.mod_signature->>'kind', '')
                        AND (p.stash_id <> s.stash_id OR p.item_id <> s.item_id)
                    ))
                    AND (p.removed_at IS NULL OR p.last_seen_at > s.removed_at)
            )`,
            [timestamp],
        );

        await conn.run(
            `UPDATE ps_sale SET eligible_since = NULL
            WHERE status = 'pending' AND (
                NOT $2 OR NOT EXISTS (
                    SELECT 1 FROM pipeline_health WHERE id = 1 AND caught_up
                        AND last_poll_at >= $1::TIMESTAMP - INTERVAL ${SALE_POLICY.maxPollGapSeconds} SECOND
                )
            )`,
            [timestamp, caughtUp],
        );

        if (caughtUp) {
            await conn.run(
                `UPDATE ps_sale SET eligible_since = $1::TIMESTAMP
                WHERE status = 'pending' AND eligible_since IS NULL`,
                [timestamp],
            );
            await conn.run(
                `UPDATE ps_sale SET status = CASE
                    WHEN market_sellers < ${SALE_POLICY.minimumSellers} OR market_price IS NULL
                        OR price_amount IS NULL OR price_currency IS NULL THEN 'insufficient-market'
                    WHEN price_amount / market_price BETWEEN ${SALE_POLICY.minimumPriceRatio} AND ${SALE_POLICY.maximumPriceRatio}
                        THEN 'likely-sold'
                    ELSE 'outside-market' END,
                    updated_at = $1::TIMESTAMP
                WHERE status = 'pending'
                    AND eligible_since <= $1::TIMESTAMP - INTERVAL ${SALE_POLICY.graceSeconds} SECOND`,
                [timestamp],
            );
        }
        await conn.run(`INSERT OR REPLACE INTO pipeline_health VALUES (1, $1::TIMESTAMP, $2)`, [
            timestamp,
            caughtUp,
        ]);
    });
}

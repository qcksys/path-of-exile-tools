import type { DuckDBConnection } from "@duckdb/node-api";
import { params } from "#src/ps/rounds.ts";
import { withTransaction } from "#src/shared/db.ts";
import type { ListingTab } from "#src/shared/stash-tab.ts";

export const SALE_POLICY = {
    graceSeconds: 3600,
    marketWindowSeconds: 86400,
    minimumSellers: 3,
    minimumPriceRatio: 0.75,
    maximumPriceRatio: 1.25,
} as const;

/**
 * Records the listings these stashes lost in the current transaction as sale candidates. A removal
 * from a public stash gives its `tab`, so listings seen before tabs were recorded take it; a sale
 * is compared only with listings in the same kind of tab.
 */
export async function recordRemovals(
    conn: DuckDBConnection,
    removals: readonly { stashId: string; withdrawn: boolean; tab?: ListingTab }[],
): Promise<void> {
    if (!removals.length) return;
    const withdrawn = removals.filter((removal) => removal.withdrawn).map((r) => r.stashId);
    if (withdrawn.length) {
        await conn.run(
            `UPDATE ps_sale SET status = 'withdrawn', updated_at = current_timestamp
            WHERE rowid IN (
                WITH pending AS MATERIALIZED (
                    SELECT rowid AS row_id, stash_id FROM ps_sale WHERE status = 'pending'
                ) SELECT row_id FROM pending WHERE stash_id IN (${params(withdrawn)})
            )`,
            withdrawn,
        );
    }
    const stashIds = removals.map((removal) => removal.stashId);
    await conn.run(
        `INSERT INTO ps_sale BY NAME
         WITH stash AS MATERIALIZED (
             SELECT * FROM ps_listing WHERE stash_id IN (${params(stashIds, 2)})
         ), removed AS MATERIALIZED (
             -- A stash changed twice in one page repeats its removals; ON CONFLICT would scan
             -- every sale, while this transaction's own sales sit in the newest row groups.
             SELECT stash.* REPLACE (coalesce(stash.tab, j.value->>'tab') AS tab),
                (j.value->>'withdrawn')::BOOLEAN AS withdrawn FROM stash
             JOIN json_each($1::JSON) j ON stash.stash_id = (j.value->>'stashId')
             WHERE stash.removed_at = current_timestamp::TIMESTAMP AND NOT EXISTS (
                 SELECT 1 FROM ps_sale s WHERE s.removed_at = current_timestamp::TIMESTAMP
                     AND s.stash_id = stash.stash_id AND s.item_id = stash.item_id)
         ), market AS MATERIALIZED (
             SELECT * FROM ps_listing WHERE item_key IN (SELECT item_key FROM removed)
         )
         SELECT l.* EXCLUDE (raw_item, withdrawn),
            CASE WHEN l.withdrawn THEN 'withdrawn'
                -- Far behind the stream (initial catch-up, or a long outage), a removal's time and
                -- market say little about when or whether it sold.
                WHEN NOT EXISTS (SELECT 1 FROM pipeline_health WHERE id = 1
                    AND last_caught_up_at >= current_timestamp::TIMESTAMP - INTERVAL ${SALE_POLICY.graceSeconds} SECOND)
                    THEN 'unobserved'
                ELSE 'pending' END AS status,
            NULL::TIMESTAMP AS eligible_since, m.price AS market_price,
            m.sellers AS market_sellers, current_timestamp::TIMESTAMP AS updated_at
         FROM removed l
         LEFT JOIN LATERAL (
             SELECT median(seller_price) AS price, count(*) AS sellers FROM (
                 SELECT lower(p.account_name), median(p.price_amount) AS seller_price
                 FROM market p
                 WHERE p.league = l.league AND p.item_key = l.item_key
                     AND p.identified = l.identified AND p.corrupted = l.corrupted
                     AND coalesce(p.foil_variation, -1) = coalesce(l.foil_variation, -1)
                     AND coalesce(p.links, 0) = coalesce(l.links, 0)
                     AND coalesce(p.tab, '') = coalesce(l.tab, '')
                     AND p.signature_value = l.signature_value
                     AND coalesce(p.mod_signature->>'kind', '') = coalesce(l.mod_signature->>'kind', '')
                     AND lower(p.account_name) <> lower(l.account_name)
                     AND p.removed_at IS NULL AND p.price_currency = l.price_currency
                     AND p.price_amount > 0
                     AND p.last_seen_at >= current_timestamp - INTERVAL ${SALE_POLICY.marketWindowSeconds} SECOND
                 GROUP BY lower(p.account_name)
             ) peers
         ) m ON TRUE`,
        [JSON.stringify(removals), ...stashIds],
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
        // Matching the same variant with a new ID is deliberately conservative, but a copy
        // that was already listed while the sold item was still listed is not its replacement.
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
                        AND coalesce(p.links, 0) = coalesce(s.links, 0)
                        AND p.signature_value = s.signature_value
                        AND coalesce(p.mod_signature->>'kind', '') = coalesce(s.mod_signature->>'kind', '')
                        AND (p.stash_id <> s.stash_id OR p.item_id <> s.item_id)
                        AND p.first_seen_at > s.last_seen_at
                    ))
                    AND (p.removed_at IS NULL OR p.last_seen_at > s.removed_at)
            )`,
            [timestamp],
        );

        // The stream is a complete, ordered log: at its head every change up to now has been seen,
        // including any relist within the grace period after an earlier removal. Lag or gaps in
        // between do not hide one, so no continuous coverage is required.
        if (caughtUp) {
            await conn.run(
                `UPDATE ps_sale SET status = CASE
                    WHEN market_sellers < ${SALE_POLICY.minimumSellers} OR market_price IS NULL
                        OR price_amount IS NULL OR price_currency IS NULL THEN 'insufficient-market'
                    WHEN price_amount / market_price BETWEEN ${SALE_POLICY.minimumPriceRatio} AND ${SALE_POLICY.maximumPriceRatio}
                        THEN 'likely-sold'
                    ELSE 'outside-market' END,
                    updated_at = $1::TIMESTAMP
                WHERE status = 'pending'
                    AND removed_at <= $1::TIMESTAMP - INTERVAL ${SALE_POLICY.graceSeconds} SECOND`,
                [timestamp],
            );
        }
        await conn.run(
            `INSERT OR REPLACE INTO pipeline_health SELECT 1, $1::TIMESTAMP, $2,
                CASE WHEN $2 THEN $1::TIMESTAMP
                    ELSE (SELECT last_caught_up_at FROM pipeline_health WHERE id = 1) END`,
            [timestamp, caughtUp],
        );
    });
}

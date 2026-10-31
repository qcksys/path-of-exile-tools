import type { DuckDBConnection } from "@duckdb/node-api";
import { marketLeagueTracked } from "@poe-tools/market";
import { REALM } from "#src/shared/auth.ts";
import { queryAll } from "#src/shared/db.ts";
import { MOD_POOLS } from "#src/shared/mod-extractors/mod-pools.ts";
import { push } from "#src/shared/remote/push.ts";
import type { UniqueHourlyRow } from "#src/shared/remote/types.ts";
import { assertSourceRealm } from "#src/shared/source.ts";

const STREAM = "psapi";
const POOL_KINDS = Object.values(MOD_POOLS)
    .map((pool) => `'${pool.kind}'`)
    .join(", ");

interface AggregateRow {
    league: string;
    hour: number;
    itemKey: string;
    corrupted: boolean;
    links: number;
    tab: UniqueHourlyRow["tab"];
    signatureKind: string;
    signatureValue: string;
    signatureData: string | null;
    iconAsset: string | null;
    baseType: string;
    name: string | null;
    frameType: number;
    identified: boolean;
    listingCount: number;
    uniqueSellers: number;
    newCount: number;
    soldAgeSeconds: number | null;
    pricesJson: string;
    salesPricesJson: string;
    delistedPricesJson: string;
    removedCount: number;
    likelySales: number;
    relistedCount: number;
    pendingCount: number;
    firstSeenAt: string;
    lastSeenAt: string;
}

/**
 * Two-stage aggregate:
 *
 *   1. `windowed` — every captured listing observed in the target hour,
 *      enriched with the resolved name (basemap join) and a deterministic
 *      `signature_value` projection of `mod_signature` keyed by `kind`.
 *   2. `markets` — `windowed` with each mod pool unique's listing counted once in
 *      its item's market (empty value) and, when it has several mods, once in a
 *      market per mod and mod count. Mod markets sum to more listings than exist.
 *   3. Top-level GROUP BY (league, hour, item_key, corrupted, links, tab,
 *      signature_kind, signature_value) — one row per *market* per hour. Foil and
 *      non-foil listings share a market. Variant axes are first-class columns; the
 *      JSON payload is preserved on `signature_data` for ad-hoc field queries.
 */
const ROLLUP_SQL = /* sql */ `
WITH observations AS (
    SELECT * EXCLUDE (observed_hour), observed_hour AS hour, 'listing' AS status
    FROM ps_listing_hour WHERE observed_hour = $1 AND ($2 IS NULL OR league = $2)
        AND ($3::VARCHAR IS NULL OR list_contains($3::JSON::VARCHAR[], item_key))
    UNION ALL BY NAME
    SELECT * EXCLUDE (eligible_since, market_price, market_sellers, updated_at),
        epoch(date_trunc('hour', removed_at))::BIGINT AS hour
    FROM ps_sale WHERE epoch(date_trunc('hour', removed_at))::BIGINT = $1
        AND ($2 IS NULL OR league = $2)
        AND ($3::VARCHAR IS NULL OR list_contains($3::JSON::VARCHAR[], item_key))
), windowed AS (
    SELECT
        l.league,
        l.hour,
        l.status,
        l.item_key,
        COALESCE(l.corrupted, FALSE) AS corrupted,
        COALESCE(l.links, 0) AS links,
        COALESCE(l.tab, '') AS tab,
        COALESCE(json_extract_string(l.mod_signature, '$.kind'), '') AS signature_kind,
        COALESCE(l.signature_value, '') AS signature_value,
        l.mod_signature::VARCHAR AS signature_data,
        l.icon_asset,
        l.base_type,
        -- Listings stored before maps dropped their names still carry a rare map's name. A rare
        -- beast's name is random, and every beast shares the Bestiary Orb icon a spirit beast
        -- teaches the basemap.
        CASE WHEN json_extract_string(l.mod_signature, '$.kind') IN ('map', 'beast') THEN NULL
            ELSE COALESCE(l.name, b.name) END AS resolved_name,
        l.frame_type,
        l.identified,
        l.account_name,
        l.price_amount,
        l.price_currency,
        l.first_seen_at,
        l.last_seen_at,
        l.removed_at
    FROM observations l
    LEFT JOIN icon_basemap b ON l.icon_asset = b.icon_asset
    WHERE l.hour = $1
        AND ($2 IS NULL OR l.league = $2)
        -- Defer rolling up unidentified items whose icon_asset has not
        -- been basemapped yet. They stay in ps_listing_hour and become eligible
        -- once an identified instance teaches the basemap. Unidentified maps are
        -- keyed by base type, not art, so they need no basemap.
        AND (
            l.identified
            OR NOT starts_with(l.item_key, 'unid:')
            OR (l.icon_asset IS NOT NULL AND b.name IS NOT NULL)
        )
        -- Corrupted Watcher's Eyes have no market. IS NOT TRUE keeps nameless listings.
        AND (COALESCE(l.corrupted, FALSE) AND COALESCE(l.name, b.name) = 'Watcher''s Eye') IS NOT TRUE
),
pool_mods AS (
    SELECT *, len(mods) AS mod_count, unnest(mods) AS mod
    FROM (
        SELECT *, json_extract(signature_data, '$.mods[*]') AS mods
        FROM windowed WHERE signature_kind IN (${POOL_KINDS})
    )
    WHERE len(mods) >= 2
),
masked_mods AS (
    -- Listings stored before ingest masked rolls keep them; older Watcher's Eyes store {aura, stat}.
    SELECT * EXCLUDE (mods, mod), regexp_replace(
        COALESCE((mod->>'aura') || ': ' || (mod->>'stat'), mod->>'$'),
        '\\d+(?:\\.\\d+)?', '#', 'g'
    ) AS mod
    FROM pool_mods
),
markets AS (
    SELECT * REPLACE (
        CASE WHEN signature_kind IN (${POOL_KINDS}) THEN '' ELSE signature_value END AS signature_value,
        CASE WHEN signature_kind IN (${POOL_KINDS})
            THEN json_object('kind', signature_kind)::VARCHAR
            ELSE signature_data END AS signature_data
    )
    FROM windowed
    UNION ALL
    SELECT * EXCLUDE (mod, mod_count) REPLACE (
        left(mod_count || ' mods: ' || mod, 255) AS signature_value,
        json_object('kind', signature_kind, 'mod', mod, 'modCount', mod_count)::VARCHAR AS signature_data
    )
    FROM masked_mods
),
prices AS (
    SELECT
        league, hour, item_key, corrupted, links, tab,
        signature_kind, signature_value, price_currency,
        -- Delisted: every removal that is not a likely sale, relist or undecided.
        CASE WHEN status IN ('listing', 'likely-sold') THEN status ELSE 'delisted' END AS price_kind,
        COUNT(*) AS price_count,
        MIN(price_amount) AS min,
        AVG(price_amount) AS mean,
        QUANTILE_CONT(price_amount, 0.1) AS p10,
        QUANTILE_CONT(price_amount, 0.25) AS p25,
        MEDIAN(price_amount) AS median,
        QUANTILE_CONT(price_amount, 0.75) AS p75,
        QUANTILE_CONT(price_amount, 0.9) AS p90,
        MAX(price_amount) AS max
    FROM markets
    WHERE price_amount > 0 AND price_currency IS NOT NULL AND status NOT IN ('relisted', 'pending')
    GROUP BY league, hour, item_key, corrupted, links, tab,
             signature_kind, signature_value, price_currency, price_kind
),
prices_agg AS (
    SELECT
        league, hour, item_key, corrupted, links, tab,
        signature_kind, signature_value, price_kind,
        json_group_object(
            price_currency,
            json_object(
                'count', price_count, 'min', min, 'mean', mean, 'p10', p10, 'p25', p25,
                'median', median, 'p75', p75, 'p90', p90, 'max', max
            )
        ) AS prices_json
    FROM prices
    GROUP BY league, hour, item_key, corrupted, links, tab,
             signature_kind, signature_value, price_kind
)
SELECT
    w.league,
    w.hour,
    w.item_key AS "itemKey",
    w.corrupted,
    w.links,
    w.tab,
    w.signature_kind AS "signatureKind",
    w.signature_value AS "signatureValue",
    ANY_VALUE(w.signature_data) AS "signatureData",
    ANY_VALUE(w.icon_asset) AS "iconAsset",
    ANY_VALUE(w.base_type) AS "baseType",
    ANY_VALUE(w.resolved_name) AS name,
    ANY_VALUE(w.frame_type) AS "frameType",
    ANY_VALUE(w.identified) AS identified,
    COUNT(*) FILTER (WHERE w.status = 'listing') AS "listingCount",
    COUNT(DISTINCT w.account_name) FILTER (WHERE w.status = 'listing') AS "uniqueSellers",
    COUNT(*) FILTER (
        WHERE w.status = 'listing' AND epoch(date_trunc('hour', w.first_seen_at))::BIGINT = w.hour
    ) AS "newCount",
    ROUND(AVG(epoch(w.removed_at) - epoch(w.first_seen_at)) FILTER (
        WHERE w.status = 'likely-sold'
    )) AS "soldAgeSeconds",
    COUNT(*) FILTER (WHERE w.status <> 'listing') AS "removedCount",
    COUNT(*) FILTER (WHERE w.status = 'likely-sold') AS "likelySales",
    COUNT(*) FILTER (WHERE w.status = 'relisted') AS "relistedCount",
    COUNT(*) FILTER (WHERE w.status = 'pending') AS "pendingCount",
    COALESCE(p.prices_json, '{}') AS "pricesJson",
    COALESCE(s.prices_json, '{}') AS "salesPricesJson",
    COALESCE(d.prices_json, '{}') AS "delistedPricesJson",
    MIN(w.first_seen_at)::VARCHAR AS "firstSeenAt",
    MAX(w.last_seen_at)::VARCHAR AS "lastSeenAt"
FROM markets w
LEFT JOIN (SELECT * FROM prices_agg WHERE price_kind = 'listing') p USING (
    league, hour, item_key, corrupted, links, tab,
    signature_kind, signature_value
)
LEFT JOIN (SELECT * FROM prices_agg WHERE price_kind = 'likely-sold') s USING (
    league, hour, item_key, corrupted, links, tab,
    signature_kind, signature_value
)
LEFT JOIN (SELECT * FROM prices_agg WHERE price_kind = 'delisted') d USING (
    league, hour, item_key, corrupted, links, tab,
    signature_kind, signature_value
)
GROUP BY
    w.league, w.hour, w.item_key, w.corrupted, w.links, w.tab,
    w.signature_kind, w.signature_value, p.prices_json, s.prices_json, d.prices_json
ORDER BY w.league, w.item_key, w.signature_kind, w.signature_value
`;

function unixHour(d: Date = new Date()): number {
    return Math.floor(d.getTime() / 3_600_000) * 3600;
}

/**
 * The items whose observations changed since this hour was last delivered, or null when the whole
 * hour must be sent: it was never delivered, or a newly learned icon can name any of its markets.
 * Every market of an item is sent, because a mod pool unique's sale reaches several of them.
 */
async function changedItemKeys(conn: DuckDBConnection, hour: number, league: string) {
    const rows = await queryAll<{ itemKey: string; basemap: boolean; changed: boolean }>(
        conn,
        `WITH state AS (
            SELECT pushed_at FROM rollup_state
            WHERE stream_name = '${STREAM}' AND league = $2 AND hour = $1
        ), observations AS (
            SELECT item_key, icon_asset, last_seen_at AS changed_at FROM ps_listing_hour
            WHERE observed_hour = $1 AND league = $2
            UNION ALL
            SELECT item_key, icon_asset, updated_at FROM ps_sale
            WHERE epoch(date_trunc('hour', removed_at))::BIGINT = $1 AND league = $2
        )
        SELECT o.item_key AS "itemKey", bool_or(b.first_seen_at > s.pushed_at) AS basemap,
            bool_or(o.changed_at > s.pushed_at) AS changed
        FROM observations o CROSS JOIN state s
        LEFT JOIN icon_basemap b ON b.icon_asset = o.icon_asset
        GROUP BY o.item_key`,
        [hour, league],
    );
    if (!rows.length || rows.some((row) => row.basemap)) return null;
    return rows.filter((row) => row.changed).map((row) => row.itemKey);
}

export async function rollupPs(
    conn: DuckDBConnection,
    opts: {
        hour?: number;
        league?: string | null;
        dryRun?: boolean;
        /** Send a delivered hour's changed items, not all of it; needs `league`. */
        changedOnly?: boolean;
        onBatch?: () => Promise<void>;
    },
): Promise<{ hours: number[]; rows: number }> {
    await assertSourceRealm(conn, REALM ?? "pc");
    const hour = opts.hour ?? unixHour() - 3600;
    const league = opts.league ?? null;
    const itemKeys =
        opts.changedOnly && league !== null ? await changedItemKeys(conn, hour, league) : null;

    const aggregates = await queryAll<AggregateRow>(conn, ROLLUP_SQL, [
        hour,
        league,
        itemKeys && JSON.stringify(itemKeys),
    ]);

    const rows: UniqueHourlyRow[] = aggregates.map((a) => ({
        realm: REALM ?? "pc",
        league: a.league,
        hour: Number(a.hour),
        itemKey: a.itemKey,
        corrupted: a.corrupted,
        links: Number(a.links),
        tab: a.tab,
        signatureKind: a.signatureKind,
        signatureValue: a.signatureValue,
        signatureData: a.signatureData
            ? (JSON.parse(a.signatureData) as Record<string, unknown>)
            : null,
        iconAsset: a.iconAsset,
        name: a.name,
        baseType: a.baseType,
        frameType: a.frameType,
        identified: a.identified,
        listingCount: Number(a.listingCount),
        uniqueSellers: Number(a.uniqueSellers),
        newCount: Number(a.newCount),
        soldAgeSeconds: a.soldAgeSeconds === null ? undefined : Number(a.soldAgeSeconds),
        prices: JSON.parse(a.pricesJson) as UniqueHourlyRow["prices"],
        salesPrices: JSON.parse(a.salesPricesJson) as UniqueHourlyRow["prices"],
        delistedPrices: JSON.parse(a.delistedPricesJson) as UniqueHourlyRow["prices"],
        removedCount: Number(a.removedCount),
        likelySales: Number(a.likelySales),
        relistedCount: Number(a.relistedCount),
        pendingCount: Number(a.pendingCount),
        firstSeenAt: a.firstSeenAt,
        lastSeenAt: a.lastSeenAt,
    }));

    // `row_count` stays the whole hour's. This hour must also stop being pending when its changed
    // items have no market, such as a corrupted Watcher's Eye.
    const markDelivered = async () => {
        if (!opts.dryRun)
            await conn.run(
                `UPDATE rollup_state SET pushed_at = now()
                WHERE stream_name = '${STREAM}' AND league = $1 AND hour = $2`,
                [league, hour],
            );
    };
    if (rows.length === 0) {
        if (itemKeys) await markDelivered();
        console.log(
            `psapi rollup hour=${hour} league=${league ?? "all"}: no rows; nothing to push.`,
        );
        return { hours: [hour], rows: 0 };
    }

    // Leagues poe.boats doesn't store stay in this database and its archive.
    await push(
        { stream: "psapi", rows: rows.filter((row) => marketLeagueTracked(row.league)) },
        { dryRun: opts.dryRun, onBatch: opts.onBatch },
    );

    if (itemKeys) {
        await markDelivered();
        console.log(
            `psapi rollup hour=${hour}: ${rows.length} rows of ${itemKeys.length} changed items pushed.`,
        );
        return { hours: [hour], rows: rows.length };
    }
    if (!opts.dryRun) {
        const byLeague = new Map<string, number>();
        for (const r of rows) byLeague.set(r.league, (byLeague.get(r.league) ?? 0) + 1);
        for (const [lg, n] of byLeague) {
            await conn.run(
                `INSERT INTO rollup_state (stream_name, league, hour, pushed_at, row_count)
                 VALUES ($1, $2, $3, current_timestamp, $4)
                 ON CONFLICT (stream_name, league, hour) DO UPDATE
                 SET pushed_at = now(), row_count = excluded.row_count`,
                [STREAM, lg, hour, n],
            );
        }
    }

    console.log(`psapi rollup hour=${hour}: ${rows.length} rows pushed.`);
    return { hours: [hour], rows: rows.length };
}

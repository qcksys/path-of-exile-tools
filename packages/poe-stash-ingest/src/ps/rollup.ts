import type { DuckDBConnection } from "@duckdb/node-api";
import { queryAll } from "#src/shared/db.ts";
import { push } from "#src/shared/remote/push.ts";
import type { UniqueHourlyRow } from "#src/shared/remote/types.ts";

const STREAM = "psapi";

interface AggregateRow {
  league: string;
  hour: number;
  itemKey: string;
  corrupted: boolean;
  foilVariation: number;
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
  pricesJson: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

/**
 * Two-stage aggregate:
 *
 *   1. `window` — every captured listing observed in the target hour,
 *      enriched with the resolved name (basemap join) and a deterministic
 *      `signature_value` projection of `mod_signature` keyed by `kind`.
 *   2. Top-level GROUP BY (league, hour, item_key, corrupted,
 *      foil_variation, signature_kind, signature_value) — one row per
 *      *market* per hour. Variant axes are first-class columns; the JSON
 *      payload is preserved on `signature_data` for ad-hoc field queries.
 *
 * `foil_variation` defaults to -1 (never a real foil index) so it can sit
 * in a NOT NULL primary key.
 */
const ROLLUP_SQL = /* sql */ `
WITH window AS (
    SELECT
        l.league,
        epoch(date_trunc('hour', l.last_seen_at))::BIGINT AS hour,
        l.item_key,
        COALESCE(l.corrupted, FALSE) AS corrupted,
        COALESCE(l.foil_variation, -1) AS foil_variation,
        COALESCE(json_extract_string(l.mod_signature, '$.kind'), '') AS signature_kind,
        CASE
            WHEN json_extract_string(l.mod_signature, '$.kind') = 'forbidden-jewel'
                THEN COALESCE(json_extract_string(l.mod_signature, '$.allocatedNotable'), '')
            WHEN json_extract_string(l.mod_signature, '$.kind') = 'impossible-escape'
                THEN COALESCE(json_extract_string(l.mod_signature, '$.keystone'), '')
            WHEN json_extract_string(l.mod_signature, '$.kind') = 'forbidden-shako'
                THEN COALESCE(
                    json_extract_string(l.mod_signature, '$.skill') || '@' ||
                        json_extract_string(l.mod_signature, '$.level'), '')
            WHEN json_extract_string(l.mod_signature, '$.kind') = 'watchers-eye'
                THEN COALESCE(l.mod_signature::VARCHAR, '')
            ELSE ''
        END AS signature_value,
        l.mod_signature::VARCHAR AS signature_data,
        l.icon_asset,
        l.base_type,
        COALESCE(l.name, b.name) AS resolved_name,
        l.frame_type,
        l.identified,
        l.account_name,
        l.price_amount,
        l.price_currency,
        l.first_seen_at,
        l.last_seen_at
    FROM ps_listing l
    LEFT JOIN icon_basemap b ON l.icon_asset = b.icon_asset
    WHERE epoch(date_trunc('hour', l.last_seen_at))::BIGINT = $1
        AND ($2 IS NULL OR l.league = $2)
        -- Defer rolling up unidentified items whose icon_asset has not
        -- been basemapped yet. They stay in ps_listing and become eligible
        -- once an identified instance teaches the basemap.
        AND (
            l.identified
            OR (l.icon_asset IS NOT NULL AND b.name IS NOT NULL)
        )
),
prices AS (
    SELECT
        league, hour, item_key, corrupted, foil_variation,
        signature_kind, signature_value, price_currency,
        COUNT(*) AS price_count,
        MIN(price_amount) AS min,
        MEDIAN(price_amount) AS median,
        MAX(price_amount) AS max
    FROM window
    WHERE price_amount IS NOT NULL AND price_currency IS NOT NULL
    GROUP BY league, hour, item_key, corrupted, foil_variation,
             signature_kind, signature_value, price_currency
),
prices_agg AS (
    SELECT
        league, hour, item_key, corrupted, foil_variation,
        signature_kind, signature_value,
        json_group_object(
            price_currency,
            json_object('count', price_count, 'min', min, 'median', median, 'max', max)
        ) AS prices_json
    FROM prices
    GROUP BY league, hour, item_key, corrupted, foil_variation,
             signature_kind, signature_value
)
SELECT
    w.league,
    w.hour,
    w.item_key AS "itemKey",
    w.corrupted,
    w.foil_variation AS "foilVariation",
    w.signature_kind AS "signatureKind",
    w.signature_value AS "signatureValue",
    ANY_VALUE(w.signature_data) AS "signatureData",
    ANY_VALUE(w.icon_asset) AS "iconAsset",
    ANY_VALUE(w.base_type) AS "baseType",
    ANY_VALUE(w.resolved_name) AS name,
    ANY_VALUE(w.frame_type) AS "frameType",
    ANY_VALUE(w.identified) AS identified,
    COUNT(*) AS "listingCount",
    COUNT(DISTINCT w.account_name) AS "uniqueSellers",
    COALESCE(p.prices_json, '{}') AS "pricesJson",
    MIN(w.first_seen_at)::VARCHAR AS "firstSeenAt",
    MAX(w.last_seen_at)::VARCHAR AS "lastSeenAt"
FROM window w
LEFT JOIN prices_agg p USING (
    league, hour, item_key, corrupted, foil_variation,
    signature_kind, signature_value
)
GROUP BY
    w.league, w.hour, w.item_key, w.corrupted, w.foil_variation,
    w.signature_kind, w.signature_value, p.prices_json
ORDER BY w.league, w.item_key, w.signature_kind, w.signature_value
`;

function unixHour(d: Date = new Date()): number {
  return Math.floor(d.getTime() / 3_600_000) * 3600;
}

export async function rollupPs(
  conn: DuckDBConnection,
  opts: { hour?: number; league?: string | null; dryRun?: boolean },
): Promise<{ hours: number[]; rows: number }> {
  const hour = opts.hour ?? unixHour() - 3600;
  const league = opts.league ?? null;

  const aggregates = await queryAll<AggregateRow>(conn, ROLLUP_SQL, [hour, league]);

  const rows: UniqueHourlyRow[] = aggregates.map((a) => ({
    league: a.league,
    hour: Number(a.hour),
    itemKey: a.itemKey,
    corrupted: a.corrupted,
    foilVariation: Number(a.foilVariation),
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
    prices: JSON.parse(a.pricesJson) as UniqueHourlyRow["prices"],
    firstSeenAt: a.firstSeenAt,
    lastSeenAt: a.lastSeenAt,
  }));

  if (rows.length === 0) {
    console.log(`psapi rollup hour=${hour} league=${league ?? "all"}: no rows; nothing to push.`);
    return { hours: [hour], rows: 0 };
  }

  await push({ stream: "psapi", rows }, { dryRun: opts.dryRun });

  if (!opts.dryRun) {
    const byLeague = new Map<string, number>();
    for (const r of rows) byLeague.set(r.league, (byLeague.get(r.league) ?? 0) + 1);
    for (const [lg, n] of byLeague) {
      await conn.run(
        `INSERT INTO rollup_state (stream_name, league, hour, pushed_at, row_count)
                 VALUES ($1, $2, $3, current_timestamp, $4)
                 ON CONFLICT (stream_name, league, hour) DO UPDATE
                 SET pushed_at = current_timestamp, row_count = excluded.row_count`,
        [STREAM, lg, hour, n],
      );
    }
  }

  console.log(`psapi rollup hour=${hour}: ${rows.length} rows pushed.`);
  return { hours: [hour], rows: rows.length };
}

import type { DuckDBConnection } from "@duckdb/node-api";
import { queryAll } from "#src/shared/db.ts";

/**
 * Idempotent rebuild of `icon_basemap` from identified uniques in
 * `ps_listing`. Counts each appearance once. Useful after seeding the DB or
 * after the ingest's incremental learning has gaps.
 */
export async function rebuildBasemap(conn: DuckDBConnection): Promise<{ entries: number }> {
  await conn.run(/* sql */ `
        INSERT INTO icon_basemap (icon_asset, name, base_type, seen_count, first_seen_at, last_seen_at)
        SELECT
            icon_asset,
            ANY_VALUE(name) AS name,
            ANY_VALUE(base_type) AS base_type,
            COUNT(*) AS seen_count,
            MIN(first_seen_at) AS first_seen_at,
            MAX(last_seen_at) AS last_seen_at
        FROM ps_listing
        WHERE identified = TRUE
            AND frame_type = 3
            AND name IS NOT NULL
            AND icon_asset IS NOT NULL
        GROUP BY icon_asset
        ON CONFLICT (icon_asset) DO UPDATE SET
            seen_count = excluded.seen_count,
            last_seen_at = excluded.last_seen_at
    `);

  const rows = await queryAll<{ n: number }>(conn, "SELECT COUNT(*) AS n FROM icon_basemap");
  const entries = Number(rows[0]?.n ?? 0);
  console.log(`icon_basemap rebuilt: ${entries} entries`);
  return { entries };
}

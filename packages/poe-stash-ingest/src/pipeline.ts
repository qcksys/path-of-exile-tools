import type { DuckDBConnection } from "@duckdb/node-api";
import type { PoeApiClient } from "@poe-tools/api-client";
import { ingestCx } from "#src/cx/ingest.ts";
import { rollupCx } from "#src/cx/rollup.ts";
import { ingestPs } from "#src/ps/ingest.ts";
import { rollupPs } from "#src/ps/rollup.ts";
import { REALM } from "#src/shared/auth.ts";
import { queryAll } from "#src/shared/db.ts";
import { configureSource } from "#src/shared/source.ts";

export async function flushRollups(
    conn: DuckDBConnection,
    opts: { league?: string | null; dryRun?: boolean; limit?: number } = {},
) {
    const pending = await queryAll<{ stream: string; league: string; hour: number }>(
        conn,
        `
        WITH observations AS (
            SELECT league, observed_hour AS hour, last_seen_at AS changed_at, icon_asset, identified FROM ps_listing_hour
            UNION ALL
            SELECT league, epoch(date_trunc('hour', removed_at))::BIGINT, updated_at, icon_asset, identified FROM ps_sale
        ), dirty AS (
            SELECT DISTINCT 'psapi' AS stream, l.league, l.hour
            FROM observations l
            LEFT JOIN rollup_state r ON r.stream_name = 'psapi' AND r.league = l.league AND r.hour = l.hour
            LEFT JOIN icon_basemap b ON b.icon_asset = l.icon_asset
            WHERE (l.identified OR b.name IS NOT NULL)
                AND (r.pushed_at IS NULL OR l.changed_at > r.pushed_at OR b.first_seen_at > r.pushed_at)
            UNION ALL
            SELECT DISTINCT 'cxapi', l.league, l.observed_hour FROM cx_market_hour l
            LEFT JOIN rollup_state r ON r.stream_name = 'cxapi' AND r.league = l.league AND r.hour = l.observed_hour
            WHERE r.pushed_at IS NULL
        ) SELECT * FROM dirty
        WHERE hour < epoch(date_trunc('hour', current_timestamp)) AND ($1 IS NULL OR league = $1)
        ORDER BY hour, stream, league LIMIT $2`,
        [opts.league ?? null, opts.limit ?? 168],
    );
    let rows = 0;
    for (const entry of pending) {
        const rollup = entry.stream === "psapi" ? rollupPs : rollupCx;
        rows += (
            await rollup(conn, {
                hour: Number(entry.hour),
                league: entry.league,
                dryRun: opts.dryRun,
            })
        ).rows;
    }
    return { hours: pending.length, rows };
}

export async function runPipeline(
    conn: DuckDBConnection,
    client: PoeApiClient,
    opts: {
        pages: number;
        league?: string | null;
        cursor?: string;
        currency?: boolean;
    },
) {
    await configureSource(conn, REALM ?? "pc", opts.league ?? null);
    const errors: unknown[] = [];
    const stash = await ingestPs(conn, client, opts).catch((error: unknown) => {
        errors.push(error);
        return null;
    });
    const currency =
        opts.currency === false
            ? []
            : await ingestCx(conn, client, { catchUp: false, league: opts.league }).catch(
                  (error: unknown) => {
                      errors.push(error);
                      return [];
                  },
              );
    const delivered = await flushRollups(conn, opts).catch((error: unknown) => {
        errors.push(error);
        return null;
    });
    if (errors.length)
        throw new AggregateError(
            errors,
            "One or more pipeline stages failed; committed data and pending deliveries are retained.",
        );
    return { stash, currency, delivered };
}

import type { DuckDBConnection } from "@duckdb/node-api";
import { queryAll } from "#src/shared/db.ts";

export interface PruneOptions {
    /** Target row cap; active listings and unresolved sale evidence are retained. */
    maxRows: number;
    /** Drop rows older than this many days (by `last_seen_at`). */
    keepDays: number;
    dryRun?: boolean;
}

export interface PruneResult {
    beforeRows: number;
    droppedByAge: number;
    droppedByCap: number;
    droppedHourlyRows: number;
    afterRows: number;
}

async function countRows(conn: DuckDBConnection): Promise<number> {
    const rows = await queryAll<{ n: number }>(conn, "SELECT COUNT(*) AS n FROM ps_listing");
    return Number(rows[0]?.n ?? 0);
}

/**
 * Two-pass prune:
 *   1. Drop eligible removed rows older than `keepDays`.
 *   2. If still over `maxRows`, drop eligible removed rows oldest-first.
 * Active listings and sale evidence are always retained.
 *
 * Hourly summaries already pushed to poe.boats are unaffected — that DB is
 * permanent.
 */
export async function prune(conn: DuckDBConnection, opts: PruneOptions): Promise<PruneResult> {
    const before = await countRows(conn);
    const removable = `removed_at IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM ps_sale s WHERE s.league = ps_listing.league
            AND lower(s.account_name) = lower(ps_listing.account_name)
            AND s.status IN ('pending', 'likely-sold')
    )`;

    let droppedByAge = 0;
    let droppedHourlyRows = 0;
    if (opts.keepDays > 0) {
        const cutoffSql = `current_timestamp - INTERVAL ${Math.floor(opts.keepDays)} DAY`;
        // Keep observations that have not yet been included in a successful rollup.
        const deliveredHourlySql = `SELECT l.rowid FROM ps_listing_hour l
            JOIN rollup_state r ON r.stream_name = 'psapi'
                AND r.league = l.league AND r.hour = l.observed_hour
            LEFT JOIN icon_basemap b ON b.icon_asset = l.icon_asset
            WHERE l.last_seen_at < ${cutoffSql} AND l.last_seen_at <= r.pushed_at
                AND (l.identified OR (b.name IS NOT NULL AND b.first_seen_at <= r.pushed_at))
                AND NOT EXISTS (SELECT 1 FROM ps_sale s WHERE s.league = l.league
                    AND epoch(date_trunc('hour', s.removed_at))::BIGINT = l.observed_hour
                    AND s.status IN ('pending', 'likely-sold'))`;
        const hourlyRows = await queryAll<{ n: number }>(
            conn,
            `SELECT COUNT(*) AS n FROM (${deliveredHourlySql})`,
        );
        droppedHourlyRows = Number(hourlyRows[0]?.n ?? 0);
        if (!opts.dryRun) {
            await conn.run(`DELETE FROM ps_listing_hour WHERE rowid IN (${deliveredHourlySql})`);
        }
        if (opts.dryRun) {
            const rows = await queryAll<{ n: number }>(
                conn,
                `SELECT COUNT(*) AS n FROM ps_listing WHERE last_seen_at < ${cutoffSql} AND ${removable}`,
            );
            droppedByAge = Number(rows[0]?.n ?? 0);
        } else {
            await conn.run(
                `DELETE FROM ps_listing WHERE last_seen_at < ${cutoffSql} AND ${removable}`,
            );
            droppedByAge = before - (await countRows(conn));
        }
    }

    let droppedByCap = 0;
    const afterAge = opts.dryRun ? before - droppedByAge : await countRows(conn);
    if (afterAge > opts.maxRows) {
        const [eligible] = await queryAll<{ n: number }>(
            conn,
            `SELECT count(*) AS n FROM ps_listing WHERE ${removable}`,
        );
        const overflow = Math.min(afterAge - opts.maxRows, Number(eligible?.n ?? 0));
        if (opts.dryRun) {
            droppedByCap = overflow;
        } else {
            await conn.run(
                `DELETE FROM ps_listing
                 WHERE rowid IN (
                     SELECT rowid FROM ps_listing WHERE ${removable}
                     ORDER BY last_seen_at ASC
                     LIMIT $1
                 )`,
                [overflow],
            );
            droppedByCap = afterAge - (await countRows(conn));
        }
    }

    const after = opts.dryRun ? before - droppedByAge - droppedByCap : await countRows(conn);
    return { beforeRows: before, droppedByAge, droppedByCap, droppedHourlyRows, afterRows: after };
}

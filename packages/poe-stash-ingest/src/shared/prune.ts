import type { DuckDBConnection } from "@duckdb/node-api";
import { queryAll } from "#src/shared/db.ts";

export interface PruneOptions {
    /** Hard row-cap: keep at most this many ps_listing rows. */
    maxRows: number;
    /** Drop rows older than this many days (by `last_seen_at`). */
    keepDays: number;
    dryRun?: boolean;
}

export interface PruneResult {
    beforeRows: number;
    droppedByAge: number;
    droppedByCap: number;
    afterRows: number;
}

async function countRows(conn: DuckDBConnection): Promise<number> {
    const rows = await queryAll<{ n: number }>(conn, "SELECT COUNT(*) AS n FROM ps_listing");
    return Number(rows[0]?.n ?? 0);
}

/**
 * Two-pass prune:
 *   1. Drop rows whose `last_seen_at` is older than `keepDays` ago.
 *      Removed-then-stale rows are dropped first (they have no live listing).
 *   2. If still over `maxRows`, drop rows in oldest-first order. Removed rows
 *      are evicted before active rows (lower business value once gone).
 *
 * Hourly summaries already pushed to poe.boats are unaffected — that DB is
 * permanent.
 */
export async function prune(conn: DuckDBConnection, opts: PruneOptions): Promise<PruneResult> {
    const before = await countRows(conn);

    let droppedByAge = 0;
    if (opts.keepDays > 0) {
        const cutoffSql = `current_timestamp - INTERVAL ${Math.floor(opts.keepDays)} DAY`;
        if (opts.dryRun) {
            const rows = await queryAll<{ n: number }>(
                conn,
                `SELECT COUNT(*) AS n FROM ps_listing WHERE last_seen_at < ${cutoffSql}`,
            );
            droppedByAge = Number(rows[0]?.n ?? 0);
        } else {
            await conn.run(`DELETE FROM ps_listing WHERE last_seen_at < ${cutoffSql}`);
            droppedByAge = before - (await countRows(conn));
        }
    }

    let droppedByCap = 0;
    const afterAge = opts.dryRun ? before - droppedByAge : await countRows(conn);
    if (afterAge > opts.maxRows) {
        const overflow = afterAge - opts.maxRows;
        if (opts.dryRun) {
            droppedByCap = overflow;
        } else {
            // Evict oldest first; removed rows naturally rank earliest under
            // ORDER BY last_seen_at because removed_at is set to a later ts.
            await conn.run(
                `DELETE FROM ps_listing
                 WHERE rowid IN (
                     SELECT rowid FROM ps_listing
                     ORDER BY removed_at IS NULL, last_seen_at ASC
                     LIMIT $1
                 )`,
                [overflow],
            );
            droppedByCap = afterAge - (await countRows(conn));
        }
    }

    const after = opts.dryRun ? before - droppedByAge - droppedByCap : await countRows(conn);
    return { beforeRows: before, droppedByAge, droppedByCap, afterRows: after };
}

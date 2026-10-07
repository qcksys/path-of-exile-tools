import type { DuckDBConnection } from "@duckdb/node-api";
import { queryAll } from "#src/shared/db.ts";

export async function pruneEquipment(
    conn: DuckDBConnection,
    opts: { keepDays: number; maxRows: number; dryRun?: boolean },
) {
    const days = Math.max(0, Math.floor(opts.keepDays));
    const retainedHours = `SELECT h.rowid FROM ps_equipment_hour h
        WHERE h.observed_hour < epoch(date_trunc('hour', current_timestamp - INTERVAL ${days} DAY))
        AND NOT EXISTS (
            SELECT 1 FROM ps_equipment_cohort_hour c LEFT JOIN rollup_state r
                ON r.stream_name = 'equipment' AND r.league = c.league AND r.hour = c.hour
            WHERE c.league = h.league AND c.hour BETWEEN h.observed_hour AND h.observed_hour + 23 * 3600
                AND (r.pushed_at IS NULL OR c.changed_at > r.pushed_at)
        )`;
    let hourlyRows = 0;
    if (days > 0) {
        const [count] = await queryAll<{ n: string }>(
            conn,
            `SELECT count(*) AS n FROM (${retainedHours})`,
        );
        hourlyRows = Number(count?.n ?? 0);
        if (!opts.dryRun) {
            await conn.run(`DELETE FROM ps_equipment_hour WHERE rowid IN (${retainedHours})`);
            await conn.run(`DELETE FROM ps_equipment_cohort_hour c
                WHERE c.hour < epoch(date_trunc('hour', current_timestamp - INTERVAL ${days} DAY))
                AND NOT EXISTS (SELECT 1 FROM ps_equipment_hour h WHERE h.league = c.league AND h.observed_hour = c.hour)
                AND EXISTS (SELECT 1 FROM rollup_state r WHERE r.stream_name = 'equipment'
                    AND r.league = c.league AND r.hour = c.hour AND c.changed_at <= r.pushed_at)`);
        }
    }
    const [total] = await queryAll<{ n: string }>(
        conn,
        "SELECT count(*) AS n FROM ps_equipment_listing",
    );
    const excess = Math.max(0, Number(total?.n ?? 0) - Math.max(0, Math.floor(opts.maxRows)));
    const removable = `SELECT l.rowid, l.last_seen_at FROM ps_equipment_listing l
        WHERE l.removed_at IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM ps_equipment_hour h WHERE h.account_name = l.account_name AND h.item_id = l.item_id
                ${opts.dryRun && days > 0 ? `AND h.rowid NOT IN (${retainedHours})` : ""}
        )`;
    const eligible = `SELECT rowid FROM (${removable}) WHERE
        ${days > 0 ? `last_seen_at < current_timestamp - INTERVAL ${days} DAY OR` : ""}
        rowid IN (SELECT rowid FROM (${removable}) ORDER BY last_seen_at LIMIT ${excess})`;
    const [count] = await queryAll<{ n: string }>(conn, `SELECT count(*) AS n FROM (${eligible})`);
    const listings = Number(count?.n ?? 0);
    if (!opts.dryRun)
        await conn.run(`DELETE FROM ps_equipment_listing WHERE rowid IN (${eligible})`);
    return { listings, hourlyRows };
}

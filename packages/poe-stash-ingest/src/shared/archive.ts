import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { DuckDBConnection } from "@duckdb/node-api";
import { queryAll, withTransaction } from "#src/shared/db.ts";

const DAY = 86400;
/** A size-triggered archive never takes the latest days, which sale and rollup corrections use. */
export const MIN_ARCHIVE_AGE_DAYS = 3;

export interface ArchiveOptions {
    /** Directory that receives one folder of Parquet files per archived UTC day. */
    dir: string;
    /** Archive rows older than this many days. */
    keepDays: number;
    /** While the database uses more than this, also archive days younger than `keepDays`. */
    maxBytes: number;
    /** Most days to archive in one call, so a backlog cannot stall a capture cycle. */
    maxDays?: number;
    now?: Date;
}

export interface ArchiveResult {
    days: string[];
    rows: Record<string, number>;
    files: string[];
}

interface Target {
    table: string;
    /** Epoch seconds that decide which UTC day a row belongs to. */
    time: string;
    /** Rows that may leave the database once their day is archived. */
    guard: string;
}

// Hours whose rollup was delivered after every listing and sale change, so deleting their
// observations cannot make a later rollup replace a delivered hour with partial data.
const DELIVERED_HOURS = `CREATE OR REPLACE TEMP TABLE archive_delivered_hour AS
    SELECT r.league, r.hour FROM rollup_state r
    WHERE r.stream_name = 'psapi'
        AND NOT EXISTS (SELECT 1 FROM ps_listing_hour l
            WHERE l.league = r.league AND l.observed_hour = r.hour AND l.last_seen_at > r.pushed_at)
        AND NOT EXISTS (SELECT 1 FROM ps_sale s
            WHERE s.league = r.league AND epoch(date_trunc('hour', s.removed_at))::BIGINT = r.hour
                AND s.updated_at > r.pushed_at)`;
const SALE_HOUR = "epoch(date_trunc('hour', t.removed_at))::BIGINT";

// Ordered so that each guard sees the rows an earlier target already removed.
const TARGETS: Target[] = [
    {
        table: "ps_capture_page",
        time: "t.captured_at // 1000",
        guard: "t.processed_at IS NOT NULL",
    },
    {
        table: "ps_listing_hour",
        time: "t.observed_hour",
        guard: `EXISTS (SELECT 1 FROM archive_delivered_hour d
            WHERE d.league = t.league AND d.hour = t.observed_hour)`,
    },
    {
        table: "ps_sale",
        time: SALE_HOUR,
        guard: `EXISTS (SELECT 1 FROM archive_delivered_hour d
            WHERE d.league = t.league AND d.hour = ${SALE_HOUR})`,
    },
    { table: "ps_listing", time: "epoch(t.removed_at)::BIGINT", guard: "TRUE" },
    {
        table: "ps_equipment_hour",
        time: "t.observed_hour",
        // Equipment summaries reach 24 hours forward, so each later window must be delivered.
        guard: `NOT EXISTS (SELECT 1 FROM ps_equipment_cohort_hour c LEFT JOIN rollup_state r
            ON r.stream_name = 'equipment' AND r.league = c.league AND r.hour = c.hour
            WHERE c.league = t.league AND c.hour BETWEEN t.observed_hour AND t.observed_hour + 23 * 3600
                AND (r.pushed_at IS NULL OR c.changed_at > r.pushed_at))`,
    },
    {
        table: "ps_equipment_cohort_hour",
        time: "t.hour",
        guard: `NOT EXISTS (SELECT 1 FROM ps_equipment_hour h WHERE h.league = t.league AND h.observed_hour = t.hour)
            AND EXISTS (SELECT 1 FROM rollup_state r WHERE r.stream_name = 'equipment'
                AND r.league = t.league AND r.hour = t.hour AND t.changed_at <= r.pushed_at)`,
    },
    {
        table: "ps_equipment_listing",
        time: "epoch(t.removed_at)::BIGINT",
        guard: `NOT EXISTS (SELECT 1 FROM ps_equipment_hour h
            WHERE h.account_name = t.account_name AND h.item_id = t.item_id)`,
    },
    {
        table: "cx_market_hour",
        time: "t.observed_hour",
        guard: `EXISTS (SELECT 1 FROM rollup_state r WHERE r.stream_name = 'cxapi'
            AND r.league = t.league AND r.hour = t.observed_hour)`,
    },
];
const PAYLOADS = ["ps_capture_payload_meta", "ps_capture_payload_chunk", "ps_capture_payload"];

const quote = (path: string) => `'${path.replaceAll("'", "''")}'`;

/** Archiving is off unless `PS_ARCHIVE_DIR` is set. */
export function archiveSettings(env = process.env): ArchiveOptions | undefined {
    if (!env.PS_ARCHIVE_DIR) return undefined;
    const keepDays = Number(env.PS_ARCHIVE_KEEP_DAYS ?? 30);
    const maxGb = Number(env.PS_ARCHIVE_MAX_GB ?? 100);
    if (!(keepDays >= MIN_ARCHIVE_AGE_DAYS) || !(maxGb > 0))
        throw new Error(
            `PS_ARCHIVE_KEEP_DAYS must be at least ${MIN_ARCHIVE_AGE_DAYS} and PS_ARCHIVE_MAX_GB positive.`,
        );
    return { dir: env.PS_ARCHIVE_DIR, keepDays, maxBytes: maxGb * 1024 ** 3 };
}

export async function databaseBytes(conn: DuckDBConnection): Promise<number> {
    const [row] = await queryAll<{ bytes: string }>(
        conn,
        `SELECT (used_blocks * block_size)::BIGINT AS bytes FROM pragma_database_size()
        WHERE database_name = current_database()`,
    );
    return Number(row?.bytes ?? 0);
}

/**
 * Moves whole UTC days of old rows into zstd Parquet files under `dir/<YYYY-MM-DD>/`, then deletes
 * them. Rows still needed for delivery, replay or sale corrections stay until a later run.
 */
export async function archiveOldData(
    conn: DuckDBConnection,
    opts: ArchiveOptions,
): Promise<ArchiveResult> {
    const now = Math.floor((opts.now ?? new Date()).getTime() / 1000);
    const today = now - (now % DAY);
    const result: ArchiveResult = { days: [], rows: {}, files: [] };
    const run = new Date(now * 1000).toISOString().replace(/[-:]|\.\d+/g, "");
    while (result.days.length < (opts.maxDays ?? 1)) {
        const ageDays =
            (await databaseBytes(conn)) > opts.maxBytes
                ? Math.min(opts.keepDays, MIN_ARCHIVE_AGE_DAYS)
                : opts.keepDays;
        await conn.run(DELIVERED_HOURS);
        const start = await oldestDay(conn, today - Math.ceil(ageDays) * DAY);
        if (start === undefined) break;
        const day = new Date(start * 1000).toISOString().slice(0, 10);
        const dir = join(opts.dir, day);
        await mkdir(dir, { recursive: true });
        const window = `BETWEEN ${start} AND ${start + DAY - 1}`;
        for (const target of TARGETS) {
            const rows = `SELECT t.rowid FROM ${target.table} t
                WHERE ${target.time} ${window} AND ${target.guard}`;
            if (target.table === "ps_capture_page") {
                await conn.run(`CREATE OR REPLACE TEMP TABLE archive_hash AS
                    SELECT DISTINCT response_hash FROM ps_capture_page WHERE rowid IN (${rows})`);
            }
            await move(
                conn,
                target.table,
                rows,
                join(dir, `${target.table}-${run}.parquet`),
                result,
            );
        }
        // Payloads are shared by checksum, so one leaves with the last page that references it.
        for (const table of PAYLOADS) {
            await move(
                conn,
                table,
                `SELECT rowid FROM ${table} WHERE response_hash IN (SELECT response_hash FROM archive_hash)
                    AND response_hash NOT IN (SELECT response_hash FROM ps_capture_page)`,
                join(dir, `${table}-${run}.parquet`),
                result,
            );
        }
        result.days.push(day);
    }
    if (result.days.length) await conn.run("CHECKPOINT");
    return result;
}

async function oldestDay(conn: DuckDBConnection, before: number) {
    const candidates = TARGETS.map(
        (target) =>
            `SELECT min(${target.time}) AS time FROM ${target.table} t
            WHERE ${target.time} < ${before} AND ${target.guard}`,
    ).join(" UNION ALL ");
    const [row] = await queryAll<{ time: string | null }>(
        conn,
        `SELECT min(time) AS time FROM (${candidates})`,
    );
    if (row?.time === null || row?.time === undefined) return undefined;
    const time = Number(row.time);
    return time - (((time % DAY) + DAY) % DAY);
}

async function move(
    conn: DuckDBConnection,
    table: string,
    rows: string,
    file: string,
    result: ArchiveResult,
) {
    await withTransaction(conn, async () => {
        await conn.run(`CREATE OR REPLACE TEMP TABLE archive_row AS ${rows}`);
        const [selected] = await queryAll<{ n: string }>(
            conn,
            "SELECT count(*) AS n FROM archive_row",
        );
        const count = Number(selected?.n ?? 0);
        if (!count) return;
        try {
            await conn.run(
                `COPY (SELECT * FROM ${table} WHERE rowid IN (SELECT rowid FROM archive_row))
                TO ${quote(file)} (FORMAT parquet, COMPRESSION zstd)`,
            );
            const [written] = await queryAll<{ n: string }>(
                conn,
                `SELECT count(*) AS n FROM read_parquet(${quote(file)})`,
            );
            if (Number(written?.n) !== count)
                throw new Error(`Archive ${file} holds ${written?.n} of ${count} rows.`);
            await conn.run(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM archive_row)`);
        } catch (error) {
            await rm(file, { force: true });
            throw error;
        }
        result.rows[table] = (result.rows[table] ?? 0) + count;
        result.files.push(file);
    });
}

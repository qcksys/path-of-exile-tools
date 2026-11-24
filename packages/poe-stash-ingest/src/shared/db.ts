import { type DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";

const SCHEMA_SQL = /* sql */ `
CREATE TABLE IF NOT EXISTS ps_listing (
    account_name VARCHAR NOT NULL,
    stash_id VARCHAR NOT NULL,
    item_id VARCHAR NOT NULL,
    league VARCHAR NOT NULL,
    item_key VARCHAR NOT NULL,
    icon_asset VARCHAR,
    identified BOOLEAN NOT NULL,
    frame_type INTEGER NOT NULL,
    type_line VARCHAR NOT NULL,
    base_type VARCHAR NOT NULL,
    name VARCHAR,
    rarity VARCHAR,
    corrupted BOOLEAN NOT NULL DEFAULT FALSE,
    foil_variation INTEGER,
    price_amount DOUBLE,
    price_currency VARCHAR,
    stack_size INTEGER,
    mod_signature JSON,
    raw_item JSON NOT NULL,
    first_seen_at TIMESTAMP NOT NULL,
    last_seen_at TIMESTAMP NOT NULL,
    removed_at TIMESTAMP
);

-- The listing tables keep no indexes. The worker finds their rows by its own listing_id and
-- equipment_id (see listing-state.ts), through joins no index serves. DuckDB 2.0 counts index
-- memory inside its limit, where these held most of it, and reclaims deleted rows from an indexed
-- table only a whole row group at a time. A primary key is rebuilt away (UNKEYED_TABLES).
DROP INDEX IF EXISTS ps_listing_league_lastseen;
DROP INDEX IF EXISTS ps_listing_league_itemkey;
DROP INDEX IF EXISTS ps_listing_removed;
DROP INDEX IF EXISTS ps_listing_icon;
DROP INDEX IF EXISTS ps_listing_item_key;
DROP INDEX IF EXISTS ps_listing_stash;

ALTER TABLE ps_listing ADD COLUMN IF NOT EXISTS signature_value VARCHAR;
-- Listings seen before links were recorded count as unlinked until their stash is re-sent.
ALTER TABLE ps_listing ADD COLUMN IF NOT EXISTS links INTEGER DEFAULT 0;
-- 'merchant' or 'other' (see listingTab); NULL for listings seen before tabs were recorded.
ALTER TABLE ps_listing ADD COLUMN IF NOT EXISTS tab VARCHAR;

CREATE TABLE IF NOT EXISTS ps_listing_hour AS
    SELECT * EXCLUDE (removed_at, raw_item),
           epoch(date_trunc('hour', last_seen_at))::BIGINT AS observed_hour
    FROM ps_listing;

-- The hour tables keep no indexes. DuckDB never scans them by index (hour filters use zonemaps),
-- inserts skip existing rows with NOT EXISTS, and an index's memory is never released once
-- loaded, so on these ever-growing tables it crowded out every query.
DROP INDEX IF EXISTS ps_listing_hour_pk;
DROP INDEX IF EXISTS ps_listing_hour_time;
ALTER TABLE ps_listing_hour ADD COLUMN IF NOT EXISTS signature_value VARCHAR;
ALTER TABLE ps_listing_hour ADD COLUMN IF NOT EXISTS links INTEGER DEFAULT 0;
ALTER TABLE ps_listing_hour ADD COLUMN IF NOT EXISTS tab VARCHAR;

CREATE TABLE IF NOT EXISTS ps_sale AS
    SELECT * EXCLUDE (raw_item), 'pending'::VARCHAR AS status,
        NULL::TIMESTAMP AS eligible_since, NULL::DOUBLE AS market_price,
        0::BIGINT AS market_sellers, current_timestamp::TIMESTAMP AS updated_at
    FROM ps_listing WHERE FALSE;
-- No indexes, as for ps_listing: a sale is recorded once by the listing batch's NOT EXISTS check.
-- An indexed status also turned every status change into a delete and insert of the whole row.
DROP INDEX IF EXISTS ps_sale_pk;
DROP INDEX IF EXISTS ps_sale_status;
ALTER TABLE ps_sale ADD COLUMN IF NOT EXISTS links INTEGER DEFAULT 0;
ALTER TABLE ps_sale ADD COLUMN IF NOT EXISTS tab VARCHAR;
-- Added after the hour and sale tables copied ps_listing's columns, so neither has it.
-- NULL (rows written before it) never matches, so those rows are rewritten once.
ALTER TABLE ps_listing ADD COLUMN IF NOT EXISTS content_digest VARCHAR;
-- The worker's own row identity (see listing-state.ts): DuckDB renumbers row IDs as it vacuums.
-- Added after the hour and sale tables copied ps_listing's columns, so neither has it.
ALTER TABLE ps_listing ADD COLUMN IF NOT EXISTS listing_id BIGINT;

CREATE TABLE IF NOT EXISTS pipeline_health (
    id INTEGER PRIMARY KEY, last_poll_at TIMESTAMP NOT NULL, caught_up BOOLEAN NOT NULL
);
ALTER TABLE pipeline_health ADD COLUMN IF NOT EXISTS last_caught_up_at TIMESTAMP;
CREATE TABLE IF NOT EXISTS ps_equipment_listing (
    account_name VARCHAR NOT NULL,
    item_id VARCHAR NOT NULL,
    stash_id VARCHAR NOT NULL,
    league VARCHAR NOT NULL,
    revision VARCHAR NOT NULL,
    matches JSON NOT NULL,
    unknown_matches JSON NOT NULL,
    price_amount DOUBLE,
    price_currency VARCHAR,
    raw_item JSON NOT NULL,
    last_seen_at TIMESTAMP NOT NULL,
    removed_at TIMESTAMP
);
-- No indexes, as for ps_listing. An indexed stash_id also turned every move into a delete and insert.
DROP INDEX IF EXISTS ps_equipment_stash;
DROP INDEX IF EXISTS ps_equipment_item;
CREATE TABLE IF NOT EXISTS ps_equipment_hour AS
    SELECT * EXCLUDE (raw_item, removed_at),
        epoch(date_trunc('hour', last_seen_at))::BIGINT AS observed_hour
    FROM ps_equipment_listing WHERE FALSE;
-- No indexes, as for ps_listing_hour.
DROP INDEX IF EXISTS ps_equipment_hour_pk;
DROP INDEX IF EXISTS ps_equipment_hour_time;
-- After ps_equipment_hour copied its columns; see ps_listing.content_digest.
ALTER TABLE ps_equipment_listing ADD COLUMN IF NOT EXISTS content_digest VARCHAR;
-- The worker's own row identity (see equipment-state.ts), as ps_listing.listing_id.
ALTER TABLE ps_equipment_listing ADD COLUMN IF NOT EXISTS equipment_id BIGINT;
CREATE TABLE IF NOT EXISTS ps_equipment_cohort_hour (
    revision VARCHAR NOT NULL, league VARCHAR NOT NULL, hour BIGINT NOT NULL,
    cohort_id VARCHAR NOT NULL, changed_at TIMESTAMP NOT NULL,
    PRIMARY KEY (revision, league, hour, cohort_id)
);
CREATE TABLE IF NOT EXISTS pipeline_config (key VARCHAR PRIMARY KEY, value VARCHAR NOT NULL);
CREATE TABLE IF NOT EXISTS ps_checkpoint (
    id VARCHAR PRIMARY KEY, captured_at BIGINT NOT NULL, payload JSON NOT NULL, delivered BOOLEAN NOT NULL
);
CREATE TABLE IF NOT EXISTS ps_daily_sample (day VARCHAR PRIMARY KEY, checkpoint_id VARCHAR NOT NULL);
CREATE TABLE IF NOT EXISTS ps_capture_payload (
    response_hash VARCHAR PRIMARY KEY, response_gzip BLOB NOT NULL, response_bytes BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS ps_capture_payload_meta (
    response_hash VARCHAR PRIMARY KEY, response_bytes BIGINT NOT NULL,
    compressed_bytes BIGINT NOT NULL, chunk_count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ps_capture_payload_chunk (
    response_hash VARCHAR NOT NULL, chunk_index INTEGER NOT NULL, response_gzip BLOB NOT NULL,
    PRIMARY KEY (response_hash, chunk_index)
);
CREATE TABLE IF NOT EXISTS ps_capture_page (
    id VARCHAR PRIMARY KEY, realm VARCHAR NOT NULL, league VARCHAR NOT NULL,
    cursor VARCHAR, next_cursor VARCHAR NOT NULL, captured_at BIGINT NOT NULL,
    response_hash VARCHAR NOT NULL, processed_at TIMESTAMP
);
-- Capture times are only aggregated and ordered, which no index serves.
DROP INDEX IF EXISTS ps_capture_page_time;
ALTER TABLE ps_capture_page ADD COLUMN IF NOT EXISTS equipment_revision VARCHAR;
CREATE TABLE IF NOT EXISTS ps_capture_stash (stash_id VARCHAR PRIMARY KEY);
CREATE TABLE IF NOT EXISTS ps_equipment_reclassify (
    revision VARCHAR NOT NULL, league VARCHAR NOT NULL, hour BIGINT NOT NULL,
    after_time BIGINT NOT NULL, after_id VARCHAR NOT NULL, completed BOOLEAN NOT NULL,
    PRIMARY KEY (revision, league, hour)
);
CREATE TABLE IF NOT EXISTS ps_equipment_reclassify_hour AS
    SELECT * FROM ps_equipment_hour WHERE FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS ps_equipment_reclassify_hour_pk
    ON ps_equipment_reclassify_hour(account_name, item_id, revision, observed_hour);
CREATE TABLE IF NOT EXISTS ps_equipment_cohort (
    revision VARCHAR NOT NULL, cohort_id VARCHAR NOT NULL, definition JSON NOT NULL,
    PRIMARY KEY (revision, cohort_id)
);
-- Definitions each receiver has acknowledged, so restarts do not resend them.
CREATE TABLE IF NOT EXISTS ps_equipment_cohort_delivered (
    url VARCHAR NOT NULL, revision VARCHAR NOT NULL, cohort_id VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS icon_basemap (
    icon_asset VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    base_type VARCHAR NOT NULL,
    seen_count BIGINT NOT NULL DEFAULT 1,
    first_seen_at TIMESTAMP NOT NULL,
    last_seen_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS cx_market_hour (
    league VARCHAR NOT NULL,
    market_id VARCHAR NOT NULL,
    observed_hour BIGINT NOT NULL,
    lowest_ratio JSON NOT NULL,
    highest_ratio JSON NOT NULL,
    volume_traded JSON NOT NULL,
    lowest_stock JSON NOT NULL,
    highest_stock JSON NOT NULL,
    PRIMARY KEY (league, market_id, observed_hour)
);

CREATE TABLE IF NOT EXISTS stream_cursor (
    stream_name VARCHAR PRIMARY KEY,
    cursor VARCHAR NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS rollup_state (
    stream_name VARCHAR NOT NULL,
    league VARCHAR NOT NULL,
    hour BIGINT NOT NULL,
    pushed_at TIMESTAMP NOT NULL,
    row_count BIGINT NOT NULL,
    PRIMARY KEY (stream_name, league, hour)
);
`;

export interface DbHandle {
    conn: DuckDBConnection;
    close: () => Promise<void>;
}

/** Tables that once had a primary key, which DuckDB cannot drop; see the listing tables above. */
const UNKEYED_TABLES = ["ps_listing", "ps_equipment_listing"];

/** Rewrites `table` with the same columns, defaults and NOT NULLs, and no primary key. */
async function dropPrimaryKey(conn: DuckDBConnection, table: string) {
    const [keys] = await queryAll<{ n: number }>(
        conn,
        `SELECT count(*)::INTEGER AS n FROM duckdb_constraints() WHERE database_name = current_database()
            AND schema_name = 'main' AND table_name = $1 AND constraint_type = 'PRIMARY KEY'`,
        [table],
    );
    if (!keys?.n) return;
    const columns = await queryAll<{
        name: string;
        type: string;
        nullable: boolean;
        fallback: string | null;
    }>(
        conn,
        `SELECT column_name AS name, data_type AS type, is_nullable AS nullable, column_default AS fallback
        FROM duckdb_columns() WHERE database_name = current_database() AND schema_name = 'main'
            AND table_name = $1 ORDER BY column_index`,
        [table],
    );
    const definitions = columns.map(
        (column) =>
            `"${column.name}" ${column.type}` +
            (column.fallback === null ? "" : ` DEFAULT ${column.fallback}`) +
            (column.nullable ? "" : " NOT NULL"),
    );
    const started = performance.now();
    await withTransaction(conn, async () => {
        await conn.run(`CREATE TABLE ${table}_unkeyed (${definitions.join(", ")})`);
        await conn.run(`INSERT INTO ${table}_unkeyed SELECT * FROM ${table}`);
        await conn.run(`DROP TABLE ${table}`);
        await conn.run(`ALTER TABLE ${table}_unkeyed RENAME TO ${table}`);
    });
    await conn.run("CHECKPOINT");
    console.log(
        `rebuilt ${table} without its primary key in ${((performance.now() - started) / 1000).toFixed(1)} s`,
    );
}

export async function openDb(path = process.env.PS_LOCAL_DB ?? "./data.duckdb"): Promise<DbHandle> {
    const instance = await DuckDBInstance.fromCache(path, {
        // biome-ignore lint/style/useNamingConvention: DuckDB configuration key.
        memory_limit: process.env.PS_MEMORY_LIMIT ?? "1GB",
        threads: process.env.PS_THREADS ?? "2",
        // DuckDB 2.0 computes DISTINCT aggregates from a materialized copy of their input, which
        // for the equipment rollup is every listing's expanded cohorts.
        // biome-ignore lint/style/useNamingConvention: DuckDB configuration key.
        disabled_optimizers: "distinct_aggregate_rewrite",
        ...(process.env.PS_CHECKPOINT_THRESHOLD
            ? // biome-ignore lint/style/useNamingConvention: DuckDB configuration key.
              { checkpoint_threshold: process.env.PS_CHECKPOINT_THRESHOLD }
            : {}),
    });
    const conn = await instance.connect();
    // Pin the session to UTC so TIMESTAMP columns store UTC clock-time and
    // `epoch(date_trunc('hour', ts))` agrees with JS `Date.now()/3.6e6` unix-hour math.
    await conn.run("SET TimeZone='UTC'");
    await conn.run(SCHEMA_SQL);
    for (const table of UNKEYED_TABLES) await dropPrimaryKey(conn, table);
    // Preserve the market keys used before extractors owned their key projection.
    for (const table of ["ps_listing", "ps_listing_hour"]) {
        await conn.run(`UPDATE ${table} SET signature_value = CASE
            WHEN mod_signature IS NULL THEN ''
            WHEN mod_signature->>'kind' = 'forbidden-jewel' THEN mod_signature->>'allocatedNotable'
            WHEN mod_signature->>'kind' = 'impossible-escape' THEN mod_signature->>'keystone'
            WHEN mod_signature->>'kind' = 'forbidden-shako'
                THEN (mod_signature->>'skill') || '@' || (mod_signature->>'level')
            ELSE sha256(mod_signature::VARCHAR) END WHERE signature_value IS NULL`);
    }
    return {
        conn,
        close: async () => {
            conn.closeSync();
            instance.closeSync();
        },
    };
}

/** SQL for a TIMESTAMP column's UTC clock time, by default the transaction's start. */
export const sqlTimestamp = (at?: Date) =>
    at ? `'${at.toISOString().slice(0, 23)}'::TIMESTAMP` : "current_timestamp::TIMESTAMP";

/** Convenience: read all rows of a query as plain objects. */
export async function queryAll<T = Record<string, unknown>>(
    conn: DuckDBConnection,
    sql: string,
    params?: unknown[] | Record<string, unknown>,
): Promise<T[]> {
    const reader = params
        ? await conn.runAndReadAll(sql, params as Parameters<typeof conn.runAndReadAll>[1])
        : await conn.runAndReadAll(sql);
    return reader.getRowObjectsJson() as T[];
}

export class TransactionRollbackError extends AggregateError {
    constructor(originalError: unknown, rollbackError: unknown) {
        super([originalError, rollbackError], "Transaction failed and rollback also failed", {
            cause: originalError,
        });
        this.name = "TransactionRollbackError";
    }
}

export async function withTransaction<T>(
    conn: DuckDBConnection,
    action: () => Promise<T>,
): Promise<T> {
    await conn.run("BEGIN TRANSACTION");
    try {
        const result = await action();
        await conn.run("COMMIT");
        return result;
    } catch (error) {
        try {
            await conn.run("ROLLBACK");
        } catch (rollbackError) {
            throw new TransactionRollbackError(error, rollbackError);
        }
        throw error;
    }
}

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
    removed_at TIMESTAMP,
    PRIMARY KEY (account_name, stash_id, item_id)
);

CREATE INDEX IF NOT EXISTS ps_listing_league_lastseen ON ps_listing(league, last_seen_at);
CREATE INDEX IF NOT EXISTS ps_listing_league_itemkey ON ps_listing(league, item_key);
CREATE INDEX IF NOT EXISTS ps_listing_icon ON ps_listing(icon_asset);
CREATE INDEX IF NOT EXISTS ps_listing_removed ON ps_listing(removed_at);

ALTER TABLE ps_listing ADD COLUMN IF NOT EXISTS signature_value VARCHAR;

CREATE TABLE IF NOT EXISTS ps_listing_hour AS
    SELECT * EXCLUDE (removed_at, raw_item),
           epoch(date_trunc('hour', last_seen_at))::BIGINT AS observed_hour
    FROM ps_listing;

CREATE UNIQUE INDEX IF NOT EXISTS ps_listing_hour_pk
    ON ps_listing_hour(account_name, stash_id, item_id, observed_hour);
CREATE INDEX IF NOT EXISTS ps_listing_hour_time ON ps_listing_hour(observed_hour, league);
ALTER TABLE ps_listing_hour ADD COLUMN IF NOT EXISTS signature_value VARCHAR;

CREATE TABLE IF NOT EXISTS ps_sale AS
    SELECT * EXCLUDE (raw_item), 'pending'::VARCHAR AS status,
        NULL::TIMESTAMP AS eligible_since, NULL::DOUBLE AS market_price,
        0::BIGINT AS market_sellers, current_timestamp::TIMESTAMP AS updated_at
    FROM ps_listing WHERE FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS ps_sale_pk
    ON ps_sale(league, account_name, stash_id, item_id, removed_at);
CREATE INDEX IF NOT EXISTS ps_sale_status ON ps_sale(status);

CREATE TABLE IF NOT EXISTS pipeline_health (
    id INTEGER PRIMARY KEY, last_poll_at TIMESTAMP NOT NULL, caught_up BOOLEAN NOT NULL
);
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
    removed_at TIMESTAMP,
    PRIMARY KEY (account_name, item_id)
);
CREATE INDEX IF NOT EXISTS ps_equipment_stash ON ps_equipment_listing(stash_id);
CREATE TABLE IF NOT EXISTS ps_equipment_hour AS
    SELECT * EXCLUDE (raw_item, removed_at),
        epoch(date_trunc('hour', last_seen_at))::BIGINT AS observed_hour
    FROM ps_equipment_listing WHERE FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS ps_equipment_hour_pk
    ON ps_equipment_hour(account_name, item_id, revision, observed_hour);
CREATE INDEX IF NOT EXISTS ps_equipment_hour_time ON ps_equipment_hour(observed_hour, league);
CREATE TABLE IF NOT EXISTS ps_equipment_cohort_hour (
    revision VARCHAR NOT NULL, league VARCHAR NOT NULL, hour BIGINT NOT NULL,
    cohort_id VARCHAR NOT NULL, changed_at TIMESTAMP NOT NULL,
    PRIMARY KEY (revision, league, hour, cohort_id)
);
CREATE TABLE IF NOT EXISTS pipeline_config (key VARCHAR PRIMARY KEY, value VARCHAR NOT NULL);
CREATE TABLE IF NOT EXISTS ps_equipment_cohort (
    revision VARCHAR NOT NULL, cohort_id VARCHAR NOT NULL, definition JSON NOT NULL,
    PRIMARY KEY (revision, cohort_id)
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

export async function openDb(path = process.env.PS_LOCAL_DB ?? "./data.duckdb"): Promise<DbHandle> {
    const instance = await DuckDBInstance.fromCache(path);
    const conn = await instance.connect();
    // Pin the session to UTC so TIMESTAMP columns store UTC clock-time and
    // `epoch(date_trunc('hour', ts))` agrees with JS `Date.now()/3.6e6` unix-hour math.
    await conn.run("SET TimeZone='UTC'");
    await conn.run(SCHEMA_SQL);
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
        await conn.run("ROLLBACK");
        throw error;
    }
}

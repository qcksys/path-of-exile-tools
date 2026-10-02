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

CREATE TABLE IF NOT EXISTS ps_listing_hour AS
    SELECT * EXCLUDE (removed_at, raw_item),
           epoch(date_trunc('hour', last_seen_at))::BIGINT AS observed_hour
    FROM ps_listing;

CREATE UNIQUE INDEX IF NOT EXISTS ps_listing_hour_pk
    ON ps_listing_hour(account_name, stash_id, item_id, observed_hour);
CREATE INDEX IF NOT EXISTS ps_listing_hour_time ON ps_listing_hour(observed_hour, league);

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

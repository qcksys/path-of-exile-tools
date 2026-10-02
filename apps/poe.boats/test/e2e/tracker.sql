CREATE TABLE stream_cursor (
    stream_name TEXT PRIMARY KEY,
    cursor TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE currency_rate (
    league TEXT NOT NULL,
    market_id TEXT NOT NULL,
    observed_hour INTEGER NOT NULL,
    lowest_ratio TEXT NOT NULL,
    highest_ratio TEXT NOT NULL,
    volume_traded TEXT NOT NULL,
    lowest_stock TEXT NOT NULL,
    highest_stock TEXT NOT NULL,
    PRIMARY KEY (league, market_id, observed_hour)
);
CREATE TABLE listing (
    account_name TEXT NOT NULL,
    stash_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    league TEXT NOT NULL,
    item_key TEXT NOT NULL,
    identified INTEGER NOT NULL,
    type_line TEXT NOT NULL,
    base_type TEXT NOT NULL,
    name TEXT,
    corrupted INTEGER NOT NULL DEFAULT 0,
    foil_variation INTEGER,
    price_amount REAL,
    price_currency TEXT,
    icon_asset TEXT,
    raw_item TEXT,
    first_seen_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    removed_at INTEGER,
    PRIMARY KEY (account_name, stash_id, item_id)
);
CREATE TABLE icon_basemap (
    icon_asset TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    base_type TEXT NOT NULL,
    seen_count INTEGER NOT NULL DEFAULT 1,
    first_seen_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
);

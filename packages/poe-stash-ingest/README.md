# @poe-tools/stash-ingest

Two-stream Path of Exile ingestor with a **DuckDB raw store** and **HTTP-pushed hourly summaries** to poe.boats.

- **`poe-stash-ps`** — public-stash (psapi) firehose
- **`poe-stash-cx`** — currency-exchange (cxapi) hourly digest

The local DuckDB file is the _transient_ hot store — bulk-write friendly, OLAP-friendly for the rollup `GROUP BY`. The remote MySQL on poe.boats receives **only** rolled-up hourly summaries and keeps them **forever**.

## Setup

```bash
vp install
vp run env:check
```

Environment values are validated by Varlock and resolved from the 1Password dev item by default. Complete the [repository environment setup](../../README.md#environment-configuration) first. Copy `.env.example` to `.env.local` only when overriding non-secret settings. Set `APP_ENV=prod` locally to use the production item and endpoint. Authenticate through the 1Password desktop app.

The DuckDB file (default `./data.duckdb`) is created on first run. No migrations to push — the schema is declared as `CREATE TABLE IF NOT EXISTS` and applied on every connection.

## Commands

### `poe-stash-ps`

```
poe-stash-ps ingest   [--pages N] [--cursor X]
poe-stash-ps rollup   [--hour <unixhour>] [--league <name|all>] [--dry-run]
poe-stash-ps basemap                                  # rebuild icon → name from existing rows
poe-stash-ps cursor   [--set <id>]                    # show or overwrite the saved cursor
poe-stash-ps prune    [--max-rows N] [--keep-days N] [--dry-run]
```

#### Capture rule

Every item is examined; we persist:

- Every **unique** (`frameType=3`) — identified or not. Unidentified ones are keyed by their `iconAsset` so the boss-drop variants can be priced separately even before the text resolves.
- Every **identified currency-tier** item (`frameType=5` / `6`, or `rarity=Currency`).

Everything else is dropped. There is no name watchlist.

#### Mod signatures

Identified uniques are run through a registry of structured mod-extractors. The result is stored as a discriminated `ModSignature` JSON blob on the listing, and **promoted to first-class columns** on the remote `stash_unique_hourly` row:

| column            | example for Forbidden Flame                                      | example for Watcher's Eye              |
| ----------------- | ---------------------------------------------------------------- | -------------------------------------- |
| `signature_kind`  | `forbidden-jewel`                                                | `watchers-eye`                         |
| `signature_value` | `Glancing Blows`                                                 | `Anger=...;Hatred=...` (sorted)        |
| `signature_data`  | `{"kind":"forbidden-jewel","allocatedNotable":"Glancing Blows"}` | `{"kind":"watchers-eye","mods":[...]}` |

`(signature_kind, signature_value)` are PK components alongside `(league, hour, item_key, corrupted, foil_variation)`, so each tradable variant gets its own permanent hourly row. `signature_data` is the lossless payload — query into it with MySQL's JSON path operators when you need a specific field.

Rows with no extracted signature use `signature_kind = ''` and `signature_value = ''` (empty strings, not NULL, so the PK works).

#### Deferred rollup for unmapped unids

Unidentified items whose `icon_asset` is not yet present in `icon_basemap` are **excluded from rollup**. They stay in the local `ps_listing` and become eligible once an identified instance with the same `icon_asset` flows through and teaches the basemap. This keeps the remote table from accumulating `unid:<icon>` rows that can never be resolved to a unique name. Identified rows are always eligible.

Built-in extractors:

| kind                                        | example bucket key in remote `modSignatureCounts` |
| ------------------------------------------- | ------------------------------------------------- |
| `forbidden-jewel` (Forbidden Flame / Flesh) | `forbidden-jewel:Glancing Blows`                  |
| `watchers-eye` (Watcher's Eye)              | `watchers-eye:{...full mod array...}`             |
| `impossible-escape`                         | `impossible-escape:Pain Attunement`               |
| `forbidden-shako`                           | `forbidden-shako:Spell Echo`                      |

Add new extractors under `src/shared/mod-extractors/` and register them in `index.ts`.

### `poe-stash-cx`

```
poe-stash-cx ingest  [--from-hour <unix>] [--catch-up]
poe-stash-cx rollup  [--hour <unix>] [--league <name|all>] [--dry-run]
poe-stash-cx cursor  [--set <hour>]
```

cx is already hourly; rollup is a passthrough that POSTs cached `cx_market_hour` rows to poe.boats.

## Local schema (DuckDB)

| table            | one row per                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `ps_listing`     | `(account_name, stash_id, item_id)` — full lifecycle: `first_seen_at`, `last_seen_at`, `removed_at` |
| `icon_basemap`   | `icon_asset` — global, learned from identified uniques flowing through                              |
| `cx_market_hour` | `(league, market_id, observed_hour)` — cxapi snapshots                                              |
| `stream_cursor`  | `psapi` / `cxapi`                                                                                   |
| `rollup_state`   | `(stream, league, hour)` — idempotency for the remote push                                          |

## Remote schema (poe.boats — MySQL, prefixed `qsPoeBoats__stash_`)

| table                    | retention   | one row per                                |
| ------------------------ | ----------- | ------------------------------------------ |
| `stash_unique_hourly`    | **forever** | `(league, hour, bucket_key)`               |
| `stash_currency_hourly`  | **forever** | `(league, market_id, hour)`                |
| `stash_basemap_snapshot` | **forever** | `icon_asset` (public unid → name resolver) |

## Pricing unidentified vs identified

The point of preserving `iconAsset` and bucketing unids by `unid:<iconAsset>` (and joining the basemap on read) is to make **EV-of-identifying-vs-selling-unid** answerable.

For e.g. Forbidden Flame:

```sql
-- All Forbidden Flame variants in Mirage at a given hour
SELECT
    item_key,
    signature_value AS allocated_notable,
    corrupted,
    listing_count,
    JSON_EXTRACT(prices, '$.divine.median') AS median_div
FROM qsPoeBoats__stash_unique_hourly
WHERE league = 'Mirage'
    AND hour = ?
    AND item_key = 'Forbidden Flame'
ORDER BY median_div DESC;
```

The same unique appears as `item_key='unid:<iconAsset>'` (the unid bucket) and as one row per allocated-notable variant under `item_key='Forbidden Flame'`. Compare to estimate EV of identifying vs selling unid.

## Scheduling

No daemon. Run from cron / Task Scheduler / GH Actions:

```bash
# Every minute — keep psapi caught up
poe-stash-ps ingest --pages 10

# Top of each hour — pull the just-completed cx hour
poe-stash-cx ingest

# 5 past the hour — push the previous hour's summaries to poe.boats
poe-stash-ps rollup
poe-stash-cx rollup

# Daily — keep the local file from growing without bound
poe-stash-ps prune
```

## poe.boats secret

The HTTP route at `/api/stash-ingest` requires a bearer token. Store it in the environment's 1Password item as `POE_BOATS_INGEST_TOKEN`. Varlock maps that field to this package's `POE_BOATS_INGEST_TOKEN` and the worker's `STASH_INGEST_TOKEN`; deployment synchronizes the worker secret.

The default push target is `https://dev.poe.boats/api/stash-ingest`. With `APP_ENV=prod`, it becomes `https://poe.boats/api/stash-ingest`.

Generate and review database migration SQL in `apps/poe.boats` before applying it to the selected environment:

```sh
vp run types:cf
vp run db:generate
vp run db:migrate
```

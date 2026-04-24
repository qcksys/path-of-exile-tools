# @poe-tools/stash-tracker

Local SQLite ingestor for the Path of Exile public stash stream (psapi) and currency exchange archive (cxapi). Filters the firehose down to a small watchlist of boss-drop uniques and unidentified bases, stores listings with a `(accountName, stashId, itemId)` PK and full lifecycle (`first_seen_at`, `last_seen_at`, `removed_at`).

## Setup

```bash
cp .env.example .env          # fill in POE_CLIENT_ID / POE_CLIENT_SECRET / POE_USER_AGENT_CONTACT / POE_LEAGUE
vp run db:push                # create data.db and apply schema
```

`POE_REALM` defaults to pc. Set `poe2` for PoE2, or `xbox` / `sony` for console realms. GGG rejects `/pc` as a path segment, so when the realm is pc the client omits it automatically.

## Commands

| Command                                | What it does                                                                                                                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vp run ingest:cx [from_hour]`         | One hourly cxapi snapshot. Uses saved cursor, or `now - 1h` on fresh runs. Optional positional arg seeds a specific unix-hour.                                                                 |
| `vp run ingest:ps [pages] [cursor]`    | Ingest N psapi pages (default 3). Optional second arg overrides the cursor. Sleeps 1.2s between pages to respect rate limits.                                                                  |
| `vp run leagues [main\|event\|season]` | Print current leagues as a table. No DB writes.                                                                                                                                                |
| `vp run build:basemap`                 | Rebuild derived state: backfill `icon_asset` on existing rows, regenerate the `icon_basemap` table from identified uniques, and refresh `item_key` under the current keying rules. Idempotent. |
| `vp run db:studio`                     | Browse the DB at https://local.drizzle.studio                                                                                                                                                  |

### Modes

- **Watchlist mode (default)** — only items matching `src/watchlist.ts` are persisted.
- **Capture-all mode** — `POE_INGEST_ALL=1 vp run ingest:ps N` bypasses the watchlist and stores every item. Do not mix this with watchlist runs against the same DB: the stash-diff pass will mark previously-tracked non-watchlist items as `removed_at` whenever you switch back.

## Tips

### Seeding the psapi cursor

psapi is a forward-only stream. Calling without a cursor returns the _oldest_ archived change, so a fresh consumer has to walk through many thousands of pages (each 1275 events, heavily dominated by `public: false` tombstones) to reach present-day data.

**Jump to a recent cursor** by copying the current `next_change_id` from https://poe.ninja/stats (top of the page) and passing it as the second arg:

```bash
vp run ingest:ps 50 3079432831-3061989796-2972834175-3334884107-3196540083
```

Subsequent runs resume from the saved cursor — you only seed once.

### cxapi archive semantics

- Calling without `id` returns the _oldest_ archived hour (roughly Settlers launch on pc).
- The response's `next_change_id` is the next hour to fetch; when it equals the `id` you sent, you've caught up.
- The in-progress current hour is never exposed — the script defaults to `now - 1h` on fresh runs, which lands on the most recent completed hour for actively-populated realms (currently poe2).
- cxapi only has data for leagues that ship a Currency Exchange market. Mirage and most post-Settlers PoE1 leagues don't have one, so cxapi queries for those leagues return zero markets.

### Rate limits

Each response is parsed through `onRateLimit`. The client warns when any rule hits ≥80% of its budget. The psapi loop sleeps 1.2s between page fetches to stay under the 2 requests/sec bucket.

## Identifying unidentified uniques

Boss-drop uniques often enter the market unidentified, and in that state the API returns no information that distinguishes them from each other at the text level — `name` is empty and `typeLine` / `baseType` collapse to the generic base (`Cobalt Jewel`, `Heavy Belt`, `Onyx Amulet`, …). Three completely different uniques will share the same three fields and look identical.

### The icon URL tells you which unique it actually is

Every item's `icon` URL is a base64url-encoded JSON blob whose third element carries GGG's internal asset path, e.g.

```
2DItems/Jewels/PuzzlePieceJewel_GreatTangle   → Forbidden Flesh
2DItems/Jewels/EntangledElementsJewel         → That Which Was Taken
2DItems/Amulets/MasterOfGems                  → Ashes of the Stars
2DItems/Belts/Headhunter                      → Headhunter
2DItems/Belts/InjectorBelt                    → Mageblood
2DItems/Rings/UberEaterofWorlds               → Nimis
```

These paths are stable across patches and discriminate the specific unique even when the item is unidentified. `src/icon.ts` exposes `decodeIconAsset(url)` for this; every ingested row has the result stored on `listing.icon_asset`.

### Self-bootstrapping basemap

Since the stream carries _both_ identified and unidentified instances of the same uniques, we let the stream teach us the mapping. Whenever an identified unique (`frameType=3`, `identified=true`, `name` present) flows through, an entry is upserted into `icon_basemap`:

| column                      |                                      |
| --------------------------- | ------------------------------------ |
| `iconAsset` (PK)            | decoded asset path                   |
| `name`                      | canonical market name                |
| `baseType`                  | underlying base (for cross-checking) |
| `seenCount`                 | running total, useful for confidence |
| `firstSeenAt`, `lastSeenAt` | lifecycle                            |

Unidentified rows are resolved by JOIN at read time:

```sql
SELECT l.*, COALESCE(b.name, l.name) AS resolved_name
FROM listing l
LEFT JOIN icon_basemap b ON l.icon_asset = b.icon_asset
WHERE l.removed_at IS NULL AND l.league = 'Mirage';
```

`COALESCE` gives you the identified name when present, falls back to the basemap for unids, and `NULL` when neither matches (rare — genuinely novel icon, worth investigating).

`vp run build:basemap` seeds this from whatever identified uniques are already in the DB, so you don't have to wait for the live stream to surface every variant — a handful of runs with `POE_INGEST_ALL=1` typically covers the common boss drops immediately.

### `item_key` keys on icon, not baseType, for unids

The canonical key stored in `listing.item_key`:

- **Identified unique** → `${name}[|corrupted][|foil:N]`
- **Unidentified unique** → `unid:${iconAsset}`, falling back to `unid:${baseType}` only when the icon URL can't be decoded

This makes aggregation by unique actually work for unids. Example keys from a real run:

```
unid:2DItems/Jewels/PuzzlePieceJewel_GreatTangle    → Forbidden Flesh (corrupted)
unid:2DItems/Belts/Headhunter                       → Headhunter
Forbidden Flesh|corrupted                           → identified corrupted FF
Mageblood|corrupted                                 → identified corrupted Mageblood
Forbidden Flame|corrupted|foil:8                    → Harbinger-foil corrupted FF-flame
```

`build:basemap` rewrites `item_key` for every row with `raw_item` so old rows (which were keyed by baseType before this change) migrate cleanly. If you add new basemap-affecting logic later, re-running the script reconciles the whole table.

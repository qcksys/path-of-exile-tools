# @poe-tools/stash-ingest

Two-stream Path of Exile ingestor with a **DuckDB raw store** and **HTTP-pushed hourly summaries** to poe.boats.

- **`poe-stash-ps`** — public-stash (psapi) firehose
- **`poe-stash-cx`** — currency-exchange (cxapi) hourly digest

The local DuckDB file holds compressed crafting-input observations and the working tables used for hourly summaries. Back up its persistent volume: saved cursors cannot reliably recover historical versions. Remote MySQL keeps hourly summaries, worker status, cursor metadata and one daily diagnostic sample; the filtered source archive stays on the ingestion server.

## Setup

For the complete local app/MySQL/worker setup, historical backfill, monitoring and server
operations, see the [ingestion server runbook](../../docs/ingestion-server.md). Historical backfill applies to exchange data only.

### Docker Compose (local pipeline)

The repository's `compose.yaml` runs one ingestion worker with a persistent DuckDB volume.
It includes both stash and exchange ingestion and retries pending summary deliveries. Install
Docker with Compose v2.24 or newer, complete the repository's 1Password environment setup,
then run from the repository root:

```powershell
$env:APP_ENV = "dev"
$env:VARLOCK_TELEMETRY_DISABLED = "1"
$env:INGEST_LEAGUE = "Allflame"
$env:COMPOSE_PROJECT_NAME = "poe-allflame-pc"
vp run '@poe-tools/stash-ingest#docker:up'
docker compose logs -f ingest
```

Varlock resolves the existing environment-specific credentials on the host. Compose mounts
the client secret and ingest token under `/run/secrets`; neither is copied into the image or
included in command arguments. Only package source files and manifests enter the build context.
Local and development configuration uses Varlock's encrypted disk cache with a 12-hour lifetime
for resolved 1Password values, shared across subsequent command invocations. The app and tracker
use the same policy. A cache miss still needs authorization; new references, explicit cache clearing
or `--skip-cache` can require another request before the other entries expire. Production caching
remains disabled. Running `op whoami` directly does not test this cache; Varlock can reuse cached
values without an authenticated CLI session.
The container runs as the unprivileged `node` user and reads its credentials before validating
the environment. `POE_BOATS_INGEST_URL` selects the receiving app; for an app on the host use
`host.docker.internal` in that URL. No database port is exposed.

Set `INGEST_PAGES` to change the pages per cycle (default 50), or `INGEST_CURRENCY=false` to
disable exchange ingestion. The default league is `all`. Use a distinct `COMPOSE_PROJECT_NAME`
for each realm and season so its volume and cursors remain separate. Never scale the worker or
run a second CLI process against its DuckDB file. DuckDB rejects concurrent writers.

```powershell
docker compose ps
docker compose stop ingest
docker compose start ingest
docker compose down
```

`stop` allows the active cycle to finish and closes DuckDB; `start` resumes committed cursors.
`down` removes containers and leaves the named volume intact. `down --volumes` deletes that
local history and should only be used when deliberately discarding it. Remote chart history is
not deleted by either command. Health reflects periodic heartbeats and committed stage progress:
a failed stage, a heartbeat older than three minutes, or a running stage without progress for
ten minutes makes the worker unhealthy. Logs identify the failed stage and the watch loop retries
it. Docker's restart policy restarts a crashed process, not an unhealthy one. The receiving app's
`/server-status` page shows the same worker report alongside actual stored history coverage.
If a transaction and its rollback both fail, the processing command exits with code 1 before
running another stage or closing DuckDB. Closing that instance can checkpoint inconsistent
state. Docker then starts a fresh process against the retained volume; this does not repair
existing missing or damaged archive payloads. Ordinary source and delivery failures continue
to use the watch loop's retry behavior.
Local health updates do not wait for remote status delivery. The worker sends status reports
serially, coalesces updates while a report is in flight, and waits for its final shutdown report
using the existing request timeout. Slow status delivery therefore does not pause capture.
Acknowledged immutable equipment definitions are reused for later rollups in the same worker
session and receiver URL. New definitions are sent before their prices, and failed uploads are
retried. Restart the worker after replacing the receiver database at the same URL so it resends
the definitions; the cache is bounded and does not survive a restart.

After the cohort manifest revision changes, the same worker also reclassifies its archived
observations from the last 24 completed hours after exchange capture, newest hour first.
This lets replayable newer hours proceed before missing older payloads. Missing bodies
still fail explicitly without advancing their replay progress or marking the hour complete.
Each cycle reclassifies up to its live page limit, capped at five archived pages.
Each reclassified hour re-delivers the 24 hours whose windows include it, so with fast cycles set
`PS_RECLASSIFY_PAGES_PER_HOUR` to cap the receiver's write load; cycles without an allowance skip
reclassification and its checkpoint.
Live stash capture also checkpoints between committed pages before fetching the next
page, releasing accumulated indexes without splitting a page transaction. A failure
preserves the last committed cursor and leaves the next page unfetched for retry.
Single-page and caught-up captures do not add a final page checkpoint.
On a large database each checkpoint rewrites gigabytes of index. With memory to spare, set
`PS_CHECKPOINT_THRESHOLD` (for example `1GB`, with `PS_MEMORY_LIMIT=10GB`): pages are then not
checkpointed individually, and DuckDB checkpoints once its WAL reaches that size. On the hub's
41 GB database, 60 replayed pages averaged 4.4 s instead of about 22 s and wrote about 0.2 GiB
each instead of about 4.3 GiB, with peak memory near the DuckDB limit. Index memory is not
bounded by `PS_MEMORY_LIMIT`, so leave the container several gigabytes above it.
Before replay, the PoE 1 pipeline checkpoints committed capture and exchange writes
to release loaded DuckDB indexes before publication loads its own indexes. This
also runs after ordinary capture failures because earlier pages may have committed.
A checkpoint failure skips replay for that cycle while pending deliveries still run;
a failed transaction rollback stops before checkpointing. PoE 2 skips this boundary.
Each hour is staged privately and published only when all its archived pages are processed.
Original capture times are retained; this does not make old listings current or fetch
uncaptured history. Live listings, removals and source cursors are not replaced. Progress
is resumable in the existing DuckDB volume, and corrected hourly summaries use the normal
acknowledged delivery path. Logs report reclassified page and completed-hour counts.
Each acknowledged upload batch also advances worker progress, so a long historical
delivery is not reported as stalled while its receiver is accepting rows.

### Temporary equipment diagnostics

To investigate unknown equipment cohort matches without opening the live DuckDB file,
place `equipment-diagnostics.request.json` beside the worker's `INGEST_STATUS_FILE`.
The processing command reads this optional request before each cycle. It must name the
exact worker realm and league, current cohort IDs, and
an expiry no more than 24 hours away:

```json
{
    "format": 1,
    "realm": "pc",
    "league": "Allflame",
    "expiresAt": "2026-10-25T12:00:00Z",
    "cohortIds": ["replace-with-a-current-cohort-id"]
}
```

Use a future expiry and actual IDs from the active cohort manifest. Missing, expired,
invalid or mismatched requests leave capture disabled; PoE 2 and all-league workers skip it.
Ordinary prepared-item cohorts and source-preparation cohorts can share one request;
unknown IDs reject the whole request. Source-preparation metadata is present in a fixture's
target only when its cohort has that profile. Known matches and definite no-matches are
not sampled.
The owning process samples target unknowns during live capture and normal pending archive
reclassification, then reclassifies sanitized items and requires identical complete matches
and unknowns. It writes `equipment-diagnostics.json` in the same directory only after the
page transaction commits.
The file excludes account, stash and item identifiers, listing notes, prices and credentials.
Samples identify their `live` or `archive` origin and retain the original capture time and
hour. Archive sampling does not revisit completed pages or start an additional scan; samples
do not explain other hours retroactively.
Unsupported shapes and unknown active flag names are skipped rather than changed; missing
diagnostic samples do not establish that the corresponding items are absent from the market.

Each accepted request permits at most 64 verification attempts and 16 saved fixtures,
with 16 KiB per fixture and 256 KiB total, shared across live and archive sampling and all
requested cohort types. An unchanged request retains its collector and limits across
cycles; changing to another valid request starts a new collector. It stops at expiry even during a
cycle; write failures do not stop ingestion. Read only
this output file for diagnosis
and remove the request when the investigation ends. No additional database connection,
cursor reset or credential resolution is needed. This debug facility does not change
classification or public market APIs.
Removing the request disables collection at the next cycle boundary. A newly accepted
request replaces the output when its first fixture is saved; until then, an existing output
may belong to an earlier request. Do not restart a worker solely to collect observations.

To seed a recent cursor on an empty volume, stop the worker, then run a one-off command with
the same host credentials (`varlock run` from this package directory):

```powershell
vp exec varlock run -- docker compose -f ../../compose.yaml run --rm ingest cursor --set <cursor>
```

For a PoE 2 worker, set `POE_REALM=poe2` and use a separate Compose project/volume. The processing
loop captures currency exchange data only. Equipment prices remain manual; direct public-stash
ingestion refuses the unsupported realm.
Exchange requests use GGG's public CDN and do not send the OAuth token. The worker still validates
the shared environment configuration; stash requests use the configured OAuth credentials.

### Offline Compose replay

This profile requires no credentials and disables external networking. A local HTTP fixture
server feeds 8,400 synthetic item observations through the API client, DuckDB ingestion,
update/removal handling, and unique, equipment and currency summary delivery. It checks 3,000
retained unique listings, 2,400 active unique listings, the updated median price, and the cursor
after reopening the database. Another 3,000 equipment observations cover early league and day 21,
with separate any-link/six-link cohorts, seller counts, prices and immutable cohort definitions.
The receiver is an in-process fixture, not the app's MySQL integration test.

```powershell
docker compose -p poe-ingest-replay --profile replay up --build --abort-on-container-exit --exit-code-from replay replay
docker compose -p poe-ingest-replay --profile replay up --abort-on-container-exit --exit-code-from replay replay
docker compose -p poe-ingest-replay --profile replay down
```

The second invocation verifies that the first invocation's cursor survives container restart
(`resumed: true`). The replay volume is separate from the live worker volume. Fixtures cover
current-hour unique observations, two equipment observation hours 21 days apart, and the saved
exchange hour (initially the previous completed hour). The saved-hour check also works when the
container restarts on a later day; fixtures make no claim about upstream historical availability. Process-cost integration
with these histories remains tracked in the
[crafting project design](../../docs/crafting-project-design.md).

### Read-only public-stash metadata check

To check which modifier fields the live PoE 1 feed supplies, run from the repository root:

```powershell
$env:APP_ENV = "dev"
$env:VARLOCK_TELEMETRY_DISABLED = "1"
vp run '@poe-tools/stash-ingest#ps' inspect --pages 1
```

This uses the existing credential references and reads at most five pages. It does not open DuckDB,
advance saved ingestion cursors, store raw responses or deliver summaries. Reports count string rows,
object rows and rows containing name/tier/level metadata, with at most three sanitized examples per
page. Account names, stash names, listing IDs, notes, icons and unrelated nested fields are omitted.
The returned pagination cursor can be supplied with `--cursor <id>`; omitting it begins at the oldest
available page, not necessarily recent listings. An empty page ends inspection. Results establish
coverage only for the inspected sample, not all listings or exact canonical modifier resolution.

The command also works as `inspect --pages 1` on the Compose ingest service with the existing host
credential setup. It requires authenticated access to the public-stash API and refuses the PoE 2
realm. If credential resolution reports an authorization timeout, unlock 1Password and allow its
connection request before retrying; do not paste credentials into the command or diagnostic output.

### Host execution

```bash
vp install
vp run env:check
```

Environment values are validated by Varlock and resolved from the 1Password dev item by default. Complete the [repository environment setup](../../README.md#environment-configuration) first. Copy `.env.example` to `.env.local` only when overriding non-secret settings. Set `APP_ENV=prod` locally to use the production item and endpoint. Authenticate through the 1Password desktop app.

The DuckDB file (default `./data.duckdb`) is created on first run. The schema is applied on every connection. Existing databases seed `ps_listing_hour` from their latest stored listing observations when that table is first created; observations already overwritten by earlier ingests cannot be recovered.

## Run the season pipeline

Use a separate DuckDB file per realm and capture scope. The saved stream cursor is tied to that scope; changing the season on the same file is rejected. A new season starts a new database. Existing hourly data remains available in the app.

From the repository root, in PowerShell:

```powershell
$env:APP_ENV = "dev"
$env:PS_LOCAL_DB = "./allflame.duckdb"
vp run '@poe-tools/stash-ingest#ps' process --league Allflame --pages 50 --watch
```

The dev endpoint is `https://dev.poe.boats/api/stash-ingest`; `local` retains the configured local endpoint. Match the ingestor token to the app's token. The receiving app's database migrations must be applied before starting the new ingestor.

`process` runs stash ingestion, sale evaluation, currency ingestion and delivery of pending completed hours. `--no-currency` disables the exchange source. Omit `--watch` for one cycle. While stash capture is behind, successful cycles continue after 1.2 seconds; caught-up cycles and failures use the normal one-minute polling interval. Failed stages are reported, saved cursors resume committed work, and delivery retries use idempotent upserts. Run only one writer per DuckDB file. Stop the watch process with Ctrl+C.

For a fresh database, seed a recent public-stash cursor with `--cursor <id>`; without one the API begins at the start of its available stream. Stash timestamps are **observation times**, not the original listing or trade times. Historical seasons can only show observations captured while they were available; the stream cannot reconstruct past sales. Initial catch-up removals are excluded from likely-sale inference.

### Durable forward capture and diagnostic checkpoints

GGG documents a stream of current and newly listed stashes, with stash IDs reappearing as the feed
advances, rather than a date-indexed history ([official reference](https://www.pathofexile.com/developer/docs/reference#publicstashes)).
Live tests on 2026-10-09 showed that the same cursor's contents and next cursor changed within
seconds. A 66-stash saved sample yielded only 33 identical versions across a ten-page replay;
two original IDs reappeared with changed selected fields and 31 were absent from those pages.
A later 25-page probe found 33 identical versions, five changed versions and 28 absent original IDs.
This is evidence against treating saved cursors as immutable snapshots, not proof of global absence.
Saved observations and summaries are the history; historical cursor restoration has been removed.
Hashes can detect differences, but cannot reconstruct a historical value that the API no longer returns.

Capture is limited to the configured league and **crafting-relevant candidates**:

- Selected good bases from the generated base cohorts and craftable jewel/cluster-jewel bases, even without an exact priced cohort match.
- Uniques/relics, currency-tier materials and divination cards, including unidentified/unpriced items.
- Craftable bases with fractures, synthesis, influence, Delve/memory/mutation flags or special modifier flags.
- Potential special-modifier donors, including lower-tier bases, identified using generated catalog text for drop-only, Delve, veiled/unveiled and mercenary modifiers.

All fields of selected items are retained, including unknown fields. Ordinary low-tier equipment,
gems and unrelated items are excluded. Filtering precedes archiving; detailed price classification
and extraction follow it. `capture-poe1.json` is regenerated alongside the market cohorts from the
crafting catalog. Distinctive donor text permits uncertain matches and combined/scaled rolls;
retention does not establish a modifier's identity or make it eligible for pricing. New game data
requires regenerating/reviewing this policy; it cannot guarantee capture of future unknown categories.
Stash records contain only selected items. Empty/private changes for previously captured stashes
preserve removals; unrelated stashes/pages produce no archive payload.

New filtered responses are stored as gzip data in 16 KiB parts in `ps_capture_payload_chunk`,
with sizes and part counts in `ps_capture_payload_meta`. Bounded parts avoid growing checkpoint
memory requirements from vectors of large BLOB values. Existing `ps_capture_payload` bodies remain
readable and are not rewritten; this does not restore missing bodies. Replay checks part order,
lengths and the full content checksum before classification. Both formats deduplicate by that checksum.
`ps_capture_page` retains each observation's scope, requested/next cursor and
capture time. Different contents at the same cursor remain separate payloads. The archive commits
before price processing, so a classification failure cannot discard the selected source items. Archiving
failure stops processing before advancing the cursor. Successful processing marks the observation
in the same transaction as its cursor update. Unprocessed observations remain available for inspection;
this command set does not automatically rebuild prices from them.

Without `PS_ARCHIVE_DIR` the archive has **no automatic deletion or age cap** and the pricing-table
`prune` command never touches it. Preserve and back up the whole DuckDB database/WAL. Provision disk
capacity and monitor growth; storage exhaustion stops capture instead of silently discarding source
pages. This retention starts when the updated worker is installed; older unrecorded versions cannot
be recovered.

### Archiving old data

When `PS_ARCHIVE_DIR` is set, `process` checks hourly for whole UTC days to move out of DuckDB, one day
per check, and keeps going every cycle while a backlog remains. `archive [--days n]` runs the same step
once. A day leaves once it is older than `PS_ARCHIVE_KEEP_DAYS` (default 30). While the database uses
more than `PS_ARCHIVE_MAX_GB` (default 100), days down to three days old leave too, oldest first.

Each archived day becomes `<PS_ARCHIVE_DIR>/<YYYY-MM-DD>/<table>-<run>.parquet` (zstd). Every file's
row count is checked before its rows are deleted. Rows a day still needs stay in DuckDB until a later
check: unprocessed captured pages, hours whose rollup has not been delivered since their last listing or
sale change, and equipment hours inside an undelivered 24-hour window. A captured payload leaves with
the last page that references it. Query archives with DuckDB, for example
`SELECT * FROM read_parquet('/backups/*/ps_listing_hour-*.parquet')`.

Deleted rows free space inside the database file for reuse; the file itself does not shrink. To
compact it, stop the worker, `ATTACH` a new file and run `COPY FROM DATABASE old TO new`.

With the worker stopped, `pnpm ps capture-status` reports observation/payload counts, unprocessed
pages, first/latest capture times, and original/compressed payload bytes. These byte counts exclude
database indexes, working tables and WAL, so also monitor actual volume usage.

Each advancing page is committed with its requested/next cursor, capture timestamp, counts and a
SHA-256 checksum of the complete parsed response (object key ordering is ignored). The first nonempty
page per UTC day is also retained as gzip/base64. The pipeline retries delivery to the authenticated
receiver; PlanetScale keeps immutable checkpoint metadata and one sample per realm/league/day.
An empty poll at an unchanged cursor does not create another checkpoint. Metadata reads exclude the
sample body and paginate in batches of 500. Samples and cursor reads require the ingestion token.
Deploy the receiver migration before updating ingestion workers. Pending uploads remain in DuckDB
if the receiver is unavailable or does not support checkpoint delivery.

Run from this package after the normal environment setup:

```sh
pnpm ps flush-checkpoints
pnpm ps validate-replay --day 2026-10-08 --league Allflame
pnpm ps probe-replay --day 2026-10-08 --league Allflame --pages 10
pnpm ps capture-status
```

Dates are UTC; `--from` is inclusive and `--to` exclusive, with a maximum range of 31 days.
Use the original capture scope (`all` if unfiltered) and the same `POE_REALM` for diagnostics.
`validate-replay` is read-only and reports `matched`, `changed`, or `missing-sample`. A daily match
validates that sample only; it does not prove the rest of the day's feed is unchanged.

`probe-replay` compares each original stash against up to 25 following pages, using both complete
stash hashes and versioned `listing-v1` hashes. It counts original versions found, selected-field
changes, originals absent from the inspected pages, and extra stash IDs. Repeated IDs retain all
observed versions for comparison. Page boundaries and ordering do not affect these comparisons.
The command reports a nonzero exit when not every selected-field fingerprint is found; absence
within the bounded probe is not proof that the record is unavailable everywhere in the feed.
Requests are spaced five seconds apart. Source failures stop the probe and retain partial counts
in its report, including HTTP status and `Retry-After` when supplied. It does not retry a rate limit.

`listing-v1` covers stash identity/public status/account/league/name, item IDs, names/base types,
rarity, identification, item level, stack size, price notes, corruption/replica/foil state and
explicit/implicit/crafted/fractured/enchantment modifiers. Item and modifier ordering is ignored;
legacy numeric rarity and string modifiers are normalized. Icons, layout, last character name,
and unselected fields are ignored. A hash match therefore proves only these selected fields:
properties, influences, sockets and other omitted fields can still differ. This is a diagnostic
comparison only. It cannot publish reconstructed prices. Changing the selected fields or
normalization requires a new version.

The probe also measures the JSON/gzip size of a candidate manifest containing only hashed stash
IDs and selected-field hashes. It does not persist this manifest, replace existing daily samples,
or change the live cursor, listings or price history.

The receiver rejects the retired `psapi-replay` and `equipment-replay` upload streams. Old historical
replay databases are retained but refused for live capture and publication, even if previously
marked validated. Normal live ingestion still applies its usual updates and sale corrections.
Checkpoints, daily samples, existing summaries and source archives are preserved.

`poe-stash-ps flush [--league <name>] [--dry-run]` replays up to 168 pending completed season-hours per call, oldest first. It includes failed deliveries, newly resolved unidentified items and later sale corrections. Repeat to drain a larger backlog. `rollup --hour <unix-seconds>` explicitly rebuilds a particular hour. Hours use UTC epoch seconds aligned to 3600.

Browse `/1/market` in the app. Filters separate realm, season and variant. The page includes per-currency asking price history, sample sizes, pending removals and likely sales. Missing hours remain gaps. Counts represent observations during an hour, not a census of the market. Archived season periods end at the season's last available observation.

## Likely-sale policy

`src/ps/sales.ts` owns the policy. A removal is a sale candidate when the stream reached its current cursor within the hour before it; removals seen further behind (initial catch-up or a long outage) are `unobserved`. A candidate is classified at the first poll that reaches the cursor at least an hour after its removal. The stream is a complete, ordered log, so by then any relist within that hour has been seen; backlogs or polling gaps in between do not delay or reset it.

The last asking price must be within 25% of the median of per-seller medians from at least three other sellers in the same season, variant and currency, observed within the last 24 hours. Market evidence is saved at removal time. Currency aliases and fractional bulk prices are normalized; currencies are never implicitly converted.

Same-seller relists match the item ID across stashes, or an equivalent variant with a new ID that first appeared after the removed item was last seen. They suppress pending sales and retract earlier estimates regardless of the new asking price. Matching a replacement copy can suppress a real sale; this is intentionally conservative. Copies the seller already had listed alongside the removed item are not replacements, so selling one of several identical copies still counts. Whole-stash withdrawals, insufficient market samples, unpriced items and out-of-range prices do not count. Partial stack reductions are not treated as item sales. Estimated sale prices are the **last asking prices**, not confirmed transaction prices.

Removal events are retained locally in `ps_sale` for correction. Pruning protects active listings, pending or inferred sale evidence, and affected hourly observations. The row cap is therefore a target and can be exceeded. Monitor local disk usage and preserve this database to retain relisting evidence.

## Extend item processing

The raw archive retains crafting candidates selected by `src/ps/crafting-capture.ts` and the generated capture policy. Ordinary uniques, currency and divination cards are also normalized automatically. Add another item family to `ITEM_CATEGORIES` in `src/shared/capture.ts` to include it in that projection, and review its archive eligibility. Identity is defined in `src/shared/item-key.ts`.

For a separately priced variant, add a `ModExtractor` under `src/shared/mod-extractors/` and register it in `EXTRACTORS`. Use `explicitModLines(item)` to support current modifier objects and legacy string modifiers. Implement `matches` and `extract`, returning a stable `kind` and deterministic JSON data; optionally provide `value` for a readable market key. Otherwise the signature is SHA-256 hashed. Sort unordered modifier collections before returning them. The ingestor persists the key, so adding an extractor requires no rollup SQL, receiver schema or UI changes. Add fixtures that prove equivalent variants group together and different variants remain separate. Existing historical observations keep the key under which they were captured.

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

The source archive uses the broader crafting-input rules above. The unique/currency price projection includes:

- Every **unique** (`frameType=3`) — identified or not. Unidentified ones are keyed by their `iconAsset` so the boss-drop variants can be priced separately even before the text resolves.
- Every **identified currency-tier** item (`frameType=5` / `6`, or `rarity=Currency`).
- Every **skill gem** (`frameType=4`, or `rarity=Gem`), keyed by `typeLine` so transfigured gems stay apart from their base gem (a Vaal gem whose skill is transfigured, per `@poe-tools/market`'s gem list, is keyed `Vaal Arc (Arc of Surging)`). The `gem` signature splits each gem by level band (below, at or above its maximum level, which follows the Exceptional tag in the gem's tag line and an `Awakened` name) and quality band (0–19%, 20%, 21–23%); corruption is its own column. Gems are not added to the source archive.

Equipment classifiers populate their own price tables. Other retained crafting candidates need supported classifiers before they can contribute prices.

#### Mod signatures

Identified uniques are run through a registry of structured mod-extractors. The result is stored as a discriminated `ModSignature` JSON blob on the listing, and **promoted to first-class columns** on the remote `stash_unique_hourly` row:

| column            | example for Forbidden Flame                                      | example for Watcher's Eye              |
| ----------------- | ---------------------------------------------------------------- | -------------------------------------- |
| `signature_kind`  | `forbidden-jewel`                                                | `watchers-eye`                         |
| `signature_value` | `Glancing Blows`                                                 | SHA-256 of the sorted mod signature   |
| `signature_data`  | `{"kind":"forbidden-jewel","allocatedNotable":"Glancing Blows"}` | `{"kind":"watchers-eye","mods":[...]}` |

`(signature_kind, signature_value)` are PK components alongside `(realm, league, hour, item_key, identified, corrupted, foil_variation, links)`, so each tradable variant gets its own permanent hourly row. `links` is 5 or 6 for a unique's largest linked socket group (poe.ninja's links split), otherwise 0, and combines with any signature. `signature_data` is the lossless payload — query into it with MySQL's JSON path operators when you need a specific field.

Rows with no extracted signature use `signature_kind = ''` and `signature_value = ''` (empty strings, not NULL, so the PK works).

#### Deferred rollup for unmapped unids

Unidentified items whose `icon_asset` is not yet present in `icon_basemap` are **excluded from rollup**. Their observations stay in `ps_listing_hour` and become eligible once an identified instance with the same `icon_asset` flows through and teaches the basemap. Rerun rollup for the affected hours to deliver them. Identified rows are always eligible.

Built-in extractors:

| kind                                        | example bucket key in remote `modSignatureCounts` |
| ------------------------------------------- | ------------------------------------------------- |
| `forbidden-jewel` (Forbidden Flame / Flesh) | `forbidden-jewel:Glancing Blows`                  |
| `watchers-eye` (Watcher's Eye)              | `watchers-eye:<SHA-256>`                         |
| `impossible-escape`                         | `impossible-escape:Pain Attunement`               |
| `forbidden-shako`                           | `forbidden-shako:Spell Echo@35`                      |
| `unique-mod-split` (`UNIQUE_MOD_SPLITS`)    | `unique-mod-split:4 Flasks`                       |

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
| `ps_listing_hour` | `(account_name, stash_id, item_id, observed_hour)` — last observed state within each UTC hour |
| `icon_basemap`   | `icon_asset` — global, learned from identified uniques flowing through                              |
| `cx_market_hour` | `(league, market_id, observed_hour)` — cxapi snapshots                                              |
| `stream_cursor`  | `psapi` / `cxapi`                                                                                   |
| `rollup_state`   | `(stream, league, hour)` — idempotency for the remote push                                          |

Each source response and its cursor are committed in one transaction. Public stash rollups use hourly observations, so later price changes and unlisting events do not rewrite earlier hours. These are counts of listings observed during the hour, rather than a census of all active listings.

Pruning applies the row target to eligible removed listings in `ps_listing`. It also deletes hourly observations older than `keepDays` once delivered and no longer needed for sale corrections. Active, pending and unresolved observations remain available for replay and can exceed the row target.

Equipment has separate current state, hourly observations and delivery markers. The same prune
command applies the row target independently to its eligible removed listings, retaining active and
undelivered observations, including source hours needed by unacknowledged trailing 6/24-hour summaries.
Full delivered hours are removed together so a later rollup cannot replace permanent history with
partial or empty prices. Equipment rollups preserve hourly prices and add exact wider medians over
deduplicated observations; source gaps prevent widening and historical corrections dirty dependent
windows. Observed cohort definitions remain stored. See the
[equipment cohort policy](../poe-market/README.md) for capture selection and confidence semantics.

## Remote schema (poe.boats — MySQL, prefixed `qsPoeBoats__stash_<game>_`)

Each game (`poe1`, `poe2`) has its own tables; the receiver routes rows by realm (`poe2` is PoE 2, the rest PoE 1).

| table                       | retention   | one row per                                |
| --------------------------- | ----------- | ------------------------------------------ |
| `unique_hourly`             | **forever** | `(realm, league, hour, item_key, identified, corrupted, foil_variation, links, signature_kind, signature_value)`        |
| `currency_hourly`           | **forever** | `(realm, league, market_id, hour)`                |
| `basemap_snapshot`          | **forever** | `icon_asset` (public unid → name resolver) |
| `cohort_hourly` (PoE 1)     | **forever** | `(realm, league, hour, cohort_id)`, the newest catalog revision's classification |
| `cohort_window` (PoE 1)     | 48 hours    | `(realm, league, hour, cohort_id)`, the 6/24-hour price windows |

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
FROM qsPoeBoats__stash_poe1_unique_hourly
WHERE league = 'Mirage'
    AND hour = ?
    AND item_key = 'Forbidden Flame'
ORDER BY median_div DESC;
```

The same unique appears as `item_key='unid:<iconAsset>'` (the unid bucket) and as one row per allocated-notable variant under `item_key='Forbidden Flame'`. Compare to estimate EV of identifying vs selling unid.

## Scheduling

Use `process --watch` for a long-running worker, or run one `process` cycle from Task Scheduler/cron every minute. The individual stages remain available for manual recovery:

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

## Tests

From the repository root, with Docker running:

```sh
vp run poe-boats#test
vp run poe-boats#test:e2e
```

The Vitest end-to-end suite starts an isolated MySQL 8.4 container with Testcontainers and applies the app's migrations. Seeded HTTP responses flow through the real API client, DuckDB ingestors, rollups, HTTP receiver and MySQL queries. It covers replay, updates, unlisting, failed pages, failed delivery, long market IDs and Watcher's Eye variants. Separate seeded SQLite checks cover the tracker. No Path of Exile credentials or production database are used. CI runs both suites.

## poe.boats secret

The HTTP route at `/api/stash-ingest` requires a bearer token. Store it in the ingestor's environment-specific 1Password record as `POE_BOATS_INGEST_TOKEN` and the matching app record as `STASH_INGEST_TOKEN`. The values must match. Local app deployment synchronizes the worker secret.

The push target comes from `POE_BOATS_INGEST_URL`. Local development uses the ingestor's 1Password record, `APP_ENV=dev` selects `https://dev.poe.boats/api/stash-ingest`, and the prod record targets `https://poe.boats/api/stash-ingest`.

Generate and review database migration SQL in `apps/poe.boats` before applying it to the selected environment:

```sh
vp run types:cf
vp run db:generate
vp run db:migrate
```

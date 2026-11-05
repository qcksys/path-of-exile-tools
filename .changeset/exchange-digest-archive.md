---
"@poe-tools/stash-ingest": minor
---

With `PS_RAW_ARCHIVE_DIR` set, the `process` worker keeps every exchange digest it fetches, unfiltered, in the `cxapi` subdirectory of the raw archive, in the same NDJSON format as stash pages. The worker seals each finished hour with zstd and uploads it to B2 below `$B2_PREFIXcxapi/`, beside the stash page archive. `raw-archive` maintains both archives and `raw-verify --exchange` replays the digests. The PoE 2 worker in `deploy/ingest/compose.yaml` now archives its digests and reads the environment's B2 key.

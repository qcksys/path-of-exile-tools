---
"@poe-tools/stash-ingest": patch
---

Speed up public-stash ingestion about sevenfold on a season-sized database. Each page is now written with about 60 set-based statements instead of about 600 per-stash ones; a stash changed twice in one page is applied in a later round. Lookups use single-column stash, item-key and item-ID indexes instead of scanning whole tables, and writes no longer use `ON CONFLICT` or `INSERT OR REPLACE`, which DuckDB runs as a full-table merge. Unused composite indexes are dropped. Selling one of several identical copies is no longer treated as a relist when the other copies were already listed.

Add archiving: with `PS_ARCHIVE_DIR` set, the worker moves whole UTC days older than `PS_ARCHIVE_KEEP_DAYS` (default 30), or older than three days while the database exceeds `PS_ARCHIVE_MAX_GB` (default 100), into zstd Parquet files, and deletes them from DuckDB once each file's row count checks out. `archive` runs the same step by hand.

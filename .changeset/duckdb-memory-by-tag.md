---
"@poe-tools/stash-ingest": patch
---

Log what holds DuckDB's memory. Each batch-write line ends with DuckDB's memory by `duckdb_memory()` tag, such as `DuckDB memory 6.8 of 7.4 GiB: TRANSACTION 1.9, ART_INDEX 1.6, …`, and a stage that fails with an out-of-memory error logs the same before the cycle's error.

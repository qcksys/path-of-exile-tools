---
"poe-boats": minor
"@poe-tools/market": minor
"@poe-tools/stash-ingest": minor
---

Store each public-stash market once in `stash_<game>_market`, with an int `id` and its latest description, and each market hour in `stash_<game>_market_hour` keyed by `(hour, marketId)`. The `stash_<game>_unique_hourly` name is now a view joining the two, so readers are unchanged. The old table's unused icon and signature indexes are gone, and market rows in the HTTP and MCP market output no longer carry `rowCreatedAt`, `rowUpdatedAt` or `rowDeletedAt`. The migration drops the old hourly tables, so their rows must be re-delivered from the ingest workers. Ruthless, SSF and private leagues are no longer stored by poe.boats: the ingest workers keep them in DuckDB and the archive (exchange capture now keeps every pair of those leagues) and don't push them, the receiver drops any that arrive, and market and exchange pages list no season for them.

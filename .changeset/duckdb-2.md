---
"@poe-tools/stash-ingest": minor
---

Upgrade DuckDB to 2.0.1, whose storage format lets checkpoints compact tables with keys or indexes. DuckDB 1.x reclaimed rows deleted from `ps_listing` and `ps_equipment_listing` only once a whole row group of 122,880 rows was gone, and listings leave in any order, so a worker's database file kept growing. A file written by 1.x keeps its format: the new `compact <source> <target>` command copies a stopped worker's database into a new file in the current format, keeping only live rows, and checks that every table, index and key matches. DuckDB 1.x cannot open the new file.

The equipment rollup is adjusted to keep its memory bounded under DuckDB 2.0. It finds each listing's last hour with a semi join, so only keys are hashed. Its medians are taken over lists, which can spill. DuckDB's rewrite of DISTINCT aggregates, which copies their whole input, is disabled.

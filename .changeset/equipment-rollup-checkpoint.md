---
"@poe-tools/stash-ingest": patch
---

Checkpoint before a delivery's equipment rollups. A batch of pages leaves its indexes and committed updates in DuckDB's memory until a checkpoint, and when no archived equipment was waiting to be reclassified (which checkpoints first) nothing released them before deliveries, so the rollup of a newly completed hour, which scans a day of equipment observations, ran out of memory until a later cycle. A failed checkpoint is reported as a delivery failure and the rollups still run. Batches also drop their temporary tables once written, since those keep their rows in memory.

---
"@poe-tools/stash-ingest": patch
---

Update listing hour rows, equipment listings and equipment hour rows in place. Their per-page updates set an indexed column (`league` on the two hour tables, `stash_id` on equipment listings) even when it had not changed. DuckDB runs such an UPDATE as a delete and insert and keeps the dead copy, so these tables and the database file kept growing. Those columns are now set only on rows whose value changed.

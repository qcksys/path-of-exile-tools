---
"@poe-tools/stash-ingest": patch
---

Change a sale's status in place. `ps_sale` had an index on `status`, so DuckDB ran every status change, such as marking a sale relisted, as a delete and insert of the whole row, its unique key included. On DuckDB 2.0.1 the worker's sale evaluation began failing on such keys as duplicates of the rows themselves. The index is dropped: while the worker is behind the stream most sales are pending, far more than DuckDB looks up by index, so no query used it.

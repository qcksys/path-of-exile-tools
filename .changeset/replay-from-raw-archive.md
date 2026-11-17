---
"@poe-tools/stash-ingest": patch
---

A process worker that reads a capture process's raw archive no longer stores a second, gzip copy of each page in DuckDB. Compressing, checksumming and writing that copy, and tracking its stashes, was a noticeable part of each page's processing, and the copies were the largest part of the database file. Each processed page's `ps_capture_page` row now records where the raw archive keeps it, and equipment reclassification reads those pages from the raw archive. Workers that fetch pages themselves keep the database archive as before.

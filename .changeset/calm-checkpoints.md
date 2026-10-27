---
"@poe-tools/stash-ingest": patch
---

Add `PS_CHECKPOINT_THRESHOLD`. When set, live capture no longer checkpoints after every page and DuckDB checkpoints once its WAL reaches that size. On a 41 GB database with 10–12 GB of memory, this took pages from about 22 s to about 4.4 s and cut disk writes per page about twentyfold. The PC worker now runs with a 16 GB container, `PS_MEMORY_LIMIT=10GB` and a 1 GB threshold.

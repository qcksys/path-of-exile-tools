---
"@poe-tools/stash-ingest": patch
---

Seal raw hours on several threads with `PS_RAW_SEAL_THREADS`. Above 1, the `zstd` command, now installed in the image, compresses each finished hour with the same settings (level 19, long-distance matching, 128 MB window, checksum) on that many threads. It writes the same single frame, which is still verified against the spool before the spool is removed. Node's zstd stream compresses on one thread; with worker threads it crashed with `ERR_STREAM_PUSH_AFTER_EOF`. The capture service in `deploy/ingest/compose.yaml` now seals on 8 threads, with 9 CPUs and 4 GB.

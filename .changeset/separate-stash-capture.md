---
"@poe-tools/stash-ingest": patch
---

Add a `capture` command that fetches the public stash stream into the raw archive without a database. With `PS_SEPARATE_CAPTURE=true`, a worker reads those pages at their capture times, so slow delivery, a failing page or a full database disk no longer stop fetching, and a database can be rebuilt from the archive with `PS_RAW_FROM`. `deploy/ingest/compose.yaml` now runs the PC stream this way.

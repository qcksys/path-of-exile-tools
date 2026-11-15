---
"@poe-tools/stash-ingest": patch
---

Skip the archived equipment replay, and the checkpoint that runs before it, when no archived hour is waiting to be reclassified. Before, whenever `PS_RECLASSIFY_PAGES_PER_HOUR` left any allowance, every cycle checkpointed the whole database first, even after the replay had nothing left to do. A large database spent tens of seconds per cycle on that. The PC worker in `deploy/ingest/compose.yaml` now runs with 4 CPUs and `PS_THREADS=4`.

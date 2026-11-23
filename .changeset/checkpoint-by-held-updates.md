---
"@poe-tools/stash-ingest": patch
---

Checkpoint by held update memory rather than at every batch commit. DuckDB checkpoints at a commit once its WAL would pass `PS_CHECKPOINT_THRESHOLD`, counting the commit's changes before writing them, so with a threshold below a batch's estimated size every batch's commit ran a full checkpoint. With a threshold set, the worker now checkpoints after a batch only once DuckDB holds a quarter of its memory limit in committed updates, and other commits just append to the WAL. A failed checkpoint is logged and leaves the committed batch alone. The PC worker in `deploy/ingest/compose.yaml` now uses a 4GB threshold.

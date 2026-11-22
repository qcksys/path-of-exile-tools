---
"@poe-tools/stash-ingest": patch
---

Add `PS_REDELIVER_MINUTES`: a delivered stash hour whose sales changed is sent again only once that many minutes have passed since its last delivery. Each cycle used to resend every such hour still in the database, and the receiver recomputed the whole day of each changed item for every one of them. An hour never delivered is sent at once as before, and unset, every cycle resends changes as before. The PC worker in `deploy/ingest/compose.yaml` resends them at most every 30 minutes.

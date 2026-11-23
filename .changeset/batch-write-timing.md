---
"@poe-tools/stash-ingest": patch
---

Log how long each part of a batch's write takes. Every commit of a batch of pages logs one line with the time of its listing statements (withdrawn and new sales, listings seen again, changed and new listings, reading, updating and inserting hour rows, the basemap), its equipment statements (cohort hours, rows seen again, changed and new rows, hour rows) and the commit itself.

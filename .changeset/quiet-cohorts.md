---
"@poe-tools/stash-ingest": patch
"poe-boats": patch
---

Cut equipment delivery load on the receiver database. `PS_RECLASSIFY_PAGES_PER_HOUR` caps archived reclassification, which re-delivers 24 hours of cohort rows for each hour it finishes; cycles without an allowance skip reclassification and its checkpoint. Cohort definitions the receiver has acknowledged are recorded in DuckDB, so a restart no longer resends all of them. The receiver recounts equipment coverage once per request instead of once per 200-row chunk.

---
"@poe-tools/stash-ingest": patch
---

Drop the indexes of the listing and equipment hour tables. These tables gain a row for every listing and item every hour, and their unique and time indexes grew with them. DuckDB never used them to find rows: hour filters scan by zonemap, and inserts already skip existing rows. But DuckDB keeps an index's memory once loaded until the index is dropped, so on a league-start worker they filled the memory limit until the equipment rollup failed every cycle. Without them that rollup fits again, and pages are processed faster because no index is maintained on insert. The hour updates set `league` in place again, since it is no longer indexed.

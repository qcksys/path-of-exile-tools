---
"@poe-tools/stash-ingest": patch
---

Keep a fixed window behind the stream position in a process worker's database. With `PS_ARCHIVE_KEEP_HOURS` set (at least 25) on a worker that reads a separate capture process's archive, each cycle moves up to two whole hours older than that window into the Parquet archive, using the archive's existing delivery and correction guards. The daily archive measures age by the clock, so a worker reading a league-start backlog archived nothing and its tables, and their indexes' memory, grew with the league. Removed listings, settled sales and their indexes now stay bounded by the window instead. The deployed PC worker keeps 26 hours.

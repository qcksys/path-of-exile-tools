---
"@poe-tools/stash-ingest": patch
---

Record each page's sales without reading the removed listings' item JSON. The sale insert fetched every column of every listing in the page's changed stashes, item JSON included, although a sale keeps none of it; that fetch cost more than the rest of the statement, which now takes about 40% less time and inserts the same rows.

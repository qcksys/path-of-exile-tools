---
"@poe-tools/stash-ingest": patch
---

Process pages faster on large databases. A removal's market price now reads only the listings and columns it compares, not every column of every listing of the item, including each item's JSON. Re-sent listings whose item key and icon are unchanged are updated without setting those indexed columns. DuckDB then updates them in place, instead of writing a new copy of each row and keeping the old one, which every later scan of `ps_listing` read.

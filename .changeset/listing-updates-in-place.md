---
"@poe-tools/stash-ingest": patch
---

Update listings in place when their item key or icon changes. `ps_listing` had indexes on `item_key` and `icon_asset`, so DuckDB ran an update that changed either (such as identifying an unidentified unique) as a delete and insert of the whole row, primary key included, and a batch could fail on its own row's key as a duplicate. No query used those indexes: lookups by item key or icon run as joins. They are dropped, every changed listing is updated in place, and the indexes' memory and checkpoint work go with them.

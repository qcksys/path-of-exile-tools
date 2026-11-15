---
"@poe-tools/stash-ingest": patch
---

Cache equipment classification and the crafting archive filter's modifier tests per item, keyed on the item without `inventoryId`, `x`, `y` and `note`, which change when a stash is re-sent unchanged. Re-sent stashes repeat most of their items, so most items are no longer matched against every cohort again. Each cache keeps the 500,000 most recently used results. The page's hourly listing copy no longer reads each listing's item JSON.

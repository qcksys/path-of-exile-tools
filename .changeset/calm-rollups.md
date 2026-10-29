---
"poe-boats": patch
---

Public stash ingest now rebuilds each item's daily market totals once per request, after all of its rows are stored, instead of after every 200 rows. An item page's variant list now always reads through the item index; one load had taken 29 s when the database chose to scan every item in the window.

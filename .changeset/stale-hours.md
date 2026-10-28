---
"@poe-tools/stash-ingest": patch
---

Fix live capture failing on every cycle with a duplicate `ps_listing_hour` key when a stash still lists an item that capture no longer selects. Only listings observed in the current change refresh their hourly observation; the stale listing keeps its earlier hour.

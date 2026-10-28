---
"@poe-tools/stash-ingest": minor
"poe-boats": minor
---

Split unique markets by socket links, as poe.ninja does: 5 or 6 for a unique's largest linked socket group, otherwise 0. Links combine with corruption and mod splits (e.g. Atziri's Splendour [Armour] 6L). The market list still shows one row per item with every link count merged; the item page lists "Any links" and, for markets with 5- or 6-link copies, "0–4L", "5L" and "6L". The market filters gain an optional `links` parameter (`0`, `5` or `6`), and variants from the HTTP and MCP market operation carry `links` (null when merged). Likely-sale pricing compares listings with the same link count. A migration adds `links` to the `stash_unique_hourly` primary key; older rows count as 0.

---
"poe-boats": minor
"@poe-tools/market": minor
"@poe-tools/item-query": minor
---

Unique weapon, armour and accessory searches now default to uncorrupted markets; other categories still default to any corruption, and the market operation returns the corruption it applied. Switching category clears the search text and the crafting base filters.

Crafting bases open their own page at `/1/market/bases/:base` (`get_season_market_base`), with hourly asking prices and listings and the base's other bands, and filter by type, attributes, item level, links and quality. Equipment bases list at most three item level bands from ilvl 74: the two highest levels unlocking at least a tenth of the base's item-level-gated top-tier weight split off, and lower levels group together. A new Cluster jewel bases category lists normal, magic and rare Cluster Jewels by size, skill, passive count and poe.ninja's item level bands (1–49, 50–67, 68–74, 75–83, 84+), matched with a new `enchant` item query condition. The regenerated cohort manifest uses that condition, so the ingest worker must run this code before it reads the manifest.

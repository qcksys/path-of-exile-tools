---
"@poe-tools/stash-ingest": minor
"poe-boats": minor
---

Add a Forbidden jewels market category that pairs Forbidden Flame and Forbidden Flesh by allocated notable, grouped by class and ascendancy, with each jewel's price and the pair's combined price; the Jewels category no longer lists them. The notable-to-ascendancy table is generated from GGG's passive tree export (`vp run game-data:ascendancies`). Item pages show each variant's latest median ask, and items with more than 20 variants list them in a searchable table grouped by class and ascendancy or by identification and corruption. Variants in the market API and MCP tool carry `latestHour`, `listingCount` and `prices`.

The stash ingester now splits The Light of Meaning by stat, Sublime Vision by its enabled aura and Thread of Hope by ring size. Listings take the split when their stash is next sent.

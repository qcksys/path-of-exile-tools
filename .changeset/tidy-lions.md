---
"poe-boats": minor
"@poe-tools/market": minor
"@poe-tools/item-query": minor
---

Refine the season market list. Only body armours and two-handed weapons, the bases that can have six sockets, split crafting bases by links; one-handed weapons, shields, helmets, gloves and boots list one market per item level band. Crafting base cohorts now also exclude items with Intangibility, through a new `intangible` item query flag, and each base row shows its level requirement (`level` on base rows from the HTTP and MCP market operation). Unique weapons, armour and accessories filter by their base's type and, for armour, attributes (`baseClass` and `attributes`).

List rows show likely sales in the latest 6 hours, day and 7 days as bar charts, and market rows from the market operation add `recentSales` (hourly for 24 hours and daily for 7 days). Exchange tables in both games chart the units of each item traded the same way, in place of the 7-day price trend line, with the 7-day change noted under the value; exchange rows from `get_season_market` and `get_poe2_season_exchange` add `recentVolume`. The asking price shows the most listed currency to two decimal places, with every other listing currency under "+N more"; divine equivalents under 0.01 are left out. Item art is larger, sits on a muted tile instead of a black one, and has the item's details under its name. The category list has item icons and marks the category being loaded until its page arrives. The regenerated cohort manifest uses the `intangible` flag, so the ingest worker must run this code before it reads the manifest.

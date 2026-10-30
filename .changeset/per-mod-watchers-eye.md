---
"poe-boats": minor
---

Price Watcher's Eye mods individually: each listing counts once in the item's market and, at its full price, once per mod for its mod count. The item page's mod table lists these markets, and the `mods` and `anyMods` filters and the cheapest matching items are gone. Foil listings are no longer stored apart, so crafting prices now include them. The migration clears market rows, so the ingester must re-deliver its hours. Ingest workers now capture and deliver the exchange of every league in their realm, not only their own.

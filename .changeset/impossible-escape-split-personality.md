---
"@poe-tools/stash-ingest": patch
---

Impossible Escape splits by keystone again: the extractor now reads the stash API's "Passive Skills in Radius of …" text, which it had missed, so identified copies were all grouped together. Split Personality now splits by its pair of rolled stats (e.g. `Life / Strength`). Listings take the split when their stash is next sent.

---
"@poe-tools/stash-ingest": minor
"@poe-tools/market": minor
"poe-boats": minor
---

Capture PoE 1 tier maps (`Map (Tier 1)` to `Map (Tier 16)`) and Nightmare maps from public stashes and list them on the market under Maps (they were under Fragments by item class). Maps are keyed by base type whether identified or not, and a rare map's random name is not stored; unique maps stay keyed by name and blighted maps are not captured. Each base is split into one market per corruption state, identification, mod count band (1–6, or 8 for 7–8 mods), delirium (0–100% in 20% steps), influence (Shaper, Elder, Elder Guardian for any of the four guardians since a Blessed Orb rerolls them, or the Originator's Memories, read from the map's implicit) and, for tier 16 and Nightmare maps, item quantity band (0–59%, then 20% steps to 200%+). Mod counts match a map's lines to the multi-line map mods of the game data (`vp run game-data:maps`). The Maps list adds tri-state toggles per band; the market filters gain `mapMods`, `mapQuantity`, `mapDelirium` and `mapInfluence` (`none`, `shaper`, `elder`, `elder-guardian`, `memory`; e.g. `8,-1-6`), which the HTTP and MCP market operation also accepts.

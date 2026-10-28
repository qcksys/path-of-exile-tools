---
"@poe-tools/stash-ingest": minor
"@poe-tools/market": minor
"poe-boats": minor
---

Capture PoE 1 skill gems from public stashes and list them on the market under Skill gems. Gems are keyed by their type line, so transfigured gems are their own items, and each gem is split into one market per level band, quality band and corruption state. Level bands are below, at and above the gem's maximum level: 1–19, 20 and 21 for normal gems, 1–2, 3 and 4 for gems with the Exceptional gem tag, 1–3, 4 and 5 for awakened exceptional gems (Awakened Empower, Enhance and Enlighten), and 1–4, 5 and 6 for other awakened gems. Quality bands are 0–19%, 20% and 21–23%. Transfigured Vaal gems are keyed as the trade site names them (e.g. `Vaal Arc (Arc of Surging)`), from a transfigured gem list generated from the trade site (`vp run game-data:gems`, which also lists Vaal gems from the game data's `vaal_gem` tag). The Skill gems list replaces its corruption select with tri-state toggles (include, exclude or neither) for each level band, each quality band, corruption, transfigured and Vaal; the market filters gain `gemLevel` and `gemQuality` (e.g. `20,-21`), `gemTransfigured` and `gemVaal` (`all`, `true` or `false`), which the HTTP and MCP market operation also accepts. Gems are not added to the source archive.

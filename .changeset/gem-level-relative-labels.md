---
"@poe-tools/market": patch
"poe-boats": patch
---

The Skill gems level toggles now read Under Max, Max and Over Max instead of a normal gem's levels, and the line listing the other tiers' levels is gone. Each toggle matches a gem against its own tier's levels, as it did before; `gemLevel` keeps its `1-19`, `20` and `21` tokens, so existing links still work.

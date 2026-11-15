---
"@poe-tools/game-data": patch
"@poe-tools/cli": patch
---

Read the client formats PoE 2 0.5.5 and PoE 1 3.30 changed. PoE 2 0.5.5.8 appended three strings to `ItemVisualIdentity`, which the community schema does not describe yet. PoE 1 3.30 ships its stat descriptions as `.csd` files and writes Genesis passive graphs with 8-byte roots and connections. CLI commands now print the errors a failure wraps, so a failed extraction logs its cause instead of only "Extraction failed".

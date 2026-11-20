---
"@poe-tools/stash-ingest": patch
---

Re-deliver only the markets whose observations changed. A delivered stash hour whose sales change status later used to resend every market of each changed item, so a mod pool unique or a base type with many markets resent all of them for one sale, and every cycle resent hundreds of rows for each of the day's hours. A changed-only rollup now sends the markets that hold an observation changed since the hour was delivered, with the same values a whole-hour rollup gives them.

---
"@poe-tools/stash-ingest": patch
---

The `capture` command starts a request at most every 1.5 s instead of 2.5 s, so it keeps closer to the stream's head when every page is full. It reads the API's rate-limit headers and never spends more than two thirds of any rule, waits out a rule that is full, and logs the rules whenever they change.

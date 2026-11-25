---
"@poe-tools/stash-ingest": patch
---

Count capture's own rate-limit hits from when its requests started. The API counts a hit when the request arrives, but capture compared the headers with its requests in the period before the response came back, so with responses slower than about half a second it took its own previous request for another client's and slowed to 1.25 s on psapi's 2-per-second rule.

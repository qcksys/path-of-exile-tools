---
"@poe-tools/stash-ingest": minor
---

Pace capture at 90% of every psapi rate-limit rule. Only the first request waits the fixed 1.5 s; after that the rate-limit headers set the spacing, which on psapi's rule of 2 hits per second is a request every 556 ms (it was every 1.5 s, a third of the limit). Hits beyond capture's own requests in a rule's period belong to another client on the same IP: they come off capture's share, and capture waits out the period of a rule they fill. Capture's own hits filling a window no longer make it wait a whole period.

---
"@poe-tools/stash-ingest": minor
---

Pace capture at 90% of every psapi rate-limit rule, and back off after 429s. Only the first request waits the fixed 1.5 s; after that the rate-limit headers set the spacing, which on psapi's rule of 2 hits per second is a request every 556 ms (it was every 1.5 s, a third of the limit). Hits beyond capture's own requests in a rule's period belong to another client on the same IP: they come off capture's share, and capture waits out the period of a rule they fill. Capture's own hits filling a window no longer make it wait a whole period.

Each 429 counts 1, halving every 6 hours, and capture's share falls in proportion to that weight, down to a third of the limit at 3. Three 429s in a row put capture back at a third of the limit; it recovers to 62% after 6 hours and 87% after a day. The 429 times are kept in `capture-rate-limited.json` beside the cursor, so restarts keep the backoff, and every 429 and every 5-point change of the share is logged and appended to `capture-pacing.ndjson`.

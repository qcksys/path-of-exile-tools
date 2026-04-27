# poe.boats TODO

## Listing age vs price tracking

Store per-listing data so we can correlate the age of a current listing against its price.

- Capture `first_seen_at` per (account, stash, item key, price) tuple on ingest.
- Update `last_seen_at` (and `seen_count`) on each subsequent snapshot where the same listing is still present at the same price.
- Reset / start a new listing record when the price changes (price change = effectively a new listing for age purposes).
- Goal: be able to answer "this item has sat at price P for N hours" at query time.

## Unlisted / sold inference via TTL cache

Track items that disappear from a stash so we can distinguish "re-listed" from "sold".

- When a previously-seen listing is no longer present in a snapshot, move it into a separate "recently unlisted" cache with a TTL (start with something like 24–72h, tune later).
- On subsequent ingests, check the cache:
  - Same account re-lists the same item key → treat as a re-list (likely a price adjustment or stash reshuffle), carry forward the original `first_seen_at` if price unchanged, or start a new age window if price changed.
  - TTL expires without the same account re-listing → treat as "probably sold".
- Combined with the listing-age data above, this gives us an estimate of **time-to-sell at a given price band** per item / base.
- Caveats to keep in mind when designing the schema:
  - Players also unlist for non-sale reasons (logging off, reorganizing, league end). The TTL + re-list check is a heuristic, not ground truth — store the raw signal and derive the "sold" label downstream so we can revise the heuristic without re-ingesting.
  - Account name changes and stash renames will look like sales; consider keying off a stable account id where possible.

---
"poe-boats": minor
"@poe-tools/stash-ingest": minor
---

Stash market item charts now show min, interquartile and average asks and likely sales, with an interquartile band only in hours with more than 8 observations and average asks hidden until selected in the legend. The count panel adds delisted listings, and a new panel shows the average age of likely sales. The ingest workers now record that age as `soldAgeSeconds`, stored in `stash_<game>_market_hour` and returned with market hours over HTTP and MCP; earlier hours have none. Exchange item charts add the lowest rate and an interquartile range estimated from each hour's lowest, highest and volume-weighted rates, returned as `p25` and `p75` by `get_season_exchange_item`. The Forbidden jewels tab sorts by pair price and likely sales, and charts each jewel's recent likely sales.

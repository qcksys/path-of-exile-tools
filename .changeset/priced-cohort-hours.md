---
"poe-boats": minor
---

Store only equipment cohort hours that have asking prices. An hour with only unconfirmed matches or unpriced listings is no longer stored, and it deletes the row an earlier delivery of that hour stored, so crafting prices and crafting base lists use each cohort's latest priced hour in the window instead of reporting the cohort unpriced. About 85% of cohort hourly rows were such empty hours.

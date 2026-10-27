# poe.boats Trade Pricing extension

Read [README.md](README.md) for what the extension does, its commands and the reviewer build.

- WXT discovers entrypoints in `entrypoints/`. Keep logic in `lib/` as plain functions with
  injected dependencies so it runs under Vitest without a browser (`vp run test`).
- Use `browser.*`, never `chrome.*`. Every message between the page, content scripts and the
  background is parsed with a Zod schema: page messages in `@poe-tools/trade-bridge`, internal
  ones in `lib/messages.ts`.
- Only `isTradeApiPath` paths may be requested on the trade site. Never read cookies or add the
  `cookies`, `webRequest` or `tabs` permissions; the trade request must stay a same-origin request
  made by the trade page's main-world script.
- Listings leave the trade page only through `scrubTradeListing`. Adding an item field there is a
  privacy change: update the README, the poe.boats `/extension` page and the store listings.
- Any change to the run's pacing or stop rules needs a test in `test/pricing-run.test.ts` or
  `test/rate-limit.test.ts`.
- Changing the bridge protocol incompatibly means bumping `BRIDGE_VERSION`.

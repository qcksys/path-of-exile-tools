# poe.boats Trade Pricing

Browser extension (Chrome and Firefox, Manifest V3, built with [WXT](https://wxt.dev)) that prices
the steps of a poe.boats crafting project from the official Path of Exile trade site. Searches run
in the user's own browser, as the user's own pathofexile.com trade page; the session cookie is
attached by the browser and is never read by the extension or sent to poe.boats.

This product isn't affiliated with or endorsed by Grinding Gear Games in any way.

## How a pricing run works

1. On a poe.boats crafting project, **Price steps** builds an official trade search for each step
   and posts the run to the extension's content script on that page.
2. The background worker opens (or reuses) a `pathofexile.com/trade` or `/trade2` tab. A script in
   that page's main world makes each search and fetch request as the page itself.
3. Requests run one at a time. Before each one the worker reads the last `X-Rate-Limit-*-State`
   headers and waits until the next request fits inside every window, keeping one request of
   margin and at least 1.5 seconds between requests. Any error response stops the whole run:
   401/403 asks the user to sign in, 429 reports when to try again.
4. Each fetch of up to 10 listings is scrubbed (price, listing time and item only) and handed to
   the poe.boats page, which re-checks the listings against the step and decides whether to fetch
   10 more, search in-person listings, or move to the next step.
5. Batches are kept in extension storage until the page decides on them, so a page closed during
   a run can still apply them when it next opens.

The protocol is defined in [`@poe-tools/trade-bridge`](../../packages/poe-trade-bridge) and used by
both sides. Price rules live in poe.boats; see
[docs/crafting-buy-in-extension.md](../../docs/crafting-buy-in-extension.md).

## What it collects and where it goes

- From trade listings: price, currency, listing time and the item's properties. Seller account
  names, character names, stash names and whisper text are dropped on the trade page.
- These are sent only to the poe.boats page that started the run. Nothing is sent to any other
  server by the extension.
- The extension stores undelivered listing batches locally for up to 7 days.
- It never reads cookies, history or other sites. Permissions: `storage`, plus access to
  `www.pathofexile.com/trade*` and the poe.boats sites.

## Commands

From `apps/poe.boats-extension/`:

```bash
vp run dev            # Chrome with live reload
vp run dev:firefox    # Firefox with live reload
vp run build          # .output/chrome-mv3
vp run build:firefox  # .output/firefox-mv3
vp run zip            # Chrome Web Store zip
vp run zip:firefox    # AMO zip plus the sources zip reviewers rebuild from
vp run typecheck
vp run test
```

Development builds also run on `https://poe-boats.localhost` and `http://localhost`; production
builds drop those origins.

## Building from source (AMO reviewers)

The sources zip contains this extension, the shared `packages/poe-trade-bridge` package and the
workspace files. With Node 24 and pnpm 10.32.1:

```bash
pnpm install --ignore-scripts --filter "@poe-tools/browser-extension..."
cd apps/poe.boats-extension
pnpm exec wxt zip -b firefox
```

The built extension is `apps/poe.boats-extension/.output/firefox-mv3`; it is byte-identical to the
submitted package.

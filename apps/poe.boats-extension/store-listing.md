# Store listings

Text for the Chrome Web Store and Firefox Add-ons (AMO) listings. Keep it in step with
[README.md](README.md) and the poe.boats `/extension` page, which is the privacy policy URL for
both stores: `https://poe.boats/extension`.

## Shared

**Name:** poe.boats Trade Pricing

**Summary (132 characters max):**
Price poe.boats crafting steps from the official Path of Exile trade site, in your own browser and session.

**Category:** Chrome: Tools. AMO: Other.

**Description:**

> poe.boats Trade Pricing finds where buying an item beats crafting it.
>
> On a poe.boats crafting project, click Price steps. The extension runs an official trade search
> for each step of the craft on pathofexile.com, in your own browser and with your own sign-in.
> poe.boats checks the listings against each step and compares the cheapest instant-buyout
> price with the expected cost of crafting to that step, then shows which step is the cheapest
> place to buy in.
>
> - Your pathofexile.com session stays in your browser. The extension never reads it and never
>   sends it anywhere.
> - Searches run only when you click, one at a time, following the trade site's rate limits.
> - Seller names and whisper messages are removed from listings before they reach poe.boats.
> - Works with Path of Exile 1 and Path of Exile 2.
>
> This product isn't affiliated with or endorsed by Grinding Gear Games in any way.

**Screenshots:** the Buy-in prices table on a poe.boats project, before and after a run
(1280×800).

## Chrome Web Store: privacy tab

**Single purpose:** Run official Path of Exile trade searches requested by a poe.boats crafting
project in the user's browser, and return the listing prices to that project.

**Permission justifications:**

- `storage`: keeps fetched listings until the poe.boats page that requested them has used them,
  for at most 7 days.
- Host access to `www.pathofexile.com/trade*`: runs the trade searches as the trade page, so the
  user's own sign-in and the site's rate limits apply.
- Host access to `poe.boats` and `dev.poe.boats`: receives search requests from, and returns
  listings to, the poe.boats crafting page.

**Remote code:** No. All code is in the package.

**Data usage:** Collects "Website content" (trade listing prices and item properties) only to
provide the feature the user started. Not sold, not used for unrelated purposes, not used for
credit decisions. Certify all three statements.

## Firefox Add-ons

**Data collection:** declared in the manifest as required `websiteContent`; Firefox 140 and later
show the consent prompt at install.

**Source code:** upload `poe-boats-trade-pricing-<version>-sources.zip` from `vp run zip:firefox`.

**Notes for reviewers:**

> Build steps are in apps/poe.boats-extension/README.md inside the sources zip (pnpm install with
> --ignore-scripts and a filter, then wxt zip -b firefox); the output is byte-identical. The
> main-world content script (trade-main) only performs fetch requests to /api/trade*/search and
> /api/trade*/fetch on www.pathofexile.com, checked by isTradeApiPath, so the trade site's own
> session and rate limits apply. Test with a poe.boats crafting project
> (https://poe.boats/1/crafting/projects): set a league under Buy-in prices and click Price steps.

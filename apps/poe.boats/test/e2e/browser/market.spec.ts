import { expect, test } from "@playwright/test";
import { selectValue } from "./control-helpers";

test("offers the season market alongside the other PoE 1 tools", async ({ page }) => {
    await page.goto("/1");
    const tools = page.getByRole("navigation", { name: "Path of Exile 1 tools" });
    await expect(tools.getByRole("link")).toHaveCount(6);
    await expect(tools.getByRole("link", { name: "Boss Rota Profits" })).toHaveAttribute(
        "href",
        "/1/boss-rota",
    );
    const market = tools.getByRole("link", { name: "Season market" });
    await expect(market.locator("svg").first()).toBeVisible();
    await market.click();
    await expect(page).toHaveURL(/\/1\/market\/currency/);
    await expect(tools.getByRole("link", { name: "Season market" })).toHaveAttribute(
        "aria-current",
        "page",
    );
    const atlas = page.getByRole("heading", { name: "Atlas", exact: true }).locator("..");
    await expect(atlas.getByRole("link", { name: "Maps" })).toBeVisible();
    await expect(atlas.getByRole("link", { name: /Scarabs|Memories/ })).toHaveCount(0);
});

test("wraps long Cluster Jewel groups and collapses the variants after selection", async ({
    page,
}, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(
        "/1/market/items/Large%20Cluster%20Jewel?league=Allflame&category=cluster-jewel-bases&kind=base",
    );
    const nav = page.getByRole("navigation", { name: "Item variants" });
    const rows = nav.locator("tbody tr");
    const toggle = nav.getByRole("button", { name: /Show (all|top)/ });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await rows.count()).toBeGreaterThan(300);
    const link = nav.getByRole("link", {
        name: /^Mace or Sceptre Attacks.*Staff Attacks.* · 8 passives · ilvl 75–83$/,
    });
    const cells = link.locator("xpath=ancestor::tr").getByRole("cell");
    await expect(cells.nth(1)).toHaveText("8");
    await expect(cells.nth(2)).toHaveText("75–83");
    expect(await link.evaluate((element) => element.getClientRects().length)).toBeGreaterThan(1);
    await link
        .locator("xpath=ancestor::tr")
        .screenshot({ path: testInfo.outputPath("large-cluster-variant.png") });
    await link.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page).toHaveURL(
        (url) => url.searchParams.get("value")?.startsWith("Mace or Sceptre Attacks") === true,
    );
    await expect(link).toHaveAttribute("aria-current", "page");
    expect(await rows.count()).toBeLessThanOrEqual(11);
});

test("a failed market sort restores the URL, rows and selected order", async ({ page }) => {
    await page.goto("/1/market/armour?league=Allflame&order=name-asc");
    const table = page.getByRole("table", { name: "Unique armour markets" });
    const sales = table.getByRole("columnheader", { name: "Likely sales" });
    const firstItem = table.getByRole("row").nth(1).getByRole("link").first();
    const itemUrl = await firstItem.getAttribute("href");
    const url = page.url();
    const delayed = Promise.withResolvers<void>();
    await page.route("**/*.data?**", async (route) => {
        await delayed.promise;
        await route.abort("failed");
    });
    await sales.getByRole("button").click();
    await expect(sales).toHaveAttribute("aria-sort", "descending");
    await expect(firstItem).toHaveAttribute("href", itemUrl!);
    delayed.resolve();
    await expect(
        page.getByText("Could not load the requested results. Showing your previous selection."),
    ).toBeVisible();
    await expect(sales).toHaveAttribute("aria-sort", "none");
    await expect(firstItem).toHaveAttribute("href", itemUrl!);
    await expect(page).toHaveURL(url);
});

test("arbitrage keeps recipe returns visible and switches between calculators", async ({
    page,
}, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/1/arbitrage?league=Exchange+One");
    const sections = page.getByRole("tablist", { name: "Arbitrage types" });
    await sections.getByRole("tab", { name: /Currency exchanges/ }).click();
    const results = page.getByRole("region", { name: "Arbitrage results" });
    await expect(results.getByRole("heading")).toBeInViewport();
    await expect(results.locator("time")).toBeVisible();
    const buffer = page.getByLabel("Price buffer (%)", { exact: true });
    const filters = page.getByRole("button", { name: "Filters", exact: true });
    await expect(buffer).toBeHidden();
    await filters.click();
    const inputVolume = page.getByRole("spinbutton", { name: "Minimum inputs traded" });
    const outputVolume = page.getByRole("spinbutton", { name: "Minimum outputs traded" });
    await inputVolume.pressSequentially("500");
    await outputVolume.fill("101");
    const recipe = page.getByRole("link", { name: "3 × Scroll of Wisdom → 1 × Portal Scroll" });
    await expect(recipe).toHaveCount(0);
    await outputVolume.fill("100");
    await expect(recipe).toBeVisible();
    await expect(page).toHaveURL(
        (url) =>
            url.searchParams.get("minimumInputUnits24h") === "500" &&
            url.searchParams.get("minimumOutputUnits24h") === "100",
    );
    await inputVolume.fill("");
    await outputVolume.fill("");
    await buffer.fill("1");
    await page.getByRole("button", { name: "Filters (1)", exact: true }).click();
    await expect(buffer).toBeHidden();

    const row = results.getByRole("row").filter({ has: recipe });
    const details = row.getByRole("button", { name: /Details for/ });
    const trade = row.getByRole("link", { name: "Buy Scroll of Wisdom" });
    for (const width of [390, 768]) {
        await page.setViewportSize({ width, height: 844 });
        await row.scrollIntoViewIfNeeded();
        await expect(recipe).toBeInViewport({ ratio: 1 });
        await expect(row.getByText("Profit", { exact: true })).toBeInViewport({ ratio: 1 });
        await expect(row.getByText(/%$/)).toBeInViewport({ ratio: 1 });
        await expect(trade).toBeHidden();
        await details.click();
        await expect(trade).toBeVisible();
        await expect(row.getByText("Buy inputs")).toBeVisible();
        await expect(row.getByText("Sell output")).toBeVisible();
        await expect(row.getByRole("link", { name: "Check Portal Scroll listings" })).toBeVisible();
        await details.click();
        await expect(trade).toBeHidden();
        if (width === 390)
            await row.screenshot({ path: testInfo.outputPath("arbitrage-recipe.png") });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("arbitrage-mobile.png") });
    for (const [name, title] of [
        ["Item recipes", "3-for-1 and 5-for-1 item recipes"],
        ["Cluster Jewel rerolls", "5-for-1 Cluster Jewel rerolls"],
    ] as const) {
        await sections.getByRole("tab", { name: new RegExp(name) }).click();
        await expect(page.getByText(title, { exact: true })).toBeInViewport({ ratio: 1 });
    }
    await sections.getByRole("tab", { name: /Currency exchanges/ }).click();
    await expect(results.getByRole("heading")).toBeInViewport();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(details).toBeHidden();
    await expect(trade).toBeInViewport({ ratio: 1 });
    await expect(buffer).toBeVisible();
    await expect(results.getByRole("columnheader", { name: "Profit" })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("arbitrage-desktop.png") });
});

test("groups categories and applies filtering and price ordering across market pages", async ({
    page,
}, testInfo) => {
    await page.goto("/1/market?league=Allflame");
    await expect(page).toHaveURL(
        (url) =>
            url.pathname === "/1/market/currency" && url.searchParams.get("league") === "Allflame",
    );
    const categories = page.getByRole("navigation", { name: "Market categories" });
    await expect(categories.getByRole("heading", { name: "Equipment & gems" })).toBeVisible();
    await categories.getByRole("link", { name: "Unique armour", exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/1/market/armour");
    await expect(
        page
            .getByRole("region", { name: "Item markets", exact: true })
            .getByRole("heading", { name: "Unique armour", level: 2, exact: true }),
    ).toBeVisible();
    await selectValue(page.getByRole("combobox", { name: "Order by" }), "price-desc");
    await selectValue(page.getByRole("combobox", { name: "Identification", exact: true }), "true");
    await selectValue(page.getByRole("combobox", { name: "Corruption", exact: true }), "false");
    await expect(page).toHaveURL(/corruption=false/);
    const rows = page.getByRole("region", { name: "Item markets" }).getByRole("row");
    await expect(rows.nth(1)).toContainText("Boots 54");
    await expect(rows.nth(1)).toContainText("57 divine");
    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(rows.nth(1)).toContainText("Boots 04");
    await expect(rows.last()).toContainText("Abberath's Hooves");
    await page.screenshot({ path: testInfo.outputPath("market-desktop.png"), fullPage: true });
    await page.getByRole("searchbox", { name: "Search items" }).fill("Goathide");
    await expect(page).toHaveURL(/q=Goathide/);
    await expect(page).not.toHaveURL(/page=2/);
    await expect(rows.nth(1)).toContainText("Boots 54");
    // Category links clear the search text.
    await categories.getByRole("link", { name: "Unique weapons", exact: true }).click();
    await expect(page.getByText("No markets match these filters")).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Search items" })).toHaveValue("");
    await expect(page).toHaveURL(
        (url) => url.pathname === "/1/market/weapons" && !url.searchParams.get("q"),
    );
    await selectValue(page.getByRole("combobox", { name: "Price currency" }), "chaos");
    await expect(page).toHaveURL(
        (url) =>
            url.pathname === "/1/market/weapons" && url.searchParams.get("currency") === "chaos",
    );
});

test("opens nested history, preserves variants and browsing state, and supports back and reload", async ({
    page,
}) => {
    await page.goto(
        "/1/market?league=Allflame&category=armour&q=Abberath&order=name-asc&identification=true&corruption=false",
    );
    await expect(page).toHaveURL((url) => url.pathname === "/1/market/armour");
    await page.getByRole("link", { name: "Abberath's Hooves", exact: true }).click();
    await expect(page).toHaveURL(/\/1\/market\/items\/Abberath/);
    await expect(page.getByRole("region", { name: "Item markets", exact: true })).toHaveCount(0);
    await expect(
        page.getByRole("heading", { name: "Abberath's Hooves", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("likely sale prices in chaos")).toBeVisible();
    await selectValue(page.getByRole("combobox", { name: "Period", exact: true }), "30");
    await expect(page).toHaveURL(/days=30/);
    await page.reload();
    await expect(
        page.getByRole("heading", { name: "Abberath's Hooves", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: /Back to markets/ }).click();
    await expect(page.getByRole("searchbox", { name: "Search items" })).toHaveValue("Abberath");
    await expect(page.getByRole("combobox", { name: "Order by" })).toContainText("Name: A–Z");
    await page.goBack();
    await expect(
        page.getByRole("heading", { name: "Abberath's Hooves", exact: true }),
    ).toBeVisible();
});

test("lists crafting bases with likely sales, opens their item page and filters by band", async ({
    page,
}, testInfo) => {
    await page.goto("/1/market/armour-bases?league=Allflame&order=name-asc");
    const list = page.getByRole("region", { name: "Armour bases", exact: true });
    await expect(list.getByRole("columnheader", { name: /Likely sales/ })).toBeVisible();
    await expect(list.getByText("ilvl 86+ · 6 links · Body Armour · Int · Level 84")).toBeVisible();
    await expect(page.getByRole("link", { name: "Abberath's Hooves", exact: true })).toHaveCount(0);
    await selectValue(page.getByRole("combobox", { name: "Links", exact: true }), "6");
    await expect(page).toHaveURL(/baseLinks=6/);
    await expect(list.getByText(/ilvl 84–85/)).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("bases-list.png"), fullPage: true });
    await list.getByRole("link", { name: "Twilight Regalia", exact: true }).click();
    await expect(page).toHaveURL(/\/1\/market\/items\/Twilight%20Regalia/);
    await expect(
        page.getByRole("heading", { name: "Twilight Regalia", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Normal, magic and rare items together/)).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Period", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("bases-item.png"), fullPage: true });
    await page.getByRole("link", { name: /Back to markets/ }).click();
    await expect(page).toHaveURL(/\/1\/market\/armour-bases\?.*baseLinks=6/);
});

test("changes an exchange item's season and period and keeps the way back", async ({
    page,
}, testInfo) => {
    await page.goto(
        "/1/market/exchange/Currency/CurrencyIdentification?league=Exchange+One&category=currency&order=name-asc",
    );
    const heading = page.getByRole("heading", { name: "Scroll of Wisdom", exact: true });
    await expect(heading).toBeVisible();
    await selectValue(page.getByRole("combobox", { name: "Period", exact: true }), "30");
    await expect(page).toHaveURL(/days=30/);
    await expect(page.getByRole("heading", { name: /Hourly price history/ })).toContainText(
        "last 30 days",
    );
    await selectValue(page.getByRole("combobox", { name: "Season", exact: true }), "Exchange Two");
    await expect(page).toHaveURL(/league=Exchange\+Two/);
    await expect(page.getByText(/Exchange Two · Currency exchange/)).toBeVisible();
    // The way back keeps the list's filters.
    await expect(page).toHaveURL(/category=currency/);
    await expect(page).toHaveURL(/order=name-asc/);
    await expect(page.getByRole("img", { name: /Hourly chaos/ }).locator("svg")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("exchange-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    // The chart redraws at the new width after the resize.
    await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath("exchange-mobile.png"), fullPage: true });
    await page.getByRole("link", { name: /Back to markets/ }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/1/market/currency");
});

test("redirects legacy bookmarks and displays a usable mobile history page", async ({
    page,
}, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
        "/1/market?realm=pc&league=Allflame&days=7&q=&currency=chaos&item=Abberath%27s+Hooves&identified=true&corrupted=false&foil=-1&kind=&value=",
    );
    await expect(page).toHaveURL(/\/market\/items\/Abberath/);
    await expect(
        page.getByRole("heading", { name: "Abberath's Hooves", exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
    );
    await page.screenshot({ path: testInfo.outputPath("market-mobile.png"), fullPage: true });
    await page.goto("/1/market/items/Missing?league=Allflame");
    await expect(
        page.getByText("No observations for this variant in the selected period."),
    ).toBeVisible();
    await page.getByRole("link", { name: /Back to markets/ }).click();
    await expect(page.getByRole("region", { name: "Item markets", exact: true })).toBeVisible();
    const toggle = page.getByRole("button", { name: "Categories: Currency" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await page
        .getByRole("navigation", { name: "Market categories" })
        .getByRole("link", { name: "Unique weapons", exact: true })
        .click();
    await expect(page.getByRole("button", { name: "Categories: Unique weapons" })).toHaveAttribute(
        "aria-expanded",
        "false",
    );
    await expect(page.getByText("No markets match these filters")).toBeVisible();
});

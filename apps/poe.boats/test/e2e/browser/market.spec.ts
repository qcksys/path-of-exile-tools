import { expect, test } from "@playwright/test";
import { selectValue } from "./control-helpers";

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
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
    );
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

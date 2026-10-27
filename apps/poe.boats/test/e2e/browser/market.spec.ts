import { expect, test } from "@playwright/test";
import { selectValue } from "./control-helpers";

test("groups categories and applies filtering and price ordering across market pages", async ({
    page,
}, testInfo) => {
    await page.goto("/1/market?league=Allflame");
    const categories = page.getByRole("navigation", { name: "Market categories" });
    await expect(categories.getByRole("heading", { name: "Equipment & gems" })).toBeVisible();
    await categories.getByRole("link", { name: "Armour", exact: true }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get("category") === "armour");
    await expect(
        page
            .getByRole("region", { name: "Item markets", exact: true })
            .getByRole("heading", { name: "Armour", level: 2, exact: true }),
    ).toBeVisible();
    await selectValue(page.getByRole("combobox", { name: "Order by" }), "price-desc");
    await selectValue(page.getByRole("combobox", { name: "Rarity", exact: true }), "unique");
    await selectValue(page.getByRole("combobox", { name: "Identification", exact: true }), "true");
    await selectValue(page.getByRole("combobox", { name: "Corruption", exact: true }), "false");
    await page.getByRole("button", { name: "Apply filters" }).click();
    const rows = page.getByRole("region", { name: "Item markets" }).getByRole("row");
    await expect(rows.nth(1)).toContainText("Boots 54");
    await expect(rows.nth(1)).toContainText("57 divine");
    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(rows.nth(1)).toContainText("Boots 04");
    await expect(rows.last()).toContainText("Abberath's Hooves");
    await page.screenshot({ path: testInfo.outputPath("market-desktop.png"), fullPage: true });
    await page.getByRole("searchbox", { name: "Search items" }).fill("Goathide");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).not.toHaveURL(/page=2/);
    await expect(rows.nth(1)).toContainText("Boots 54");
    await categories.getByRole("link", { name: "Weapons", exact: true }).click();
    await expect(page.getByText("No markets match these filters")).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Search items" })).toHaveValue("Goathide");
});

test("opens nested history, preserves variants and browsing state, and supports back and reload", async ({
    page,
}) => {
    await page.goto(
        "/1/market?league=Allflame&category=armour&q=Abberath&order=name-asc&identification=true&corruption=false",
    );
    await page.getByRole("link", { name: "Abberath's Hooves", exact: true }).click();
    await expect(page).toHaveURL(/\/1\/market\/items\/Abberath/);
    await expect(page.getByRole("region", { name: "Item markets", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Abberath's Hooves" })).toBeVisible();
    await page.getByRole("link", { name: "chaos", exact: true }).click();
    await expect(page.getByLabel("Hourly median asking price in chaos")).toBeVisible();
    await selectValue(page.getByRole("combobox", { name: "Period", exact: true }), "30");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/days=30/);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Abberath's Hooves" })).toBeVisible();
    await page.getByRole("link", { name: /Back to markets/ }).click();
    await expect(page.getByRole("searchbox", { name: "Search items" })).toHaveValue("Abberath");
    await expect(page.getByRole("combobox", { name: "Order by" })).toContainText("Name: A–Z");
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Abberath's Hooves" })).toBeVisible();
});

test("redirects legacy bookmarks and displays a usable mobile history page", async ({
    page,
}, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
        "/1/market?realm=pc&league=Allflame&days=7&q=&currency=chaos&item=Abberath%27s+Hooves&identified=true&corrupted=false&foil=-1&kind=&value=",
    );
    await expect(page).toHaveURL(/\/market\/items\/Abberath/);
    await expect(page.getByRole("heading", { name: "Abberath's Hooves" })).toBeVisible();
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
    const toggle = page.getByRole("button", { name: "Categories: All items" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await page
        .getByRole("navigation", { name: "Market categories" })
        .getByRole("link", { name: "Weapons", exact: true })
        .click();
    await expect(page.getByRole("button", { name: "Categories: Weapons" })).toHaveAttribute(
        "aria-expanded",
        "false",
    );
    await expect(page.getByText("No markets match these filters")).toBeVisible();
});

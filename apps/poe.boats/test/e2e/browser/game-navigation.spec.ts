import { expect, test } from "@playwright/test";

test("lists each game's tools under its home page link", async ({ page }) => {
    await page.goto("/");
    const first = page.getByRole("navigation", { name: "Path of Exile 1 tools" });
    await expect(first.getByRole("link")).toHaveText([
        "Path of Exile 1",
        "Crafting Calculator",
        "Idol Planner",
        "Vendor Recipe Arbitrage",
        "Boss Rota Profits",
        "Recombinator Simulator",
        "Season market",
        "Collector Gallery",
    ]);
    const second = page.getByRole("navigation", { name: "Path of Exile 2 tools" });
    await expect(second.getByRole("link")).toHaveText([
        "Path of Exile 2",
        "Crafting Calculator",
        "Exchange Prices",
        "Reforging Arbitrage",
    ]);
    await second.getByRole("link", { name: "Crafting Calculator" }).click();
    await expect(page).toHaveURL(/\/2\/crafting/);
    await expect(second.getByRole("link", { name: "Crafting Calculator" })).toHaveAttribute(
        "aria-current",
        "page",
    );
    await expect(second.getByRole("link", { name: "Reforging Arbitrage" })).toHaveAttribute(
        "href",
        "/2/arbitrage",
    );
    await expect(first).toHaveCount(0);
});

test("keeps the current tool visible on narrow screens and follows nested routes", async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/1/recombinator");
    const nav = page.getByRole("navigation", { name: "Path of Exile 1 tools" });
    const simulator = nav.getByRole("link", { name: "Recombinator Simulator" });
    await expect(simulator).toHaveAttribute("aria-current", "page");
    await expect(simulator).toBeInViewport({ ratio: 0.99 });
    const crafting = nav.getByRole("link", { name: "Crafting Calculator" });
    await crafting.click();
    await expect(crafting).toHaveAttribute("aria-current", "page");
    await page.goto("/1/crafting/projects");
    await expect(crafting).toHaveAttribute("aria-current", "page");
    await page.goBack();
    await page.goBack();
    await expect(simulator).toHaveAttribute("aria-current", "page");
});

test("opens the collector gallery and narrows it to a Demigod's artwork", async ({ page }) => {
    await page.goto("/1/");
    await page.getByRole("link", { name: "Collector Gallery" }).click();
    const count = page.getByRole("region", { name: "Gallery results" }).getByRole("status");
    await expect(count).toHaveText("136 items · 156 artworks");
    await page.getByRole("searchbox").fill("Golden Flame");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(count).toHaveText("1 item · 2 artworks");
    await expect(page.getByRole("heading", { name: "Demigod's Beacon" })).toBeVisible();
    await expect(page.getByText("Emberwake · Bloodgrip · Soulthirst")).toBeVisible();
    const alternate = page.locator("figure").filter({ hasText: "Emberwake" });
    await expect(alternate.getByText("Historical ask")).toBeVisible();
    await expect(alternate.getByText("99 mirrors")).toBeVisible();
    await expect(alternate.getByText("Likely sales (30d)")).toBeVisible();
    await expect(alternate.getByText("Unavailable")).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(count).toHaveText("136 items · 156 artworks");
});

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

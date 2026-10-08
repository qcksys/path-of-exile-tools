import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { craftingCatalogSchema } from "../../../app/schemas/crafting";
import { choose } from "./recombinator-helpers";

for (const game of ["poe1", "poe2"] as const) {
    test(`${game} starts empty and presents grouped item artwork and details`, async ({
        page,
    }, testInfo) => {
        const catalog = craftingCatalogSchema.parse(
            JSON.parse(await readFile(`public/game-data/crafting-${game}.json`, "utf8")),
        );
        const [baseId, base] = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "Body Armour" && base.drop_level === 1,
        )!;
        await page.goto(`/${game === "poe1" ? 1 : 2}/crafting/emulate`);
        const picker = page.getByRole("combobox", { name: "Item base", exact: true });
        await expect(picker).toHaveValue("");
        await expect(page.getByRole("region", { name: "Current item", exact: true })).toHaveCount(
            0,
        );
        expect(
            await page.evaluate(() =>
                Object.keys(localStorage).some((key) => key.endsWith(":draft:v1")),
            ),
        ).toBe(false);
        await picker.fill(base.name);
        await picker.press("ArrowDown");
        const option = page
            .getByRole("listbox")
            .getByRole("option", { name: `${base.name} · Body Armour`, exact: true });
        await expect(option.getByRole("img", { name: base.name })).toHaveAttribute(
            "src",
            game === "poe1"
                ? /^https:\/\/www.pathofexile.com\/image\/Art\//
                : /^https:\/\/cdn.poe2db.tw\/image\/Art\//,
        );
        await expect(page.getByRole("group", { name: "Body Armour", exact: true })).toBeVisible();
        await option.click();
        await expect(page.getByLabel("Item base details")).toContainText("Base level 1");
        const card = page.getByRole("region", { name: "Current item", exact: true });
        await expect(card).toHaveAttribute("data-rarity", "normal");
        await expect(card.getByRole("img", { name: base.name })).toBeVisible();
        await expect
            .poll(() =>
                card
                    .getByRole("img", { name: base.name })
                    .evaluate((image: HTMLImageElement) => image.naturalWidth),
            )
            .toBeGreaterThan(0);
        await card.screenshot({ path: testInfo.outputPath("item-card.png") });
        await expect
            .poll(async () =>
                page.evaluate(
                    (key) => JSON.parse(localStorage.getItem(key) ?? "null")?.item?.baseId,
                    `poe-boats:crafting:${game}:${catalog.patch}:draft:v1`,
                ),
            )
            .toBe(baseId);
        await page.reload();
        await expect(picker).toHaveValue(`${base.name} · Body Armour`);
        await expect(card).toBeVisible();
        await page.getByRole("button", { name: "Apply craft", exact: true }).click();
        await expect(card).toHaveAttribute("data-rarity", "rare");
        await expect(card.getByRole("heading", { level: 2 })).toHaveCSS(
            "color",
            "rgb(255, 255, 119)",
        );
        await page.setViewportSize({ width: 1280, height: 1400 });
        await card.screenshot({ path: testInfo.outputPath("rare-item-card.png") });
        await page.setViewportSize({ width: 390, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            390,
        );
    });
}

test("new projects require a base and the graph expands without changing the project", async ({
    page,
}, testInfo) => {
    await page.goto("/1/crafting/projects");
    await page.getByRole("button", { name: "New project", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Starting base" })).toHaveValue("");
    await expect(page.getByRole("button", { name: "Create project", exact: true })).toBeDisabled();
    await choose(page, "Starting base", "Plate Vest", "Plate Vest · Body Armour");
    await page.getByRole("button", { name: "Create project", exact: true }).click();
    const graph = page.getByRole("region", { name: "Crafting project graph", exact: true });
    await expect(graph.locator('[data-item-art="Plate Vest"] img').first()).toBeVisible();
    await expect(graph.getByRole("link", { name: "React Flow", exact: true })).toHaveCount(0);
    const initial = (await graph.boundingBox())!;
    await graph.screenshot({ path: testInfo.outputPath("graph-item-thumbnails.png") });
    await page.getByRole("button", { name: "Full width", exact: true }).click();
    await expect
        .poll(async () => (await graph.boundingBox())!.width)
        .toBeGreaterThan(initial.width);
    await page.getByRole("button", { name: "Fullscreen graph", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Crafting project graph", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: "React Flow", exact: true })).toHaveCount(0);
    await expect
        .poll(async () => Math.round((await dialog.boundingBox())!.height))
        .toBe(page.viewportSize()!.height);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Full width", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
    );
    await page.getByRole("button", { name: "Full width", exact: true }).click();
    await expect.poll(async () => (await graph.boundingBox())!.width).toBe(initial.width);
    await page.getByRole("button", { name: "Add item input", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "New input base", exact: true })).toHaveValue(
        "",
    );
    await choose(page, "New input base", "Coral Ring", "Coral Ring · Ring");
    await expect(
        page
            .getByRole("region", { name: "Selected step editor" })
            .getByRole("combobox", { name: "Purchased base" }),
    ).toHaveValue("Coral Ring · Ring");
    await page.getByRole("button", { name: "New project", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Starting base" })).toHaveValue("");
    await expect(page.getByRole("button", { name: "Create project", exact: true })).toBeDisabled();
});

test("currency artwork remains usable in prices, pinned methods and mobile controls", async ({
    page,
}, testInfo) => {
    const requests: string[] = [];
    page.on("request", (request) => {
        if (request.url().includes("/game-data/items-poe1.json")) requests.push(request.url());
    });
    await page.goto("/1/crafting/emulate");
    await choose(page, "Item base", "Plate Vest", "Plate Vest · Body Armour");
    await choose(page, "Crafting method", "Orb of Alchemy", "Orb of Alchemy");
    await page.getByRole("button", { name: "Pin current crafting method" }).click();
    const pinned = page.getByRole("region", { name: "Pinned methods" });
    await expect(pinned.locator('[data-item-art="Orb of Alchemy"] img')).toBeVisible();
    await expect(pinned.getByRole("combobox", { name: "Pinned crafting methods" })).toHaveValue(
        "Orb of Alchemy",
    );
    await page.getByText("Custom prices in chaos", { exact: true }).click();
    const prices = page
        .locator("details")
        .filter({ has: page.getByText("Custom prices in chaos", { exact: true }) });
    await expect(prices.locator('[data-item-art="Orb of Alchemy"] img')).toBeVisible();
    await prices.getByRole("spinbutton", { name: "Orb of Alchemy", exact: true }).fill("2");
    expect(requests).toHaveLength(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await pinned.scrollIntoViewIfNeeded();
    await pinned.screenshot({ path: testInfo.outputPath("pinned-currency-mobile.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
    );
});

test("broken artwork keeps item labels and selection available", async ({ page }) => {
    await page.route("https://www.pathofexile.com/image/**", (route) => route.abort());
    await page.goto("/1/crafting/emulate");
    await choose(page, "Item base", "Plate Vest", "Plate Vest · Body Armour");
    const card = page.getByRole("region", { name: "Current item", exact: true });
    await expect(card.getByLabel("Artwork unavailable for Plate Vest")).toBeVisible();
    await expect(card.getByRole("heading", { name: "Plate Vest" })).toBeVisible();
    await page.getByRole("button", { name: "Apply craft", exact: true }).click();
    await expect(card).toHaveAttribute("data-rarity", "rare");
});

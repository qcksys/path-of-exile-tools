import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { craftingCatalogSchema } from "../../../app/schemas/crafting";
import { selectValue } from "./control-helpers";
import { choose } from "./recombinator-helpers";

async function createIdol(page: Page, name: string) {
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByRole("textbox", { name: "Name (optional)" }).fill(name);
    await page.getByRole("button", { name: "Select modifier...", exact: true }).first().click();
    await page.getByRole("listbox").getByRole("option").first().click();
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
}

for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 640 },
]) {
    test(`idol inventory actions and language remain usable at ${viewport.width}px`, async ({
        page,
    }, testInfo) => {
        await page.setViewportSize(viewport);
        await page.goto("/1/idol-planner");
        await createIdol(page, "Review idol");
        const edit = page.getByRole("button", { name: "Edit: Review idol", exact: true });
        await expect(edit).toBeVisible();
        await edit.click();
        await expect(page.getByRole("dialog", { name: "Edit Idol" })).toBeVisible();
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await page.getByRole("button", { name: "Import", exact: true }).last().click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
            path: testInfo.outputPath("mobile-inventory.png"),
            fullPage: true,
        });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            viewport.width,
        );
        const language = page.getByRole("combobox", {
            name: "Change display language",
            exact: true,
        });
        await language.click();
        await page
            .getByRole("listbox")
            .getByRole("option", { name: "Español", exact: true })
            .click();
        await expect(page.locator("html")).toHaveAttribute("lang", "es");
        await page.reload();
        await expect(page.locator("html")).toHaveAttribute("lang", "es");
    });
}

test("idols can be placed, moved and removed without dragging and reject unavailable cells", async ({
    page,
}) => {
    await page.goto("/1/idol-planner");
    await createIdol(page, "Keyboard idol");
    await page.getByText("Place or move without dragging", { exact: true }).click();
    const controls = page.getByRole("region", { name: "Arrange idols without dragging" });
    await selectValue(controls.getByRole("combobox", { name: "Idol to arrange" }), {
        label: "Keyboard idol",
    });
    const position = controls.getByRole("combobox", { name: "Grid position" });
    await position.focus();
    await page.keyboard.press("Enter");
    await expect(
        page.getByRole("option", { name: "Row 1, column 1 · unavailable", exact: true }),
    ).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("option", { name: "Row 1, column 2", exact: true }).press("Enter");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await controls.getByRole("button", { name: "Place idol", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(controls.getByRole("status")).toHaveText("Idol placed at row 1, column 2.");
    await expect(controls).toContainText("Currently at row 1, column 2.");
    await selectValue(position, { label: "Row 2, column 2" });
    await controls.getByRole("button", { name: "Move idol", exact: true }).press("Enter");
    await expect(controls).toContainText("Currently at row 2, column 2.");
    await page.reload();
    await page.getByText("Place or move without dragging", { exact: true }).click();
    await selectValue(controls.getByRole("combobox", { name: "Idol to arrange" }), {
        label: "Keyboard idol · placed",
    });
    await expect(controls).toContainText("Currently at row 2, column 2.");
    await controls.getByRole("button", { name: "Remove from grid", exact: true }).press("Enter");
    await expect(controls.getByRole("status")).toContainText("It remains in your inventory");
    await expect(controls.getByRole("button", { name: "Remove from grid" })).toHaveCount(0);
    await expect(
        page.getByRole("button", { name: "Edit: Keyboard idol", exact: true }),
    ).toBeVisible();
});

test("project and build deletion require explicit confirmation and cancellation preserves drafts", async ({
    page,
}) => {
    await page.goto("/1/crafting/projects");
    await page.getByRole("button", { name: "Create from preset", exact: true }).click();
    await expect(
        page.getByRole("tab", { name: "Life on block shield", exact: true }),
    ).toBeVisible();
    await page.getByText("Saved item plans & builds", { exact: true }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Delete item plan?" });
    await expect(dialog).toContainText("Life on block shield");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await expect(
        page.getByRole("tab", { name: "Life on block shield", exact: true }),
    ).toBeVisible();
    await page.getByText("Saved item plans & builds", { exact: true }).click();
    await page.getByRole("textbox", { name: "Build name", exact: true }).fill("Review build");
    await page.getByRole("button", { name: "Create build", exact: true }).click();
    await selectValue(page.getByRole("combobox", { name: "Item plan for Review build" }), {
        label: "Life on block shield",
    });
    await selectValue(page.getByRole("combobox", { name: "Save mode for Review build" }), "value");
    await page.getByRole("button", { name: "Add item to build" }).click();
    await page.getByRole("button", { name: "Delete build", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Delete build?" });
    await expect(dialog).toContainText("embedded item-plan copies");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("textbox", { name: "Saved build name" })).toHaveValue(
        "Review build",
    );
    await page.getByRole("button", { name: "Delete build", exact: true }).click();
    await dialog.getByRole("button", { name: "Delete build", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Saved build name" })).toHaveCount(0);
    await expect(
        page.getByRole("tab", { name: "Life on block shield", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "Delete item plan", exact: true })
        .click();
    await expect(page.getByRole("tab")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Crafting projects" })).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(0);
});

for (const failure of ["http", "network"] as const) {
    test(`sign-in exposes pending state and allows retry after ${failure} failure`, async ({
        page,
    }) => {
        let release = () => {};
        const responseReady = new Promise<void>((resolve) => {
            release = resolve;
        });
        let attempts = 0;
        await page.route("**/api/auth/sign-in/social", async (route) => {
            attempts++;
            expect(route.request().postDataJSON().callbackURL).toBe("/2/crafting/projects");
            await responseReady;
            if (failure === "network") await route.abort();
            else
                await route.fulfill({
                    status: 500,
                    contentType: "application/json",
                    body: JSON.stringify({ message: "Unavailable" }),
                });
        });
        await page.goto("/login?returnTo=/2/crafting/projects");
        await page.getByRole("button", { name: "Continue with Google" }).click();
        await expect(page.getByRole("button", { name: "Connecting to Google…" })).toBeDisabled();
        release();
        await expect(page.getByRole("alert")).toContainText("try again");
        const retry = page.getByRole("button", { name: "Continue with Google" });
        await expect(retry).toBeEnabled();
        await retry.click();
        await expect(page.getByRole("alert")).toBeVisible();
        expect(attempts).toBe(2);
    });
}

for (const game of [1, 2]) {
    test(`PoE ${game} mobile crafting sections reach the action and results directly`, async ({
        page,
    }, testInfo) => {
        await page.setViewportSize({ width: 390, height: 844 });
        const catalog = craftingCatalogSchema.parse(
            JSON.parse(await readFile(`public/game-data/crafting-poe${game}.json`, "utf8")),
        );
        const base = Object.values(catalog.bases).find(
            (entry) => entry.item_class === "Body Armour" && entry.drop_level === 1,
        )!;
        await page.goto(`/${game}/crafting/calculate`);
        await expect(page.getByRole("button", { name: "Open Item base options" })).toHaveCount(1);
        await choose(page, "Item base", base.name, `${base.name} · Body Armour`);
        const nav = page.getByRole("navigation", { name: "Workbench sections" });
        await expect(nav).toBeInViewport();
        await nav.getByRole("button", { name: "Modifiers", exact: true }).click();
        await page.getByRole("button", { name: "Require", exact: true }).first().click();
        await nav.getByRole("button", { name: "Calculate", exact: true }).click();
        const calculate = page.getByRole("button", { name: "Calculate odds", exact: true });
        await expect(calculate).toBeFocused();
        await expect(calculate).toBeInViewport();
        await calculate.press("Enter");
        await expect(
            page.getByRole("region", { name: "Crafting results", exact: true }),
        ).toBeVisible();
        await nav.getByRole("button", { name: "Results", exact: true }).click();
        await expect(
            page.getByRole("region", { name: "Crafting results", exact: true }),
        ).toBeInViewport();
        await page.screenshot({ path: testInfo.outputPath("mobile-crafting-results.png") });
    });
}

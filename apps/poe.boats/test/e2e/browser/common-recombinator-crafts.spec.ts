import { expect, type Page, test } from "@playwright/test";
import { choose, select } from "./recombinator-helpers";

async function prepareItems(page: Page, bases: string[]) {
    await page.goto("/1/recombinator");
    for (const [index, base] of bases.entries()) {
        if (index >= 2) await page.getByRole("button", { name: "Add item", exact: true }).click();
        await choose(page, `Item ${index + 1} base`, base.split(" · ")[0], base);
        await page.getByLabel(`Item ${index + 1} level`, { exact: true }).fill("86");
    }
}

for (const { donor, chance, warning } of [
    {
        donor: "Zodiac Leather",
        chance: "100%",
        warning: "It contributes to the mod count but cannot be selected on either base.",
    },
    {
        donor: "Triumphant Lamellar",
        chance: "83.25%",
        warning: "It can survive on the other base.",
    },
]) {
    test(`transferring suppression from ${donor} respects both bases' Strength eligibility`, async ({
        page,
    }) => {
        await prepareItems(page, [`${donor} · Body Armour`, "Necrotic Armour · Body Armour"]);
        await choose(
            page,
            "Item 1 add suffix (0/3)",
            "of Nullification",
            /\(of Nullification, ilvl 86\)$/,
        );
        await select(page, "Step 1 input B preparation", "Prepare an essence NNN donor");
        await choose(
            page,
            "Step 1 input B preparation recipe",
            "Screaming Essence of Rage",
            "Screaming Essence of Rage · Suffix: +(33-37) to Strength",
        );
        await expect(page.getByText(warning, { exact: false })).toBeVisible();
        await page.getByRole("button", { name: "Calculate plan", exact: true }).click();
        await page.getByRole("checkbox", { name: /\(of Nullification,/ }).check();
        await expect(page.getByTestId("target-chance")).toHaveText(chance);

        await select(page, "Required output base", "Necrotic Armour");
        await page.getByRole("checkbox", { name: "Matching only", exact: true }).check();
        await page
            .getByRole("checkbox", { name: "Exact match (no additional modifiers)", exact: true })
            .check();
        await expect(page.getByTestId("target-chance")).toHaveText("50%");
        const rows = page.getByRole("table").getByRole("row");
        await expect(rows).toHaveCount(2);
        await expect(rows.nth(1)).toContainText("Necrotic Armour");
        await expect(rows.nth(1)).toContainText("of Nullification");
        await expect(rows.nth(1)).not.toContainText("Strength");
        await expect(rows.nth(1).getByRole("cell").last()).toHaveText("50%");
    });
}

for (const { craft, base, prefixes } of [
    {
        craft: "triple energy shield body armour",
        base: "Any INT Body Armour · generic",
        prefixes: ["Resplendent", "Unfaltering", "Seraphim's"],
    },
    {
        craft: "triple elemental Spine Bow",
        base: "Spine Bow · Bow",
        prefixes: ["Carbonising", "Crystalising", "Vapourising"],
    },
]) {
    test(`${craft} uses two overlapping prefix pairs`, async ({ page }) => {
        await prepareItems(page, [base, base]);
        for (const [index, pair] of [prefixes.slice(0, 2), [prefixes[0], prefixes[2]]].entries()) {
            for (const [slot, prefix] of pair.entries())
                await choose(
                    page,
                    `Item ${index + 1} add prefix (${slot}/3)`,
                    prefix,
                    new RegExp(`\\(${prefix}, ilvl \\d+\\)$`),
                );
        }
        await page.getByRole("button", { name: "Calculate plan", exact: true }).click();
        for (const prefix of prefixes) {
            const target = page.getByRole("checkbox", { name: new RegExp(`\\(${prefix},`) });
            await expect(target).toHaveCount(1);
            await target.check();
        }
        await page
            .getByRole("checkbox", { name: "Exact match (no additional modifiers)", exact: true })
            .check();
        await page.getByRole("checkbox", { name: "Matching only", exact: true }).check();
        await expect(page.getByTestId("target-chance")).toHaveText("30.6931%");
        const rows = page.getByRole("table").getByRole("row");
        await expect(rows).toHaveCount(2);
        for (const prefix of prefixes) await expect(rows.nth(1)).toContainText(prefix);
        await expect(rows.nth(1).getByRole("cell").last()).toHaveText("30.6931%");
    });
}

test("life and fire resistance on body armour benefit from opposite-side exclusive crafts", async ({
    page,
}) => {
    await prepareItems(page, ["Glorious Plate · Body Armour", "Glorious Plate · Body Armour"]);
    await choose(page, "Item 1 add prefix (0/3)", "Prime", /\(Prime, ilvl 86\)$/);
    await choose(page, "Item 2 add suffix (0/3)", "of Tzteosh", /\(of Tzteosh, ilvl 84\)$/);
    const calculate = page.getByRole("button", { name: "Calculate plan", exact: true });
    await calculate.click();
    for (const name of [/\(Prime,/, /\(of Tzteosh,/])
        await page.getByRole("checkbox", { name }).check();
    await expect(page.getByTestId("target-chance")).toHaveText("33.3333%");

    for (const { side, query, recipe } of [
        {
            side: "A",
            query: "Strength and Dexterity rank 1",
            recipe: "Crafting bench rank 1 · Suffix: +(10-15) to Strength and Dexterity",
        },
        {
            side: "B",
            query: "Armour during Soul Gain Prevention rank 1",
            recipe: "Crafting bench rank 1 · Prefix: +(1000-1600) to Armour during Soul Gain Prevention",
        },
    ]) {
        const label = `Step 1 input ${side} preparation`;
        await select(page, label, "Add an exclusive bench craft");
        await choose(page, `${label} recipe`, query, recipe);
    }
    await calculate.click();
    await expect(page.getByTestId("target-chance")).toHaveText("55.2775%");
    await page
        .getByRole("checkbox", { name: "Exact match (no additional modifiers)", exact: true })
        .check();
    await page.getByRole("checkbox", { name: "Matching only", exact: true }).check();
    await expect(page.getByTestId("target-chance")).toHaveText("55.2775%");
    const outcomes = page.getByRole("table");
    await expect(outcomes.getByRole("row")).toHaveCount(2);
    await expect(outcomes).toContainText("Prime");
    await expect(outcomes).toContainText("of Tzteosh");
    await expect(outcomes).not.toContainText("Strength and Dexterity");
    await expect(outcomes).not.toContainText("Soul Gain Prevention");

    await page
        .getByRole("checkbox", {
            name: "Remove crafted mods after this recombination",
            exact: true,
        })
        .uncheck();
    await calculate.click();
    await expect(page.getByTestId("target-chance")).toHaveText("11.2225%");
    await page
        .getByRole("checkbox", { name: "Exact match (no additional modifiers)", exact: true })
        .uncheck();
    await expect(page.getByTestId("target-chance")).toHaveText("55.2775%");
    await expect(outcomes).toContainText("Strength and Dexterity");
    await expect(outcomes).toContainText("Soul Gain Prevention");
});

test("a three-combine elemental bow plan carries failed intermediate crafts forward", async ({
    page,
}) => {
    await prepareItems(page, Array(4).fill("Spine Bow · Bow"));
    for (const [index, prefix] of [
        "Carbonising",
        "Crystalising",
        "Carbonising",
        "Vapourising",
    ].entries())
        await choose(
            page,
            `Item ${index + 1} add prefix (0/3)`,
            prefix,
            new RegExp(`\\(${prefix}, ilvl 82\\)$`),
        );
    await page.getByRole("textbox", { name: "Step 1 name", exact: true }).fill("Fire and cold");
    await page.getByRole("button", { name: "Add step", exact: true }).click();
    await page
        .getByRole("textbox", { name: "Step 2 name", exact: true })
        .fill("Fire and lightning");
    await select(page, "Step 2 input A", "Item 3");
    await select(page, "Step 2 input B", "Item 4");
    await page.getByRole("button", { name: "Add step", exact: true }).click();
    await page.getByRole("textbox", { name: "Step 3 name", exact: true }).fill("Triple elemental");
    await select(page, "Step 3 input A", "Step 1: Fire and cold");
    await select(page, "Step 3 input B", "Step 2: Fire and lightning");
    await page.getByRole("button", { name: "Calculate plan", exact: true }).click();
    await select(page, "View step results", "Step 3: Triple elemental");
    for (const prefix of ["Carbonising", "Crystalising", "Vapourising"])
        await page.getByRole("checkbox", { name: new RegExp(`\\(${prefix},`) }).check();
    await expect(page.getByTestId("target-chance")).toHaveText("5.5316%");
    await page.getByRole("checkbox", { name: "Matching only", exact: true }).check();
    const rows = page.getByRole("table").getByRole("row");
    await expect(rows).toHaveCount(2);
    for (const prefix of ["Carbonising", "Crystalising", "Vapourising"])
        await expect(rows.nth(1)).toContainText(prefix);

    await page.getByRole("checkbox", { name: /\(Vapourising,/ }).uncheck();
    await select(page, "View step results", "Step 1: Fire and cold");
    await expect(page.getByTestId("target-chance")).toHaveText("33%");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toContainText("Carbonising");
    await expect(rows.nth(1)).toContainText("Crystalising");
    await expect(rows.nth(1)).not.toContainText("Vapourising");
});

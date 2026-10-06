import { expect, type Page, test } from "@playwright/test";
import { choose } from "./recombinator-helpers";

async function prepareAxes(page: Page) {
    await page.goto("/1/recombinator");
    for (const number of [1, 2]) {
        await choose(page, `Item ${number} base`, "Despot Axe", "Despot Axe · Two Hand Axe");
        await page.getByLabel(`Item ${number} level`, { exact: true }).fill("83");
    }
}

for (const suffixCount of [0, 1, 2]) {
    test(`Flaring plus an essence NNN donor with ${suffixCount} suffixes gives triple T1 prefixes`, async ({
        page,
    }) => {
        await prepareAxes(page);
        await choose(page, "Item 1 add prefix (0/3)", "Merciless", /\(Merciless, ilvl 83\)$/);
        await choose(page, "Item 1 add prefix (1/3)", "Dictator's", /\(Dictator's, ilvl 83\)$/);
        await choose(page, "Item 2 add prefix (0/3)", "Flaring", /\(Flaring, ilvl 77\)$/);
        if (suffixCount >= 1)
            await choose(
                page,
                "Item 2 add suffix (0/3)",
                "of the Brute",
                /\(of the Brute, ilvl 1\)$/,
            );
        if (suffixCount === 2)
            await choose(page, "Item 2 add suffix (1/3)", "of Skill", /\(of Skill, ilvl 1\)$/);

        const calculate = page.getByRole("button", { name: "Calculate plan", exact: true });
        const chance = page.getByTestId("target-chance");
        await calculate.click();
        for (const name of [/\(Merciless,/, /\(Dictator's,/, /\(Flaring,/])
            await page.getByRole("checkbox", { name }).check();
        await expect(chance).toHaveText("9.901%");

        await page
            .getByRole("combobox", { name: "Step 1 input B preparation", exact: true })
            .click();
        await page
            .getByRole("option", { name: "Prepare an essence NNN donor", exact: true })
            .click();
        await choose(
            page,
            "Step 1 input B preparation recipe",
            "Screaming Essence of Torment",
            "Screaming Essence of Torment · Prefix: Adds (8-19) to (248-261) Lightning Damage to Spells",
        );
        const keepMods = page.getByRole("checkbox", {
            name: "Keep input modifiers in prepared donor",
            exact: true,
        });
        await keepMods.check();
        await expect(chance).not.toBeVisible();
        await calculate.click();
        await expect(chance).toHaveText("30.6931%");

        await page.getByRole("checkbox", { name: "Matching only", exact: true }).check();
        const outcomes = page.getByRole("table");
        await expect(outcomes.getByRole("row")).toHaveCount(suffixCount + 2);
        for (const row of await outcomes.getByRole("row").all()) {
            if (!(await row.getByRole("cell").count())) continue;
            await expect(row).toContainText("Flaring");
            await expect(row).toContainText("Merciless");
            await expect(row).toContainText("Dictator's");
        }
        await expect(outcomes).not.toContainText("Lightning Damage to Spells");
        await expect(
            page.getByRole("button", { name: "Custom modifiers (0)", exact: true }),
        ).toHaveCount(2);

        await keepMods.uncheck();
        await expect(chance).not.toBeVisible();
        await calculate.click();
        await expect(chance).toHaveText("0%");
        await expect(
            page.getByText("No outcomes match these target modifiers.", { exact: true }),
        ).toBeVisible();
    });
}

for (const prefix of ["Merciless", "Dictator's"]) {
    test(`Flaring plus ${prefix} supports exclusive crafted suffixes on both axes`, async ({
        page,
    }) => {
        await prepareAxes(page);
        await choose(page, "Item 1 add prefix (0/3)", "Flaring", /\(Flaring, ilvl 77\)$/);
        await choose(
            page,
            "Item 2 add prefix (0/3)",
            prefix,
            new RegExp(`\\(${prefix}, ilvl 83\\)$`),
        );
        for (const side of ["A", "B"]) {
            const label = `Step 1 input ${side} preparation`;
            await page.getByRole("combobox", { name: label, exact: true }).click();
            await page
                .getByRole("option", { name: "Add an exclusive bench craft", exact: true })
                .click();
            await choose(
                page,
                `${label} recipe`,
                side === "A"
                    ? "chance to deal Double Damage rank 1"
                    : "Double Damage while Focused rank 1",
                side === "A"
                    ? "Crafting bench rank 1 · Suffix: (6-7)% chance to deal Double Damage"
                    : "Crafting bench rank 1 · Suffix: (16-20)% chance to deal Double Damage while Focused",
            );
        }
        await expect(
            page.getByRole("checkbox", {
                name: "Remove crafted mods after this recombination",
                exact: true,
            }),
        ).toBeChecked();
        await page.getByRole("button", { name: "Calculate plan", exact: true }).click();
        for (const name of [/\(Flaring,/, new RegExp(`\\(${prefix},`)])
            await page.getByRole("checkbox", { name }).check();
        await expect(page.getByTestId("target-chance")).toHaveText("33%");
        await expect(page.getByRole("alert")).not.toBeVisible();
        await expect(page.getByRole("table")).not.toContainText("Double Damage");
    });
}

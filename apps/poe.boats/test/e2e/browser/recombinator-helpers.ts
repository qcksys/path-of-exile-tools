import type { Page } from "@playwright/test";

export async function choose(page: Page, label: string, query: string, option: string | RegExp) {
    const input = page.getByRole("combobox", { name: label, exact: true });
    await input.fill(query);
    await input.press("ArrowDown");
    await page.getByRole("option", { name: option, exact: true }).click();
}

export async function select(page: Page, label: string, option: string) {
    await page.getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
}

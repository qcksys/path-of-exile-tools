import { expect, type Page } from "@playwright/test";

export async function choose(page: Page, label: string, query: string, option: string | RegExp) {
    const input = page.getByRole("combobox", { name: label, exact: true });
    await input.fill(query);
    await input.press("ArrowDown");
    await page.getByRole("listbox").getByRole("option", { name: option, exact: true }).click();
    // An open Base UI picker hides other fields from assistive technology.
    await expect(page.getByRole("listbox")).toHaveCount(0);
}

export async function select(page: Page, label: string, option: string) {
    const input = page.getByRole("combobox", { name: label, exact: true });
    await input.click();
    await page.getByRole("listbox").getByRole("option", { name: option, exact: true }).click();
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("listbox")).toHaveCount(0);
}

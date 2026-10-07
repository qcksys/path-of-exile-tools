import { expect, type Locator } from "@playwright/test";

export async function selectValue(
    control: Locator,
    value: string | { label: string } | { index: number },
) {
    await control.click();
    const listbox = control.page().getByRole("listbox");
    const option =
        typeof value === "string"
            ? listbox.locator(`[role="option"][data-value=${JSON.stringify(value)}]`)
            : "index" in value
              ? listbox.getByRole("option").nth(value.index)
              : listbox.getByRole("option", { name: value.label, exact: true });
    await option.click();
    await expect(control).toHaveAttribute("aria-expanded", "false");
    await expect(listbox).toHaveCount(0);
}

import { expect, type Locator } from "@playwright/test";

// A click that sees the card still animating retries with forced page scrolls, which move the
// trigger out from under the pointer and close a hover-opened card.
export async function hoverOpen(trigger: Locator) {
    await trigger.hover();
    const popup = trigger.page().locator('[data-slot="popover-content"]');
    await expect(popup).toBeVisible();
    await popup.evaluate((element) =>
        Promise.all(element.getAnimations().map((animation) => animation.finished)),
    );
}

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

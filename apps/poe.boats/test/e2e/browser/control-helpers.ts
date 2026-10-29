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
    // A click on an option while its popup still zooms in can miss it and leave the popup open.
    await option.evaluate((element) => {
        const popup = element.closest('[data-slot$="-content"]') ?? element;
        return Promise.all(popup.getAnimations().map((animation) => animation.finished));
    });
    await option.click();
    await expect(control).toHaveAttribute("aria-expanded", "false");
    await expect(listbox).toHaveCount(0);
}

import { fireEvent, within } from "@testing-library/react";
import { expect } from "vite-plus/test";
import { z } from "zod";

export function changeControl(...[element, event]: Parameters<typeof fireEvent.change>) {
    if (
        element instanceof HTMLElement &&
        element.tagName === "BUTTON" &&
        element.getAttribute("role") === "combobox"
    ) {
        const value = String(
            z
                .object({ target: z.object({ value: z.union([z.string(), z.number()]) }) })
                .parse(event).target.value,
        );
        fireEvent.click(element);
        const option = [
            ...selectMenu(element).querySelectorAll<HTMLElement>('[role="option"][data-value]'),
        ].find((option) => option.dataset.value === value);
        if (!option) throw new Error(`Select option is unavailable: ${value}`);
        fireEvent.mouseMove(option);
        fireEvent.click(option);
        return;
    }
    return fireEvent.change(element, event);
}

function selectMenu(element: HTMLElement) {
    const menu = document.getElementById(element.getAttribute("aria-controls") ?? "");
    if (!menu) throw new Error("Select menu is not open");
    return menu;
}

export function expectControlValue(element: HTMLElement, value: unknown) {
    if (element.tagName !== "BUTTON" || element.getAttribute("role") !== "combobox") {
        expect(element).toHaveProperty("value", value);
        return;
    }
    fireEvent.click(element);
    const menu = selectMenu(element);
    const selected = within(menu).getByRole("option", { selected: true });
    expect(selected.getAttribute("data-value")).toEqual(value);
    fireEvent.keyDown(menu, { key: "Escape" });
}

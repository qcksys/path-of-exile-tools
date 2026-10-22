// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { MethodPicker } from "../app/components/crafting/method-picker";
import type { CraftingMethod } from "../app/schemas/crafting";
import { changeControl, expectControlValue } from "./control-helpers";
import { baseId, catalog, engine } from "./crafting-fixtures";

const old = "Metadata/Items/Delve/DelveSocketableCurrencyReroll1";
const current = "Metadata/Items/Delve/DelveStackableSocketableCurrencyReroll1";
const alchemical = "Metadata/Items/Delve/DelveStackableSocketableCurrencyUpgrade1";
const fossil = catalog.crafting.fossils.find((entry) => entry.name === "Jagged Fossil")!;

beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

function mount(resonator: string) {
    const onChange = vi.fn();
    function Harness() {
        const [value, setValue] = useState<CraftingMethod>({
            kind: "fossils",
            ids: [fossil.id],
            resonator,
            logic: "additive",
        });
        return (
            <MethodPicker
                engine={engine}
                item={{ ...engine.createItem(baseId), rarity: "rare" }}
                value={value}
                onChange={(next) => {
                    setValue(next);
                    onChange(next);
                }}
            />
        );
    }
    render(<Harness />);
    return onChange;
}

function menu() {
    const picker = screen.getByRole("combobox", { name: "Resonator" });
    fireEvent.click(picker);
    return within(document.getElementById(picker.getAttribute("aria-controls")!)!);
}

it("offers only stackable IDs for new selections and labels alchemical availability", () => {
    const onChange = mount(current);
    const options = menu();
    expect(
        options.getAllByRole("option").map((option) => option.getAttribute("data-value")),
    ).toEqual(expect.arrayContaining([current, alchemical]));
    expect(options.queryByRole("option", { name: /Legacy, non-stackable/ })).toBeNull();
    const choice = options.getByRole("option", {
        name: /Primitive Alchemical Resonator · Ruthless \/ legacy/,
    });
    fireEvent.mouseMove(choice);
    fireEvent.click(choice);
    expect(onChange.mock.lastCall?.[0].resonator).toBe(alchemical);
});

it("keeps a historical selection's exact ID until explicitly changed", () => {
    const onChange = mount(old);
    expectControlValue(screen.getByRole("combobox", { name: "Resonator" }), old);
    const options = menu();
    expect(options.getByRole("option", { selected: true }).textContent).toContain(
        "Legacy, non-stackable",
    );
    expect(
        options
            .getAllByRole("option")
            .filter((option) => option.textContent?.includes("Legacy, non-stackable")),
    ).toHaveLength(1);
    fireEvent.keyDown(options.getByRole("option", { selected: true }), { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
    changeControl(screen.getByRole("combobox", { name: "Resonator" }), {
        target: { value: current },
    });
    expect(onChange.mock.lastCall?.[0].resonator).toBe(current);
    expect(menu().queryByRole("option", { name: /Legacy, non-stackable/ })).toBeNull();
});

it("chooses a stackable resonator when a historical craft needs more sockets", () => {
    const onChange = mount(old);
    fireEvent.click(screen.getByRole("checkbox", { name: "Pristine Fossil" }));
    expect(onChange.mock.lastCall?.[0]).toMatchObject({
        resonator: "Metadata/Items/Delve/DelveStackableSocketableCurrencyReroll2",
        ids: expect.arrayContaining([fossil.id]),
    });
});

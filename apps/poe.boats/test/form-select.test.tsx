// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vite-plus/test";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Label } from "~/components/ui/label";
import { changeControl, expectControlValue } from "./control-helpers";

afterEach(cleanup);

it("submits selected values through a form and labels empty and numeric values", () => {
    const view = render(
        <form>
            <Label>
                Period
                <FormSelect name="period" defaultValue={7}>
                    <FormSelectItem value="">Any period</FormSelectItem>
                    <FormSelectItem value={7}>Last seven days</FormSelectItem>
                    <FormSelectItem value={30}>Last thirty days</FormSelectItem>
                </FormSelect>
            </Label>
        </form>,
    );
    const control = screen.getByRole("combobox", { name: "Period" });
    expect(control.textContent).toContain("Last seven days");
    expect(new FormData(view.container.querySelector("form")!).get("period")).toBe("7");
    changeControl(control, { target: { value: 30 } });
    expect(control.textContent).toContain("Last thirty days");
    expect(new FormData(view.container.querySelector("form")!).get("period")).toBe("30");
    changeControl(control, { target: { value: "" } });
    expect(control.textContent).toContain("Any period");
});

it("updates controlled selections without confusing adjacent menus and honors disabled options", () => {
    function Controls() {
        const [first, setFirst] = useState("a");
        const [second, setSecond] = useState("b");
        return (
            <>
                <FormSelect aria-label="First" value={first} onValueChange={setFirst}>
                    <FormSelectItem value="a">Alpha</FormSelectItem>
                    <FormSelectItem value="b">Beta</FormSelectItem>
                </FormSelect>
                <FormSelect aria-label="Second" value={second} onValueChange={setSecond}>
                    <FormSelectItem value="a">Alpha</FormSelectItem>
                    <FormSelectItem value="b">Beta</FormSelectItem>
                    <FormSelectItem value="c" disabled>
                        Gamma
                    </FormSelectItem>
                </FormSelect>
            </>
        );
    }
    render(<Controls />);
    changeControl(screen.getByRole("combobox", { name: "First" }), { target: { value: "b" } });
    changeControl(screen.getByRole("combobox", { name: "Second" }), { target: { value: "a" } });
    expectControlValue(screen.getByRole("combobox", { name: "First" }), "b");
    const second = screen.getByRole("combobox", { name: "Second" });
    expect(second.textContent).toContain("Alpha");
    fireEvent.click(second);
    const menu = document.getElementById(second.getAttribute("aria-controls")!)!;
    expect(within(menu).getByRole("option", { name: "Gamma" }).getAttribute("aria-disabled")).toBe(
        "true",
    );
});

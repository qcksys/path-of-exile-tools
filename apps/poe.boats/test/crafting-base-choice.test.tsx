// @vitest-environment jsdom

import { itemQuerySchema } from "@poe-tools/item-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { GraphQueryEditor } from "../app/components/crafting/graph-query-editor";
import { CraftingWorkbench } from "../app/components/crafting/workbench";
import { exportCraftingItemText } from "../app/lib/crafting-item-text";
import { changeControl } from "./control-helpers";
import { catalog, engine } from "./crafting-fixtures";
import { graphFixture } from "./crafting-graph-fixtures";

afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
});

it("imports the first item without choosing a placeholder base or recording a fictitious history item", () => {
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    render(
        <MemoryRouter>
            <CraftingWorkbench catalog={catalog} mode="emulate" />
        </MemoryRouter>,
    );
    expect(screen.queryByRole("region", { name: "Current item" })).toBeNull();
    fireEvent.click(screen.getByText("Import or export item text"));
    expect(
        screen.getByRole("button", { name: "Export current item text" }).hasAttribute("disabled"),
    ).toBe(true);
    const baseId = Object.keys(catalog.bases).find(
        (id) => catalog.bases[id]!.name === "Coral Ring",
    )!;
    const item = engine.createItem(baseId, 86);
    fireEvent.change(screen.getByLabelText("Item text"), {
        target: { value: exportCraftingItemText(engine, item) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
    fireEvent.click(screen.getByRole("button", { name: "Import selected item" }));
    expect(screen.getByRole("combobox", { name: "Item base" })).toHaveProperty(
        "value",
        "Coral Ring · Ring",
    );
    expect(screen.getByRole("button", { name: "Undo" }).hasAttribute("disabled")).toBe(true);
    const draft = JSON.parse(
        localStorage.getItem(`poe-boats:crafting:poe1:${catalog.patch}:draft:v1`)!,
    );
    expect(draft.item).toEqual(item);
});

it("waits for an explicit base before changing an outcome condition", () => {
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    const onChange = vi.fn();
    const query = itemQuerySchema.parse({
        game: "poe1",
        groups: [{ type: "and", filters: [{ kind: "mod", count: { min: 1 } }] }],
    });
    render(
        <GraphQueryEditor
            value={query}
            onChange={onChange}
            catalog={catalog}
            label="Target"
            ruleset={graphFixture().ruleset}
        />,
    );
    changeControl(screen.getByRole("combobox", { name: "Condition type" }), {
        target: { value: "base" },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel required base" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Choose required base" })).toBeNull();
    changeControl(screen.getByRole("combobox", { name: "Condition type" }), {
        target: { value: "base" },
    });
    const panel = within(screen.getByRole("region", { name: "Choose required base" }));
    const picker = panel.getByRole("combobox", { name: "Required base" });
    expect(picker).toHaveProperty("value", "");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(picker, { target: { value: "Coral Ring" } });
    fireEvent.keyDown(picker, { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "Coral Ring · Ring" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const chosen = itemQuerySchema.parse(onChange.mock.calls[0]![0]);
    expect(chosen.groups[0]!.filters[0]).toEqual({
        kind: "base",
        field: "baseId",
        values: [Object.keys(catalog.bases).find((id) => catalog.bases[id]!.name === "Coral Ring")],
    });
});

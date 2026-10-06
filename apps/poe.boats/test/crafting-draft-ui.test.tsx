// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { CraftingWorkbench } from "../app/components/crafting/workbench";
import {
    type CraftingCatalog,
    type CraftingProject,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";
import { catalog } from "./crafting-fixtures";
import { retainedRevealFixture } from "./crafting-retained-reveal-fixtures";

const poe2 = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const key = (data = catalog) => `poe-boats:crafting:${data.game}:${data.patch}:draft:v1`;
const savedKey = (data = catalog) => `poe-boats:crafting:${data.game}:${data.patch}`;
const draft = (data = catalog): CraftingProject => JSON.parse(localStorage.getItem(key(data))!);
const button = (name: string) => screen.getByText(name, { selector: "button" });
const item = () => screen.getByRole("region", { name: "Current item" });
function mount(data: CraftingCatalog = catalog) {
    const view = render(
        <StrictMode>
            <MemoryRouter>
                <CraftingWorkbench catalog={data} mode="emulate" />
            </MemoryRouter>
        </StrictMode>,
    );
    fireEvent.change(screen.getByLabelText("Search modifiers"), { target: { value: "Prime" } });
    return view;
}
function saveControls() {
    fireEvent.click(screen.getByText("Save, load, and export"));
}

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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe.each([catalog, poe2])("$game automatic crafting drafts", (data) => {
    it("recovers populated and empty inventory tabs while keeping named projects independent", () => {
        const view = mount(data);
        fireEvent.click(screen.getByText("Item inventory (0)"));
        fireEvent.click(screen.getByText("Manage inventory tabs"));
        fireEvent.change(screen.getByLabelText("Tab name"), { target: { value: "Keep" } });
        fireEvent.click(button("Add tab"));
        fireEvent.change(screen.getByLabelText("Inventory item name"), {
            target: { value: "Attempt" },
        });
        fireEvent.click(button("Store current item"));
        fireEvent.change(screen.getByLabelText("Tab name"), { target: { value: "Empty" } });
        fireEvent.click(button("Add tab"));
        saveControls();
        fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Organized" } });
        fireEvent.click(button("Save project"));
        const expected = draft(data);
        expect(expected.inventoryTabs).toEqual(["Keep", "Empty"]);
        expect(expected.inventory[0]).toMatchObject({ name: "Attempt", tab: "Keep" });
        view.unmount();
        mount(data);
        expect(draft(data)).toEqual(expected);
        fireEvent.click(screen.getByText("Item inventory (1)"));
        fireEvent.change(screen.getByLabelText("Inventory tab"), { target: { value: "Keep" } });
        expect(screen.getByRole("button", { name: "Load Attempt" })).toBeDefined();
        fireEvent.click(screen.getByText("Manage inventory tabs"));
        fireEvent.change(screen.getByLabelText("Tab name"), { target: { value: "Renamed" } });
        fireEvent.click(button("Rename tab"));
        expect(draft(data).inventory[0]!.tab).toBe("Renamed");
        saveControls();
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "Organized" },
        });
        fireEvent.click(button("Load project"));
        expect(draft(data)).toEqual(expected);
        expect(screen.getByLabelText("Inventory tab")).toHaveProperty("value", "");
        fireEvent.change(screen.getByLabelText("Inventory tab"), { target: { value: "Keep" } });
        expect(screen.getByRole("button", { name: "Load Attempt" })).toBeDefined();
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("restores the current undo position and setup without changing a named project", () => {
        const view = mount(data);
        fireEvent.change(screen.getByLabelText("Random seed"), { target: { value: "123" } });
        fireEvent.click(button("Apply craft"));
        saveControls();
        fireEvent.change(screen.getByLabelText("Project name"), {
            target: { value: "Checkpoint" },
        });
        fireEvent.click(button("Save project"));
        const named = localStorage.getItem(savedKey(data));
        fireEvent.change(screen.getByLabelText("Base quality (%)"), { target: { value: "12" } });
        const retained = item().textContent;
        fireEvent.change(screen.getByLabelText("Base quality (%)"), { target: { value: "16" } });
        fireEvent.click(button("Undo"));
        expect(item().textContent).toBe(retained);
        const expected = draft(data);
        view.unmount();
        mount(data);
        expect(item().textContent).toBe(retained);
        expect(screen.getByLabelText("Random seed")).toHaveProperty("value", "123");
        expect(button("Undo")).toHaveProperty("disabled", true);
        expect(button("Redo")).toHaveProperty("disabled", true);
        expect(screen.queryByText("Emulator spending")).toBeNull();
        expect(screen.getByText("Restored draft · 0 crafts")).toBeDefined();
        expect(draft(data)).toEqual(expected);
        expect(localStorage.getItem(savedKey(data))).toBe(named);
        saveControls();
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "Checkpoint" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.getByLabelText("Base quality (%)")).toHaveProperty("value", "0");
    });

    it("restores retained reveal offers after a conflicting manual addition", () => {
        const { offered, currency, choice, blocker } = retainedRevealFixture(data.game);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: data.game,
            patch: data.patch,
            item: offered,
            method: currency("add_mod_to_rare"),
            target: { groups: [], rarity: "rare" },
            steps: [{ id: "inspect", condition: { groups: [], rarity: "rare" } }],
            prices: { [currency("add_mod_to_rare").id]: 2 },
            baseCost: 5,
            inventory: [{ id: "waiting", name: "Pending reveal", item: offered }],
            seed: 42,
            iterations: 100,
            maxActions: 10,
        });
        localStorage.setItem(key(data), JSON.stringify(project));
        const view = mount(data);
        fireEvent.change(screen.getByLabelText("Search modifiers"), { target: { value: blocker } });
        fireEvent.click(button("Add to item"));
        const expected = draft(data);
        view.unmount();
        mount(data);
        const selected = within(screen.getByRole("region", { name: "Reveal modifier" })).getByRole(
            "button",
            { name: new RegExp(`^${offered.reveal!.choices.indexOf(choice) + 1}\\.`) },
        );
        expect(selected).toHaveProperty("disabled", true);
        expect(draft(data)).toEqual(expected);
        expect(draft(data).item.reveal).toEqual(offered.reveal);
        fireEvent.click(within(item()).getByRole("button", { name: "Remove" }));
        expect(selected).toHaveProperty("disabled", false);
        fireEvent.click(selected);
        expect(screen.queryByRole("region", { name: "Reveal modifier" })).toBeNull();
        expect(draft(data).item.mods.map((mod) => mod.id)).toEqual([choice]);
    });
});

describe("automatic draft storage boundaries", () => {
    it("keeps games and builds separate", () => {
        const first = mount();
        fireEvent.change(screen.getByLabelText("Item level"), { target: { value: "44" } });
        const stored = localStorage.getItem(key());
        first.unmount();
        const second = mount(poe2);
        expect(screen.getByLabelText("Item level")).toHaveProperty("value", "86");
        fireEvent.change(screen.getByLabelText("Item level"), { target: { value: "50" } });
        second.unmount();
        const otherBuild = { ...catalog, patch: "another-build" };
        const third = mount(otherBuild);
        expect(screen.getByLabelText("Item level")).toHaveProperty("value", "86");
        third.unmount();
        mount();
        expect(screen.getByLabelText("Item level")).toHaveProperty("value", "44");
        expect(localStorage.getItem(key())).toBe(stored);
        expect(draft(poe2).item.level).toBe(50);
    });

    it("persists opting out, removes the automatic draft and can resume saving", () => {
        const view = mount();
        fireEvent.click(button("Apply craft"));
        saveControls();
        fireEvent.click(button("Save project"));
        const named = localStorage.getItem(savedKey());
        fireEvent.click(screen.getByRole("checkbox", { name: "Automatically save this draft" }));
        expect(localStorage.getItem(key())).toBe("false");
        fireEvent.change(screen.getByLabelText("Item level"), { target: { value: "90" } });
        expect(localStorage.getItem(key())).toBe("false");
        view.unmount();
        mount();
        expect(screen.getByLabelText("Rarity")).toHaveProperty("value", "normal");
        expect(screen.getByLabelText("Item level")).toHaveProperty("value", "86");
        saveControls();
        const toggle = screen.getByRole("checkbox", { name: "Automatically save this draft" });
        expect(toggle).toHaveProperty("checked", false);
        fireEvent.click(toggle);
        fireEvent.change(screen.getByLabelText("Item level"), { target: { value: "88" } });
        expect(draft().item.level).toBe(88);
        expect(localStorage.getItem(savedKey())).toBe(named);
    });

    it.each([
        "malformed",
        "wrong game",
        "wrong build",
        "unknown base",
    ])("preserves a %s draft until the user chooses to replace it", (failure) => {
        const view = mount();
        const invalid = draft();
        view.unmount();
        if (failure === "wrong game") invalid.game = "poe2";
        if (failure === "wrong build") invalid.patch = "another-build";
        if (failure === "unknown base") invalid.item.baseId = "missing";
        const raw = failure === "malformed" ? "not json" : JSON.stringify(invalid);
        localStorage.setItem(key(), raw);
        mount();
        expect(screen.getByRole("alert").textContent).toContain("could not be restored");
        expect(localStorage.getItem(key())).toBe(raw);
        fireEvent.change(screen.getByLabelText("Item level"), { target: { value: "50" } });
        expect(localStorage.getItem(key())).toBe(raw);
        saveControls();
        fireEvent.click(screen.getByRole("checkbox", { name: "Automatically save this draft" }));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(draft().item.level).toBe(50);
    });

    it("keeps crafting usable when browser storage cannot be read", () => {
        const read = Storage.prototype.getItem;
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, name) {
            if (name === key()) throw new Error("Storage unavailable");
            return read.call(this, name);
        });
        mount();
        expect(screen.getByRole("alert").textContent).toContain("could not be restored");
        fireEvent.click(button("Apply craft"));
        expect(screen.getByLabelText("Rarity")).toHaveProperty("value", "rare");
    });

    it("retains the previous draft and reports write failures without losing current edits", () => {
        mount();
        const previous = localStorage.getItem(key());
        const write = Storage.prototype.setItem;
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
            this: Storage,
            name,
            value,
        ) {
            if (name === key()) throw new Error("Quota exceeded");
            return write.call(this, name, value);
        });
        fireEvent.click(button("Apply craft"));
        expect(screen.getByLabelText("Rarity")).toHaveProperty("value", "rare");
        expect(screen.getByRole("alert").textContent).toContain("could not be saved");
        expect(localStorage.getItem(key())).toBe(previous);
        vi.restoreAllMocks();
        fireEvent.change(screen.getByLabelText("Item level"), { target: { value: "90" } });
        expect(screen.queryByRole("alert")).toBeNull();
        expect(draft().item.rarity).toBe("rare");
        expect(draft().item.level).toBe(90);
    });
});

// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { InventoryPanel } from "~/components/crafting/inventory-panel";
import { CraftingEngine } from "~/lib/crafting-engine";
import { validateProject } from "~/lib/crafting-simulation";
import {
    type CraftingProject,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "~/schemas/crafting";
import { catalog } from "./crafting-fixtures";

const catalogs = [
    catalog,
    craftingCatalogSchema.parse(
        JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
    ),
];
afterEach(cleanup);

describe.each(catalogs)("$game inventory tabs", (data) => {
    const engine = new CraftingEngine(data);
    const base = Object.keys(data.bases).find(
        (id) => data.bases[id]!.item_class === "Body Armour",
    )!;
    const item = engine.createItem(base);
    const entry = { id: "original", name: "Original", item };
    function mount(
        initialEntries: CraftingProject["inventory"] = [entry],
        initialTabs: string[] = [],
    ) {
        const changed = vi.fn();
        const loaded = vi.fn();
        function Inventory() {
            const [entries, setEntries] = useState(initialEntries);
            const [tabs, setTabs] = useState(initialTabs);
            return (
                <InventoryPanel
                    engine={engine}
                    item={item}
                    entries={entries}
                    tabs={tabs}
                    onLoad={loaded}
                    onChange={(nextEntries, nextTabs) => {
                        changed(nextEntries, nextTabs);
                        setEntries(nextEntries);
                        setTabs(nextTabs);
                    }}
                />
            );
        }
        render(<Inventory />);
        fireEvent.click(screen.getByText(`Item inventory (${initialEntries.length})`));
        return { changed, loaded };
    }
    const button = (name: string) => screen.getByRole("button", { name });
    function nameTab(name: string) {
        fireEvent.change(screen.getByLabelText("Tab name"), { target: { value: name } });
    }
    function selectTab(name: string) {
        fireEvent.change(screen.getByLabelText("Inventory tab"), { target: { value: name } });
    }

    it("creates, renames and removes tabs without losing snapshots or changing their rolls", () => {
        const { changed, loaded } = mount();
        expect(button("Load Original")).toBeDefined();
        fireEvent.click(screen.getByText("Manage inventory tabs"));
        nameTab("  Keep  ");
        fireEvent.click(button("Add tab"));
        expect(screen.getByLabelText("Inventory tab")).toHaveProperty("value", "Keep");
        expect(screen.queryByRole("button", { name: "Load Original" })).toBeNull();
        fireEvent.change(screen.getByLabelText("Inventory item name"), {
            target: { value: "Attempt" },
        });
        fireEvent.click(button("Store current item"));
        const stored = changed.mock.lastCall![0][1];
        expect(stored).toMatchObject({ name: "Attempt", tab: "Keep", item });
        expect(stored.item).not.toBe(item);
        nameTab("Finished");
        fireEvent.click(button("Rename tab"));
        expect(changed.mock.lastCall![1]).toEqual(["Finished"]);
        expect(changed.mock.lastCall![0][1]).toMatchObject({
            id: stored.id,
            tab: "Finished",
            item,
        });
        expect(stored.tab).toBe("Keep");
        fireEvent.click(button("Remove tab"));
        expect(changed.mock.lastCall![1]).toEqual([]);
        expect(screen.getByLabelText("Inventory tab")).toHaveProperty("value", "");
        expect(button("Load Original")).toBeDefined();
        fireEvent.click(button("Load Attempt"));
        expect(loaded.mock.lastCall).toEqual([item, "Attempt"]);
        expect(loaded.mock.lastCall![0]).not.toBe(stored.item);
        expect(changed.mock.lastCall![0][1].tab).toBeUndefined();
    });

    it("moves snapshots between tabs and deletes only the selected snapshot", () => {
        const other = { id: "other", name: "Other", item, tab: "Keep" };
        const { changed } = mount([entry, other], ["Keep", "Donors"]);
        fireEvent.change(screen.getByLabelText("Move Original to tab"), {
            target: { value: "Keep" },
        });
        expect(screen.queryByRole("button", { name: "Load Original" })).toBeNull();
        selectTab("Keep");
        expect(button("Load Original")).toBeDefined();
        expect(button("Load Other")).toBeDefined();
        fireEvent.change(screen.getByLabelText("Move Original to tab"), {
            target: { value: "Donors" },
        });
        selectTab("Donors");
        expect(screen.queryByRole("button", { name: "Load Other" })).toBeNull();
        fireEvent.click(button("Delete Original"));
        expect(changed.mock.lastCall![0]).toEqual([other]);
        expect(changed.mock.lastCall![1]).toEqual(["Keep", "Donors"]);
        expect(entry).not.toHaveProperty("tab");
    });

    it("rejects duplicate, blank and reserved names and enforces the tab limit", () => {
        const tabs = Array.from({ length: 20 }, (_, index) => `Tab ${index + 1}`);
        mount([entry], tabs);
        fireEvent.click(screen.getByText("Manage inventory tabs"));
        nameTab("New tab");
        expect(button("Add tab")).toHaveProperty("disabled", true);
        selectTab("Tab 1");
        for (const name of ["", "  ", "Tab 2", " Tab 2 ", "Unfiled"]) {
            nameTab(name);
            expect(button("Rename tab")).toHaveProperty("disabled", true);
        }
        nameTab("Renamed");
        expect(button("Rename tab")).toHaveProperty("disabled", false);
        selectTab("");
        expect(button("Remove tab")).toHaveProperty("disabled", true);
        expect(button("Rename tab")).toHaveProperty("disabled", true);
    });

    function project() {
        return craftingProjectSchema.parse({
            format: 1,
            game: data.game,
            patch: data.patch,
            item,
            inventory: [entry],
            target: { groups: [] },
            method: {
                kind: "currency",
                id: data.crafting.currencies.find((value) => value.action === "transmute_to_magic")!
                    .id,
            },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 10,
        });
    }
    it("accepts legacy projects and retains populated and empty tabs through JSON", () => {
        const legacy = project();
        expect(validateProject(data, legacy).inventory).toEqual([entry]);
        const grouped = {
            ...legacy,
            inventoryTabs: ["Keep", "Empty"],
            inventory: [{ ...entry, tab: "Keep" }],
        };
        expect(validateProject(data, JSON.parse(JSON.stringify(grouped)))).toEqual(grouped);
    });

    it("rejects malformed or missing tabs without relaxing extracted-item validation", () => {
        const initial = project();
        for (const inventoryTabs of [
            ["Keep", "Keep"],
            [""],
            ["Unfiled"],
            ["x".repeat(61)],
            Array.from({ length: 21 }, (_, index) => String(index)),
        ])
            expect(() => validateProject(data, { ...initial, inventoryTabs })).toThrow();
        expect(() =>
            validateProject(data, { ...initial, inventory: [{ ...entry, tab: "Missing" }] }),
        ).toThrow("Unknown inventory tab");
        expect(() =>
            validateProject(data, {
                ...initial,
                inventoryTabs: ["Keep"],
                inventory: [{ ...entry, tab: "Keep", item: { ...item, baseId: "unknown" } }],
            }),
        ).toThrow();
    });
});

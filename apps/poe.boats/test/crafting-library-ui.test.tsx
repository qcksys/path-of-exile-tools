// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { InventoryStorage } from "~/components/crafting/inventory-storage";
import { useItemLibrary } from "~/components/crafting/use-item-library";
import { CraftingWorkbench } from "~/components/crafting/workbench";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import { validateProject } from "~/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "~/schemas/crafting";
import { changeControl, expectControlValue } from "./control-helpers";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";
import { chooseStartingItem } from "./starting-item-helper";

const poe2 = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const key = (data = catalog) => `poe-boats:crafting:${data.game}:${data.patch}`;
const libraryKey = (data = catalog) => `${key(data)}:library:v1`;
const button = (name: string) => screen.getByText(name, { selector: "button" });
function shared() {
    changeControl(screen.getByLabelText("Inventory storage"), { target: { value: "library" } });
}
function mountWorkbench(data = catalog, mode = "emulate") {
    const view = render(
        <MemoryRouter>
            <CraftingWorkbench catalog={data} mode={mode} />
        </MemoryRouter>,
    );
    chooseStartingItem(data);
    changeControl(screen.getByLabelText("Search modifiers"), { target: { value: "Prime" } });
    return view;
}
async function choose(label: string, name: string) {
    const picker = screen.getByRole("combobox", { name: label });
    changeControl(picker, { target: { value: name } });
    fireEvent.keyDown(picker, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name }));
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

describe.each([catalog, poe2])("$game library controls", (data) => {
    const current = new CraftingEngine(data);
    const item = {
        ...current.createItem(
            Object.keys(data.bases).find((id) => data.bases[id]!.item_class === "Body Armour")!,
        ),
        quality: 12,
    };
    const project = craftingProjectSchema.parse({
        format: 1,
        game: data.game,
        patch: data.patch,
        item,
        inventory: [{ id: "project", name: "Project snapshot", item }],
        method: {
            kind: "currency",
            id: data.crafting.currencies.find((entry) => entry.action === "transmute_to_rare")!.id,
        },
        target: { groups: [] },
        steps: [],
        prices: {},
        seed: 42,
        iterations: 1,
        maxActions: 1,
    });
    const library = {
        format: 1 as const,
        game: data.game,
        patch: data.patch,
        inventory: [{ id: "shared", name: "Shared snapshot", item, tab: "Keep" }],
        inventoryTabs: ["Keep", "Empty"],
    };
    function mountStorage() {
        const loaded = vi.fn();
        function Harness() {
            const library = useItemLibrary(current);
            const [value, setValue] = useState(project);
            return (
                <InventoryStorage
                    engine={current}
                    project={value}
                    library={library}
                    onLoad={loaded}
                    onChange={(inventory, inventoryTabs) =>
                        setValue({ ...value, inventory, inventoryTabs })
                    }
                />
            );
        }
        render(<Harness />);
        shared();
        return { loaded };
    }
    async function upload(input: unknown, size = 100) {
        await act(async () =>
            changeControl(screen.getByLabelText("Import crafting library"), {
                target: {
                    files: [
                        {
                            size,
                            text: async () =>
                                typeof input === "string" ? input : JSON.stringify(input),
                        },
                    ],
                },
            }),
        );
    }

    it("previews imports, supports cancellation and replaces only the shared library", async () => {
        const { loaded } = mountStorage();
        await upload(library);
        expect(
            screen.getByRole("region", { name: "Replace shared library" }).textContent,
        ).toContain("1 items and 2 tabs");
        expect(localStorage.getItem(libraryKey(data))).toBeNull();
        fireEvent.click(button("Cancel import"));
        expect(screen.queryByRole("region", { name: "Replace shared library" })).toBeNull();
        await upload(library);
        fireEvent.click(button("Replace library"));
        expect(JSON.parse(localStorage.getItem(libraryKey(data))!)).toEqual(library);
        fireEvent.click(screen.getByText("Item inventory (1)"));
        changeControl(screen.getByLabelText("Inventory tab"), { target: { value: "Keep" } });
        fireEvent.click(screen.getByRole("button", { name: "Load Shared snapshot" }));
        expect(loaded.mock.lastCall).toEqual([item, "Shared snapshot"]);
        changeControl(screen.getByLabelText("Inventory storage"), {
            target: { value: "project" },
        });
        fireEvent.click(screen.getByText("Item inventory (1)"));
        expect(screen.getByRole("button", { name: "Load Project snapshot" })).toBeDefined();
    });

    it("retains current storage when imports are malformed, too large or from another build", async () => {
        localStorage.setItem(libraryKey(data), JSON.stringify(library));
        mountStorage();
        for (const input of [
            "{bad",
            { ...library, patch: "other" },
            { ...library, inventoryTabs: [] },
        ]) {
            await upload(input);
            expect(screen.getByRole("alert").textContent).toContain("Cannot import library");
            expect(screen.queryByRole("region", { name: "Replace shared library" })).toBeNull();
            expect(localStorage.getItem(libraryKey(data))).toBe(JSON.stringify(library));
        }
        await upload(library, 3 * 1024 * 1024);
        expect(screen.getByRole("alert").textContent).toContain("at most 2 MB");
    });

    it("keeps entered item and tab names when a storage write fails", () => {
        mountStorage();
        fireEvent.click(screen.getByText("Item inventory (0)"));
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("Full");
        });
        changeControl(screen.getByLabelText("Inventory item name"), {
            target: { value: "Retry me" },
        });
        fireEvent.click(button("Store current item"));
        expectControlValue(screen.getByLabelText("Inventory item name"), "Retry me");
        fireEvent.click(screen.getByText("Manage inventory tabs"));
        changeControl(screen.getByLabelText("Tab name"), { target: { value: "Keep" } });
        fireEvent.click(button("Add tab"));
        expectControlValue(screen.getByLabelText("Tab name"), "Keep");
        expectControlValue(screen.getByLabelText("Inventory tab"), "");
        expect(screen.getByText("Item inventory (0)")).toBeDefined();
        expect(localStorage.getItem(libraryKey(data))).toBeNull();
    });

    it("requires confirmation before discarding an unreadable library", () => {
        localStorage.setItem(libraryKey(data), "broken");
        mountStorage();
        fireEvent.click(button("Start empty library"));
        expect(localStorage.getItem(libraryKey(data))).toBe("broken");
        fireEvent.click(button("Replace library"));
        expect(JSON.parse(localStorage.getItem(libraryKey(data))!).inventory).toEqual([]);
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("exports a standalone library including its populated and empty tabs", async () => {
        localStorage.setItem(libraryKey(data), JSON.stringify(library));
        let exported: Blob | undefined;
        vi.stubGlobal(
            "URL",
            class extends URL {
                static createObjectURL(blob: Blob) {
                    exported = blob;
                    return "blob:library";
                }
                static revokeObjectURL() {}
            },
        );
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
        mountStorage();
        fireEvent.click(button("Export library"));
        expect(click.mock.instances[0]).toHaveProperty(
            "download",
            `crafting-library-${data.game}-${data.patch}.json`,
        );
        expect(exported).toHaveProperty("type", "application/json");
        const text = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsText(exported!);
        });
        expect(JSON.parse(text)).toEqual(library);
    });

    it("keeps the library through base changes, named project loads and browser reloads", () => {
        localStorage.setItem(`${key(data)}:draft:v1`, JSON.stringify(project));
        const boots = current.createItem(
            Object.keys(data.bases).find((id) => data.bases[id]!.item_class === "Boots")!,
        );
        localStorage.setItem(
            key(data),
            JSON.stringify({ boots: { ...project, item: boots, inventory: [] } }),
        );
        const view = mountWorkbench(data);
        shared();
        fireEvent.click(screen.getByText("Item inventory (0)"));
        changeControl(screen.getByLabelText("Inventory item name"), {
            target: { value: "Armour" },
        });
        fireEvent.click(button("Store current item"));
        const stored = localStorage.getItem(libraryKey(data));
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "boots" } });
        fireEvent.click(button("Load project"));
        expectControlValue(screen.getByLabelText("Base quality (%)"), "0");
        expect(localStorage.getItem(libraryKey(data))).toBe(stored);
        fireEvent.click(screen.getByRole("button", { name: "Load Armour" }));
        expectControlValue(screen.getByLabelText("Base quality (%)"), "12");
        expect(JSON.parse(localStorage.getItem(`${key(data)}:draft:v1`)!).inventory).toEqual([]);
        view.unmount();
        mountWorkbench(data);
        shared();
        fireEvent.click(screen.getByText("Item inventory (1)"));
        expect(screen.getByRole("button", { name: "Load Armour" })).toBeDefined();
        expect(localStorage.getItem(libraryKey(data))).toBe(stored);
    });
});

it("copies a library donor into the ordinary method and process without depending on later library edits", () => {
    const item = { ...engine.createItem(baseId), influences: [0] };
    const donor = {
        id: "elder",
        name: "Elder donor",
        item: { ...engine.createItem(baseId), influences: [1] },
    };
    const method = currency("transfer_item_influence");
    const project = craftingProjectSchema.parse({
        format: 1,
        game: catalog.game,
        patch: catalog.patch,
        item,
        method,
        target: { groups: [] },
        steps: [{ id: "craft", method, condition: { groups: [] } }],
        prices: {},
        seed: 42,
        iterations: 1,
        maxActions: 1,
    });
    localStorage.setItem(`${key()}:draft:v1`, JSON.stringify(project));
    localStorage.setItem(
        libraryKey(),
        JSON.stringify({
            format: 1,
            game: catalog.game,
            patch: catalog.patch,
            inventory: [donor],
        }),
    );
    mountWorkbench(catalog, "simulate");
    const pickers = screen.getAllByLabelText("Donor item");
    expect(pickers).toHaveLength(2);
    for (const picker of pickers) changeControl(picker, { target: { value: "library:elder" } });
    const saved = JSON.parse(localStorage.getItem(`${key()}:draft:v1`)!);
    expect(saved.inventory).toEqual([]);
    expect(saved.method.donor).toMatchObject({
        id: "library:elder",
        name: "Library · Elder donor",
        item: donor.item,
    });
    expect(saved.steps[0].method.donor).toEqual(saved.method.donor);
    act(() => {
        localStorage.removeItem(libraryKey());
        window.dispatchEvent(new StorageEvent("storage", { key: libraryKey() }));
    });
    expectControlValue(screen.getAllByLabelText("Donor item")[0], "library:elder");
    expect(validateProject(catalog, saved).method).toEqual(saved.method);
    expect(engine.apply(saved.item, saved.method, seededRandom(42)).item.influences).toEqual([
        0, 1,
    ]);
});

it("copies a PoE 2 library Jewel into a self-contained project and sockets it", async () => {
    const current = new CraftingEngine(poe2);
    const conversion = poe2.crafting.augments.find((entry) => entry.name === "Cadigan's Epiphany")!;
    const host = current.apply(
        { ...current.createItem("Metadata/Items/Armours/Gloves/FourGlovesStr1"), sockets: 1 },
        { kind: "augment", id: conversion.id },
        seededRandom(42),
    ).item;
    const jewel = current.createItem(
        Object.entries(poe2.bases).find(([, base]) => base.name === "Ruby")![0],
    );
    const project = craftingProjectSchema.parse({
        format: 1,
        game: poe2.game,
        patch: poe2.patch,
        item: host,
        method: { kind: "socket_jewel", id: "socket_jewel" },
        target: { groups: [] },
        steps: [],
        prices: {},
        seed: 42,
        iterations: 1,
        maxActions: 1,
    });
    localStorage.setItem(`${key(poe2)}:draft:v1`, JSON.stringify(project));
    localStorage.setItem(
        libraryKey(poe2),
        JSON.stringify({
            format: 1,
            game: poe2.game,
            patch: poe2.patch,
            inventory: [{ id: "ruby", name: "Ruby", item: jewel, tab: "Jewels" }],
            inventoryTabs: ["Jewels"],
        }),
    );
    mountWorkbench(poe2);
    await choose("Jewel from inventory", "Library · Ruby");
    fireEvent.click(button("Apply craft"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
        within(screen.getByRole("region", { name: "Socketed Jewel" })).getByText("Ruby"),
    ).toBeDefined();
    const saved = JSON.parse(localStorage.getItem(`${key(poe2)}:draft:v1`)!);
    expect(saved.inventory).toEqual([]);
    expect(saved.method.jewel.item).toEqual(jewel);
    expect(saved.item.socketedJewel).toEqual(jewel);
    expect(validateProject(poe2, saved)).toEqual(saved);
});

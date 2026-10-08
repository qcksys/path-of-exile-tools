// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
    CraftingDisplay,
    DisplaySettings,
    useDisplayPreferences,
} from "~/components/crafting/display-settings";
import { ItemCard } from "~/components/crafting/item-card";
import { CraftingWorkbench } from "~/components/crafting/workbench";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import { modifierTiers } from "~/lib/crafting-modifier-details";
import { craftingCatalogSchema } from "~/schemas/crafting";
import { changeControl, expectControlValue } from "./control-helpers";
import { catalog } from "./crafting-fixtures";
import { chooseStartingItem } from "./starting-item-helper";

const catalogs = [
    catalog,
    craftingCatalogSchema.parse(
        JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
    ),
];
const storageKey = "poe-boats:crafting:display";
const button = (name: string) => screen.getByRole("button", { name });
const individualText = (card: HTMLElement) =>
    card.querySelector('[aria-label="Individual explicit modifiers"]')?.textContent;
async function select(label: string, name: string) {
    const control = screen.getByRole("combobox", { name: label });
    fireEvent.click(control);
    const option = within(
        document.getElementById(control.getAttribute("aria-controls")!)!,
    ).getByRole("option", { name });
    act(() => option.focus());
    fireEvent.keyDown(option, { key: "Enter" });
}
function Settings() {
    const { preferences, setPreferences, storageError, display } = useDisplayPreferences();
    return (
        <>
            <DisplaySettings
                value={preferences}
                onChange={setPreferences}
                storageError={storageError}
            />
            <output aria-label="Current display">{JSON.stringify(display)}</output>
            <input aria-label="Editable text" />
        </>
    );
}
const currentDisplay = () => JSON.parse(screen.getByLabelText("Current display").textContent!);

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

it("restores persisted preferences and exposes labelled, keyboard-operable settings", async () => {
    const view = render(<Settings />);
    expect(screen.queryByRole("region", { name: "Crafting display settings" })).toBeNull();
    fireEvent.click(button("Display settings"));
    expect(button("Display settings").getAttribute("aria-expanded")).toBe("true");
    await select("Item output", "Classic");
    await select("Modifier layout", "Separate affix tabs");
    await select("Tag filter behavior", "Hide mismatches");
    fireEvent.click(screen.getByRole("checkbox", { name: "Show tag filter" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Show weight percentages" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Compact layout" }));
    const preferences = {
        itemOrder: "dropLevel",
        itemOutput: "classic",
        modifierLayout: "tabs",
        filterEffect: "hide",
        showTagFilter: false,
        showWeightPercentages: false,
        compact: true,
    };
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual(preferences);
    view.unmount();
    render(<Settings />);
    expect(currentDisplay()).toEqual({ advanced: false, compact: true });
    fireEvent.click(button("Display settings"));
    expect(screen.getByRole("combobox", { name: "Item output" }).textContent).toContain("Classic");
    expect(screen.getByRole("combobox", { name: "Modifier layout" }).textContent).toContain(
        "Separate affix tabs",
    );
    expect(screen.getByRole("combobox", { name: "Tag filter behavior" }).textContent).toContain(
        "Hide mismatches",
    );
    expect(
        screen.getByRole("checkbox", { name: "Show tag filter" }).getAttribute("aria-checked"),
    ).toBe("false");
    expect(
        screen
            .getByRole("checkbox", { name: "Show weight percentages" })
            .getAttribute("aria-checked"),
    ).toBe("false");
});

it.each([
    "broken",
    "null",
    '{"compact":"yes"}',
    '{"itemOutput":"unknown"}',
    '{"modifierLayout":"unknown"}',
    '{"filterEffect":"unknown"}',
    '{"showTagFilter":"yes"}',
    '{"showWeightPercentages":1}',
])("recovers invalid saved preferences: %s", (saved) => {
    localStorage.setItem(storageKey, saved);
    render(<Settings />);
    expect(currentDisplay()).toEqual({ advanced: true, compact: false });
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({
        itemOrder: "dropLevel",
        itemOutput: "advanced",
        modifierLayout: "columns",
        filterEffect: "cross",
        showTagFilter: true,
        showWeightPercentages: true,
        compact: false,
    });
});

it("adds filter defaults to earlier saved display preferences", () => {
    localStorage.setItem(
        storageKey,
        JSON.stringify({ itemOutput: "classic", modifierLayout: "tabs", compact: true }),
    );
    render(<Settings />);
    fireEvent.click(button("Display settings"));
    expect(screen.getByRole("combobox", { name: "Tag filter behavior" }).textContent).toContain(
        "Cross out mismatches",
    );
    expect(
        screen.getByRole("checkbox", { name: "Show tag filter" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
        screen
            .getByRole("checkbox", { name: "Show weight percentages" })
            .getAttribute("aria-checked"),
    ).toBe("true");
    expect(currentDisplay()).toEqual({ advanced: false, compact: true });
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toMatchObject({
        itemOutput: "classic",
        modifierLayout: "tabs",
        compact: true,
        filterEffect: "cross",
    });
});

it("keeps preferences usable when storage is unavailable and clears the error on a successful save", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("Unavailable");
    });
    const save = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("Unavailable");
    });
    render(<Settings />);
    expect(screen.getByRole("alert").textContent).toContain("could not be saved");
    fireEvent.click(button("Display settings"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Compact layout" }));
    expect(currentDisplay()).toEqual({ advanced: true, compact: true });
    save.mockRestore();
    fireEvent.click(screen.getByRole("checkbox", { name: "Compact layout" }));
    expect(screen.queryByRole("alert")).toBeNull();
});

it.each([
    "advanced",
    "classic",
])("temporarily reverses %s output with Alt without persisting the reversal", (itemOutput) => {
    localStorage.setItem(storageKey, JSON.stringify({ itemOutput }));
    const view = render(<Settings />);
    const save = vi.spyOn(Storage.prototype, "setItem");
    const advanced = itemOutput === "advanced";
    fireEvent.keyDown(window, { key: "Alt", altKey: true });
    expect(currentDisplay().advanced).toBe(!advanced);
    fireEvent.keyDown(window, { key: "Alt", altKey: true, repeat: true });
    expect(currentDisplay().advanced).toBe(!advanced);
    fireEvent.keyUp(window, { key: "Alt" });
    expect(currentDisplay().advanced).toBe(advanced);
    fireEvent.keyDown(window, { key: "Alt", altKey: true });
    fireEvent.blur(window);
    expect(currentDisplay().advanced).toBe(advanced);
    fireEvent.keyDown(window, { key: "Alt", altKey: true });
    fireEvent(document, new Event("visibilitychange"));
    expect(currentDisplay().advanced).toBe(advanced);
    fireEvent.keyDown(screen.getByLabelText("Editable text"), { key: "Alt", altKey: true });
    expect(currentDisplay().advanced).toBe(advanced);
    fireEvent.keyDown(window, { key: "Alt", altKey: true, ctrlKey: true });
    fireEvent.keyDown(window, { key: "Alt", altKey: true, metaKey: true });
    expect(currentDisplay().advanced).toBe(advanced);
    expect(save).not.toHaveBeenCalled();
    const remove = vi.spyOn(window, "removeEventListener");
    view.unmount();
    expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("keyup", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("blur", expect.any(Function));
});

it("renders on the server without reading or writing browser storage", () => {
    const read = vi.spyOn(Storage.prototype, "getItem");
    const save = vi.spyOn(Storage.prototype, "setItem");
    expect(renderToString(<Settings />)).toContain("Display settings");
    expect(read).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
});

describe.each(catalogs)("$game display preferences", (data) => {
    it("combines hybrid stats in classic output and preserves edits, history, Alt and saved rolls", async () => {
        render(
            <MemoryRouter>
                <CraftingWorkbench catalog={data} mode="emulate" />
            </MemoryRouter>,
        );
        chooseStartingItem(data);
        for (const id of [
            "IncreasedLife8",
            data.game === "poe1" ? "LocalBaseArmourAndLife1" : "LocalIncreasedArmourAndLife1",
        ]) {
            changeControl(screen.getByLabelText("Search modifiers"), { target: { value: id } });
            fireEvent.click(button("Add to item"));
        }
        const card = screen.getByRole("region", { name: "Current item" });
        const rolls = () =>
            within(card).getAllByLabelText<HTMLInputElement>("Value for base_maximum_life");
        const original = rolls().map((input) => Number(input.value));
        fireEvent.click(button("Save project"));
        const storage = `poe-boats:crafting:${data.game}:${data.patch}`;
        const saved = localStorage.getItem(storage);
        fireEvent.click(button("Display settings"));
        await select("Item output", "Classic");
        const combined = () => within(card).getByRole("list", { name: "Combined explicit stats" });
        expect(combined().textContent).toContain(`+${original[0]! + original[1]!} to maximum Life`);
        expect(combined().children).toHaveLength(2);
        expect(rolls().map((input) => Number(input.value))).toEqual(original);
        fireEvent.click(button("Save project"));
        expect(localStorage.getItem(storage)).toBe(saved);
        fireEvent.click(within(card).getByText("Individual modifiers and rolls"));
        for (const summary of within(card).getAllByText("Raw stat values and ranges"))
            fireEvent.click(summary);
        const changed = data.mods.IncreasedLife8!.stats[0]!.min;
        changeControl(rolls()[0]!, { target: { value: String(changed) } });
        expect(combined().textContent).toContain(`+${changed + original[1]!} to maximum Life`);
        fireEvent.click(button("Undo"));
        expect(combined().textContent).toContain(`+${original[0]! + original[1]!} to maximum Life`);
        fireEvent.click(button("Redo"));
        expect(combined().textContent).toContain(`+${changed + original[1]!} to maximum Life`);
        fireEvent.keyDown(button("Display settings"), { key: "Alt", altKey: true });
        expect(within(card).queryByRole("list", { name: "Combined explicit stats" })).toBeNull();
        expect(
            within(card).getByRole("list", { name: "Individual explicit modifiers" }).children,
        ).toHaveLength(2);
        fireEvent.keyUp(window, { key: "Alt" });
        expect(combined().textContent).toContain(`+${changed + original[1]!} to maximum Life`);
        fireEvent.click(button("Save project"));
        const project = JSON.parse(localStorage.getItem(storage)!)["My crafting project"];
        expect(project.item.mods[0].values[0]).toBe(changed);
        expect(project.item.mods[1].values[1]).toBe(original[1]);
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(combined().textContent).toContain(`+${changed + original[1]!} to maximum Life`);
    });

    it("keeps essence tiers and extracted tags through item setup, history, saves and view changes", async () => {
        render(
            <MemoryRouter>
                <CraftingWorkbench catalog={data} mode="emulate" />
            </MemoryRouter>,
        );
        chooseStartingItem(data);
        const id = data.game === "poe1" ? "ColdResist1" : "IncreasedLife8";
        const card = screen.getByRole("region", { name: "Current item" });
        changeControl(screen.getByLabelText("Modifier source"), {
            target: { value: "essence" },
        });
        changeControl(screen.getByLabelText("Search modifiers"), { target: { value: id } });
        fireEvent.click(button("Add to item"));
        const metadata = card.querySelector<HTMLElement>("[data-modifier-details]")!;
        const engine = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, base]) => base.item_class === "Body Armour" && base.drop_level === 1,
        )![0];
        const tier = modifierTiers(engine, base, "essence").get(id);
        expect(metadata.textContent).toContain(`Tier ${tier}`);
        expect(metadata.textContent).toContain(" · essence");
        expect(metadata.textContent).toContain(`Tags: ${data.mods[id]!.implicit_tags.join(", ")}`);
        const content = card.textContent;
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(
            localStorage.getItem(`poe-boats:crafting:${data.game}:${data.patch}`)!,
        )["My crafting project"];
        expect(saved.item.mods[0].essence).toBe(true);
        fireEvent.click(button("Undo"));
        expect(card.querySelector("[data-modifier-details]")).toBeNull();
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(content);
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(content);
        const modifiers = individualText(card);
        fireEvent.click(button("Display settings"));
        await select("Item output", "Classic");
        expect(card.querySelector<HTMLElement>("[data-modifier-details]")!.hidden).toBe(true);
        expect(individualText(card)).toBe(modifiers);
        fireEvent.keyDown(button("Display settings"), { key: "Alt", altKey: true });
        expect(card.querySelector<HTMLElement>("[data-modifier-details]")!.hidden).toBe(false);
    });

    it("preserves crafting, history and project data when changing the display", async () => {
        render(
            <MemoryRouter>
                <CraftingWorkbench catalog={data} mode="emulate" />
            </MemoryRouter>,
        );
        chooseStartingItem(data);
        const item = screen.getByRole("region", { name: "Current item" });
        const initial = item.textContent;
        fireEvent.click(button("Apply craft"));
        const crafted = individualText(item);
        const metadata = () => item.querySelector<HTMLElement>("[data-modifier-details]")!;
        expect(metadata().hidden).toBe(false);
        changeControl(screen.getByLabelText("Required rarity"), { target: { value: "rare" } });
        fireEvent.click(button("Save project"));
        const key = `poe-boats:crafting:${data.game}:${data.patch}`;
        const project = localStorage.getItem(key);
        fireEvent.click(button("Display settings"));
        await select("Item output", "Classic");
        fireEvent.click(screen.getByRole("checkbox", { name: "Compact layout" }));
        expect(screen.getByRole("region", { name: "Current item" })).toBe(item);
        expect(item.dataset.itemOutput).toBe("classic");
        expect(metadata().hidden).toBe(true);
        expect(individualText(item)).toBe(crafted);
        expect(item.closest("[data-compact]")?.getAttribute("data-compact")).toBe("true");
        fireEvent.click(within(item).getByText("Individual modifiers and rolls"));
        expect(within(item).getAllByRole("button", { name: "Remove" }).length).toBeGreaterThan(0);
        expect(within(item).getAllByLabelText(/^Value for /).length).toBeGreaterThan(0);
        fireEvent.keyDown(button("Display settings"), { key: "Alt", altKey: true });
        expect(metadata().hidden).toBe(false);
        fireEvent.keyUp(window, { key: "Alt" });
        expect(metadata().hidden).toBe(true);
        fireEvent.click(button("Save project"));
        expect(localStorage.getItem(key)).toBe(project);
        await select("Modifier layout", "Separate affix tabs");
        expect(screen.getByRole("tablist", { name: "Modifier affixes" })).toBeDefined();
        await select("Tag filter behavior", "Hide mismatches");
        fireEvent.click(screen.getByRole("checkbox", { name: "Show tag filter" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Show weight percentages" }));
        expect(screen.queryByLabelText("Modifier tag")).toBeNull();
        expect(individualText(item)).toBe(crafted);
        fireEvent.click(button("Save project"));
        expect(localStorage.getItem(key)).toBe(project);
        fireEvent.click(button("Undo"));
        expect(item.textContent).toBe(initial);
        fireEvent.click(button("Redo"));
        expect(individualText(item)).toBe(crafted);
    });

    it("orders searchable bases by extracted drop level without changing the current item", async () => {
        render(
            <MemoryRouter>
                <CraftingWorkbench catalog={data} />
            </MemoryRouter>,
        );
        chooseStartingItem(data);
        const item = screen.getByRole("region", { name: "Current item" }).textContent;
        fireEvent.click(button("Display settings"));
        const picker = screen.getByRole("combobox", { name: "Item base" });
        const selected = picker.getAttribute("value");
        changeControl(picker, { target: { value: "Body Armour" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        const options = within(await screen.findByRole("listbox")).getAllByRole("option");
        const expected = Object.values(data.bases)
            .filter((base) =>
                `${base.name} ${base.item_class}`.toLowerCase().includes("body armour"),
            )
            .sort(
                (a, b) =>
                    a.item_class.localeCompare(b.item_class) ||
                    a.drop_level - b.drop_level ||
                    (a.requirements?.level ?? 0) - (b.requirements?.level ?? 0) ||
                    (a.requirements?.strength ?? 0) - (b.requirements?.strength ?? 0) ||
                    (a.requirements?.dexterity ?? 0) - (b.requirements?.dexterity ?? 0) ||
                    (a.requirements?.intelligence ?? 0) - (b.requirements?.intelligence ?? 0) ||
                    a.name.localeCompare(b.name),
            );
        expect(options.map((option) => option.getAttribute("aria-label"))).toEqual(
            expected.slice(0, 60).map((base) => `${base.name} · ${base.item_class}`),
        );
        fireEvent.keyDown(picker, { key: "Escape" });
        expectControlValue(picker, selected);
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toBe(item);
    });

    it("keeps a running calculation alive while settings change", async () => {
        const terminate = vi.fn();
        const postMessage = vi.fn();
        vi.stubGlobal(
            "Worker",
            class {
                terminate = terminate;
                postMessage = postMessage;
            },
        );
        render(
            <MemoryRouter>
                <CraftingWorkbench catalog={data} />
            </MemoryRouter>,
        );
        chooseStartingItem(data);
        changeControl(screen.getByLabelText("Required rarity"), { target: { value: "rare" } });
        fireEvent.click(button("Calculate odds"));
        expect(postMessage).toHaveBeenCalledTimes(1);
        fireEvent.click(button("Display settings"));
        await select("Item output", "Classic");
        await select("Modifier layout", "Separate affix tabs");
        await select("Tag filter behavior", "Hide mismatches");
        fireEvent.click(screen.getByRole("checkbox", { name: "Show tag filter" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Show weight percentages" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Compact layout" }));
        expect(postMessage).toHaveBeenCalledTimes(1);
        expect(terminate).not.toHaveBeenCalled();
        fireEvent.click(button("Stop simulation"));
        expect(terminate).toHaveBeenCalledTimes(1);
    });

    it("uses classic output for additional read-only item cards without dropping rolled values", () => {
        const engine = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, base]) => base.item_class === "Body Armour" && base.drop_level === 1,
        )![0];
        const currency = data.crafting.currencies.find(
            (entry) => entry.action === "transmute_to_rare",
        )!;
        const item = engine.apply(
            engine.createItem(base),
            { kind: "currency", id: currency.id },
            seededRandom(42),
        ).item;
        const view = render(<ItemCard engine={engine} item={item} label="Sample result" />);
        const content = individualText(screen.getByRole("region", { name: "Sample result" }));
        view.rerender(
            <CraftingDisplay value={{ advanced: false, compact: true }}>
                <ItemCard engine={engine} item={item} label="Sample result" />
            </CraftingDisplay>,
        );
        const card = screen.getByRole("region", { name: "Sample result" });
        expect(individualText(card)).toBe(content);
        expect(
            within(card).getByRole("list", { name: "Combined explicit stats" }).textContent,
        ).not.toBe("");
        expect(
            [...card.querySelectorAll<HTMLElement>("[data-modifier-details]")].every(
                (entry) => entry.hidden,
            ),
        ).toBe(true);
        expect(card.dataset.itemOutput).toBe("classic");
    });
});

it("shows the same extracted spawn-level override in the modifier browser and item card", () => {
    render(
        <MemoryRouter>
            <CraftingWorkbench catalog={catalogs[1]!} mode="emulate" />
        </MemoryRouter>,
    );
    chooseStartingItem(catalogs[1]!);
    changeControl(screen.getByLabelText("Search modifiers"), {
        target: { value: "ArmourAppliesToElementalDamage1" },
    });
    const levels = "ilvl 30 · modifier level 1";
    expect(screen.getByRole("region", { name: "Modifier pool" }).textContent).toContain(levels);
    fireEvent.click(button("Add to item"));
    const card = screen.getByRole("region", { name: "Current item" });
    expect(card.querySelector("[data-modifier-details]")!.textContent).toContain(levels);
});

it("renders repeated extracted stat slots without duplicate React keys", () => {
    const data = catalogs[1]!;
    const engine = new CraftingEngine(data);
    const base = data.crafting.waystones[0]!.id;
    const item = { ...engine.createItem(base), rarity: "rare" as const };
    const mod = engine
        .pool(item)
        .find(({ mod }) => new Set(mod.stats.map((stat) => stat.id)).size < mod.stats.length)!;
    expect(mod).toBeDefined();
    item.mods.push(engine.rollMod(mod.id, seededRandom(1)));
    const error = vi.spyOn(console, "error");
    const view = render(<ItemCard engine={engine} item={item} />);
    view.rerender(
        <CraftingDisplay value={{ advanced: false, compact: true }}>
            <ItemCard engine={engine} item={item} />
        </CraftingDisplay>,
    );
    expect(error).not.toHaveBeenCalled();
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { CraftingWorkbench } from "../app/components/crafting/workbench";
import { seededRandom } from "../app/lib/crafting-engine";
import { type CraftingItem, craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, engine } from "./crafting-fixtures";

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

const key = `poe-boats:crafting:poe1:${catalog.patch}`;
const button = (name: string) => screen.getByRole("button", { name });
const saved = () => JSON.parse(localStorage.getItem(key)!)["My crafting project"];

describe("bench replacement in the workbench", () => {
    it.each([
        false,
        true,
    ])("retains paid removals, undo history and the skip setting (%s)", (skipOnConflict) => {
        let item: CraftingItem = { ...engine.createItem(baseId), rarity: "rare" };
        while (engine.counts(item).prefixes < 3)
            item = engine.addStartingMod(
                item,
                engine.pool(item, { side: "prefix" })[0]!.id,
                seededRandom(1),
            );
        const recipes = catalog.crafting.bench.filter(
            (entry) => entry.mod && entry.itemClasses.includes(engine.base(item).item_class),
        );
        const prefix = recipes.find(
            (entry) => engine.mod(entry.mod!).generation_type === "prefix",
        )!;
        const suffix = recipes.find(
            (entry) => engine.mod(entry.mod!).generation_type === "suffix",
        )!;
        item = engine.apply(item, { kind: "bench", id: suffix.id }, seededRandom(1)).item;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: { kind: "bench", id: prefix.id, skipOnConflict },
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 1,
            iterations: 10,
            maxActions: 2,
        });
        localStorage.setItem(key, JSON.stringify({ bench: project }));
        render(
            <MemoryRouter>
                <CraftingWorkbench catalog={catalog} mode="emulate" />
            </MemoryRouter>,
        );
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "bench" } });
        fireEvent.click(button("Load project"));
        expect(
            screen.getByRole("checkbox", {
                name: "Skip addition when the bench modifier conflicts",
            }),
        ).toHaveProperty("checked", skipOnConflict);
        expect(screen.getByLabelText("Orb of Scouring")).toBeDefined();
        fireEvent.click(button("Apply craft"));
        const spending = within(screen.getByText("Emulator spending").closest("details")!);
        expect(spending.getByText("Orb of Scouring").nextElementSibling!.textContent).toBe("1");
        if (!skipOnConflict) expect(screen.getByRole("alert").textContent).toContain("open prefix");
        fireEvent.click(button("Save project"));
        expect(saved().item.mods).toEqual(item.mods.filter((entry) => !entry.crafted));
        expect(saved().method).toEqual(project.method);
        fireEvent.click(button("Undo"));
        fireEvent.click(button("Save project"));
        expect(saved().item).toEqual(item);
        expect(screen.queryByText("Emulator spending")).toBeNull();
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        expect(saved().item.mods).toHaveLength(3);
        const checkbox = screen.getByRole("checkbox", {
            name: "Skip addition when the bench modifier conflicts",
        });
        fireEvent.click(checkbox);
        fireEvent.click(button("Save project"));
        expect(saved().method.skipOnConflict).toBe(!skipOnConflict);
    });
});

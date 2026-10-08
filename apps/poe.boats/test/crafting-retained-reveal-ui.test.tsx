// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { CraftingWorkbench } from "../app/components/crafting/workbench";
import { seededRandom } from "../app/lib/crafting-engine";
import { craftingProjectSchema } from "../app/schemas/crafting";
import { changeControl } from "./control-helpers";
import { pickModifier, retainedRevealFixture } from "./crafting-retained-reveal-fixtures";
import { chooseStartingItem } from "./starting-item-helper";

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

describe.each(["poe1", "poe2"] as const)("%s retained reveal controls", (game) => {
    it("retains offers while adding and removing a modifier through the item editor", () => {
        const { catalog, engine, currency, offered, choice, blocker } = retainedRevealFixture(game);
        const legacy = structuredClone(offered);
        delete legacy.reveal!.offeredOn;
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: catalog.patch,
            item: legacy,
            method: currency("add_mod_to_rare"),
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 10,
            maxActions: 2,
        });
        const key = `poe-boats:crafting:${game}:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ legacy: project }));
        render(
            <MemoryRouter>
                <CraftingWorkbench catalog={catalog} mode="emulate" />
            </MemoryRouter>,
        );
        chooseStartingItem(catalog);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "legacy" } });
        fireEvent.click(screen.getByRole("button", { name: "Load project" }));
        const selected = () =>
            within(screen.getByRole("region", { name: "Reveal modifier" })).getByRole("button", {
                name: new RegExp(`^${offered.reveal!.choices.indexOf(choice) + 1}\\.`),
            });
        expect(selected()).toHaveProperty("disabled", false);
        changeControl(screen.getByLabelText("Search modifiers"), {
            target: { value: blocker },
        });
        const row = screen
            .getByRole("region", { name: "Modifier pool" })
            .querySelector<HTMLElement>(`[data-modifier-id="${blocker}"]`)!;
        fireEvent.click(within(row).getByRole("button", { name: "Add to item" }));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(selected()).toHaveProperty("disabled", true);
        fireEvent.click(screen.getByRole("button", { name: "Save project" }));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.reveal.offeredOn.mods).toEqual(offered.mods);
        expect(saved.item.reveal.choices).toEqual(offered.reveal!.choices);
        expect(saved.item.mods.some((entry: { id: string }) => entry.id === blocker)).toBe(true);
        const added = within(screen.getByRole("region", { name: "Current item" }))
            .getByText(
                new RegExp(
                    `^${engine.mod(blocker).generation_type} · ${engine.mod(blocker).name} ·`,
                ),
            )
            .closest("li")!;
        fireEvent.click(within(added).getByRole("button", { name: "Remove" }));
        expect(selected()).toHaveProperty("disabled", false);
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
        expect(selected()).toHaveProperty("disabled", true);
        fireEvent.click(screen.getByRole("button", { name: "Redo" }));
        expect(selected()).toHaveProperty("disabled", false);
    });

    it("keeps blocked offers visible, restores eligibility after crafting, and preserves undo and saves", () => {
        const { catalog, engine, currency, offered, choice, blocker } = retainedRevealFixture(game);
        const item = engine.apply(offered, currency("add_mod_to_rare"), pickModifier(blocker)).item;
        const annul = currency("remove_random_mod");
        const seed = Array.from({ length: 50 }, (_, seed) => seed).find(
            (seed) => engine.apply(item, annul, seededRandom(seed)).item.reveal,
        );
        expect(seed).toBeDefined();
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: catalog.patch,
            item,
            method: annul,
            target: { groups: [] },
            steps: [],
            prices: {},
            seed,
            iterations: 10,
            maxActions: 2,
        });
        const key = `poe-boats:crafting:${game}:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ retained: project }));
        render(
            <MemoryRouter>
                <CraftingWorkbench catalog={catalog} mode="emulate" />
            </MemoryRouter>,
        );
        chooseStartingItem(catalog);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "retained" } });
        const button = (name: string) => screen.getByText(name, { selector: "button" });
        fireEvent.click(button("Load project"));
        const selected = () =>
            within(screen.getByRole("region", { name: "Reveal modifier" })).getByRole("button", {
                name: new RegExp(`^${item.reveal!.choices.indexOf(choice) + 1}\\.`),
            });
        expect(selected()).toHaveProperty("disabled", true);
        expect(selected().getAttribute("title")).toContain("conflicts");
        fireEvent.click(button("Apply craft"));
        expect(selected()).toHaveProperty("disabled", false);
        fireEvent.click(button("Undo"));
        expect(selected()).toHaveProperty("disabled", true);
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item).toEqual(item);
        fireEvent.click(button("Redo"));
        expect(selected()).toHaveProperty("disabled", false);
        fireEvent.click(selected());
        expect(screen.queryByRole("region", { name: "Reveal modifier" })).toBeNull();
        fireEvent.click(button("Save project"));
        const final = JSON.parse(localStorage.getItem(key)!)["My crafting project"].item;
        expect(final.reveal).toBeUndefined();
        expect(final.mods.map((entry: { id: string }) => entry.id)).toEqual([choice]);
    });
});

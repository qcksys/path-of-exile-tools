// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { modText } from "~/components/crafting/item-card";
import { seededRandom } from "~/lib/crafting-engine";
import { CraftingSimulation } from "~/lib/crafting-simulation";
import type { CraftingItem } from "~/schemas/crafting";
import { craftingProjectSchema } from "~/schemas/crafting";
import { changeControl } from "./control-helpers";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";
import { button, CraftingWorker, mount } from "./crafting-workbench-ui-fixtures";

describe("crafting workbench", () => {
    it.each([
        74, 86,
    ])("preserves Ukatoa's level-%i implicit outcome through targets, Allflame choice and saved history", async (level) => {
        const ducat = catalog.crafting.currencies.find(
            (entry) => entry.action === "add_eldritch_implicit_amulet",
        )!;
        const method = { kind: "currency" as const, id: ducat.id, allflame: true as const };
        const base = Object.entries(catalog.bases).find(
            ([, entry]) => entry.name === "Paua Amulet",
        )![0];
        const item = { ...engine.createItem(base, level), intangibility: 0 };
        const initial = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: currency("transmute_to_magic"),
            target: {
                groups:
                    level < 75
                        ? [{ mods: engine.base(item).implicits, minimum: 1, negated: true }]
                        : [],
            },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 500,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ ukatoa: initial }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "ukatoa" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: ducat.name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: ducat.name }));
        expect(
            screen
                .getByRole("checkbox", { name: "Use Allflame crafting" })
                .getAttribute("aria-disabled"),
        ).toBe("true");
        expect(screen.getByRole("note", { name: "Ducat crafting model" }).textContent).toContain(
            "empty pool removes",
        );
        changeControl(screen.getByLabelText("Modifier source"), { target: { value: "ukatoa" } });
        const pool = within(screen.getByRole("region", { name: "Modifier pool" }));
        const selected = engine.ukatoaModifiers(item)[0];
        if (selected) {
            changeControl(screen.getByLabelText("Search modifiers"), {
                target: { value: selected.id },
            });
            fireEvent.click(pool.getByRole("button", { name: "Require" }));
            fireEvent.click(pool.getByRole("button", { name: "Replace implicit" }));
            expect(screen.queryByRole("alert")).toBeNull();
            fireEvent.click(button("Save project"));
            const preview = JSON.parse(localStorage.getItem(key)!)["My crafting project"].item;
            expect(preview.implicits[0].id).toBe(selected.id);
            expect(preview.implicitCraft).toEqual({
                currency: ducat.id,
                level,
                removed: engine.base(item).implicits,
            });
            fireEvent.click(button("Undo"));
        } else expect(pool.getByText("No modifiers match these filters.")).toBeDefined();
        fireEvent.click(button("Calculate odds"));
        const request = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0];
        expect(request.project.method).toEqual(method);
        if (selected) expect(request.project.target.groups[0].mods).toEqual([selected.id]);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.click(button("Save project"));
        let saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.allflameCopies).toHaveLength(4);
        for (const copy of saved.item.allflameCopies)
            expect(copy.implicits).toHaveLength(selected ? 1 : 0);
        const expected = engine.chooseAllflame(saved.item, 0);
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        fireEvent.click(button("Keep copy 1"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain(
            `${ducat.name} · implicit replacement`,
        );
        if (!selected)
            expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain(
                "no implicit remains",
            );
        const spending = screen.getByText("Emulator spending").closest("details")!;
        expect(spending.textContent).toContain(`${ducat.name}1`);
        expect(spending.textContent).toContain(
            `Dead Man's Sulphur${engine
                .costs(method, item)
                .find((entry) => entry.id === catalog.crafting.allflame!.sulphur)!
                .amount.toLocaleString()}`,
        );
        fireEvent.click(button("Undo"));
        expect(screen.getByRole("region", { name: "Allflame copies" })).toBeDefined();
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(expected);
        expect(saved.method).toEqual(method);
    });

    it("calculates Merrick targets and saves four corrupted offers, the fifth affix and chosen-copy spending", async () => {
        const ducat = catalog.crafting.currencies.find(
            (entry) => entry.action === "add_mod_and_corrupt_rare_abyss_jewel",
        )!;
        const method = { kind: "currency" as const, id: ducat.id, allflame: true as const };
        let item: CraftingItem = {
            ...engine.createItem("Metadata/Items/Jewels/JewelAbyssMelee", 86),
            rarity: "rare",
            intangibility: 0,
        };
        while (item.mods.length < 4)
            item = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(1));
        const target = { groups: [], corrupted: true, affixCount: { min: 5, max: 5 } };
        const initial = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: currency("add_mod_to_rare"),
            target,
            steps: [],
            prices: {},
            seed: 42,
            iterations: 500,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ merrick: initial }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "merrick" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: ducat.name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: ducat.name }));
        expect(
            screen
                .getByRole("checkbox", { name: "Use Allflame crafting" })
                .getAttribute("aria-disabled"),
        ).toBe("true");
        expect(screen.getByRole("note", { name: "Ducat crafting model" }).textContent).toContain(
            "fifth modifier",
        );
        fireEvent.click(button("Calculate odds"));
        const request = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0];
        expect(request.project.method).toEqual(method);
        expect(request.project.target).toEqual(initial.target);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.click(button("Save project"));
        let saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.corrupted).toBe(false);
        expect(saved.item.allflameCopies).toHaveLength(4);
        for (const copy of saved.item.allflameCopies) {
            expect(copy).toMatchObject({ corrupted: true, corruptedBy: ducat.id });
            expect(copy.mods).toHaveLength(5);
        }
        const expected = engine.chooseAllflame(saved.item, 0);
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        fireEvent.click(button("Keep copy 1"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain(
            `Corrupted · ${ducat.name}`,
        );
        const spending = screen.getByText("Emulator spending").closest("details")!;
        expect(spending.textContent).toContain(`${ducat.name}1`);
        expect(spending.textContent).toContain("Dead Man's Sulphur12,200");
        fireEvent.click(button("Undo"));
        expect(screen.getByRole("region", { name: "Allflame copies" })).toBeDefined();
        fireEvent.click(button("Redo"));
        expect(screen.queryByRole("region", { name: "Allflame copies" })).toBeNull();
        fireEvent.click(button("Save project"));
        saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(expected);
        expect(saved.method).toEqual(method);
    });

    it("selects Genteel conversion targets, previews an off-base replacement and retains chosen copies through saves", async () => {
        const ducat = catalog.crafting.currencies.find(
            (entry) => entry.action === "reroll_single_attribute_modifier",
        )!;
        const method = { kind: "currency" as const, id: ducat.id, allflame: true as const };
        const item = {
            ...engine.addStartingMod(engine.createItem(baseId), "Strength1", seededRandom(1)),
            intangibility: 0,
        };
        const initial = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: currency("add_mod_to_rare"),
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 500,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ genteel: initial }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "genteel" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: ducat.name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: ducat.name }));
        expect(
            screen
                .getByRole("checkbox", { name: "Use Allflame crafting" })
                .getAttribute("aria-disabled"),
        ).toBe("true");
        expect(screen.getByRole("note", { name: "Ducat crafting model" }).textContent).toContain(
            "conflicting replacement removes",
        );
        changeControl(screen.getByLabelText("Modifier source"), {
            target: { value: "attribute" },
        });
        changeControl(screen.getByLabelText("Search modifiers"), {
            target: { value: "Dexterity1" },
        });
        const pool = within(screen.getByRole("region", { name: "Modifier pool" }));
        fireEvent.click(pool.getByRole("button", { name: "Require" }));
        fireEvent.click(pool.getByRole("button", { name: "Replace attribute" }));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain(
            "Genteel attribute conversion",
        );
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].item.mods[0],
        ).toMatchObject({ id: "Dexterity1", attributeSource: "Strength1" });
        fireEvent.click(button("Undo"));
        fireEvent.click(button("Calculate odds"));
        const request = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0];
        expect(request.project.method).toEqual(method);
        expect(request.project.target.groups[0].mods).toEqual(["Dexterity1"]);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.click(button("Save project"));
        let saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.allflameCopies).toHaveLength(2);
        const expected = engine.chooseAllflame(saved.item, 0);
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        fireEvent.click(button("Keep copy 1"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${ducat.name}1`,
        );
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Dead Man's Sulphur3,660",
        );
        fireEvent.click(button("Undo"));
        expect(screen.getByRole("region", { name: "Allflame copies" })).toBeDefined();
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(expected);
        expect(saved.method).toEqual(method);
    });

    it.each([
        "reroll_rare_infamous",
        "add_deepwater_hazard_belt_mod",
        "add_pantheon_aspect",
    ])("selects the %s pool and method for calculation, manual copies and saved results", async (action) => {
        const ducat = catalog.crafting.currencies.find((entry) => entry.action === action)!;
        const method = { kind: "currency" as const, id: ducat.id, allflame: true as const };
        const item: CraftingItem = {
            ...engine.createItem(
                action === "add_deepwater_hazard_belt_mod" ? "Metadata/Items/Belts/Belt3" : baseId,
            ),
            rarity: "rare",
            intangibility: 0,
        };
        const mod = engine.ducatPool(item, action)[0]!;
        const initial = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: currency("add_mod_to_rare"),
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 500,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ ducat: initial }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "ducat" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: ducat.name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: ducat.name }));
        expect(
            screen
                .getByRole("checkbox", { name: "Use Allflame crafting" })
                .getAttribute("aria-disabled"),
        ).toBe("true");
        changeControl(screen.getByLabelText("Modifier source"), { target: { value: action } });
        changeControl(screen.getByLabelText("Search modifiers"), { target: { value: mod.id } });
        const pool = within(screen.getByRole("region", { name: "Modifier pool" }));
        expect(pool.getByText(modText(mod.mod))).toBeDefined();
        fireEvent.click(pool.getByRole("button", { name: "Require" }));
        fireEvent.click(pool.getByRole("button", { name: "Add to item" }));
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item.mods[0].id).toBe(
            mod.id,
        );
        fireEvent.click(button("Undo"));
        fireEvent.click(button("Calculate odds"));
        const request = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0];
        expect(request.project.method).toEqual(method);
        expect(request.project.target.groups[0].mods).toEqual([mod.id]);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.click(button("Save project"));
        let saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.allflameCopies).toHaveLength(action === "add_pantheon_aspect" ? 4 : 3);
        const expected = engine.chooseAllflame(saved.item, 1);
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        fireEvent.click(button("Keep copy 2"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${ducat.name}1`,
        );
        fireEvent.click(button("Undo"));
        expect(screen.getByRole("region", { name: "Allflame copies" })).toBeDefined();
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(expected);
        expect(saved.method).toEqual(method);
    });

    it.each([
        "reset",
        "destroy",
        "split",
    ])("selects the mandatory Allflame Ducat and preserves its %s outcome through costs, history and saves", async (outcome) => {
        const action =
            outcome === "split" ? "split_to_single_explicit" : "reset_ghostliness_or_delete";
        const ducat = catalog.crafting.currencies.find((entry) => entry.action === action)!;
        const method = { kind: "currency" as const, id: ducat.id, allflame: true as const };
        const item: CraftingItem = {
            ...engine.createItem(baseId),
            rarity: "rare",
            intangibility: outcome === "split" ? 0 : 80,
            mods: [
                engine.rollMod("IncreasedLife1", seededRandom(1)),
                engine.rollMod("FireResist1", seededRandom(2)),
            ],
        };
        const seed = Array.from({ length: 30 }, (_, index) => index).find((seed) => {
            const copy = engine.prepareAllflame(item, method, seededRandom(seed)).item
                .allflameCopies![0]!;
            return Boolean(copy.destroyed) === (outcome === "destroy");
        })!;
        const initial = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: currency("add_mod_to_rare"),
            target:
                outcome === "split"
                    ? { groups: [{ mods: ["IncreasedLife1"] }] }
                    : { groups: [], intangibility: { min: 0, max: 0 } },
            steps: [],
            prices: {},
            seed,
            iterations: 10,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ ducat: initial }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "ducat" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: ducat.name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: ducat.name }));
        const toggle = screen.getByRole("checkbox", { name: "Use Allflame crafting" });
        expect(toggle.getAttribute("aria-checked")).toBe("true");
        expect(toggle.getAttribute("aria-disabled")).toBe("true");
        expect(screen.getByRole("note", { name: "Ducat crafting model" }).textContent).toContain(
            outcome === "split" ? "uniformly chosen" : "50% chance to destroy",
        );
        fireEvent.click(button("Calculate odds"));
        const request = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0];
        expect(request.project.method).toEqual(method);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.click(button("Save project"));
        let saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.allflameCopies).toHaveLength(outcome === "split" ? 4 : 1);
        const expected = engine.chooseAllflame(saved.item, 0);
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        fireEvent.click(button(outcome === "destroy" ? "Accept destroyed outcome" : "Keep copy 1"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent?.includes("Destroyed.")).toBe(outcome === "destroy");
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${ducat.name}1`,
        );
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            outcome === "split" ? "Dead Man's Sulphur19,520" : "Dead Man's Sulphur6,100",
        );
        fireEvent.click(button("Undo"));
        expect(screen.getByRole("region", { name: "Allflame copies" })).toBeDefined();
        fireEvent.click(button("Redo"));
        expect(screen.queryByRole("region", { name: "Allflame copies" })).toBeNull();
        fireEvent.click(button("Save project"));
        saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(expected);
        expect(saved.method).toEqual(method);
    });

    it("calculates Allflame targets and retains manual copies, costs, history and saved choices", () => {
        const craft = currency("add_mod_to_rare");
        const sulphur = catalog.crafting.allflame!.sulphur;
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        const initial = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: { ...engine.createItem(baseId), rarity: "rare" },
            method: craft,
            target: { groups: [] },
            steps: [],
            prices: { [sulphur]: 0.001 },
            seed: 42,
            iterations: 10,
            maxActions: 1,
        });
        localStorage.setItem(key, JSON.stringify({ allflame: initial }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "allflame" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(screen.getByRole("checkbox", { name: "Use Allflame crafting" }));
        expect(screen.getByRole("note", { name: "Allflame crafting model" }).textContent).toContain(
            "5,490",
        );
        fireEvent.click(screen.getByText("Intangibility requirement"));
        fireEvent.click(button("Add intangibility requirement"));
        changeControl(screen.getByRole("spinbutton", { name: "Minimum intangibility" }), {
            target: { value: "8" },
        });
        fireEvent.click(button("Calculate odds"));
        const request = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0];
        expect(request.project.method.allflame).toBe(true);
        expect(request.project.target.intangibility.min).toBe(8);
        const simulation = new CraftingSimulation(catalog, request.project);
        simulation.runTrial();
        expect(simulation.result().probability).toBe(1);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getAllByRole("button", { name: /^Keep copy/ })).toHaveLength(4);
        expect(screen.queryByText("Emulator spending")).toBeNull();
        fireEvent.click(button("Save project"));
        let saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.allflameCopies).toHaveLength(4);
        const expected = engine.chooseAllflame(saved.item, 1);
        fireEvent.click(button("Keep copy 2"));
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Dead Man's Sulphur5,490",
        );
        expect(screen.queryByRole("region", { name: "Allflame copies" })).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain(`Intangibility: ${expected.intangibility}%`);
        fireEvent.click(button("Undo"));
        expect(screen.getAllByRole("button", { name: /^Keep copy/ })).toHaveLength(4);
        fireEvent.click(button("Redo"));
        expect(screen.queryByRole("button", { name: "Keep copy 2" })).toBeNull();
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.getAllByRole("button", { name: /^Keep copy/ })).toHaveLength(4);
        fireEvent.click(button("Keep copy 2"));
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Dead Man's Sulphur5,490",
        );
        fireEvent.click(button("Save project"));
        saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(expected);
        expect(saved.method.allflame).toBe(true);
    });
});

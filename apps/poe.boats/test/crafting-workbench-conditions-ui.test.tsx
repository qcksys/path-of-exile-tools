// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { modText } from "~/components/crafting/item-card";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import { itemProperties } from "~/lib/crafting-properties";
import { CraftingProcess, calculateProcessExact } from "~/lib/crafting-simulation";
import type { CraftingItem } from "~/schemas/crafting";
import { craftingProjectSchema } from "~/schemas/crafting";
import { changeControl, expectControlValue } from "./control-helpers";
import { baseId, catalog, currency, engine, getCatalog } from "./crafting-fixtures";
import { button, CraftingWorker, mount } from "./crafting-workbench-ui-fixtures";

describe("crafting workbench", () => {
    it.each([
        "poe1",
        "poe2",
    ] as const)("edits %s final property conditions and retains calculation, process, history and saves", async (game) => {
        const data = game === "poe1" ? catalog : getCatalog("poe2");
        const current = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(([, entry]) => entry.name === "Crude Bow")![0];
        const item = current.addStartingMod(
            current.createItem(base),
            "LocalIncreasedAttackSpeed1",
            { pick: (choices) => choices[0]!.value, integer: (min) => min },
        );
        const divine = data.crafting.currencies.find(
            (entry) => entry.action === "reroll_mod_values",
        )!;
        const highest = {
            ...item,
            mods: item.mods.map((entry) => ({
                ...entry,
                values: current.mod(entry.id).stats.map((stat) => stat.max),
            })),
        };
        const maximum = itemProperties(current, highest).attacksPerSecond!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: data.patch,
            item,
            method: { kind: "currency", id: divine.id },
            target: { groups: [] },
            steps: [],
            prices: { [divine.id]: 2 },
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:${game}:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ properties: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "properties" },
        });
        fireEvent.click(button("Load project"));
        const card = screen.getByRole("region", { name: "Current item" });
        expect(
            within(card).getByRole("region", { name: "Final item properties" }).textContent,
        ).toContain("Physical DPS");
        fireEvent.click(screen.getByText("Final item property conditions"));
        fireEvent.click(button("Require Attacks per Second"));
        changeControl(screen.getByLabelText("Minimum Attacks per Second"), {
            target: { value: String(maximum) },
        });
        fireEvent.click(button("Calculate odds"));
        const first = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(first.target.properties).toEqual({ attacksPerSecond: { min: maximum } });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        fireEvent.click(button("Add crafting step"));
        const process = screen.getByRole("region", { name: "Crafting process" });
        expect(process.textContent).toContain("1 final item property requirements");
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[1]!;
        const input = worker.postMessage.mock.calls[0]![0].project;
        const result = calculateProcessExact(current, input);
        expect(result.probability).toBeCloseTo(1 / 3);
        act(() => worker.onmessage?.({ data: { type: "done", result } }));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.steps[0].condition.properties).toEqual(first.target.properties);
        const before = card.textContent;
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const after = card.textContent;
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Divine Orb1",
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expectControlValue(
            within(screen.getByRole("region", { name: "Crafting requirements" })).getByLabelText(
                "Minimum Attacks per Second",
            ),
            String(maximum),
        );
        fireEvent.click(
            within(screen.getByRole("region", { name: "Crafting requirements" })).getByRole(
                "button",
                { name: "Clear Attacks per Second requirement" },
            ),
        );
        expect(
            within(screen.getByRole("region", { name: "Crafting requirements" })).queryByLabelText(
                "Minimum Attacks per Second",
            ),
        ).toBeNull();
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("edits %s nested conditions, assigns modifiers to a branch and retains process saves", async (game) => {
        const data = game === "poe1" ? catalog : getCatalog("poe2");
        const current = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, entry]) => entry.item_class === "Body Armour" && !entry.implicits.length,
        )![0];
        let item = current.addStartingMod(
            current.createItem(base),
            "IncreasedLife1",
            seededRandom(1),
        );
        item = current.addStartingMod({ ...item, rarity: "rare" }, "ColdResist1", seededRandom(1));
        const annul = data.crafting.currencies.find(
            (entry) => entry.action === "remove_random_mod",
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: data.patch,
            item,
            method: { kind: "currency", id: annul.id },
            target: { groups: [] },
            steps: [],
            prices: { [annul.id]: 2 },
            seed: 42,
            iterations: 1000,
            maxActions: 2,
        });
        const key = `poe-boats:crafting:${game}:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ nested: project }));
        mount("calculate", data);
        changeControl(screen.getByLabelText("Search modifiers"), {
            target: { value: "IncreasedLife1" },
        });
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "nested" } });
        fireEvent.click(button("Load project"));
        const requirements = within(screen.getByRole("region", { name: "Crafting requirements" }));
        fireEvent.click(requirements.getByRole("button", { name: "Add combined condition" }));
        fireEvent.click(requirements.getByRole("button", { name: "Any (OR)" }));
        fireEvent.click(requirements.getByText("Condition 1", { exact: true }));
        const condition = within(
            requirements.getByRole("region", { name: "Condition 1 requirements" }),
        );
        fireEvent.click(condition.getByRole("button", { name: "Add combined condition" }));
        fireEvent.click(
            condition.getByRole("checkbox", { name: "Invert combined condition (NOT)" }),
        );
        fireEvent.click(condition.getByText("Condition 1.1", { exact: true }));
        const leaf = within(condition.getByRole("region", { name: "Condition 1.1 requirements" }));
        fireEvent.click(leaf.getByText("Item conditions", { exact: true }));
        changeControl(leaf.getByLabelText("Required rarity"), { target: { value: "rare" } });
        const picker = screen.getByRole("combobox", { name: "Requirement destination" });
        changeControl(picker, { target: { value: "Condition 1.1" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Condition 1.1" }));
        const pool = within(screen.getByRole("region", { name: "Modifier pool" }));
        const row = within(
            pool
                .getByText(modText(current.mod("IncreasedLife1")))
                .closest("div.border-b")! as HTMLElement,
        );
        fireEvent.click(row.getByRole("button", { name: "Require" }));
        expect(leaf.getByRole("checkbox", { name: "Exclude matches in group 1" })).toBeDefined();
        fireEvent.click(row.getByRole("button", { name: "Remove target" }));
        expect(leaf.queryByRole("checkbox", { name: "Exclude matches in group 1" })).toBeNull();
        fireEvent.click(row.getByRole("button", { name: "Require" }));
        fireEvent.click(requirements.getByRole("button", { name: "Add condition" }));
        fireEvent.click(requirements.getByText("Condition 2", { exact: true }));
        const alternative = within(
            requirements.getByRole("region", { name: "Condition 2 requirements" }),
        );
        fireEvent.click(alternative.getByText("Item conditions", { exact: true }));
        changeControl(alternative.getByLabelText("Required rarity"), {
            target: { value: "normal" },
        });
        fireEvent.click(button("Calculate odds"));
        const target = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project.target;
        expect(target.groups).toEqual([]);
        expect(target.expression).toMatchObject({
            operator: "or",
            operands: [
                {
                    expression: {
                        negated: true,
                        operands: [{ rarity: "rare", groups: [{ mods: ["IncreasedLife1"] }] }],
                    },
                },
                { rarity: "normal" },
            ],
        });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        fireEvent.click(button("Add crafting step"));
        const processRegion = within(screen.getByRole("region", { name: "Crafting process" }));
        expect(processRegion.getByText(/3 nested conditions \(OR\)/)).toBeDefined();
        fireEvent.click(processRegion.getByText("Edit step condition"));
        const step = within(processRegion.getByRole("region", { name: "Step 1 condition" }));
        fireEvent.click(step.getByText("Condition 2", { exact: true }));
        const stepAlternative = within(
            step.getByRole("region", { name: "Condition 2 requirements" }),
        );
        fireEvent.click(stepAlternative.getByText("Item conditions", { exact: true }));
        changeControl(stepAlternative.getByLabelText("Required rarity"), {
            target: { value: "magic" },
        });
        expectControlValue(alternative.getByLabelText("Required rarity"), "normal");
        fireEvent.click(processRegion.getByRole("button", { name: "Use current requirements" }));
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[1]!;
        const input = worker.postMessage.mock.calls[0]![0].project;
        expect(input.steps[0].condition).toEqual(target);
        const result = calculateProcessExact(current, input);
        expect(result).toMatchObject({ probability: 0.5, meanCost: 2 });
        act(() => worker.onmessage?.({ data: { type: "done", result } }));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.target).toEqual(target);
        expect(saved.steps[0].condition).toEqual(target);
        fireEvent.click(
            requirements.getAllByRole("button", { name: "Remove combined condition" })[0]!,
        );
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.click(button("Calculate odds"));
        expect(CraftingWorker.instances[2]!.postMessage.mock.calls[0]![0].project.target).toEqual(
            target,
        );
    });

    it("edits raw defence rolls, calculates Sacred Orbs and preserves the result through history and saves", async () => {
        const range = catalog.bases[baseId]!.defences.armour!;
        const sacred = catalog.crafting.currencies.find(
            (entry) => entry.action === "reroll_variable_defences",
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: engine.createItem(baseId),
            method: currency("transmute_to_magic"),
            target: { groups: [] },
            steps: [],
            prices: { [sacred.id]: 3 },
            seed: 42,
            iterations: 1000,
            maxActions: 2,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ defences: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "defences" } });
        fireEvent.click(button("Load project"));
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Base Armour: Not set");
        fireEvent.click(screen.getByText("Starting base defences"));
        changeControl(screen.getByLabelText("Starting Base Armour"), {
            target: { value: String(range.min) },
        });
        expect(card.textContent).toContain(`Base Armour: ${range.min}`);
        fireEvent.click(button("Set maximum base defences"));
        expect(card.textContent).toContain(`Base Armour: ${range.max}`);
        changeControl(screen.getByLabelText("Starting Base Armour"), {
            target: { value: String(range.min) },
        });
        fireEvent.click(screen.getByText("Base defence requirements"));
        fireEvent.click(button("Require Base Armour"));
        expect((screen.getByLabelText("Minimum Base Armour") as HTMLInputElement).value).toBe(
            String(range.max),
        );
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: "Sacred Orb" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Sacred Orb" }));
        expect(screen.getByRole("note", { name: "Sacred Orb model" }).textContent).toContain(
            "independently",
        );
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.target.baseDefences).toEqual({ armour: { min: range.max, max: range.max } });
        expect(sent.item.baseDefences).toEqual({ armour: range.min });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const after = card.textContent;
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.baseDefences.armour).toBeGreaterThanOrEqual(range.min);
        expect(saved.item.baseDefences.armour).toBeLessThanOrEqual(range.max);
        expect(saved.target.baseDefences).toEqual(sent.target.baseDefences);
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Sacred Orb1",
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain(`Base Armour: ${range.min}`);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Clear Base Armour requirement"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        expect((screen.getByLabelText("Minimum Base Armour") as HTMLInputElement).value).toBe(
            String(range.max),
        );
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        fireEvent.click(button("Add crafting step"));
        const processRegion = within(screen.getByRole("region", { name: "Crafting process" }));
        expect(processRegion.getByText(/1 base defence requirements/)).toBeDefined();
        fireEvent.click(processRegion.getByText("Edit step condition"));
        expect(
            (
                within(
                    processRegion.getByRole("region", { name: "Step 1 condition" }),
                ).getByLabelText("Minimum Base Armour") as HTMLInputElement
            ).value,
        ).toBe(String(range.max));
    });

    it("shows PoE 2 fixed base defences and supports requirements without inventing Sacred Orb rolls", () => {
        const data = getCatalog("poe2");
        const current = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(([, entry]) => entry.defences.armour)![0];
        const value = data.bases[base]!.defences.armour!.min;
        const method = {
            kind: "currency",
            id: data.crafting.currencies.find((entry) => entry.action === "transmute_to_magic")!.id,
        };
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item: current.createItem(base),
            method,
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ defences: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "defences" } });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain(
            `Base Armour: ${value}`,
        );
        fireEvent.click(screen.getByText("Base defence requirements"));
        fireEvent.click(button("Require Base Armour"));
        fireEvent.click(button("Calculate odds"));
        expect(
            CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project.target.baseDefences,
        ).toEqual({ armour: { min: value, max: value } });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain(
            `Base Armour: ${value}`,
        );
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("edits %s exclusion groups and retains them through calculation, processes and saves", (game) => {
        const data = game === "poe1" ? catalog : getCatalog("poe2");
        const current = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, entry]) => entry.item_class === "Ring" && entry.implicits.length > 0,
        )![0];
        let item: CraftingItem = { ...current.createItem(base), rarity: "rare" };
        for (const side of ["prefix", "suffix"] as const)
            item = current.addStartingMod(
                item,
                current.pool(item, { side })[0]!.id,
                seededRandom(42),
            );
        const annul = data.crafting.currencies.find(
            (entry) => entry.action === "remove_random_mod",
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: data.patch,
            item,
            method: { kind: "currency", id: annul.id },
            target: { groups: [{ mods: item.mods.map((entry) => entry.id) }] },
            steps: [],
            prices: { [annul.id]: 2 },
            seed: 42,
            iterations: 1000,
            maxActions: 3,
        });
        const key = `poe-boats:crafting:${game}:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ exclusion: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "exclusion" },
        });
        fireEvent.click(button("Load project"));
        const requirements = within(screen.getByRole("region", { name: "Crafting requirements" }));
        fireEvent.click(requirements.getByRole("checkbox", { name: "Exclude matches in group 1" }));
        expect(requirements.getByText(/all selected modifiers must be absent/)).toBeDefined();
        changeControl(requirements.getByLabelText("Group 1 match threshold"), {
            target: { value: "2" },
        });
        expect(requirements.getByText(/Passes when fewer than 2/)).toBeDefined();
        const groupPicker = screen.getByRole("combobox", { name: "Add requirements to" });
        fireEvent.click(groupPicker);
        const groupMenu = document.getElementById(groupPicker.getAttribute("aria-controls")!)!;
        expect(
            within(groupMenu).getByRole("option", { name: "Group 1 (exclude matches)" }),
        ).toBeDefined();
        fireEvent.keyDown(groupMenu, { key: "Escape" });
        fireEvent.click(button("Calculate odds"));
        expect(
            CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project.target.groups[0],
        ).toMatchObject({ negated: true, minimum: 2 });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        fireEvent.click(button("Add crafting step"));
        const processRegion = within(screen.getByRole("region", { name: "Crafting process" }));
        expect(processRegion.getByText(/1 exclusion group/)).toBeDefined();
        fireEvent.click(processRegion.getByText("Edit step condition"));
        const condition = within(processRegion.getByRole("region", { name: "Step 1 condition" }));
        fireEvent.click(condition.getByRole("checkbox", { name: "Exclude matches in group 1" }));
        expect(processRegion.queryByText(/1 exclusion group/)).toBeNull();
        fireEvent.click(processRegion.getByRole("button", { name: "Use current requirements" }));
        expect(
            condition
                .getByRole("checkbox", { name: "Exclude matches in group 1" })
                .getAttribute("aria-checked"),
        ).toBe("true");
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[1]!;
        const input = worker.postMessage.mock.calls[0]![0].project;
        expect(input.steps[0].condition.groups).toEqual(input.target.groups);
        const result = calculateProcessExact(current, input);
        expect(result).toMatchObject({ probability: 1, meanCost: 2 });
        act(() => worker.onmessage?.({ data: { type: "done", result } }));
        fireEvent.click(button("Apply process"));
        const emulator = CraftingWorker.instances[2]!;
        const processInput = emulator.postMessage.mock.calls[0]![0].project;
        const process = new CraftingProcess(current, processInput, seededRandom(processInput.seed));
        while (!process.done) process.advance();
        act(() => emulator.onmessage?.({ data: { type: "emulated", result: process.result() } }));
        expect(screen.getByText("Process finished successfully.")).toBeDefined();
        expect(process.item.mods).toHaveLength(1);
        fireEvent.click(button("Undo"));
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(process.item);
        expect(saved.target.groups[0]).toMatchObject({ negated: true, minimum: 2 });
        expect(saved.steps[0].condition.groups).toEqual(saved.target.groups);
        fireEvent.click(requirements.getByRole("checkbox", { name: "Exclude matches in group 1" }));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(
            requirements
                .getByRole("checkbox", { name: "Exclude matches in group 1" })
                .getAttribute("aria-checked"),
        ).toBe("true");
        expect(
            condition
                .getByRole("checkbox", { name: "Exclude matches in group 1" })
                .getAttribute("aria-checked"),
        ).toBe("true");
        fireEvent.click(processRegion.getByRole("button", { name: "Always pass" }));
        expect(
            condition.queryByRole("checkbox", { name: "Exclude matches in group 1" }),
        ).toBeNull();
    });
});

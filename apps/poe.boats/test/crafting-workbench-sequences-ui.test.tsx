// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { seededRandom } from "~/lib/crafting-engine";
import { CraftingProcess, calculateProcessExact } from "~/lib/crafting-simulation";
import type { CraftingItem } from "~/schemas/crafting";
import { craftingProjectSchema } from "~/schemas/crafting";
import { changeControl } from "./control-helpers";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";
import { button, CraftingWorker, mount } from "./crafting-workbench-ui-fixtures";

describe("crafting workbench", () => {
    it("loads an editable currency sequence and saves its condition-only step", () => {
        mount();
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        const transmute = catalog.crafting.currencies.find(
            (entry) => entry.action === "transmute_to_magic",
        )!;
        changeControl(screen.getByLabelText("Currency sequence"), {
            target: { value: transmute.id },
        });
        fireEvent.click(button("Use currency sequence"));
        const processRegion = screen.getByRole("region", { name: "Crafting process" });
        expect(
            within(processRegion).getAllByRole("combobox", { name: "Step action" }),
        ).toHaveLength(4);
        expect(
            within(processRegion).getAllByRole("combobox", { name: "Crafting method" }),
        ).toHaveLength(3);
        expect(within(processRegion).getByText(/1 open affixes · magic/)).toBeDefined();
        fireEvent.click(button("Apply process"));
        const worker = CraftingWorker.instances[0]!;
        const input = worker.postMessage.mock.calls[0]![0].project;
        const process = new CraftingProcess(engine, input, seededRandom(input.seed));
        while (!process.done) process.advance();
        act(() => worker.onmessage?.({ data: { type: "emulated", result: process.result() } }));
        expect(screen.getByText("Process finished successfully.")).toBeDefined();
        expect(process.item.mods).toHaveLength(3);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(`poe-boats:crafting:poe1:${catalog.patch}`)!)[
            "My crafting project"
        ];
        expect(saved.steps[1]).toMatchObject({ condition: { openAffixes: 1, rarity: "magic" } });
        expect(saved.steps[1].method).toBeUndefined();
    });

    it("edits and calculates a condition-only step with rarity and exact affix counts", () => {
        mount("calculate");
        const requirements = screen.getByRole("region", { name: "Crafting requirements" });
        fireEvent.click(within(requirements).getByText("Item conditions"));
        changeControl(within(requirements).getByLabelText("Required rarity"), {
            target: { value: "normal" },
        });
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        fireEvent.click(button("Add condition check"));
        const processRegion = screen.getByRole("region", { name: "Crafting process" });
        fireEvent.click(within(processRegion).getByText("Edit step condition"));
        const condition = within(processRegion).getByRole("region", { name: "Step 1 condition" });
        fireEvent.click(within(condition).getByText("Item conditions"));
        changeControl(within(condition).getByLabelText("Maximum total affixes"), {
            target: { value: "0" },
        });
        expect(
            within(processRegion).queryByRole("combobox", { name: "Crafting method" }),
        ).toBeNull();
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[0]!;
        const input = worker.postMessage.mock.calls[0]![0].project;
        expect(input.steps[0].condition).toMatchObject({
            rarity: "normal",
            affixCount: { min: 0, max: 0 },
        });
        act(() =>
            worker.onmessage?.({
                data: { type: "done", result: calculateProcessExact(engine, input) },
            }),
        );
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByRole("region", { name: "Crafting results" }).textContent).toContain(
            "100",
        );
        changeControl(within(processRegion).getByLabelText("Step action"), {
            target: { value: "craft" },
        });
        expect(
            within(processRegion).getByRole("combobox", { name: "Crafting method" }),
        ).toBeDefined();
    });

    it("requires the preset starting rarity and offers Alteration only when extracted", () => {
        mount();
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        const alteration = catalog.crafting.currencies.find(
            (entry) => entry.action === "reroll_magic",
        )!;
        changeControl(screen.getByLabelText("Currency sequence"), {
            target: { value: alteration.id },
        });
        expect(button("Use currency sequence").hasAttribute("disabled")).toBe(true);
        changeControl(screen.getByRole("combobox", { name: "Rarity" }), {
            target: { value: "magic" },
        });
        expect(button("Use currency sequence").hasAttribute("disabled")).toBe(false);
        fireEvent.click(button("Use currency sequence"));
        expect(button("Replace process with sequence")).toBeDefined();
    });

    it("applies combined steps without a target, saves the process setting, and undoes its spending", () => {
        mount();
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        fireEvent.click(button("Add crafting step"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.click(button("Apply process"));
        const worker = CraftingWorker.instances[0]!;
        const request = worker.postMessage.mock.calls[0]![0];
        expect(request.type).toBe("emulate-process");
        expect(request.project.useProcess).toBe(true);
        const process = new CraftingProcess(
            engine,
            request.project,
            seededRandom(request.project.seed),
        );
        while (!process.done) process.advance();
        act(() => worker.onmessage?.({ data: { type: "emulated", result: process.result() } }));
        expect(card.textContent).not.toBe(before);
        expect(screen.getByText("Process finished successfully.")).toBeDefined();
        expect(screen.getByText("Emulator spending")).toBeDefined();
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(`poe-boats:crafting:poe1:${catalog.patch}`)!);
        expect(saved["My crafting project"].useProcess).toBe(true);
        expect(saved["My crafting project"].steps).toHaveLength(1);
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        expect(screen.queryByText("Emulator spending")).toBeNull();
        fireEvent.click(button("Redo"));
        expect(card.textContent).not.toBe(before);
        expect(screen.getByText("Emulator spending")).toBeDefined();
    });

    it("discards a stopped process and ignores its stale completion", () => {
        mount();
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        fireEvent.click(button("Add crafting step"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.click(button("Apply process"));
        const worker = CraftingWorker.instances[0]!;
        const input = worker.postMessage.mock.calls[0]![0].project;
        const process = new CraftingProcess(engine, input, seededRandom(input.seed));
        while (!process.done) process.advance();
        act(() => worker.onmessage?.({ data: { type: "emulating", result: process.result() } }));
        expect(screen.getByText("1 steps completed")).toBeDefined();
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Stop process"));
        act(() => worker.onmessage?.({ data: { type: "emulated", result: process.result() } }));
        expect(card.textContent).toBe(before);
        expect(screen.queryByText("Emulator spending")).toBeNull();
        expect(screen.getByText(/current item and spending were left unchanged/)).toBeDefined();
    });

    it("calculates combined steps and displays expected currencies and process odds", () => {
        let item: CraftingItem = { ...engine.createItem(baseId), rarity: "rare" };
        for (let index = 0; index < 2; index++)
            item = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(index));
        const target = engine.validateTarget({ groups: [{ mods: [item.mods[0]!.id] }] });
        const method = currency("remove_random_mod");
        const input = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            target,
            method,
            useProcess: true,
            steps: [
                {
                    id: "annul",
                    method,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "restart",
                },
            ],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 3,
        });
        localStorage.setItem(
            `poe-boats:crafting:poe1:${catalog.patch}`,
            JSON.stringify({ process: input }),
        );
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "process" } });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("region", { name: "Crafting process" })).toBeDefined();
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[0]!;
        expect(worker.postMessage.mock.calls[0]![0]).toMatchObject({
            type: "calculate",
            project: { useProcess: true },
        });
        act(() =>
            worker.onmessage?.({
                data: { type: "done", result: calculateProcessExact(engine, input) },
            }),
        );
        const results = screen.getByRole("region", { name: "Crafting results" });
        expect(results.textContent).toContain("87.5");
        expect(results.textContent).toContain("one process attempt");
        expect(results.textContent).toContain("12.5% of trials reached the step limit");
        const currencies = within(results).getByText("Expected currency per attempt")
            .parentElement!;
        expect(within(currencies).getByText("1.75")).toBeDefined();
        for (const label of ["Average crafts / attempt", "Starting items / attempt"])
            expect(within(results).getByText(label).nextElementSibling?.textContent).toBe("1.75");
    });
});

// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import { CraftingSimulation } from "~/lib/crafting-simulation";
import { craftingProjectSchema } from "~/schemas/crafting";
import { changeControl, expectControlValue } from "./control-helpers";
import { baseId, catalog, currency, engine, getCatalog } from "./crafting-fixtures";
import { button, CraftingWorker, mount } from "./crafting-workbench-ui-fixtures";

describe("crafting workbench", () => {
    it.each([
        "poe1",
        "poe2",
    ] as const)("previews %s reveal sources without changing the craft, then switches to the actual offer through history", (game) => {
        const data = game === "poe1" ? catalog : getCatalog("poe2");
        const current = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, base]) => base.item_class === "Body Armour" && base.drop_level === 1,
        )![0];
        const action = (action: string) => ({
            kind: "currency" as const,
            id: data.crafting.currencies.find((entry) => entry.action === action)!.id,
        });
        const item = current.apply(
            current.createItem(base),
            action("transmute_to_rare"),
            seededRandom(42),
        ).item;
        const method = action(
            game === "poe1" ? "replace_rare_mod_veiled" : "abyssal_bench_ticket_armour",
        );
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: data.patch,
            item,
            method,
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:${game}:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ reveal: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "reveal" } });
        fireEvent.click(button("Load project"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        changeControl(screen.getByLabelText("Modifier source"), {
            target: { value: "revealed" },
        });
        expectControlValue(screen.getByLabelText("Preview reveal source"), method.id);
        const alternative = current.revealSources(item).find((entry) => entry.id !== method.id)!;
        changeControl(screen.getByLabelText("Preview reveal source"), {
            target: { value: alternative.id },
        });
        const pool = screen.getByRole("region", { name: "Modifier pool" });
        const row = pool.querySelector<HTMLElement>("[data-modifier-id]")!;
        const id = row.dataset.modifierId!;
        expect(within(row).getByText(/^Preview offer [\d.]+%$/)).toBeDefined();
        fireEvent.click(within(row).getByRole("button", { name: "Require" }));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(project.item);
        expect(saved.method).toEqual(project.method);
        expect(saved.target.groups[0].mods).toEqual([id]);
        fireEvent.click(button("Calculate odds"));
        const request = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0];
        expect(request.project.method).toEqual(project.method);
        expect(request.project.target.groups[0].mods).toEqual([id]);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.queryByLabelText("Preview reveal source")).toBeNull();
        expect(within(pool).getAllByText(/^Offer [\d.]+%$/).length).toBeGreaterThan(0);
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].item.reveal.source,
        ).toBe(method.id);
        const after = card.textContent;
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        expectControlValue(screen.getByLabelText("Preview reveal source"), alternative.id);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        expect(screen.queryByLabelText("Preview reveal source")).toBeNull();
    });

    it("previews an inactive influence, adds its modifier and preserves both through history, workers and saves", () => {
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: engine.createItem(baseId),
            method: currency("transmute_to_rare"),
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ influence: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "influence" },
        });
        fireEvent.click(button("Load project"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        changeControl(screen.getByLabelText("Modifier source"), {
            target: { value: "influence:0" },
        });
        expect(card.textContent).toBe(before);
        const row = screen
            .getByRole("region", { name: "Modifier pool" })
            .querySelector<HTMLElement>("[data-modifier-id]")!;
        const id = row.dataset.modifierId!;
        fireEvent.click(within(row).getByRole("button", { name: "Require" }));
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item).toEqual(
            project.item,
        );
        fireEvent.click(within(row).getByRole("button", { name: "Add to item" }));
        expect(screen.queryByRole("alert")).toBeNull();
        const after = card.textContent;
        expect(after).not.toBe(before);
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Calculate odds"));
        const request = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0];
        expect(request.project.item.influences).toEqual([0]);
        expect(request.project.item.mods.map((entry: { id: string }) => entry.id)).toEqual([id]);
        expect(request.project.target.groups[0].mods).toEqual([id]);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(request.project.item);
        expect(saved.target).toEqual(request.project.target);
        fireEvent.click(button("Undo"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        fireEvent.click(screen.getByText("Influences", { selector: "summary" }));
        expect(screen.getByRole("checkbox", { name: "Shaper" }).getAttribute("aria-checked")).toBe(
            String(true),
        );
    });

    it("uses extracted Genesis effects for modifier previews, worker requests, history and saved projects", async () => {
        const tree = catalog.crafting.genesis!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: { ...engine.createItem(baseId), destroyed: true, corrupted: true },
            method: currency("transmute_to_rare"),
            target: { groups: [], rarity: "rare", affixCount: { min: 4, max: 4 } },
            steps: [],
            prices: { "generated:genesis": 7 },
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ genesis: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "genesis" } });
        fireEvent.click(button("Load project"));
        expect(button("Apply craft")).toHaveProperty("disabled", true);
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: tree.name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: tree.name }));
        expect(button("Apply craft")).toHaveProperty("disabled", false);
        const effects = within(screen.getByRole("region", { name: "Genesis Tree effects" }));
        expect(
            effects
                .getByRole("checkbox", { name: tree.passives.EquipmentNode9neg!.text! })
                .getAttribute("aria-checked"),
        ).toBe(String(false));
        fireEvent.click(
            effects.getByRole("checkbox", { name: tree.passives.EquipmentNode9!.text! }),
        );
        changeControl(effects.getByLabelText("Modifier tier rating bonuses"), {
            target: { value: "3" },
        });
        expect(effects.getByLabelText("Modifier tier rating bonuses").textContent).toContain(
            "3 bonuses · +60 rating",
        );
        changeControl(screen.getByRole("textbox", { name: "Search modifiers" }), {
            target: { value: "maximum Life" },
        });
        const pool = screen.getByRole("region", { name: "Modifier pool" });
        expect(pool.querySelector('[data-modifier-id="IncreasedLife1"]')).toBeNull();
        const nodes = ["EquipmentNode9", "EquipmentNode2", "EquipmentNode3b", "EquipmentNode20a"];
        const life = engine
            .genesisModifiers(project.item, nodes)
            .find((entry) => /^IncreasedLife\d+$/.test(entry.id))!;
        expect(pool.querySelector(`[data-modifier-id="${life.id}"]`)?.textContent).toContain(
            "4,000",
        );
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[0]!;
        const request = worker.postMessage.mock.calls[0]![0];
        expect(request.project.method).toMatchObject({ kind: "genesis", id: "genesis" });
        expect([...request.project.method.nodes].sort()).toEqual([...nodes].sort());
        const simulation = new CraftingSimulation(catalog, request.project);
        for (let trial = 0; trial < 100; trial++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            probability: 1,
            errors: {},
            meanCost: 7,
            spending: { "generated:genesis": 100 },
        });
        act(() => worker.onmessage?.({ data: { type: "done", result: simulation.result() } }));
        const card = screen.getAllByRole("region", { name: "Current item" })[0]!;
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).not.toContain("Destroyed");
        const after = card.textContent;
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Genesis equipment item1",
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.method).toEqual(request.project.method);
        expect(saved.item.mods).toHaveLength(4);
        expect(saved.prices["generated:genesis"]).toBe(7);
        fireEvent.click(
            effects.getByRole("checkbox", { name: tree.passives.EquipmentNode9!.text! }),
        );
        fireEvent.click(button("Undo"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        expect(
            effects
                .getByRole("checkbox", { name: tree.passives.EquipmentNode9!.text! })
                .getAttribute("aria-checked"),
        ).toBe(String(true));
        expectControlValue(effects.getByLabelText("Modifier tier rating bonuses"), "3");
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        fireEvent.click(button("Add crafting step"));
        const step = within(screen.getByRole("article", { name: "Step 1 editor" }));
        changeControl(step.getByLabelText("Modifier tier rating bonuses"), {
            target: { value: "0" },
        });
        expectControlValue(effects.getByLabelText("Modifier tier rating bonuses"), "3");
        fireEvent.click(button("Mass simulate"));
        const process = CraftingWorker.instances.at(-1)!.postMessage.mock.calls[0]![0];
        expect(process.project.useProcess).toBe(true);
        expect(process.project.steps[0].method).toEqual({
            kind: "genesis",
            id: "genesis",
            nodes: ["EquipmentNode9"],
        });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].steps).toEqual(
            process.project.steps,
        );
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("omits Genesis from unsupported %s base selections", async (game) => {
        const data = game === "poe1" ? catalog : getCatalog("poe2");
        const current = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, entry]) => entry.item_class === "Wand",
        )![0];
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: data.patch,
            item: current.createItem(base),
            method: { kind: "generate", id: "normal" },
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        localStorage.setItem(
            `poe-boats:crafting:${game}:${data.patch}`,
            JSON.stringify({ wand: project }),
        );
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "wand" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: "Genesis" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        expect(await screen.findByText("No eligible matches.")).toBeDefined();
        expect(screen.queryByRole("option", { name: catalog.crafting.genesis!.name })).toBeNull();
        expect(screen.queryByRole("region", { name: "Genesis Tree effects" })).toBeNull();
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("generates a fresh %s item with costs, worker dispatch, history and save/load", async (game) => {
        const data = game === "poe1" ? catalog : getCatalog("poe2");
        const current = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, entry]) =>
                entry.item_class === "Body Armour" && !entry.corrupted && !entry.implicits.length,
        )![0];
        const item = current.validateItem({
            ...current.createItem(base),
            corrupted: true,
            destroyed: true,
            quality: 20,
            ...(game === "poe1" ? { memoryStrands: 82 } : { twiceCorrupted: true }),
        });
        const initialMethod = {
            kind: "currency",
            id: data.crafting.currencies.find((entry) => entry.action === "transmute_to_magic")!.id,
        };
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: data.patch,
            item,
            method: initialMethod,
            target: { groups: [], rarity: "rare" },
            steps: [],
            prices: { "generated:rare": 5 },
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:${game}:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ fresh: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "fresh" } });
        fireEvent.click(button("Load project"));
        expect(button("Apply craft").hasAttribute("disabled")).toBe(true);
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: "Generate rare item" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Generate rare item" }));
        expect(button("Apply craft").hasAttribute("disabled")).toBe(false);
        expect(screen.getByRole("note", { name: "Item generation model" }).textContent).toContain(
            "each replacement",
        );
        fireEvent.click(button("Calculate odds"));
        expect(screen.queryByRole("alert")).toBeNull();
        const request = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0];
        expect(request.project.method).toEqual({ kind: "generate", id: "rare" });
        const simulation = new CraftingSimulation(data, request.project);
        for (let trial = 0; trial < 100; trial++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            probability: 1,
            meanCost: 5,
            spending: { "generated:rare": 100 },
        });
        act(() =>
            CraftingWorker.instances[0]!.onmessage?.({
                data: { type: "done", result: simulation.result() },
            }),
        );
        const card = screen.getAllByRole("region", { name: "Current item" })[0]!;
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).not.toContain("Destroyed");
        expect(card.textContent).not.toContain("Memory Strands: 82");
        const after = card.textContent;
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Generated rare item1",
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.method).toEqual({ kind: "generate", id: "rare" });
        expect(saved.prices["generated:rare"]).toBe(5);
        expect(saved.item).toMatchObject({ rarity: "rare", quality: 0, corrupted: false });
        expect(saved.item.destroyed).toBeUndefined();
        fireEvent.click(button("Undo"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
    });

    it("retains PoE 2 desecration with an empty reveal pool through calculation, spending, history and saves", () => {
        const data = getCatalog("poe2");
        const current = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, entry]) => entry.name === "Rattling Sceptre",
        )![0];
        const bone = data.crafting.currencies.find(
            (entry) => entry.action === "abyssal_bench_ticket_weapon_high",
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item: { ...current.createItem(base, 1), rarity: "rare" },
            method: { kind: "currency", id: bone.id },
            target: { groups: [], unrevealedCount: { min: 1, max: 1 } },
            steps: [],
            prices: { [bone.id]: 3 },
            seed: 42,
            iterations: 20,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ emptyReveal: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "emptyReveal" },
        });
        fireEvent.click(button("Load project"));
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[0]!;
        const simulation = new CraftingSimulation(
            data,
            worker.postMessage.mock.calls[0]![0].project,
            false,
        );
        for (let index = 0; index < 20; index++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({ probability: 1, meanCost: 3, errors: {} });
        act(() => worker.onmessage?.({ data: { type: "done", result: simulation.result() } }));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const panel = screen.getByRole("region", { name: "Reveal modifier" });
        expect(within(panel).getByRole("status").textContent).toContain(
            "No eligible reveal choices",
        );
        expect(within(panel).queryByRole("button", { name: "Reveal choices" })).toBeNull();
        expect(within(panel).queryByRole("button", { name: /Reveal with/ })).toBeNull();
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${bone.name}1`,
        );
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.reveal.choices).toEqual([]);
        expect(current.revealPool(current.validateItem(saved.item))).toEqual([]);
        fireEvent.click(button("Undo"));
        expect(screen.queryByRole("region", { name: "Reveal modifier" })).toBeNull();
        fireEvent.click(button("Redo"));
        expect(screen.getByRole("region", { name: "Reveal modifier" }).textContent).toContain(
            "No eligible reveal choices",
        );
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${bone.name}1`,
        );
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("region", { name: "Reveal modifier" }).textContent).toContain(
            "No eligible reveal choices",
        );
    });
    it("reveals choices, commits one modifier and restores the choices with undo", () => {
        const rare = engine.apply(
            engine.createItem(baseId),
            currency("transmute_to_rare"),
            seededRandom(3),
        ).item;
        const item = engine.apply(rare, currency("replace_rare_mod_veiled"), seededRandom(11)).item;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: catalog.game,
            patch: catalog.patch,
            item,
            target: { groups: [] },
            method: { kind: "reveal", preferred: [] },
            steps: [],
            prices: {},
            seed: 15,
            iterations: 100,
            maxActions: 10,
        });
        localStorage.setItem(
            `poe-boats:crafting:poe1:${catalog.patch}`,
            JSON.stringify({ veiled: project }),
        );
        mount();
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "veiled" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(button("Reveal choices"));
        const panel = screen.getByRole("region", { name: "Reveal modifier" });
        const choices = panel.textContent;
        expect(within(panel).getAllByRole("button")).toHaveLength(3);
        fireEvent.click(within(panel).getAllByRole("button")[0]!);
        expect(screen.queryByRole("region", { name: "Reveal modifier" })).toBeNull();
        fireEvent.click(button("Undo"));
        expect(screen.getByRole("region", { name: "Reveal modifier" }).textContent).toBe(choices);
        fireEvent.click(button("Redo"));
        expect(screen.queryByRole("region", { name: "Reveal modifier" })).toBeNull();
    });
});

// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { modText } from "~/components/crafting/item-card";
import { CraftingWorkbench } from "~/components/crafting/workbench";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import { itemProperties } from "~/lib/crafting-properties";
import {
    CraftingProcess,
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "~/lib/crafting-simulation";
import type { CraftingItem, CraftingProject } from "~/schemas/crafting";
import { craftingCatalogSchema, craftingProjectSchema } from "~/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

class CraftingWorker {
    static instances: CraftingWorker[] = [];
    onmessage: ((event: { data: unknown }) => void) | null = null;
    terminate = vi.fn();
    postMessage = vi.fn();
    constructor() {
        CraftingWorker.instances.push(this);
    }
}
beforeEach(() => {
    CraftingWorker.instances = [];
    localStorage.clear();
    vi.stubGlobal("Worker", CraftingWorker);
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
const button = (name: string) => {
    const scope = screen.queryByText(name, { selector: "button" })?.parentElement;
    return (scope ? within(scope) : screen).getByRole("button", { name });
};
function mount(mode = "emulate", data = catalog) {
    return render(
        <MemoryRouter>
            <CraftingWorkbench catalog={data} mode={mode} />
        </MemoryRouter>,
    );
}

describe("crafting workbench", () => {
    it.each([
        "poe1",
        "poe2",
    ] as const)("previews %s reveal sources without changing the craft, then switches to the actual offer through history", (game) => {
        const data =
            game === "poe1"
                ? catalog
                : craftingCatalogSchema.parse(
                      JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
                  );
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
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "reveal" } });
        fireEvent.click(button("Load project"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.change(screen.getByLabelText("Modifier source"), {
            target: { value: "revealed" },
        });
        expect(screen.getByLabelText("Preview reveal source")).toHaveProperty("value", method.id);
        const alternative = current.revealSources(item).find((entry) => entry.id !== method.id)!;
        fireEvent.change(screen.getByLabelText("Preview reveal source"), {
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
        expect(screen.getByLabelText("Preview reveal source")).toHaveProperty(
            "value",
            alternative.id,
        );
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
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "influence" },
        });
        fireEvent.click(button("Load project"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.change(screen.getByLabelText("Modifier source"), {
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
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        fireEvent.click(screen.getByText("Influences", { selector: "summary" }));
        expect(screen.getByRole("checkbox", { name: "Shaper" })).toHaveProperty("checked", true);
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
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "genesis" } });
        fireEvent.click(button("Load project"));
        expect(button("Apply craft")).toHaveProperty("disabled", true);
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: tree.name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: tree.name }));
        expect(button("Apply craft")).toHaveProperty("disabled", false);
        const effects = within(screen.getByRole("region", { name: "Genesis Tree effects" }));
        expect(
            effects.getByRole("checkbox", { name: tree.passives.EquipmentNode9neg!.text! }),
        ).toHaveProperty("checked", false);
        fireEvent.click(
            effects.getByRole("checkbox", { name: tree.passives.EquipmentNode9!.text! }),
        );
        fireEvent.change(effects.getByLabelText("Modifier tier rating bonuses"), {
            target: { value: "3" },
        });
        expect(effects.getByRole("option", { name: "3 bonuses · +60 rating" })).toBeDefined();
        fireEvent.change(screen.getByRole("textbox", { name: "Search modifiers" }), {
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
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        expect(
            effects.getByRole("checkbox", { name: tree.passives.EquipmentNode9!.text! }),
        ).toHaveProperty("checked", true);
        expect(effects.getByLabelText("Modifier tier rating bonuses")).toHaveProperty("value", "3");
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        fireEvent.click(button("Add crafting step"));
        const step = within(screen.getByRole("article", { name: "Step 1 editor" }));
        fireEvent.change(step.getByLabelText("Modifier tier rating bonuses"), {
            target: { value: "0" },
        });
        expect(effects.getByLabelText("Modifier tier rating bonuses")).toHaveProperty("value", "3");
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
        const data =
            game === "poe1"
                ? catalog
                : craftingCatalogSchema.parse(
                      JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
                  );
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
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "wand" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: "Genesis" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        expect(await screen.findByText("No eligible matches.")).toBeDefined();
        expect(screen.queryByRole("option", { name: catalog.crafting.genesis!.name })).toBeNull();
        expect(screen.queryByRole("region", { name: "Genesis Tree effects" })).toBeNull();
    });

    it("preserves Tangled effects across modifier weights, crafting history, saves and optimization", () => {
        const tangled = catalog.crafting.fossils.find((entry) => entry.name === "Tangled Fossil")!;
        const pristine = catalog.crafting.fossils.find(
            (entry) => entry.name === "Pristine Fossil",
        )!;
        const pair = (positive: string, negative: string) =>
            catalog.crafting.fossils.find(
                (entry) =>
                    tangled.randomOutcomes.includes(entry.id) &&
                    entry.positive[0]!.tag === positive &&
                    entry.negative[0]!.tag === negative,
            )!.id;
        const method = {
            kind: "fossils",
            ids: [tangled.id, pristine.id],
            tangled: pair("life", "resistance"),
            logic: "additive",
            resonator: catalog.crafting.currencies.find(
                (entry) => entry.action === "delve_currency_reroll" && entry.id.endsWith("2"),
            )!.id,
        };
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: { ...engine.createItem(baseId), rarity: "rare" },
            method,
            target: { groups: [{ mods: ["IncreasedLife1"] }] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ tangled: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "tangled" } });
        fireEvent.click(button("Load project"));
        const effects = within(
            screen.getAllByRole("group", { name: "Tangled Fossil revealed effects" })[0]!,
        );
        expect(effects.getByLabelText("Greatly more modifiers")).toHaveProperty("value", "life");
        expect(effects.getByLabelText("Blocked modifiers")).toHaveProperty("value", "resistance");
        expect(
            within(effects.getByLabelText("Blocked modifiers")).getByRole("option", {
                name: "life",
            }),
        ).toHaveProperty("disabled", true);
        expect(
            within(effects.getByLabelText("Greatly more modifiers")).getAllByRole("option"),
        ).toHaveLength(22);
        const pool = screen.getByRole("region", { name: "Modifier pool" });
        fireEvent.change(screen.getByRole("textbox", { name: "Search modifiers" }), {
            target: { value: "maximum Life" },
        });
        expect(pool.querySelector('[data-modifier-id="IncreasedLife1"]')?.textContent).toContain(
            "40,000",
        );
        fireEvent.change(effects.getByLabelText("Greatly more modifiers"), {
            target: { value: "critical" },
        });
        expect(pool.querySelector('[data-modifier-id="IncreasedLife1"]')?.textContent).toContain(
            "10,000",
        );
        fireEvent.change(effects.getByLabelText("Blocked modifiers"), {
            target: { value: "fire" },
        });
        fireEvent.click(button("Mass simulate"));
        const request = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0];
        expect(request.project.method.tangled).toBe(pair("critical", "fire"));
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        const crafted = card.textContent;
        fireEvent.click(button("Undo"));
        expect(card.textContent).not.toBe(crafted);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(crafted);
        fireEvent.change(screen.getByLabelText("Project name"), {
            target: { value: "revealed pair" },
        });
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["revealed pair"].method.tangled).toBe(
            pair("critical", "fire"),
        );
        fireEvent.click(screen.getByText("Fossil optimizer"));
        const optimizer = within(screen.getByText("Fossil optimizer").closest("details")!);
        expect(optimizer.getByLabelText("Greatly more modifiers")).toHaveProperty(
            "value",
            "critical",
        );
        fireEvent.change(optimizer.getByLabelText("Blocked modifiers"), {
            target: { value: "cold" },
        });
        fireEvent.click(button("Compare fossils"));
        const worker = CraftingWorker.instances.at(-1)!;
        expect(worker.postMessage.mock.calls[0]![0].options.tangled).toBe(pair("critical", "cold"));
        fireEvent.change(optimizer.getByLabelText("Blocked modifiers"), {
            target: { value: "chaos" },
        });
        expect(worker.terminate).toHaveBeenCalled();
        fireEvent.click(optimizer.getByRole("checkbox", { name: "Tangled Fossil" }));
        expect(optimizer.queryByLabelText("Blocked modifiers")).toBeNull();
        fireEvent.click(button("Compare fossils"));
        expect(
            CraftingWorker.instances.at(-1)!.postMessage.mock.calls[0]![0].options.tangled,
        ).toBeUndefined();
        fireEvent.click(button("Stop optimizer"));
        fireEvent.click(screen.getByText("Fossil optimizer"));
        fireEvent.click(screen.getAllByRole("checkbox", { name: "Tangled Fossil" })[0]!);
        expect(screen.queryByRole("group", { name: "Tangled Fossil revealed effects" })).toBeNull();
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["revealed pair"].method.tangled,
        ).toBeUndefined();
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("uses %s required character level across crafting modes and saved history", (game) => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
        );
        const current = new CraftingEngine(data);
        const random = seededRandom(42);
        const base = Object.entries(data.bases).find(([, base]) => base.name === "Iron Ring")![0];
        const item = current.addStartingMod(
            current.addStartingMod(current.createItem(base), "Strength7", random),
            "IncreasedLife1",
            random,
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
            target: { groups: [] },
            steps: [],
            prices: { [annul.id]: 2 },
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:${game}:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ level: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "level" } });
        fireEvent.click(button("Load project"));
        const card = screen.getByRole("region", { name: "Current item" });
        expect(
            within(card).getByRole("region", { name: "Final item properties" }).textContent,
        ).toContain("Required Character Level52");
        fireEvent.click(screen.getByText("Final item property conditions"));
        expect(
            screen.getByText(/Required Character Level includes the base, modifiers/),
        ).toBeDefined();
        fireEvent.click(button("Require Required Character Level"));
        fireEvent.change(screen.getByLabelText("Minimum Required Character Level"), {
            target: { value: "0" },
        });
        fireEvent.change(screen.getByLabelText("Maximum Required Character Level"), {
            target: { value: "10" },
        });
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[0]!;
        const request = worker.postMessage.mock.calls[0]![0].project;
        expect(request.target.properties).toEqual({ requiredLevel: { min: 0, max: 10 } });
        expect(
            calculateExact(current, request.item, request.method, request.target).probability,
        ).toBe(0.5);
        const simulation = new CraftingSimulation(data, request, false);
        for (let trial = 0; trial < 100; trial++) simulation.runTrial();
        expect(simulation.result().errors).toEqual({});
        expect(simulation.result().meanCost).toBe(2);
        act(() => worker.onmessage?.({ data: { type: "done", result: simulation.result() } }));
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const after = card.textContent;
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.target.properties).toEqual(request.target.properties);
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        expect(screen.getByLabelText("Maximum Required Character Level")).toHaveProperty(
            "value",
            "10",
        );
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("uses %s attribute requirements in targets and saved crafting history", (game) => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
        );
        const current = new CraftingEngine(data);
        const first = {
            pick: <T,>(choices: { value: T }[]) => choices[0]!.value,
            integer: (min: number) => min,
        };
        let item = current.addStartingMod(
            current.createItem(
                game === "poe1"
                    ? "Metadata/Items/Armours/BodyArmours/BodyStrDex15"
                    : "Metadata/Items/Armours/BodyArmours/FourBodyStrDex11",
            ),
            "ReducedLocalAttributeRequirements1",
            first,
        );
        item = current.addStartingMod(item, "IncreasedLife1", first);
        const maximum = game === "poe1" ? 94 : 56;
        const annul = data.crafting.currencies.find(
            (entry) => entry.action === "remove_random_mod",
        )!;
        const initial = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: data.patch,
            item,
            method: { kind: "currency", id: annul.id },
            target: { groups: [] },
            steps: [],
            prices: { [annul.id]: 2 },
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:${game}:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ requirements: initial }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "requirements" },
        });
        fireEvent.click(button("Load project"));
        const card = screen.getByRole("region", { name: "Current item" });
        expect(
            within(card).getByRole("region", { name: "Final item properties" }).textContent,
        ).toContain(`Strength Requirement${maximum}`);
        fireEvent.click(screen.getByText("Final item property conditions"));
        expect(
            screen.getByText(
                /Attribute requirements include local modifiers and socket conversions/,
            ),
        ).toBeDefined();
        fireEvent.click(button("Require Strength Requirement"));
        fireEvent.change(screen.getByLabelText("Minimum Strength Requirement"), {
            target: { value: "0" },
        });
        fireEvent.change(screen.getByLabelText("Maximum Strength Requirement"), {
            target: { value: String(maximum) },
        });
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[0]!;
        const request = worker.postMessage.mock.calls[0]![0].project;
        expect(request.target.properties).toEqual({
            strengthRequirement: { min: 0, max: maximum },
        });
        expect(
            calculateExact(current, request.item, request.method, request.target).probability,
        ).toBe(0.5);
        const simulation = new CraftingSimulation(data, request, false);
        for (let trial = 0; trial < 100; trial++) simulation.runTrial();
        expect(simulation.result().errors).toEqual({});
        expect(simulation.result().meanCost).toBe(2);
        act(() => worker.onmessage?.({ data: { type: "done", result: simulation.result() } }));
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const after = card.textContent;
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.target.properties).toEqual(request.target.properties);
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        expect(screen.getByLabelText("Maximum Strength Requirement")).toHaveProperty(
            "value",
            String(maximum),
        );
    });

    it("uses extracted reload time for PoE 2 targets, calculation, simulation and saved history", () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const current = new CraftingEngine(data);
        const item = current.addStartingMod(
            current.createItem("Metadata/Items/Weapons/TwoHandWeapons/Crossbows/FourCrossbow1"),
            "AbyssModCrossbowKurgalSuffixReloadSpeed",
            { pick: (choices) => choices[0]!.value, integer: (min) => min },
            "revealed",
        );
        const divine = data.crafting.currencies.find(
            (entry) => entry.action === "reroll_mod_values",
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            method: { kind: "currency", id: divine.id },
            target: { groups: [] },
            steps: [],
            prices: { [divine.id]: 3 },
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ reload: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "reload" } });
        fireEvent.click(button("Load project"));
        const card = screen.getByRole("region", { name: "Current item" });
        expect(
            within(card).getByRole("region", { name: "Final item properties" }).textContent,
        ).toContain("Reload Time (s)0.68");
        fireEvent.click(screen.getByText("Final item property conditions"));
        expect(
            screen.getByText(/Reload Time includes local attack and reload speed/),
        ).toBeDefined();
        fireEvent.click(button("Require Reload Time (s)"));
        fireEvent.change(screen.getByLabelText("Minimum Reload Time (s)"), {
            target: { value: "0" },
        });
        fireEvent.change(screen.getByLabelText("Maximum Reload Time (s)"), {
            target: { value: "0.64" },
        });
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[0]!;
        const request = worker.postMessage.mock.calls[0]![0].project;
        expect(request.target.properties).toEqual({ reloadTime: { min: 0, max: 0.64 } });
        expect(
            calculateExact(current, request.item, request.method, request.target).probability,
        ).toBeCloseTo(1 / 9);
        const simulation = new CraftingSimulation(data, request, false);
        for (let trial = 0; trial < 100; trial++) simulation.runTrial();
        expect(simulation.result().errors).toEqual({});
        expect(simulation.result().meanCost).toBe(3);
        act(() => worker.onmessage?.({ data: { type: "done", result: simulation.result() } }));
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const after = card.textContent;
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.target.properties).toEqual(request.target.properties);
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        expect(screen.getByLabelText("Maximum Reload Time (s)")).toHaveProperty("value", "0.64");
    });

    it.each([
        8, 9,
    ])("uses bench reroll action %i in calculation, simulation and saved history", async (action) => {
        const recipe = catalog.crafting.bench.find((entry) => entry.action === action)!;
        let item: CraftingItem = { ...engine.createItem(baseId), rarity: "rare" };
        while (item.mods.length < 6)
            item = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(1));
        for (const entry of item.mods.slice(0, 5)) entry.fractured = true;
        const initial = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: currency("reroll"),
            target: { groups: [], affixCount: { min: 6, max: 6 } },
            steps: [],
            prices: { [recipe.cost[0]!.id]: 2 },
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ bench: initial }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "bench" } });
        fireEvent.click(button("Load project"));
        const card = screen.getByRole("region", { name: "Current item" });
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: recipe.name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: `Bench · ${recipe.name}` }));
        expect(screen.getByRole("note", { name: "Bench reroll model" }).textContent).toContain(
            "after each removal",
        );
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[0]!;
        const request = worker.postMessage.mock.calls[0]![0].project;
        expect(request.method).toEqual({ kind: "bench", id: recipe.id });
        expect(
            calculateExact(engine, request.item, request.method, request.target).probability,
        ).toBeCloseTo(1);
        const simulation = new CraftingSimulation(catalog, request, false);
        for (let trial = 0; trial < 100; trial++) simulation.runTrial();
        expect(simulation.result().errors).toEqual({});
        expect(simulation.result().meanCost).toBe(recipe.cost[0]!.amount * 2);
        act(() => worker.onmessage?.({ data: { type: "done", result: simulation.result() } }));
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const after = card.textContent;
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `Chaos Orb${recipe.cost[0]!.amount}`,
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.method).toEqual(request.method);
        expect(saved.item.mods.slice(0, 5)).toEqual(item.mods.slice(0, 5));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        expect(screen.getByRole("note", { name: "Bench reroll model" })).toBeDefined();
    });

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
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "ukatoa" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: ducat.name } });
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
        fireEvent.change(screen.getByLabelText("Modifier source"), { target: { value: "ukatoa" } });
        const pool = within(screen.getByRole("region", { name: "Modifier pool" }));
        const selected = engine.ukatoaModifiers(item)[0];
        if (selected) {
            fireEvent.change(screen.getByLabelText("Search modifiers"), {
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
        fireEvent.change(screen.getByLabelText("Saved project"), {
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
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "merrick" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: ducat.name } });
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
        fireEvent.change(screen.getByLabelText("Saved project"), {
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
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "genteel" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: ducat.name } });
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
        fireEvent.change(screen.getByLabelText("Modifier source"), {
            target: { value: "attribute" },
        });
        fireEvent.change(screen.getByLabelText("Search modifiers"), {
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
        fireEvent.change(screen.getByLabelText("Saved project"), {
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
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "ducat" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: ducat.name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: ducat.name }));
        expect(
            screen
                .getByRole("checkbox", { name: "Use Allflame crafting" })
                .getAttribute("aria-disabled"),
        ).toBe("true");
        fireEvent.change(screen.getByLabelText("Modifier source"), { target: { value: action } });
        fireEvent.change(screen.getByLabelText("Search modifiers"), { target: { value: mod.id } });
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
        fireEvent.change(screen.getByLabelText("Saved project"), {
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
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "ducat" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: ducat.name } });
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
        fireEvent.change(screen.getByLabelText("Saved project"), {
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
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "allflame" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(screen.getByRole("checkbox", { name: "Use Allflame crafting" }));
        expect(screen.getByRole("note", { name: "Allflame crafting model" }).textContent).toContain(
            "5,490",
        );
        fireEvent.click(screen.getByText("Intangibility requirement"));
        fireEvent.click(button("Add intangibility requirement"));
        fireEvent.change(screen.getByRole("spinbutton", { name: "Minimum intangibility" }), {
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
        fireEvent.change(screen.getByLabelText("Saved project"), {
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

    it.each([
        "bench",
        "beast",
    ] as const)("links sockets through the %s with targets, spending, history and persistence", async (kind) => {
        const recipe = catalog.crafting.bench.find((entry) => entry.linkCount === 6)!;
        const linkingBeast = catalog.crafting.beasts.find((entry) => entry.maximumLinks)!;
        const method = { kind, id: kind === "bench" ? recipe.id : linkingBeast.id };
        const priceId = kind === "bench" ? recipe.cost[0]!.id : linkingBeast.id;
        const vaal = catalog.crafting.currencies.find(
            (entry) => entry.action === "corrupt_item",
        )!.id;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: {
                ...engine.createItem(baseId),
                sockets: 6,
                memoryStrands: 82,
                quality: 20,
                corrupted: kind === "bench",
            },
            method: currency("transmute_to_magic"),
            target: { groups: [] },
            steps: [],
            prices: { [priceId]: 0.5, [vaal]: 1 },
            seed: 42,
            iterations: 10,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ linking: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "linking" } });
        fireEvent.click(button("Load project"));
        const connection = screen.getByRole("combobox", { name: "Socket 1 to 2" });
        fireEvent.change(connection, { target: { value: "Linked" } });
        fireEvent.keyDown(connection, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Linked" }));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: engine.methodName(method) } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(
            await screen.findByRole("option", {
                name: `${kind === "bench" ? "Bench" : "Beastcraft"} · ${engine.methodName(method)}`,
            }),
        );
        expect(screen.getByRole("note", { name: "Socket linking model" }).textContent).toContain(
            kind === "bench" ? "Remaining links are unknown" : "Links all current",
        );
        fireEvent.click(screen.getByText("Linked socket requirement"));
        fireEvent.click(button("Add linked socket requirement"));
        fireEvent.change(screen.getByRole("spinbutton", { name: "Minimum linked sockets" }), {
            target: { value: "6" },
        });
        fireEvent.click(button("Calculate odds"));
        const request = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0];
        expect(request.project.item.socketLinks).toEqual([true, null, null, null, null]);
        expect(request.project.target.linkedSockets).toEqual({ min: 6, max: 6 });
        expect(request.project.method).toEqual(method);
        const sampled = new CraftingSimulation(catalog, request.project);
        sampled.runTrial();
        expect(sampled.result()).toMatchObject({
            probability: 1,
            meanCost: kind === "bench" ? 2250 : 0.5,
        });
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain("Largest linked group: 6 sockets");
        expect(card.textContent).toContain("Memory Strands: 82");
        const after = card.textContent;
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            engine.costName(priceId),
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.socketLinks).toEqual([true, true, true, true, true]);
        expect(saved.target.linkedSockets).toEqual({ min: 6, max: 6 });
        expect(saved.method).toEqual(method);
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        fireEvent.change(screen.getByRole("spinbutton", { name: "Gem sockets" }), {
            target: { value: "4" },
        });
        expect(card.textContent).toContain("Largest linked group: 1–4 sockets");
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("generates a fresh %s item with costs, worker dispatch, history and save/load", async (game) => {
        const data =
            game === "poe1"
                ? catalog
                : craftingCatalogSchema.parse(
                      JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
                  );
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
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "fresh" } });
        fireEvent.click(button("Load project"));
        expect(button("Apply craft").hasAttribute("disabled")).toBe(true);
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: "Generate rare item" } });
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
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
    });

    it("retains PoE 2 desecration with an empty reveal pool through calculation, spending, history and saves", () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
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
        fireEvent.change(screen.getByLabelText("Saved project"), {
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
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("region", { name: "Reveal modifier" }).textContent).toContain(
            "No eligible reveal choices",
        );
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("edits %s aggregate resistance and life targets through calculation, history and saves", (game) => {
        const data =
            game === "poe1"
                ? catalog
                : craftingCatalogSchema.parse(
                      JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
                  );
        const current = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(([, entry]) => entry.name === "Ruby Ring")![0];
        const item = current.addStartingMod(current.createItem(base), "IncreasedLife1", {
            pick: (choices) => choices[0]!.value,
            integer: (min) => min,
        });
        const divine = data.crafting.currencies.find(
            (entry) => entry.action === "reroll_mod_values",
        )!;
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
        localStorage.setItem(key, JSON.stringify({ totals: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "totals" } });
        fireEvent.click(button("Load project"));
        const card = screen.getByRole("region", { name: "Current item" });
        const properties = within(card).getByRole("region", { name: "Final item properties" });
        expect(properties.textContent).toContain("Flat Life10");
        expect(properties.textContent).toContain("Total Resistance (%)");
        fireEvent.click(screen.getByText("Final item property conditions"));
        fireEvent.click(button("Require Total Resistance (%)"));
        const input = screen.getByLabelText("Minimum Total Resistance (%)");
        expect(input.hasAttribute("min")).toBe(false);
        fireEvent.change(input, { target: { value: "-1" } });
        fireEvent.click(button("Require Flat Life"));
        const maximum = current.mod("IncreasedLife1").stats[0]!.max;
        fireEvent.change(screen.getByLabelText("Minimum Flat Life"), {
            target: { value: String(maximum) },
        });
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[0]!;
        const request = worker.postMessage.mock.calls[0]![0].project;
        expect(request.target.properties).toEqual({
            totalResistance: { min: -1 },
            flatLife: { min: maximum },
        });
        const simulation = new CraftingSimulation(data, request, false);
        for (let trial = 0; trial < 100; trial++) simulation.runTrial();
        expect(simulation.result().errors).toEqual({});
        act(() => worker.onmessage?.({ data: { type: "done", result: simulation.result() } }));
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].target.properties,
        ).toEqual(request.target.properties);
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const after = card.textContent;
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.getByLabelText("Minimum Total Resistance (%)")).toHaveProperty("value", "-1");
        expect(screen.getByLabelText("Minimum Flat Life")).toHaveProperty("value", String(maximum));
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("uses %s flask properties in calculation, simulation, history and saves", (game) => {
        const data =
            game === "poe1"
                ? catalog
                : craftingCatalogSchema.parse(
                      JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
                  );
        const current = new CraftingEngine(data);
        const item = current.addStartingMod(
            {
                ...current.createItem(
                    `Metadata/Items/Flasks/${game === "poe2" ? "Four" : ""}FlaskLife1`,
                ),
                quality: 20,
            },
            "FlaskIncreasedRecoveryAmount1",
            { pick: (choices) => choices[0]!.value, integer: (min) => min },
        );
        const divine = data.crafting.currencies.find(
            (entry) => entry.action === "reroll_mod_values",
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: data.patch,
            item,
            method: { kind: "currency", id: divine.id },
            target: { groups: [] },
            steps: [],
            prices: { [divine.id]: 3 },
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:${game}:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ flask: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "flask" } });
        fireEvent.click(button("Load project"));
        const card = screen.getByRole("region", { name: "Current item" });
        const properties = within(card).getByRole("region", { name: "Final item properties" });
        expect(properties.textContent).toContain(`Life Recovery${game === "poe1" ? 118 : 85}`);
        expect(properties.textContent).toContain(`Maximum Charges${game === "poe1" ? 21 : 60}`);
        expect(properties.textContent).not.toContain("Mana Recovery");
        fireEvent.click(screen.getByText("Final item property conditions"));
        expect(
            screen.getByText(/Low-life, low-mana and character bonuses are excluded/),
        ).toBeTruthy();
        fireEvent.click(button("Require Life Recovery"));
        const maximum = game === "poe1" ? 123 : 87;
        fireEvent.change(screen.getByLabelText("Minimum Life Recovery"), {
            target: { value: String(maximum) },
        });
        fireEvent.click(button("Require Charges per Use"));
        fireEvent.change(screen.getByLabelText("Minimum Charges per Use"), {
            target: { value: "" },
        });
        fireEvent.click(button("Require Charges per Use"));
        fireEvent.change(screen.getByLabelText("Maximum Charges per Use"), {
            target: { value: "10" },
        });
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[0]!;
        const request = worker.postMessage.mock.calls[0]![0].project;
        expect(request.target.properties).toEqual({
            lifeRecovery: { min: maximum },
            chargesPerUse: { min: game === "poe1" ? 7 : 10, max: 10 },
        });
        const exact = calculateExact(current, request.item, request.method, request.target);
        expect(exact.probability).toBeCloseTo(game === "poe1" ? 1 / 6 : 1 / 5);
        const simulation = new CraftingSimulation(data, request, false);
        for (let trial = 0; trial < 100; trial++) simulation.runTrial();
        expect(simulation.result().errors).toEqual({});
        expect(simulation.result().meanCost).toBe(3);
        act(() => worker.onmessage?.({ data: { type: "done", result: simulation.result() } }));
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].target.properties,
        ).toEqual(request.target.properties);
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const after = card.textContent;
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.getByLabelText("Minimum Life Recovery")).toHaveProperty(
            "value",
            String(maximum),
        );
        expect(screen.getByLabelText("Maximum Charges per Use")).toHaveProperty("value", "10");
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("edits %s final property conditions and retains calculation, process, history and saves", async (game) => {
        const data =
            game === "poe1"
                ? catalog
                : craftingCatalogSchema.parse(
                      JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
                  );
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
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "properties" },
        });
        fireEvent.click(button("Load project"));
        const card = screen.getByRole("region", { name: "Current item" });
        expect(
            within(card).getByRole("region", { name: "Final item properties" }).textContent,
        ).toContain("Physical DPS");
        fireEvent.click(screen.getByText("Final item property conditions"));
        fireEvent.click(button("Require Attacks per Second"));
        fireEvent.change(screen.getByLabelText("Minimum Attacks per Second"), {
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
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(
            within(screen.getByRole("region", { name: "Crafting requirements" })).getByLabelText(
                "Minimum Attacks per Second",
            ),
        ).toHaveProperty("value", String(maximum));
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
        const data =
            game === "poe1"
                ? catalog
                : craftingCatalogSchema.parse(
                      JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
                  );
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
        fireEvent.change(screen.getByLabelText("Search modifiers"), {
            target: { value: "IncreasedLife1" },
        });
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "nested" } });
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
        fireEvent.change(leaf.getByLabelText("Required rarity"), { target: { value: "rare" } });
        const picker = screen.getByRole("combobox", { name: "Requirement destination" });
        fireEvent.change(picker, { target: { value: "Condition 1.1" } });
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
        fireEvent.change(alternative.getByLabelText("Required rarity"), {
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
        fireEvent.change(stepAlternative.getByLabelText("Required rarity"), {
            target: { value: "magic" },
        });
        expect(alternative.getByLabelText("Required rarity")).toHaveProperty("value", "normal");
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
        fireEvent.change(screen.getByLabelText("Saved project"), {
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
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "defences" } });
        fireEvent.click(button("Load project"));
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Base Armour: Not set");
        fireEvent.click(screen.getByText("Starting base defences"));
        fireEvent.change(screen.getByLabelText("Starting Base Armour"), {
            target: { value: String(range.min) },
        });
        expect(card.textContent).toContain(`Base Armour: ${range.min}`);
        fireEvent.click(button("Set maximum base defences"));
        expect(card.textContent).toContain(`Base Armour: ${range.max}`);
        fireEvent.change(screen.getByLabelText("Starting Base Armour"), {
            target: { value: String(range.min) },
        });
        fireEvent.click(screen.getByText("Base defence requirements"));
        fireEvent.click(button("Require Base Armour"));
        expect((screen.getByLabelText("Minimum Base Armour") as HTMLInputElement).value).toBe(
            String(range.max),
        );
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: "Sacred Orb" } });
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
        fireEvent.change(screen.getByLabelText("Saved project"), {
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
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
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
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "defences" } });
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
        const data =
            game === "poe1"
                ? catalog
                : craftingCatalogSchema.parse(
                      JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
                  );
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
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "exclusion" },
        });
        fireEvent.click(button("Load project"));
        const requirements = within(screen.getByRole("region", { name: "Crafting requirements" }));
        fireEvent.click(requirements.getByRole("checkbox", { name: "Exclude matches in group 1" }));
        expect(requirements.getByText(/all selected modifiers must be absent/)).toBeDefined();
        fireEvent.change(requirements.getByLabelText("Group 1 match threshold"), {
            target: { value: "2" },
        });
        expect(requirements.getByText(/Passes when fewer than 2/)).toBeDefined();
        expect(screen.getByRole("option", { name: "Group 1 (exclude matches)" })).toBeDefined();
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
        fireEvent.change(screen.getByLabelText("Saved project"), {
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

    it.each([
        false,
        true,
    ])("recombines an inventory donor and preserves spending, history and saves (advanced inputs: %s)", async (advanced) => {
        const left = engine.addStartingMod(
            engine.createItem(baseId),
            "IncreasedLife1",
            seededRandom(42),
        );
        left.rarity = "magic";
        const suffix = engine
            .pool({ ...engine.createItem(baseId), rarity: "rare" })
            .find((entry) => entry.mod.generation_type === "suffix")!.id;
        const donor = {
            id: "recombine-donor",
            name: "Suffix donor",
            item: engine.addStartingMod(engine.createItem(baseId), suffix, seededRandom(42)),
        };
        if (advanced) {
            left.influences = [0];
            left.memoryStrands = 82;
            donor.item.mods[0]!.fractured = true;
            donor.item.memoryStrands = 22;
        }
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: left,
            method: currency("reroll_mod_values"),
            target: { groups: [{ mods: ["IncreasedLife1"] }, { mods: [suffix] }] },
            steps: [],
            inventory: [donor],
            prices: { "service:recombine": 2, "donor:recombine-donor": 4 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ recombination: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "recombination" },
        });
        fireEvent.click(button("Load project"));
        const choose = async (name: string, label: string) => {
            const picker = screen.getByRole("combobox", { name });
            fireEvent.change(picker, { target: { value: label } });
            fireEvent.keyDown(picker, { key: "ArrowDown" });
            fireEvent.click(await screen.findByRole("option", { name: label }));
        };
        await choose("Crafting method", "Recombine items");
        await choose("Recombination donor", donor.name);
        expect(screen.getByRole("region", { name: "Recombination model" }).textContent).toContain(
            "inventory snapshots remain reusable",
        );
        fireEvent.click(button("Calculate odds"));
        expect(screen.queryByRole("alert")).toBeNull();
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method).toEqual({ kind: "recombine", id: "recombine", donor });
        expect(sent.target.groups).toEqual(project.target.groups);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByLabelText("Rarity")).toHaveProperty("value", "rare");
        expect(screen.getByText("Emulator spending")).toBeDefined();
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.method.donor).toEqual(donor);
        expect(saved.inventory).toEqual([donor]);
        expect(saved.item.rarity).toBe("rare");
        if (advanced) {
            expect(saved.item.memoryStrands).toBe(saved.item.influences.length ? 82 : 22);
            if (saved.item.influences.length)
                expect(saved.item.mods.every((mod: { fractured: boolean }) => !mod.fractured)).toBe(
                    true,
                );
        }
        fireEvent.click(button("Undo"));
        expect(screen.getByLabelText("Rarity")).toHaveProperty("value", "magic");
        if (advanced) expect(screen.getByLabelText("Memory strands")).toHaveProperty("value", "82");
        expect(screen.queryByText("Emulator spending")).toBeNull();
        fireEvent.click(button("Redo"));
        expect(screen.getByLabelText("Rarity")).toHaveProperty("value", "rare");
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("combobox", { name: "Recombination donor" })).toHaveProperty(
            "value",
            donor.name,
        );
    });

    it("sets up a Blight-ravaged map, selects repeated oils and retains targets, costs and history", async () => {
        const map = catalog.crafting.maps.find(
            (entry) => catalog.bases[entry.id]?.name === "Beach Map",
        )!;
        const blight = catalog.crafting.anointing.maps.find((entry) => entry.ravaged)!;
        const recipe = catalog.crafting.anointing.recipes.find(
            (entry) => entry.type === "InfectedMap",
        )!;
        const oil = recipe.items[0]!;
        const stat = catalog.mods[recipe.mod!]!.stats.find((entry) =>
            entry.id.includes("pack_size"),
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: engine.createItem(map.id),
            method: { kind: "anoint", id: recipe.id },
            target: { groups: [], stats: [{ id: stat.id, scope: "all", min: stat.min * 3 }] },
            steps: [],
            prices: { [oil]: 2 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ blight: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "blight" } });
        fireEvent.click(button("Load project"));
        const choose = async (name: string, label: string) => {
            const picker = screen.getByRole("combobox", { name });
            fireEvent.change(picker, { target: { value: label } });
            fireEvent.keyDown(picker, { key: "ArrowDown" });
            fireEvent.click(await screen.findByRole("option", { name: label }));
        };
        await choose("Blight map type", "Blight-ravaged map");
        await choose("Add map oil", engine.costName(oil));
        await choose("Add map oil", engine.costName(oil));
        expect(
            within(screen.getByRole("group", { name: "Map oil selection" })).getByText(
                `Oil 3: ${engine.costName(oil)}`,
            ),
        ).toBeDefined();
        fireEvent.click(button("Calculate odds"));
        expect(screen.queryByRole("alert")).toBeNull();
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.item.blight).toBe(blight.mod);
        expect(sent.method.additional).toEqual([recipe.id, recipe.id]);
        expect(sent.target.stats).toEqual(project.target.stats);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Can be Anointed up to 9 times");
        expect(card.textContent).toContain("Area level 85");
        expect(card.textContent).toContain("× 3");
        expect(screen.getByText("Emulator spending")).toBeDefined();
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.anointments).toEqual([recipe.id, recipe.id, recipe.id]);
        expect(saved.item.blight).toBe(blight.mod);
        expect(saved.method.additional).toEqual([recipe.id, recipe.id]);
        fireEvent.click(button("Undo"));
        expect(card.textContent).not.toContain("× 3");
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain("× 3");
        fireEvent.click(button("Remove oil 2"));
        expect(screen.queryByRole("button", { name: "Remove oil 3" })).toBeNull();
        await choose("Blight map type", "Ordinary map");
        expect(card.textContent).not.toContain("Can be Anointed");
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("× 3");
        expect(screen.getByRole("button", { name: "Remove oil 3" })).toBeDefined();
    });

    it("converts an occupied glove socket, targets the Jewel socket and retains it through history and saves", async () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const current = new CraftingEngine(data);
        const rune = "Metadata/Items/SoulCores/RuneFire";
        const conversion = data.crafting.augments.find(
            (entry) => entry.name === "Cadigan's Epiphany",
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item: {
                ...current.createItem("Metadata/Items/Armours/Gloves/FourGlovesStr1"),
                sockets: 1,
                augments: [rune],
            },
            method: { kind: "augment", id: rune },
            target: { groups: [] },
            steps: [],
            prices: { [conversion.id]: 7 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ conversion: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "conversion" },
        });
        fireEvent.click(button("Load project"));
        const choose = async (name: string, query: string, label: string) => {
            const picker = screen.getByRole("combobox", { name });
            fireEvent.change(picker, { target: { value: query } });
            fireEvent.keyDown(picker, { key: "ArrowDown" });
            fireEvent.click(await screen.findByRole("option", { name: label }));
        };
        await choose("Crafting method", "Cadigan", "Socket · Cadigan's Epiphany");
        expect(screen.getByRole("note", { name: "Jewel socket conversion" }).textContent).toContain(
            "socket-bound",
        );
        await choose("Augment destination", "Replace socket 1", "Replace socket 1 · Desert Rune");
        const requirement = within(screen.getByRole("group", { name: "Jewel socket requirement" }));
        fireEvent.click(requirement.getByRole("button", { name: "Present" }));
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method).toEqual({ kind: "augment", id: conversion.id, replace: 0 });
        expect(sent.target.jewelSocket).toBe(true);
        expect(sent.prices[conversion.id]).toBe(7);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Jewel sockets: 1 · Cadigan's Epiphany");
        expect(card.textContent).toContain("Augment sockets: 0");
        expect(card.textContent).not.toContain("Desert Rune");
        expect(screen.queryByRole("spinbutton", { name: "Augment sockets" })).toBeNull();
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Cadigan's Epiphany1",
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("Desert Rune");
        expect(card.textContent).not.toContain("Jewel sockets");
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain("Jewel sockets: 1");
        fireEvent.change(screen.getByLabelText("Project name"), {
            target: { value: "Jewel socket" },
        });
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["Jewel socket"];
        expect(saved.item).toEqual({
            ...project.item,
            sockets: 0,
            augments: [],
            jewelSocket: conversion.id,
        });
        expect(saved.target.jewelSocket).toBe(true);
        expect(current.validateItem(saved.item)).toEqual(saved.item);
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "Jewel socket" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Jewel sockets: 1");
        fireEvent.click(button("Apply craft"));
        expect(screen.getByRole("alert").textContent).toContain("converted Jewel socket");
        expect(card.textContent).toContain("Jewel sockets: 1");
    });

    it("sockets an inventory Jewel, targets its presence and preserves independent contents through saves and history", async () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const current = new CraftingEngine(data);
        const conversion = data.crafting.augments.find(
            (entry) => entry.name === "Cadigan's Epiphany",
        )!;
        const host = current.apply(
            { ...current.createItem("Metadata/Items/Armours/Gloves/FourGlovesStr1"), sockets: 1 },
            { kind: "augment", id: conversion.id },
            seededRandom(42),
        ).item;
        const jewelBase = Object.entries(data.bases).find(([, base]) => base.name === "Ruby")![0];
        const blank = { ...current.createItem(jewelBase), rarity: "rare" as const };
        const jewel = current.addStartingMod(blank, current.pool(blank)[0]!.id, seededRandom(42));
        const entry = { id: "ruby", name: "Crafted Ruby", item: jewel, tab: "Jewels" };
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item: host,
            method: { kind: "remove_jewel", id: "remove_jewel" },
            target: { groups: [] },
            inventory: [entry],
            inventoryTabs: ["Jewels"],
            steps: [],
            prices: {},
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ jewel: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "jewel" } });
        fireEvent.click(button("Load project"));
        const choose = async (name: string, label: string) => {
            const picker = screen.getByRole("combobox", { name });
            fireEvent.change(picker, { target: { value: label } });
            fireEvent.keyDown(picker, { key: "ArrowDown" });
            fireEvent.click(await screen.findByRole("option", { name: label }));
        };
        await choose("Crafting method", "Socket inventory Jewel");
        await choose("Jewel from inventory", entry.name);
        fireEvent.click(
            within(screen.getByRole("group", { name: "Socketed Jewel requirement" })).getByRole(
                "button",
                { name: "Present" },
            ),
        );
        fireEvent.click(button("Calculate odds"));
        expect(screen.queryByRole("alert")).toBeNull();
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method).toEqual({ kind: "socket_jewel", id: "socket_jewel", jewel: entry });
        expect(sent.target.socketedJewel).toBe(true);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByRole("region", { name: "Socketed Jewel" }).textContent).toContain(
            "Ruby",
        );
        fireEvent.click(screen.getByText("Item inventory (1)"));
        fireEvent.change(screen.getByLabelText("Inventory tab"), { target: { value: "Jewels" } });
        fireEvent.click(button("Store socketed Jewel"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual({ ...host, socketedJewel: jewel });
        expect(saved.inventory).toHaveLength(2);
        expect(saved.inventory[0]).toEqual(entry);
        expect(saved.inventory[1].item).toEqual(jewel);
        expect(saved.inventory[1].tab).toBe("Jewels");
        expect(saved.target.socketedJewel).toBe(true);
        expect(current.validateItem(saved.item)).toEqual(saved.item);
        fireEvent.click(button("Undo"));
        expect(screen.queryByRole("region", { name: "Socketed Jewel" })).toBeNull();
        fireEvent.click(button("Redo"));
        expect(screen.getByRole("region", { name: "Socketed Jewel" })).toBeDefined();
        await choose("Crafting method", "Remove socketed Jewel");
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("region", { name: "Socketed Jewel" })).toBeNull();
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain(
            "Jewel sockets: 1",
        );
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("region", { name: "Socketed Jewel" }).textContent).toContain(
            "Ruby",
        );
        fireEvent.click(button("Load Ruby"));
        expect(screen.queryByRole("region", { name: "Socketed Jewel" })).toBeNull();
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain("Ruby");
    });

    it("selects the metamod beastcraft, guarantees suffix protection and preserves it through saves", async () => {
        let item: CraftingItem = {
            ...engine.createItem(baseId),
            rarity: "rare",
            memoryStrands: 82,
        };
        for (const id of ["FireResist1", "ColdResist1", "LightningResist1"])
            item = engine.addStartingMod(item, id, seededRandom(1));
        const recipe = catalog.crafting.beasts.find((entry) => entry.metamods.length)!;
        const lock = recipe.metamods.find((id) => engine.mod(id).generation_type === "prefix")!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: catalog.game,
            patch: catalog.patch,
            item,
            method: currency("add_mod_to_rare"),
            target: { groups: [{ mods: [lock] }] },
            steps: [],
            prices: { [recipe.id]: 7 },
            seed: 42,
            iterations: 100,
            maxActions: 2,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ matron: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "matron" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: "Meta-modifier" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(
            await screen.findByRole("option", {
                name: `Beastcraft · ${recipe.category}: ${recipe.description}`,
            }),
        );
        expect(
            screen.getByRole("note", { name: "Metamod beastcraft model" }).textContent,
        ).toContain("equal modeled chance");
        expect(screen.queryByLabelText("Beast level")).toBeNull();
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method).toEqual({ kind: "beast", id: recipe.id });
        expect(engine.beastMetamodPool(sent.item, recipe.id).map((entry) => entry.id)).toEqual([
            lock,
        ]);
        expect(sent.prices[recipe.id]).toBe(7);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Suffixes Cannot Be Changed");
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.mods.slice(0, 3)).toEqual(item.mods);
        expect(saved.item.mods[3]).toMatchObject({ id: lock, crafted: true });
        expect(saved.item.memoryStrands).toBe(82);
        fireEvent.click(screen.getByText("Emulator spending"));
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${recipe.description}1`,
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).not.toContain("Suffixes Cannot Be Changed");
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain("Suffixes Cannot Be Changed");
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Suffixes Cannot Be Changed");
        fireEvent.click(button("Apply craft"));
        expect(screen.getByRole("alert").textContent).toContain(
            "Remove existing crafted modifiers",
        );
        expect(card.textContent).toContain("Suffixes Cannot Be Changed");
    });

    it.each([
        { base: baseId, influences: [0], recipe: "EinharMasterCraft42" },
        {
            base: "Metadata/Items/Maps/MapAtlasBeach",
            influences: [],
            recipe: "EinharMasterCraft49",
        },
    ])("selects $recipe and retains its result through history and project saves", async ({
        base,
        influences,
        recipe,
    }) => {
        const item = { ...engine.createItem(base), rarity: "rare" as const, influences };
        const project = craftingProjectSchema.parse({
            format: 1,
            game: catalog.game,
            patch: catalog.patch,
            item,
            method: currency("add_mod_to_rare"),
            target: { groups: [], affixCount: { min: 1, max: 1 } },
            steps: [],
            prices: { [recipe]: 5 },
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ beast: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "beast" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: "Add a Mod to" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        const extracted = catalog.crafting.beasts.find((entry) => entry.id === recipe)!;
        fireEvent.click(
            await screen.findByRole("option", {
                name: `Beastcraft · ${extracted.category}: ${extracted.description}`,
            }),
        );
        expect(
            screen.getByRole("note", { name: "Augmentation beastcraft model" }).textContent,
        ).toContain("item's level");
        expect(screen.queryByLabelText("Beast level")).toBeNull();
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method).toEqual({ kind: "beast", id: recipe });
        expect(sent.prices[recipe]).toBe(5);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        const result = card.textContent;
        expect(result).toContain("0/3 prefixes · 1/3 suffixes");
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.mods).toHaveLength(1);
        expect(saved.method).toEqual({ kind: "beast", id: recipe });
        fireEvent.click(screen.getByText("Emulator spending"));
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${extracted.description}1`,
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).not.toBe(result);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(result);
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(result);
    });

    it.each([
        false,
        true,
    ])("selects Abyss essence, replaces its Mark (fractured: %s), and retains the reveal floor through Echoes and saves", async (fractured) => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const crafting = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, entry]) => entry.name === "Golden Hoop",
        )![0];
        const item = crafting.addStartingMod(
            crafting.createItem(base),
            "IncreasedLife1",
            seededRandom(1),
        );
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            method: { kind: "currency", id: "Metadata/Items/Currency/AbyssalBenchTicketJewellery" },
            target: { groups: [], unrevealedCount: { min: 1, max: 1 } },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 3,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ abyss: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "abyss" } });
        fireEvent.click(button("Load project"));
        const select = async (name: string) => {
            const picker = screen.getByRole("combobox", { name: "Crafting method" });
            fireEvent.change(picker, { target: { value: name } });
            fireEvent.keyDown(picker, { key: "ArrowDown" });
            fireEvent.click(await screen.findByRole("option", { name }));
        };
        await select("Essence of the Abyss");
        expect(screen.getByRole("region", { name: "Abyssal Mark model" }).textContent).toContain(
            "not extracted",
        );
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Bears the Mark of the Abyssal Lord");
        if (fractured) fireEvent.click(within(card).getByRole("button", { name: "Fracture" }));
        const beforeBone = card.textContent;
        fireEvent.click(button("Save project"));
        const marked = JSON.parse(localStorage.getItem(key)!)["My crafting project"].item;
        expect(marked.mods[0].crafted).toBe(true);
        expect(marked.mods[0].fractured).toBe(fractured);
        await select("Preserved Collarbone");
        fireEvent.click(screen.getByRole("checkbox", { name: /^Omen of Sinistral Necromancy/ }));
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.item).toEqual(marked);
        expect(sent.target.unrevealedCount).toEqual({ min: 1, max: 1 });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).not.toContain("Bears the Mark");
        expect(within(card).queryByRole("button", { name: "Unfracture" })).toBeNull();
        const afterBone = card.textContent;
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(beforeBone);
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).not.toContain(
            "Preserved Collarbone1",
        );
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(afterBone);
        expect(screen.getByLabelText("Abyssal Mark reveal").textContent).toContain(
            "Minimum modifier level: 34",
        );
        expect(screen.getByRole("region", { name: "Reveal modifier" }).textContent).toContain(
            "80%, 15% or 5% probability",
        );
        fireEvent.click(button("Reveal with Omen of Abyssal Echoes"));
        fireEvent.click(button("Reroll reveal choices"));
        fireEvent.click(screen.getByText("Emulator spending"));
        const spending = screen.getByText("Emulator spending").closest("details")!;
        expect(spending.textContent).toContain("Essence of the Abyss1");
        expect(spending.textContent).toContain("Preserved Collarbone1");
        expect(spending.textContent).toContain("Omen of Abyssal Echoes1");
        expect(spending.textContent).not.toContain("Omen of Sinistral Necromancy");
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.reveal.mark).toBe(marked.mods[0].id);
        expect(saved.item.reveal.echoes.remaining).toBe(0);
        expect(crafting.mod(saved.item.reveal.choices[0]).domain).toBe("desecrated");
        expect(
            saved.item.reveal.choices.every((id: string) => crafting.mod(id).required_level >= 34),
        ).toBe(true);
        fireEvent.click(button("Undo"));
        expect(button("Reroll reveal choices").hasAttribute("disabled")).toBe(false);
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(button("Reroll reveal choices").hasAttribute("disabled")).toBe(true);
        expect(screen.getByLabelText("Abyssal Mark reveal").textContent).toContain(
            "Minimum modifier level: 34",
        );
        fireEvent.click(
            within(screen.getByRole("region", { name: "Reveal modifier" })).getByRole("button", {
                name: /^1\./,
            }),
        );
        expect(screen.queryByRole("region", { name: "Reveal modifier" })).toBeNull();
        expect(card.textContent).toContain("desecrated");
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.click(button("Undo"));
        expect(screen.getByLabelText("Abyssal Mark reveal")).toBeDefined();
        fireEvent.click(button("Redo"));
        expect(screen.queryByLabelText("Abyssal Mark reveal")).toBeNull();
    });

    it("selects Talisman recipes, restores strand checkpoints and retains double fractures", async () => {
        let item: CraftingItem = {
            ...engine.createItem("Metadata/Items/Amulets/Talismans/Talisman1_2"),
            rarity: "rare",
            memoryStrands: 82,
        };
        while (item.mods.length < 6)
            item = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(1));
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: { kind: "beast", id: "EinharMasterCraft32" },
            target: {
                groups: item.mods
                    .slice(0, 2)
                    .map((entry) => ({ mods: [entry.id], fractured: true })),
            },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ talisman: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "talisman" } });
        fireEvent.click(button("Load project"));
        const select = async (name: string) => {
            const picker = screen.getByRole("combobox", { name: "Crafting method" });
            fireEvent.change(picker, { target: { value: name } });
            fireEvent.keyDown(picker, { key: "ArrowDown" });
            fireEvent.click(await screen.findByRole("option", { name }));
        };
        await select("Beastcraft · Create an Imprint: Of a Rare Talisman");
        expect(
            screen.getByRole("note", { name: "Talisman beastcraft model" }).textContent,
        ).toContain("Memory Strands");
        fireEvent.click(button("Apply craft"));
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Imprint stored · rare · 6 modifiers");
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item.imprint).toEqual(
            item,
        );
        await select("Orb of Annulment");
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        await select("Imprint");
        fireEvent.click(button("Apply craft"));
        expect(card.textContent).not.toContain("Imprint stored");
        expect(card.textContent).toContain("Memory Strands: 82");
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item).toEqual(item);
        await select(
            "Beastcraft · Fracture two Modifers: On a Rare Talisman with at least 6 modifiers",
        );
        fireEvent.click(button("Calculate odds"));
        const request = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0];
        expect(request.project.method).toEqual({ kind: "beast", id: "EinharMasterCraftMorrigan6" });
        expect(
            request.project.target.groups.every(
                (group: { fractured?: boolean }) => group.fractured,
            ),
        ).toBe(true);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"]
            .item as CraftingItem;
        expect(saved.mods.filter((entry) => entry.fractured)).toHaveLength(2);
        expect(saved.memoryStrands).toBe(82);
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Fracture two Modifers",
        );
        fireEvent.click(button("Undo"));
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item).toEqual(item);
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item).toEqual(saved);
        fireEvent.click(button("Apply craft"));
        expect(screen.getByRole("alert").textContent).toContain("fractured");
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain("Memory Strands: 82");
    });

    it("selects Tainted Jeweller's Orbs and retains socket targets, spending and history", async () => {
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: { ...engine.createItem(baseId), corrupted: true, sockets: 5 },
            method: currency("reroll_socket_numbers_hellscape"),
            target: { groups: [], sockets: { min: 6, max: 6 } },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ sockets: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "sockets" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: "Tainted Jeweller" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Tainted Jeweller's Orb" }));
        expect(screen.getByRole("note", { name: "Tainted Jeweller model" }).textContent).toContain(
            "maximum of 6",
        );
        fireEvent.click(button("Calculate odds"));
        const request = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0];
        expect(request.project.target.sockets).toEqual({ min: 6, max: 6 });
        expect(request.project.method).toEqual(project.method);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Gem sockets: 4");
        expect(card.textContent).toContain("Corrupted");
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Tainted Jeweller's Orb1",
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("Gem sockets: 5");
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain("Gem sockets: 4");
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item.sockets).toBe(4);
        fireEvent.change(screen.getByRole("spinbutton", { name: "Gem sockets" }), {
            target: { value: "6" },
        });
        fireEvent.click(button("Apply craft"));
        expect(screen.getByRole("alert").textContent).toContain("maximum sockets");
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Gem sockets: 4");
    });

    it.each([
        ["reroll_rare_hellscape", "Tainted Chaos Orb", "Tainted Chaos model", 0],
        ["add_mod_to_rare_hellscape", "Tainted Exalted Orb", "Tainted Exalted model", 3],
        ["upgrade_mod_tier_hellscape", "Tainted Divine Teardrop", "Tainted Divine model", 4],
    ] as const)("selects %s and retains corrupted outcomes, costs, targets, history and saves", async (action, name, note, count) => {
        let item: CraftingItem = {
            ...engine.createItem(baseId),
            rarity: "rare",
            corrupted: true,
            sockets: 6,
        };
        while (item.mods.length < 4)
            item = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(1));
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: currency(action),
            target: { groups: [], affixCount: { min: count, max: count } },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ tainted: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "tainted" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name }));
        expect(screen.getByRole("note", { name: note })).toBeDefined();
        fireEvent.click(button("Calculate odds"));
        const request = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0];
        expect(request.project.method).toEqual(project.method);
        expect(request.project.target.affixCount).toEqual({ min: count, max: count });
        expect(request.project.item.corrupted).toBe(true);
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const after = card.textContent;
        expect(after).toContain("Corrupted");
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${name}1`,
        );
        if (count === 0) {
            expect(after).toContain("No explicit modifiers");
            fireEvent.click(button("Apply craft"));
            expect(screen.getByRole("alert").textContent).toContain("rare item");
            expect(card.textContent).toBe(after);
        }
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.mods).toHaveLength(count);
        expect(saved.item.rarity).toBe(count === 0 ? "normal" : "rare");
        expect(saved.item.sockets).toBe(6);
        expect(saved.item.corrupted).toBe(true);
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
    });

    it("fractures PoE 2 crafted modifiers and retains their slot, targets, spending, history and saves", async () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const engine = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(([, entry]) => entry.name === "Ruby Ring")![0];
        const essence = data.crafting.poe2Essences.find(
            (entry) => entry.name === "Essence of the Breach",
        )!;
        const fracture = data.crafting.currencies.find(
            (entry) => entry.action === "fracture_random_mod",
        )!;
        let item = engine.addStartingMod(
            { ...engine.createItem(base), rarity: "rare" },
            essence.rules[0]!.mod!,
            seededRandom(1),
            "essence",
        );
        while (item.mods.length < 4)
            item = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(1));
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            method: { kind: "currency", id: fracture.id },
            target: { groups: [{ mods: [item.mods[0]!.id], fractured: true }] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ fracture: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "fracture" } });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("note", { name: "Fracturing model" }).textContent).toContain(
            "still occupy a crafted slot",
        );
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.item.mods[0].crafted).toBe(true);
        expect(sent.target.groups[0].fractured).toBe(true);
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        const craftedRow = within(card)
            .getByText(/crafted$/)
            .closest("li")!;
        fireEvent.click(within(craftedRow).getByRole("button", { name: "Fracture" }));
        expect(craftedRow.textContent).toContain("crafted · fractured");
        fireEvent.click(within(craftedRow).getByRole("button", { name: "Unfracture" }));
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const after = card.textContent;
        expect(within(card).getAllByRole("button", { name: "Unfracture" })).toHaveLength(1);
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Fracturing Orb1",
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.mods[0].crafted).toBe(true);
        expect(
            saved.item.mods.filter((entry: { fractured: boolean }) => entry.fractured),
        ).toHaveLength(1);
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
    });

    it.each([
        false,
        true,
    ])("selects socket-count bench recipes with corruption=%s and retains targets, spending, history and saves", async (corrupted) => {
        const recipe = catalog.crafting.bench.find((entry) => entry.socketCount === 6)!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: { ...engine.createItem(baseId, 1), corrupted },
            method: { kind: "bench", id: recipe.id },
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ sockets: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "sockets" } });
        fireEvent.click(button("Load project"));
        const count = screen.getByRole("spinbutton", { name: "Gem sockets" }) as HTMLInputElement;
        fireEvent.click(screen.getByText("Custom prices in chaos"));
        expect(screen.getByRole("spinbutton", { name: "Vaal Orb" })).toBeDefined();
        expect(count.max).toBe("6");
        fireEvent.change(count, { target: { value: "2" } });
        fireEvent.click(screen.getByText("Socket requirement"));
        fireEvent.click(button("Add socket requirement"));
        fireEvent.change(screen.getByRole("spinbutton", { name: "Minimum gem sockets" }), {
            target: { value: "6" },
        });
        fireEvent.click(button("Calculate odds"));
        expect(screen.queryByRole("alert")).toBeNull();
        const request = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0];
        expect(request.project.item.sockets).toBe(2);
        expect(request.project.target.sockets).toEqual({ min: 6, max: 6 });
        fireEvent.click(button("Stop simulation"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: "Six Sockets" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Bench · Six Sockets" }));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Gem sockets: 6");
        expect(count.value).toBe("6");
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Jeweller's Orb350",
        );
        const spending = screen.getByText("Emulator spending").closest("details")!.textContent;
        if (corrupted) expect(spending).toContain("Vaal Orb350");
        else expect(spending).not.toContain("Vaal Orb350");
        fireEvent.click(button("Undo"));
        expect(count.value).toBe("2");
        fireEvent.click(button("Redo"));
        expect(count.value).toBe("6");
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.sockets).toBe(6);
        expect(saved.item.corrupted).toBe(corrupted);
        expect(saved.target.sockets).toEqual({ min: 6, max: 6 });
        fireEvent.change(count, { target: { value: "0" } });
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(count.value).toBe("6");
    });

    it("selects the maximum-socket beastcraft and retains calculation, costs, history and saves", async () => {
        const recipe = catalog.crafting.beasts.find((entry) => entry.maximumSockets)!;
        const method = { kind: "beast" as const, id: recipe.id };
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: { ...engine.createItem(baseId, 1), sockets: 2, memoryStrands: 82, quality: 20 },
            method: currency("transmute_to_magic"),
            target: { groups: [] },
            steps: [],
            prices: { [recipe.id]: 4 },
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ beastSockets: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "beastSockets" },
        });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: recipe.description } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(
            await screen.findByRole("option", {
                name: `Beastcraft · ${engine.methodName(method)}`,
            }),
        );
        expect(screen.getByLabelText("Socket beastcraft model").textContent).toContain(
            "full capacity",
        );
        expect(screen.queryByRole("spinbutton", { name: "Beast level" })).toBeNull();
        fireEvent.click(screen.getByText("Socket requirement"));
        fireEvent.click(button("Add socket requirement"));
        fireEvent.change(screen.getByRole("spinbutton", { name: "Minimum gem sockets" }), {
            target: { value: "6" },
        });
        fireEvent.click(button("Calculate odds"));
        expect(screen.queryByRole("alert")).toBeNull();
        const request = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0];
        expect(request.project.method).toEqual(method);
        expect(request.project.target.sockets).toEqual({ min: 6, max: 6 });
        expect(request.project.prices[recipe.id]).toBe(4);
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain("Gem sockets: 6");
        expect(card.textContent).toContain("Memory Strands: 82");
        const after = card.textContent;
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${engine.methodName(method)}1`,
        );
        fireEvent.click(button("Apply craft"));
        expect(screen.getByRole("alert").textContent).toContain("already has the maximum");
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.method).toEqual(method);
        expect(saved.item).toEqual({ ...project.item, sockets: 6 });
        expect(saved.target.sockets).toEqual({ min: 6, max: 6 });
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
    });

    it("selects flask enchantment recipes, calculates targets and retains costs, history and saves", async () => {
        const base = Object.entries(catalog.bases).find(
            ([, entry]) => entry.name === "Quicksilver Flask" && !entry.corrupted,
        )![0];
        const recipe = catalog.crafting.bench.find(
            (entry) => entry.enchantment?.mod === "FlaskEnchantmentInjectorOnFullCharges__",
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: { ...engine.createItem(base), quality: 20 },
            method: currency("add_flask_injector"),
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ flask: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "flask" } });
        fireEvent.click(button("Load project"));
        expect(screen.getByText(/one of 15 eligible outcomes/)).toBeDefined();
        fireEvent.click(screen.getByText("Enchantment requirement"));
        const targetPicker = screen.getByRole("combobox", { name: "Require enchantment" });
        fireEvent.change(targetPicker, { target: { value: "Charges reach full" } });
        fireEvent.keyDown(targetPicker, { key: "ArrowDown" });
        fireEvent.click(
            await screen.findByRole("option", { name: /Used when Charges reach full/ }),
        );
        fireEvent.click(button("Calculate odds"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(
            CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project.target.enchantments,
        ).toEqual([recipe.enchantment!.mod]);
        fireEvent.click(button("Stop simulation"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: "Bench Charges reach full" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(
            await screen.findByRole("option", {
                name: `Bench · ${engine.methodName({ kind: "bench", id: recipe.id })}`,
            }),
        );
        expect(screen.getByRole("region", { name: "Bench enchantment" }).textContent).toContain(
            "Used when Charges reach full",
        );
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Used when Charges reach full");
        expect(card.textContent).toContain("Quality: +20%");
        const spending = screen.getByText("Emulator spending").closest("details")!;
        expect(spending.textContent).toContain("Instilling Orb5");
        expect(spending.textContent).toContain("Glassblower's Bauble5");
        fireEvent.click(button("Undo"));
        expect(card.textContent).not.toContain("Used when Charges reach full");
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.enchantments[0].id).toBe(recipe.enchantment!.mod);
        expect(saved.target.enchantments).toEqual([recipe.enchantment!.mod]);
        fireEvent.change(picker, { target: { value: "Remove Enchantments" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Bench · Remove Enchantments" }));
        fireEvent.click(button("Apply craft"));
        expect(card.textContent).not.toContain("Used when Charges reach full");
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Used when Charges reach full");
    });

    it("uses the Rune quality maximum for controls, targets, spending and saved items", async () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const current = new CraftingEngine(data);
        const rune = data.crafting.augments.find(
            (entry) => entry.name === "Legacy of Serle's Grit",
        )!;
        const base = Object.keys(data.bases).find(
            (id) =>
                data.bases[id]!.item_class === "One Hand Mace" && !data.bases[id]!.implicits.length,
        )!;
        const item = current.addStartingMod(
            current.createItem(base),
            "AlloyEffectOfSocketedAugments1",
            seededRandom(42),
            "essence",
        );
        item.mods[0]!.values = [30];
        const recipe = data.crafting.baseQuality.find(
            (entry) => !entry.corrupted && entry.itemClasses.includes("One Hand Mace"),
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item: { ...item, sockets: 1, quality: 51 },
            method: { kind: "augment", id: rune.id },
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ serle: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "serle" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Maximum Quality is 52%");
        expect(
            screen.getByRole("spinbutton", { name: "Base quality (%)" }).getAttribute("max"),
        ).toBe("62");
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: current.costName(recipe.id) } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: current.costName(recipe.id) }));
        expect(screen.getByRole("region", { name: "Base quality model" }).textContent).toContain(
            "up to 52%",
        );
        fireEvent.click(screen.getByText("Base quality requirement"));
        fireEvent.click(button("Add quality requirement"));
        fireEvent.change(screen.getByRole("spinbutton", { name: "Maximum base quality (%)" }), {
            target: { value: "52" },
        });
        fireEvent.click(button("Calculate odds"));
        expect(
            CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project.target.quality,
        ).toEqual({ min: 52, max: 52 });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const quality = screen.getByRole("spinbutton", {
            name: "Base quality (%)",
        }) as HTMLInputElement;
        expect(quality.value).toBe("52");
        fireEvent.click(button("Undo"));
        expect(quality.value).toBe("51");
        fireEvent.click(button("Redo"));
        expect(quality.value).toBe("52");
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.quality).toBe(52);
        expect(saved.item.augments).toEqual([rune.id]);
        expect(saved.target.quality).toEqual({ min: 52, max: 52 });
        expect(current.validateItem(saved.item)).toEqual(saved.item);
        const spending = screen.getByText("Emulator spending").closest("details")!.textContent;
        expect(spending).toContain(`${rune.name}1`);
        expect(spending).toContain(`${current.costName(recipe.id)}1`);
    });

    it("selects an occupied Rune socket for Masterwork upgrades and preserves the result and spending", async () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const current = new CraftingEngine(data);
        const id = (suffix: string) => `Metadata/Items/SoulCores/${suffix}`;
        const masterwork = data.crafting.augments.find(
            (entry) => entry.name === "Masterwork Rune",
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item: {
                ...current.createItem("Metadata/Items/Armours/BodyArmours/FourBodyStr1"),
                sockets: 2,
                augments: [id("TalismanRabbit"), id("RuneFireGreater")],
            },
            method: { kind: "augment", id: id("RuneFire") },
            target: { groups: [], stats: [{ id: "base_fire_damage_resistance_%", min: 22 }] },
            steps: [],
            prices: { [masterwork.id]: 4 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ upgrade: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "upgrade" } });
        fireEvent.click(button("Load project"));
        const choose = async (name: string, query: string, label: string) => {
            const picker = screen.getByRole("combobox", { name });
            fireEvent.change(picker, { target: { value: query } });
            fireEvent.keyDown(picker, { key: "ArrowDown" });
            fireEvent.click(await screen.findByRole("option", { name: label }));
        };
        await choose("Crafting method", "Masterwork Rune", "Upgrade · Masterwork Rune");
        expect(screen.queryByRole("combobox", { name: "Augment destination" })).toBeNull();
        await choose(
            "Rune socket to upgrade",
            "Socket 2",
            "Socket 2 · Greater Desert Rune → Perfect Desert Rune",
        );
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method).toEqual({ kind: "upgrade_augment", id: masterwork.id, socket: 1 });
        expect(sent.target).toEqual(project.target);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Socket 1 · Rabbit Idol");
        expect(card.textContent).toContain("Socket 2 · Perfect Desert Rune");
        expect(card.textContent).toContain("+22% to Fire Resistance");
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Masterwork Rune1",
        );
        expect(
            screen.getByText(
                "Socket a Rune with an available higher tier before applying this craft.",
            ),
        ).toBeTruthy();
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("Socket 2 · Greater Desert Rune");
        expect(
            screen.getByRole("combobox", { name: "Rune socket to upgrade" }).getAttribute("value"),
        ).toContain("Socket 2");
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain("Socket 2 · Perfect Desert Rune");
        fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "upgraded" } });
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!).upgraded;
        expect(saved.method).toEqual(sent.method);
        expect(saved.item.augments).toEqual([id("TalismanRabbit"), id("RuneFirePerfect")]);
        expect(current.validateItem(saved.item)).toEqual(saved.item);
        fireEvent.click(button("Apply craft"));
        expect(screen.getByRole("alert").textContent).toContain("no higher Rune tier");
        expect(card.textContent).toContain("Socket 2 · Perfect Desert Rune");
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Masterwork Rune1",
        );
    });

    it.each([
        {
            name: "Fox Idol",
            itemClass: "Body Armour",
            existing: "TalismanRabbit",
            stat: "gold_+%_from_enemies",
            min: 10,
            text: "Bonded: 10%",
            corrupted: false,
        },
        {
            name: "Legacy of Runeseeker's Call",
            itemClass: "Wand",
            existing: "RuneFire",
            stat: "non_skill_base_all_damage_%_to_gain_as_fire",
            min: 14,
            text: "14% of Damage as Extra Fire Damage",
            corrupted: true,
        },
    ])("applies $name interactions and preserves their displayed effects through history and saves", async (scenario) => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const current = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, base]) => base.item_class === scenario.itemClass && !base.implicits.length,
        )![0];
        const augment = data.crafting.augments.find((entry) => entry.name === scenario.name)!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item: {
                ...current.createItem(base),
                sockets: 2,
                corrupted: scenario.corrupted,
                augments: [`Metadata/Items/SoulCores/${scenario.existing}`],
            },
            method: { kind: "augment", id: augment.id },
            target: { groups: [], stats: [{ id: scenario.stat, min: scenario.min }] },
            steps: [],
            prices: { [augment.id]: 3 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ interaction: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "interaction" },
        });
        fireEvent.click(button("Load project"));
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method).toEqual(project.method);
        expect(sent.target).toEqual(project.target);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain(scenario.name);
        expect(card.textContent).toContain(scenario.text);
        fireEvent.click(button("Undo"));
        expect(card.textContent).not.toContain(scenario.text);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain(scenario.text);
        fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "result" } });
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!).result;
        expect(current.statTotals(current.validateItem(saved.item)).get(scenario.stat)).toBe(
            scenario.min,
        );
        expect(saved.item.augments).toEqual([...project.item.augments!, augment.id]);
    });

    it("explains an Atziri core's corruption odds and dispatches its socketed state", async () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const current = new CraftingEngine(data);
        const core = data.crafting.augments.find((entry) =>
            entry.id.endsWith("/SoulCoreSpecial30"),
        )!;
        const vaal = data.crafting.currencies.find((entry) => entry.action === "corrupt_item")!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item: {
                ...current.createItem("Metadata/Items/Armours/BodyArmours/FourBodyStr1", 86),
                sockets: 2,
            },
            method: { kind: "augment", id: core.id },
            target: { groups: [], sockets: { min: 3, max: 3 } },
            steps: [],
            prices: { [core.id]: 5, [vaal.id]: 2 },
            seed: 42,
            iterations: 1000,
            maxActions: 2,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ atziri: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "atziri" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: vaal.name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: vaal.name }));
        expect(
            screen.getByText(/A socketed augment removes the explicit no-change outcome/),
        ).toBeTruthy();
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.item.augments).toEqual([core.id]);
        expect(sent.method).toEqual({ kind: "currency", id: vaal.id });
        expect(sent.target.sockets).toEqual({ min: 3, max: 3 });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Undo"));
        expect(
            screen.queryByText(/A socketed augment removes the explicit no-change outcome/),
        ).toBeNull();
        fireEvent.click(button("Redo"));
        expect(
            screen.getByText(/A socketed augment removes the explicit no-change outcome/),
        ).toBeTruthy();
    });

    it("selects an Aldur rune and preserves duplicate conversion outcomes through history, worker dispatch and saves", async () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const current = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, base]) => base.item_class === "Wand" && !base.implicits.length,
        )![0];
        const item: CraftingItem = {
            ...current.createItem(base),
            rarity: "rare",
            sockets: 1,
            mods: ["SpellDamageGainedAsFire6", "SpellDamageGainedAsCold6"].map((id) =>
                current.rollMod(id, seededRandom(1)),
            ),
        };
        const rune = data.crafting.augments.find((entry) => entry.name === "Betrayal of Aldur")!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            method: { kind: "augment", id: "Metadata/Items/SoulCores/RuneFire" },
            target: {
                groups: [],
                stats: [{ id: "non_skill_base_all_damage_%_to_gain_as_chaos", min: 60 }],
            },
            steps: [],
            prices: { [rune.id]: 10 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ aldur: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "aldur" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: "Betrayal of Aldur" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Socket · Betrayal of Aldur" }));
        fireEvent.click(button("Calculate odds"));
        expect(CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project.method).toEqual({
            kind: "augment",
            id: rune.id,
        });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Betrayal of Aldur");
        expect(card.textContent?.match(/Damage as Extra Chaos Damage/g)).toHaveLength(2);
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("Damage as Extra Fire Damage");
        fireEvent.click(button("Redo"));
        expect(card.textContent?.match(/Damage as Extra Chaos Damage/g)).toHaveLength(2);
        fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "converted" } });
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!).converted;
        expect(saved.item.mods.map((entry: { id: string }) => entry.id)).toEqual([
            "ConvertedSpellDamageGainedAsChaos6",
            "ConvertedSpellDamageGainedAsChaos6",
        ]);
        expect(saved.item.mods.every((entry: { conversion?: unknown }) => entry.conversion)).toBe(
            true,
        );
        expect(current.validateItem(saved.item)).toEqual(saved.item);
    });

    it.each([
        "Metadata/Items/Armours/BodyArmours/FourBodyStr1",
        "Metadata/Items/Rings/FourRingB6",
    ])("sockets Serle's Triumph on %s, calculates a seventh affix and preserves history and saves", async (base) => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const current = new CraftingEngine(data);
        let item: CraftingItem = {
            ...current.createItem(base, 86),
            sockets: 1,
            rarity: "rare",
        };
        for (const side of ["prefix", "prefix", "prefix", "suffix", "suffix", "suffix"])
            item = current.addStartingMod(
                item,
                current.pool(item, { side })[0]!.id,
                seededRandom(1),
            );
        const rune = data.crafting.augments.find((entry) => entry.name === "Serle's Triumph")!;
        const exalt = data.crafting.currencies.find((entry) => entry.name === "Exalted Orb")!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            method: { kind: "augment", id: rune.id },
            target: { groups: [], affixCount: { min: 7, max: 7 } },
            steps: [],
            prices: { [rune.id]: 8, [exalt.id]: 2 },
            seed: 42,
            iterations: 1000,
            maxActions: 2,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ serle: project }));
        mount("calculate", data);
        if (data.bases[base]!.initialSockets) {
            const picker = screen.getByRole("combobox", { name: "Item base" });
            fireEvent.change(picker, { target: { value: "Grasping Ring" } });
            fireEvent.keyDown(picker, { key: "ArrowDown" });
            fireEvent.click(await screen.findByRole("option", { name: /Grasping Ring/ }));
            const sockets = screen.getByRole("spinbutton", {
                name: "Augment sockets",
            }) as HTMLInputElement;
            expect(sockets.value).toBe("1");
            expect(sockets.min).toBe("1");
            expect(sockets.max).toBe("1");
        }
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "serle" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(button("Apply craft"));
        const card = screen.getByRole("region", { name: "Current item" });
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain("3/4 suffixes");
        expect(card.textContent).toContain("Socket 1 · Serle's Triumph");
        fireEvent.click(screen.getByText("Item conditions"));
        expect(screen.getByLabelText("Maximum total affixes").getAttribute("max")).toBe("7");
        expect(
            screen.getByRole("combobox", { name: "Open affixes of either type" }).textContent,
        ).toContain("At least 7");
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: "Exalted Orb" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Exalted Orb" }));
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.item.augments).toEqual([rune.id]);
        expect(sent.target.affixCount).toEqual({ min: 7, max: 7 });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain("4/4 suffixes");
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("3/4 suffixes");
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain("4/4 suffixes");
        fireEvent.change(screen.getByLabelText("Project name"), {
            target: { value: "seven affixes" },
        });
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["seven affixes"];
        expect(saved.item.baseId).toBe(base);
        expect(saved.item.sockets).toBe(1);
        expect(saved.item.mods).toHaveLength(7);
        expect(saved.item.augments).toEqual([rune.id]);
    });

    it("selects socketable augments, calculates, replaces and preserves spending and history", async () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const localEngine = new CraftingEngine(data);
        const fire = data.crafting.augments.find((entry) => entry.name === "Desert Rune")!;
        const cold = data.crafting.augments.find((entry) => entry.name === "Glacial Rune")!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item: {
                ...localEngine.createItem("Metadata/Items/Armours/BodyArmours/FourBodyStr1", 86),
                sockets: 1,
            },
            method: { kind: "augment", id: fire.id },
            target: {
                groups: [],
                stats: [{ id: "base_fire_damage_resistance_%", scope: "all", min: 14 }],
            },
            steps: [],
            prices: { [fire.id]: 2, [cold.id]: 3 },
            seed: 42,
            iterations: 1000,
            maxActions: 2,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ augments: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "augments" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(button("Calculate odds"));
        expect(CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project.method).toEqual({
            kind: "augment",
            id: fire.id,
        });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Socket 1 · Desert Rune");
        expect(card.textContent).toContain("+14% to Fire Resistance");
        const choose = async (name: string, value: string) => {
            const picker = screen.getByRole("combobox", { name });
            fireEvent.change(picker, { target: { value } });
            fireEvent.keyDown(picker, { key: "ArrowDown" });
            fireEvent.click(await screen.findByRole("option", { name: value }));
        };
        await choose("Crafting method", "Socket · Glacial Rune");
        await choose("Augment destination", "Replace socket 1 · Desert Rune");
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain("Socket 1 · Glacial Rune");
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("Socket 1 · Desert Rune");
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain("Socket 1 · Glacial Rune");
        fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "socketed" } });
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!).socketed;
        expect(saved.item.augments).toEqual([cold.id]);
        expect(saved.method).toEqual({ kind: "augment", id: cold.id, replace: 0 });
    });

    it("edits map quality types and requirements, applies chisels and preserves history and saved state", async () => {
        const rarity = catalog.crafting.mapQuality.find(
            (entry) => entry.description === "Quality (Rarity)",
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: engine.createItem("Metadata/Items/Maps/MapAtlasBeach", 86),
            method: currency("transmute_to_rare"),
            target: { groups: [] },
            steps: [],
            prices: { [rarity.id]: 3 },
            seed: 42,
            iterations: 1000,
            maxActions: 4,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ map: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "map" } });
        fireEvent.click(button("Load project"));
        const choose = async (name: string, value: string) => {
            const picker = screen.getByRole("combobox", { name });
            fireEvent.change(picker, { target: { value } });
            fireEvent.keyDown(picker, { key: "ArrowDown" });
            fireEvent.click(await screen.findByRole("option", { name: value }));
        };
        await choose("Map quality type", "Quality (Rarity)");
        fireEvent.change(screen.getByLabelText("Map quality (%)"), { target: { value: "18" } });
        await choose("Crafting method", "Maven's Chisel of Procurement");
        expect(screen.getByRole("region", { name: "Map quality model" }).textContent).toContain(
            "Adds 5%",
        );
        fireEvent.click(screen.getByText("Map quality requirement", { exact: true }));
        fireEvent.click(button("Add quality requirement"));
        await choose("Required map quality type", "Quality (Rarity)");
        fireEvent.change(screen.getByLabelText("Maximum map quality (%)"), {
            target: { value: "20" },
        });
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.item).toMatchObject({ mapQuality: rarity.id, quality: 18 });
        expect(sent.target.quality).toEqual({ min: 20, max: 20, mapType: rarity.id });
        expect(sent.method).toEqual({ kind: "currency", id: rarity.id });
        expect(sent.prices[rarity.id]).toBe(3);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Quality (Rarity): +20%");
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("Quality (Rarity): +18%");
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toMatchObject({ mapQuality: rarity.id, quality: 20 });
        expect(saved.target).toEqual(sent.target);
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Quality (Rarity): +20%");
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        fireEvent.click(button("Add crafting step"));
        expect(screen.getByRole("region", { name: "Crafting process" }).textContent).toContain(
            "20–20% Quality (Rarity)",
        );
    });

    it("selects Tainted Catalyst and retains random quality, numeric conditions, history and saves", async () => {
        const method = currency("add_random_jewellery_quality");
        const tainted = catalog.crafting.taintedCatalysts[0]!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: { ...engine.createItem("Metadata/Items/Rings/Ring1", 86), corrupted: true },
            method: currency("transmute_to_rare"),
            target: { groups: [], catalyst: { min: 20, max: 20 } },
            steps: [],
            prices: { [tainted.id]: 3 },
            seed: 42,
            iterations: 1000,
            maxActions: 3,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ tainted: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "tainted" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: "Tainted Catalyst" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Tainted Catalyst" }));
        expect(
            screen.getByRole("region", { name: "Tainted Catalyst model" }).textContent,
        ).toContain("12 eligible types");
        fireEvent.click(screen.getByText("Catalyst quality requirement", { exact: true }));
        fireEvent.change(screen.getByLabelText("Minimum catalyst quality (%)"), {
            target: { value: "18" },
        });
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method).toEqual(method);
        expect(sent.target.catalyst).toEqual({ min: 18, max: 20 });
        expect(sent.prices[tainted.id]).toBe(3);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        const result = engine.apply(project.item, method, seededRandom(42)).item;
        expect(card.textContent).toContain(engine.costName(result.catalyst!.id));
        expect(card.textContent).toContain("Corrupted");
        fireEvent.click(button("Undo"));
        expect(card.textContent).not.toContain("Catalyst");
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(result);
        expect(saved.target).toEqual(sent.target);
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain(engine.costName(result.catalyst!.id));
    });

    it("sets up memory maps and retains Intention uses, conditions, costs, history and saves", async () => {
        const method = currency("enchant_map_zana_influence_drops");
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: engine.createItem("Metadata/Items/Maps/MapAtlasBeach", 86),
            method: currency("transmute_to_rare"),
            target: { groups: [] },
            steps: [],
            prices: { [catalog.crafting.memoryMaps!.currency]: 7 },
            seed: 42,
            iterations: 1000,
            maxActions: 3,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ map: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "map" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(screen.getByRole("checkbox", { name: "Memory Influenced Map" }));
        const uses = screen.getByLabelText("Existing Intention uses") as HTMLInputElement;
        expect(uses.max).toBe("3");
        fireEvent.change(uses, { target: { value: "1" } });
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: "Orb of Intention" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Orb of Intention" }));
        expect(
            screen.getByRole("region", { name: "Orb of Intention model" }).textContent,
        ).toContain("not modeled");
        fireEvent.click(screen.getByText("Orb of Intention requirement", { exact: true }));
        fireEvent.click(button("Add Intention requirement"));
        expect((screen.getByLabelText("Minimum Intention uses") as HTMLInputElement).value).toBe(
            "3",
        );
        fireEvent.change(screen.getByLabelText("Minimum Intention uses"), {
            target: { value: "2" },
        });
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method).toEqual(method);
        expect(sent.item.memoryMap).toEqual({ intentions: 1 });
        expect(sent.target.intentions).toEqual({ min: 2, max: 3 });
        expect(sent.prices[catalog.crafting.memoryMaps!.currency]).toBe(7);
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain("40% less Quantity");
        expect(card.textContent).toContain("+24 Memory Strands");
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("+12 Memory Strands");
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Apply craft"));
        expect(card.textContent).toContain("Orb of Intention uses: 3/3");
        fireEvent.click(button("Apply craft"));
        expect(screen.getByRole("alert").textContent).toContain("Intention limit");
        expect(card.textContent).toContain("Orb of Intention uses: 3/3");
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.memoryMap).toEqual({ intentions: 3 });
        expect(saved.target).toEqual(sent.target);
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("+36 Memory Strands");
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        fireEvent.click(button("Add crafting step"));
        fireEvent.click(button("Use current requirements"));
        expect(screen.getByRole("region", { name: "Crafting process" }).textContent).toContain(
            "2–3 Intention uses",
        );
        fireEvent.click(screen.getByRole("checkbox", { name: "Memory Influenced Map" }));
        expect(screen.queryByLabelText("Existing Intention uses")).toBeNull();
        expect(card.textContent).not.toContain("Memory Strands");
    });

    it.each([
        { label: "Locus of Corruption", seed: 7, destroyed: false },
        { label: "Locus of Corruption", seed: 4, destroyed: true },
        { label: "Vaal Orb", seed: 1, destroyed: false },
    ])("preserves PoE 1 jewel $label results at seed $seed through dispatch, history and saves", async ({
        label,
        seed,
        destroyed,
    }) => {
        const locus = label === "Locus of Corruption";
        const method = locus
            ? { kind: "locus" as const, id: catalog.crafting.locus!.id }
            : {
                  kind: "currency" as const,
                  id: catalog.crafting.currencies.find((entry) => entry.action === "corrupt_item")!
                      .id,
              };
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: engine.createItem("Metadata/Items/Jewels/JewelInt", 86),
            method: currency("transmute_to_rare"),
            target: { groups: [], corrupted: true },
            steps: [],
            prices: { [method.id]: 7 },
            seed,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ jewel: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "jewel" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: label } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: label }));
        expect(screen.getByRole("region", { name: `${label} model` }).textContent).toContain(
            locus ? "destroyed outcomes still spend" : "unique-jewel",
        );
        fireEvent.click(button("Calculate odds"));
        expect(CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project).toMatchObject({
            method,
            target: project.target,
            prices: project.prices,
        });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain(destroyed ? "Destroyed" : "Corrupted");
        expect(card.textContent).not.toContain("Twice Corrupted");
        fireEvent.click(button("Undo"));
        expect(card.textContent).not.toContain("Corrupted");
        expect(card.textContent).not.toContain("Destroyed");
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(engine.apply(project.item, method, seededRandom(seed)).item);
        expect(saved.target).toEqual(project.target);
        expect(saved.method).toEqual(method);
        if (locus && !destroyed) expect(saved.item.implicits).toHaveLength(2);
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain(destroyed ? "Destroyed" : "Corrupted");
    });

    it.each([
        false,
        true,
    ])("selects map corruption, edits tier and affix requirements, and preserves results (twice: %s)", async (twice) => {
        const recipe = catalog.crafting.beasts.find((entry) => entry.mapCorruption === "twice")!;
        const method = twice
            ? { kind: "beast" as const, id: recipe.id }
            : {
                  kind: "currency" as const,
                  id: catalog.crafting.currencies.find((entry) => entry.action === "corrupt_item")!
                      .id,
              };
        const label = twice ? `Beastcraft · ${recipe.category}: ${recipe.description}` : "Vaal Orb";
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: engine.createItem("Metadata/Items/Maps/MapAtlasBeach", 86),
            method: currency("transmute_to_rare"),
            target: { groups: [] },
            steps: [],
            prices: { [method.id]: 7 },
            seed: twice ? 7 : 1,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ map: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "map" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: twice ? "Corrupt a Map" : "Vaal Orb" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: label }));
        expect(screen.queryByLabelText("Beast level")).toBeNull();
        expect(
            screen.getByRole("region", { name: twice ? "Double map corruption" : "Vaal Orb model" })
                .textContent,
        ).toContain(twice ? "two different Vaal outcomes" : "eight explicit modifiers");
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Map tier 2 · Area level 69");
        fireEvent.click(screen.getByText("Map tier requirement", { exact: true }));
        fireEvent.click(button("Add tier requirement"));
        expect((screen.getByLabelText("Minimum Map tier") as HTMLInputElement).value).toBe("3");
        expect((screen.getByLabelText("Maximum Map tier") as HTMLInputElement).max).toBe("17");
        fireEvent.change(screen.getByLabelText("Maximum Map tier"), { target: { value: "3" } });
        if (!twice) {
            fireEvent.click(button("Clear tier requirement"));
            fireEvent.click(screen.getByText("Item conditions", { exact: true }));
            expect((screen.getByLabelText("Maximum total affixes") as HTMLInputElement).max).toBe(
                "8",
            );
            for (const bound of ["Minimum", "Maximum"])
                fireEvent.change(screen.getByLabelText(`${bound} total affixes`), {
                    target: { value: "8" },
                });
        }
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method).toEqual(method);
        expect(sent.target).toMatchObject(
            twice ? { mapTier: { min: 3, max: 3 } } : { affixCount: { min: 8, max: 8 } },
        );
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain(twice ? "Vaal Pyramid Map" : "4/3 prefixes");
        expect(card.textContent).toContain(
            twice ? "Map tier 3 · Area level 70" : "Map tier 2 · Area level 69",
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("Map tier 2 · Area level 69");
        expect(card.textContent).not.toContain("Corrupted");
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(
            engine.apply(project.item, method, seededRandom(project.seed)).item,
        );
        expect(saved.target).toEqual(sent.target);
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Corrupted");
        if (twice) {
            fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
            fireEvent.click(button("Add crafting step"));
            fireEvent.click(button("Use current requirements"));
            expect(screen.getByRole("region", { name: "Crafting process" }).textContent).toContain(
                "Map tier 3–3",
            );
        }
    });

    it("selects the build-derived map corruption recipe and retains its result, requirements and cost", async () => {
        const recipe = catalog.crafting.beasts.find((entry) => entry.mapCorruption === "implicit")!;
        const method = { kind: "beast" as const, id: recipe.id };
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: engine.createItem("Metadata/Items/Maps/MapAtlasBeach", 86),
            method: currency("transmute_to_rare"),
            target: { groups: [{ mods: ["MapCorruptionItemRarity"] }], corrupted: true },
            steps: [],
            prices: { [recipe.id]: 7 },
            seed: 0,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ map: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "map" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: "Corrupt a Map" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(
            await screen.findByRole("option", {
                name: `Beastcraft · ${recipe.category}: ${recipe.description}`,
            }),
        );
        expect(screen.queryByLabelText("Beast level")).toBeNull();
        fireEvent.change(screen.getByLabelText("Modifier source"), {
            target: { value: "corrupted" },
        });
        fireEvent.change(screen.getByLabelText("Search modifiers"), {
            target: { value: "Item Rarity" },
        });
        expect(screen.getAllByText("+(8-12)% Item Rarity").length).toBeGreaterThan(0);
        expect(
            screen.getByRole("region", { name: "Map corruption beastcraft" }).textContent,
        ).toContain("Guarantees one corrupted implicit");
        fireEvent.click(button("Calculate odds"));
        expect(CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project).toMatchObject({
            method,
            target: project.target,
            prices: project.prices,
        });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("+8% Item Rarity");
        expect(card.textContent).toContain("Corrupted");
        fireEvent.click(button("Undo"));
        expect(card.textContent).not.toContain("+8% Item Rarity");
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(engine.apply(project.item, method, seededRandom(0)).item);
        expect(saved.target).toEqual(project.target);
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("+8% Item Rarity");
    });

    it.each([
        0, 5,
    ])("selects PoE 1 equipment Vaal Orbs and keeps seed %s through dispatch, history and saves", async (seed) => {
        const id = Object.keys(catalog.bases).find(
            (id) => catalog.bases[id]!.name === "Coral Ring",
        )!;
        const vaal = catalog.crafting.currencies.find((entry) => entry.action === "corrupt_item")!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: engine.createItem(id),
            method: currency("transmute_to_rare"),
            target:
                seed === 0
                    ? {
                          groups: [],
                          rarity: "rare",
                          affixCount: { min: 6, max: 6 },
                          corrupted: true,
                      }
                    : { groups: [{ mods: ["V2CannotBePoisonedCorrupted"] }], corrupted: true },
            steps: [],
            prices: { [vaal.id]: 3 },
            seed,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ vaal: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "vaal" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: "Vaal Orb" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Vaal Orb" }));
        expect(screen.getByRole("region", { name: "Vaal Orb model" }).textContent).toContain(
            "white-socket branch leaves modeled properties unchanged",
        );
        fireEvent.click(button("Calculate odds"));
        expect(CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project).toMatchObject({
            method: { kind: "currency", id: vaal.id },
            target: project.target,
            prices: project.prices,
        });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Corrupted");
        expect(card.textContent).toContain(seed === 0 ? "3/3 prefixes" : "Cannot be Poisoned");
        fireEvent.click(button("Undo"));
        expect(card.textContent).not.toContain("Corrupted");
        expect(card.textContent).toContain("0/0 prefixes");
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(
            engine.apply(project.item, { kind: "currency", id: vaal.id }, seededRandom(seed)).item,
        );
        expect(saved.target).toEqual(project.target);
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Corrupted");
        const requirements = screen.getByRole("region", { name: "Crafting requirements" });
        fireEvent.click(within(requirements).getByText("Item conditions", { exact: true }));
        fireEvent.click(
            within(requirements).getByRole("button", { name: "Clear item conditions" }),
        );
        expect(
            within(
                within(requirements).getByRole("group", { name: "Required corruption" }),
            ).getByRole("button", { name: "Any", pressed: true }),
        ).toBeDefined();
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].target.corrupted,
        ).toBeUndefined();
    });

    it.each([
        { base: "Rusted Cuirass", action: "incursion_armour_quality", seed: 0, corrupted: false },
        { base: "Gold Ring", action: "incursion_jewellery_quality", seed: 5, corrupted: true },
    ])("keeps $action quality and corruption conditions through dispatch, history and saves", ({
        base,
        action,
        seed,
        corrupted,
    }) => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const model = new CraftingEngine(data);
        const baseId = Object.keys(data.bases).find((id) => data.bases[id]!.name === base)!;
        const currency = data.crafting.currencies.find((entry) => entry.action === action)!;
        const catalyst = data.crafting.catalysts.find((entry) => entry.tags.includes("life"))!;
        const jewellery = action === "incursion_jewellery_quality";
        const item = model.createItem(baseId);
        if (jewellery) item.catalyst = { id: catalyst.id, quality: 29 };
        else item.quality = 29;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            method: { kind: "currency", id: currency.id },
            target: {
                groups: [],
                ...(jewellery
                    ? { catalyst: { id: catalyst.id, min: 30, max: 30 } }
                    : { quality: { min: 30, max: 30 } }),
            },
            steps: [],
            prices: { [currency.id]: 7 },
            seed,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ infuser: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "infuser" } });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("region", { name: "Quality Infuser model" }).textContent).toContain(
            "Modeled corruption chance for this use: 45%",
        );
        const requirements = screen.getByRole("region", { name: "Crafting requirements" });
        fireEvent.click(within(requirements).getByText("Item conditions", { exact: true }));
        const conditions = within(requirements).getByRole("group", { name: "Required corruption" });
        fireEvent.click(
            within(conditions).getByRole("button", {
                name: corrupted ? "Corrupted" : "Uncorrupted",
            }),
        );
        const target = { ...project.target, corrupted };
        fireEvent.click(button("Calculate odds"));
        expect(CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project).toMatchObject({
            method: project.method,
            target,
            prices: project.prices,
        });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("30%");
        expect(card.textContent?.includes("Corrupted")).toBe(corrupted);
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("29%");
        expect(card.textContent).not.toContain("Corrupted");
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(model.apply(item, project.method, seededRandom(seed)).item);
        expect(saved.target).toEqual(target);
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("30%");
        expect(card.textContent?.includes("Corrupted")).toBe(corrupted);
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        fireEvent.click(button("Add crafting step"));
        fireEvent.click(button("Use current requirements"));
        expect(screen.getByRole("region", { name: "Crafting process" }).textContent).toContain(
            corrupted ? "corrupted" : "uncorrupted",
        );
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].steps[0].condition,
        ).toEqual(target);
        fireEvent.click(within(conditions).getByRole("button", { name: "Any" }));
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].target.corrupted,
        ).toBeUndefined();
    });

    it.each([
        {
            name: "Ancient Infuser",
            action: "incursion_corrupt_tablet",
            base: "Irradiated Tablet",
            seed: 1,
        },
        {
            name: "Architect's Orb",
            action: "incursion_corrupt_equipment",
            base: "Gold Ring",
            seed: 0,
        },
        {
            name: "Architect's Orb",
            action: "incursion_corrupt_equipment",
            base: "Gold Ring",
            seed: 4,
        },
    ])("keeps $name outcomes through dispatch, history and saves at seed $seed", ({
        name,
        action,
        base,
        seed,
    }) => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const model = new CraftingEngine(data);
        const baseId = Object.keys(data.bases).find((id) => data.bases[id]!.name === base)!;
        const currency = data.crafting.currencies.find((entry) => entry.action === action)!;
        const item = model.createItem(baseId);
        const tablet = action === "incursion_corrupt_tablet";
        item.corrupted = !tablet;
        const stat = data.mods[item.implicits[0]!.id]!.stats[0]!.id;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            method: { kind: "currency", id: currency.id },
            target: {
                groups: [],
                ...(tablet
                    ? { stats: [{ id: stat, scope: "implicit", min: 20 }] }
                    : { rarity: "normal" }),
            },
            steps: [],
            prices: { [currency.id]: 7 },
            seed,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ tablet: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "tablet" } });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("region", { name: `${name} model` }).textContent).toContain(
            tablet ? "three equally likely" : "twice corrupted",
        );
        fireEvent.click(button("Calculate odds"));
        expect(CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project).toMatchObject({
            method: project.method,
            target: project.target,
            prices: project.prices,
        });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        if (tablet) {
            expect(card.textContent).toContain("20 uses remaining");
            expect((screen.getByLabelText(`Value for ${stat}`) as HTMLInputElement).max).toBe("20");
        } else if (seed === 4) {
            expect(card.textContent).toContain("Destroyed. This item cannot be crafted");
            expect((button("Apply craft") as HTMLButtonElement).disabled).toBe(true);
            expect(within(card).queryByRole("spinbutton")).toBeNull();
        } else {
            expect(card.textContent).toContain("Twice Corrupted");
        }
        fireEvent.click(button("Undo"));
        if (tablet) expect(card.textContent).toContain("10 uses remaining");
        else expect(card.textContent).not.toContain("Twice Corrupted");
        expect(card.textContent).not.toContain("Destroyed.");
        expect((button("Apply craft") as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(model.apply(item, project.method, seededRandom(seed)).item);
        expect(saved.target).toEqual(project.target);
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain(
            tablet ? "20 uses remaining" : seed === 4 ? "Destroyed." : "Twice Corrupted",
        );
    });

    it("targets an extracted Waystone tier, updates area level and keeps tier changes through history and saves", () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const model = new CraftingEngine(data);
        const base = data.crafting.waystones.find((entry) => entry.tier === 15)!;
        const vaal = data.crafting.currencies.find((entry) =>
            entry.id.endsWith("/CurrencyCorrupt"),
        )!;
        const omen = data.crafting.currencies.find((entry) => entry.name === "Omen of Corruption")!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item: model.createItem(base.id),
            method: { kind: "currency", id: vaal.id, omens: [omen.id] },
            target: { groups: [] },
            steps: [],
            prices: { [vaal.id]: 2, [omen.id]: 3 },
            seed: 8,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ waystone: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "waystone" } });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("region", { name: "Vaal Orb model" }).textContent).toContain(
            "change tier by one",
        );
        fireEvent.click(screen.getByText("Waystone tier requirement", { exact: true }));
        fireEvent.click(button("Add tier requirement"));
        expect((screen.getByLabelText("Minimum Waystone tier") as HTMLInputElement).value).toBe(
            "16",
        );
        expect((screen.getByLabelText("Maximum Waystone tier") as HTMLInputElement).max).toBe("16");
        fireEvent.click(button("Calculate odds"));
        expect(
            CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project.target.waystoneTier,
        ).toEqual({ min: 16, max: 16 });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Waystone (Tier 16)");
        expect(card.textContent).toContain("Area level 80");
        expect(card.textContent).toContain("Corrupted");
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("Waystone (Tier 15)");
        expect(card.textContent).toContain("Area level 79");
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(model.waystone(saved.item)?.tier).toBe(16);
        expect(saved.target.waystoneTier).toEqual({ min: 16, max: 16 });
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Waystone (Tier 16)");
        fireEvent.click(button("Clear tier requirement"));
        expect(screen.queryByLabelText("Minimum Waystone tier")).toBeNull();
        fireEvent.click(button("Add tier requirement"));
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        fireEvent.click(button("Add crafting step"));
        fireEvent.click(button("Use current requirements"));
        expect(screen.getByRole("region", { name: "Crafting process" }).textContent).toContain(
            "Waystone tier 16–16",
        );
    });

    it("accepts eight-affix Waystone requirements and persists all corrupted modifiers", () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const model = new CraftingEngine(data);
        let item = {
            ...model.createItem(data.crafting.waystones.find((entry) => entry.tier === 15)!.id),
            rarity: "rare" as const,
        };
        for (let index = 0; index < 6; index++)
            item = {
                ...model.addStartingMod(item, model.pool(item)[0]!.id, seededRandom(index)),
                rarity: "rare",
            };
        const vaal = data.crafting.currencies.find((entry) =>
            entry.id.endsWith("/CurrencyCorrupt"),
        )!;
        const random = seededRandom(42);
        vi.spyOn(random, "pick")
            .mockImplementationOnce(
                (choices) => choices.find((entry) => entry.value === "extra")!.value,
            )
            .mockImplementationOnce((choices) => choices.find((entry) => entry.value === 4)!.value);
        const corrupted = model.apply(item, { kind: "currency", id: vaal.id }, random).item;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item: corrupted,
            method: { kind: "currency", id: vaal.id },
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ eight: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "eight" } });
        fireEvent.click(button("Load project"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain(
            "4/3 prefixes",
        );
        fireEvent.click(screen.getByText("Item conditions", { exact: true }));
        fireEvent.change(screen.getByLabelText("Minimum total affixes"), {
            target: { value: "8" },
        });
        fireEvent.change(screen.getByLabelText("Maximum total affixes"), {
            target: { value: "8" },
        });
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.mods).toHaveLength(8);
        expect(saved.target.affixCount).toEqual({ min: 8, max: 8 });
        fireEvent.click(button("Calculate odds"));
        expect(
            CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project.item.mods,
        ).toHaveLength(8);
    });

    it("calculates a jewel value target and keeps Vaal scaling through history, worker requests and saves", () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const model = new CraftingEngine(data);
        const ruby = Object.entries(data.bases).find(([, entry]) => entry.name === "Ruby")![0];
        const item = model.addStartingMod(model.createItem(ruby), "JewelArmour", seededRandom(1));
        const vaal = data.crafting.currencies.find((entry) =>
            entry.id.endsWith("/CurrencyCorrupt"),
        )!;
        const omen = data.crafting.currencies.find((entry) => entry.name === "Omen of Corruption")!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            method: { kind: "currency", id: vaal.id, omens: [omen.id] },
            target: { groups: [], stats: [{ id: "physical_damage_reduction_rating_+%", min: 24 }] },
            steps: [],
            prices: { [vaal.id]: 2, [omen.id]: 3 },
            seed: 729,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ jewel: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "jewel" } });
        fireEvent.click(button("Load project"));
        const modelDescription = screen.getByRole("region", { name: "Vaal Orb model" });
        expect(modelDescription.textContent).toContain("50% no-change chance");
        expect(modelDescription.textContent).toContain("78–122%");
        fireEvent.click(button("Calculate odds"));
        expect(CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project).toMatchObject({
            item,
            method: project.method,
            target: project.target,
        });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("24% increased Armour");
        expect(card.textContent).toContain("Corruption value roll 119%");
        expect(card.textContent).toContain("Corrupted");
        const spending = screen.getByText("Emulator spending").closest("details")!;
        expect(spending.textContent).toContain("Vaal Orb1");
        expect(spending.textContent).toContain("Omen of Corruption1");
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("16% increased Armour");
        expect(card.textContent).not.toContain("Corruption value roll");
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].item.mods[0],
        ).toMatchObject({ values: [20], corruptionScale: 119 });
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("24% increased Armour");
        expect(card.textContent).toContain("Corruption value roll 119%");
        fireEvent.click(button("Calculate odds"));
        expect(
            CraftingWorker.instances.at(-1)!.postMessage.mock.calls.at(-1)![0].project.item.mods[0]
                .corruptionScale,
        ).toBe(119);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.getByRole("alert").textContent).toContain("uncorrupted");
    });

    it("sets augment sockets, targets a Vaal socket outcome and preserves the result through history and saves", () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const model = new CraftingEngine(data);
        const cuirass = Object.entries(data.bases).find(
            ([, entry]) => entry.name === "Rusted Cuirass",
        )![0];
        const vaal = data.crafting.currencies.find((entry) => entry.name === "Vaal Orb")!;
        const omen = data.crafting.currencies.find((entry) => entry.name === "Omen of Corruption")!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item: { ...model.createItem(cuirass), sockets: 1 },
            method: { kind: "currency", id: vaal.id, omens: [omen.id] },
            target: { groups: [] },
            steps: [],
            prices: { [vaal.id]: 2, [omen.id]: 4 },
            seed: 2,
            iterations: 1000,
            maxActions: 5,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ corruption: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "corruption" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("region", { name: "Vaal Orb model" }).textContent).toContain(
            "four equally likely outcomes",
        );
        fireEvent.change(screen.getByRole("spinbutton", { name: "Augment sockets" }), {
            target: { value: "2" },
        });
        fireEvent.click(screen.getByText("Socket requirement", { exact: true }));
        fireEvent.click(button("Add socket requirement"));
        fireEvent.change(screen.getByRole("spinbutton", { name: "Minimum augment sockets" }), {
            target: { value: "3" },
        });
        fireEvent.change(screen.getByRole("spinbutton", { name: "Maximum augment sockets" }), {
            target: { value: "3" },
        });
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.item.sockets).toBe(2);
        expect(sent.target.sockets).toEqual({ min: 3, max: 3 });
        expect(sent.method.omens).toEqual([omen.id]);
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain("Augment sockets: 3");
        expect(card.textContent).toContain("Corrupted");
        const spending = screen.getByText("Emulator spending").closest("details")!;
        expect(spending.textContent).toContain("Vaal Orb1");
        expect(spending.textContent).toContain("Omen of Corruption1");
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("Augment sockets: 2");
        expect(card.textContent).not.toContain("Corrupted");
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toMatchObject({ sockets: 3, corrupted: true });
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Augment sockets: 3");
        expect(card.textContent).toContain("Corrupted");
        fireEvent.click(button("Apply craft"));
        expect(screen.getByRole("alert").textContent).toContain("uncorrupted");
    });

    it("targets a Bloodstained implicit and restores corruption through history and saved projects", () => {
        const fossil = catalog.crafting.fossils.find(
            (entry) => entry.name === "Bloodstained Fossil",
        )!;
        const ring = Object.entries(catalog.bases).find(
            ([, base]) => base.name === "Coral Ring",
        )![0];
        const item = { ...engine.createItem(ring), rarity: "rare" as const };
        const resonator = catalog.crafting.currencies.find(
            (entry) => entry.action === "delve_currency_reroll" && entry.id.endsWith("1"),
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            target: { groups: [] },
            method: {
                kind: "fossils",
                ids: [fossil.id],
                resonator: resonator.id,
                logic: "additive",
            },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ bloodstained: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "bloodstained" },
        });
        fireEvent.click(button("Load project"));
        expect(
            screen.getByRole("region", { name: "Bloodstained Fossil model" }).textContent,
        ).toContain("locked implicits remain");
        fireEvent.change(screen.getByLabelText("Modifier source"), {
            target: { value: "corrupted" },
        });
        const desired = engine
            .corruptedModifiers(item)
            .find((entry) => entry.mod.required_level > 1)!;
        fireEvent.change(screen.getByRole("textbox", { name: "Search modifiers" }), {
            target: { value: desired.id },
        });
        const pool = within(screen.getByRole("region", { name: "Modifier pool" }));
        fireEvent.click(pool.getByRole("button", { name: "Require" }));
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method.ids).toEqual([fossil.id]);
        expect(sent.target.groups[0].mods).toEqual([desired.id]);
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const after = card.textContent;
        expect(after).toContain("Corrupted");
        expect(after).not.toContain("+22 to maximum Life");
        const spending = screen.getByText("Emulator spending").closest("details")!;
        expect(spending.textContent).toContain("Bloodstained Fossil1");
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.corrupted).toBe(true);
        expect(engine.mod(saved.item.implicits[0].id).generation_type).toBe("corrupted");
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Apply craft"));
        expect(screen.getByRole("alert").textContent).toContain("uncorrupted");
        expect(card.textContent).toBe(after);
    });

    it("selects and targets Gilded's extra implicit while preserving item history and saves", () => {
        const jagged = catalog.crafting.fossils.find((entry) => entry.name === "Jagged Fossil")!;
        const gilded = catalog.crafting.fossils.find((entry) =>
            entry.effects.includes("BetterSellPrice"),
        )!;
        const ring = Object.entries(catalog.bases).find(
            ([, base]) => base.name === "Coral Ring",
        )![0];
        const resonator = catalog.crafting.currencies.find(
            (entry) => entry.action === "delve_currency_upgrade" && entry.id.endsWith("1"),
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: engine.createItem(ring),
            target: { groups: [] },
            method: {
                kind: "fossils",
                ids: [jagged.id],
                resonator: resonator.id,
                logic: "additive",
            },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ gilded: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "gilded" } });
        fireEvent.click(button("Load project"));
        const fossils = within(screen.getByRole("group", { name: "Choose up to four fossils" }));
        fireEvent.click(fossils.getByRole("checkbox", { name: "Gilded Fossil" }));
        fireEvent.click(fossils.getByRole("checkbox", { name: "Jagged Fossil" }));
        expect(screen.getByRole("region", { name: "Gilded Fossil model" }).textContent).toContain(
            "vendor reward outcomes are not simulated",
        );
        fireEvent.change(screen.getByLabelText("Modifier source"), { target: { value: "gilded" } });
        const pool = within(screen.getByRole("region", { name: "Modifier pool" }));
        expect(pool.getByText("Item sells for much more to vendors")).toBeDefined();
        fireEvent.click(pool.getByRole("button", { name: "Require" }));
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.target.groups[0].mods).toEqual(["DoubleModSellPrice1"]);
        expect(sent.method.ids).toEqual([gilded.id]);
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const after = card.textContent;
        expect(after).toContain("Item sells for much more to vendors");
        expect(after).toContain("+22 to maximum Life");
        const spending = screen.getByText("Emulator spending").closest("details")!;
        expect(spending.textContent).toContain("Gilded Fossil1");
        expect(spending.textContent).toContain(`${resonator.name}1`);
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.implicits).toHaveLength(2);
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        expect(
            fossils.getByRole("checkbox", { name: "Gilded Fossil" }).getAttribute("aria-checked"),
        ).toBe("true");
    });

    it("selects Sanctified Fossil, shows adjusted weights and preserves crafting results through history and saves", () => {
        const jagged = catalog.crafting.fossils.find((entry) => entry.name === "Jagged Fossil")!;
        const sanctified = catalog.crafting.fossils.find((entry) => entry.lucky)!;
        const resonator = catalog.crafting.currencies.find(
            (entry) => entry.action === "delve_currency_reroll" && entry.id.endsWith("1"),
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: { ...engine.createItem(baseId), rarity: "rare" },
            target: {
                groups: [{ mods: ["IncreasedLife1"] }],
                stats: [{ id: "base_maximum_life", min: 24 }],
            },
            method: {
                kind: "fossils",
                ids: [jagged.id],
                resonator: resonator.id,
                logic: "additive",
            },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ sanctified: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "sanctified" },
        });
        fireEvent.click(button("Load project"));
        const fossils = within(screen.getByRole("group", { name: "Choose up to four fossils" }));
        fireEvent.click(fossils.getByRole("checkbox", { name: "Sanctified Fossil" }));
        fireEvent.click(fossils.getByRole("checkbox", { name: "Jagged Fossil" }));
        expect(
            screen.getByRole("region", { name: "Sanctified Fossil model" }).textContent,
        ).toContain("0.61×");
        fireEvent.change(screen.getByRole("textbox", { name: "Search modifiers" }), {
            target: { value: "IncreasedLife1" },
        });
        expect(
            within(screen.getByRole("region", { name: "Modifier pool" })).getByText("650"),
        ).toBeDefined();
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method.ids).toEqual([sanctified.id]);
        expect(sent.method.resonator).toBe(resonator.id);
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const after = card.textContent;
        expect(after).not.toBe(before);
        const spending = screen.getByText("Emulator spending").closest("details")!;
        expect(spending.textContent).toContain("Sanctified Fossil1");
        expect(spending.textContent).toContain(`${resonator.name}1`);
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.method.ids).toEqual([sanctified.id]);
        expect(saved.item.mods.length).toBeGreaterThanOrEqual(4);
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        expect(
            fossils
                .getByRole("checkbox", { name: "Sanctified Fossil" })
                .getAttribute("aria-checked"),
        ).toBe("true");
        fireEvent.click(button("Remove group"));
        fireEvent.click(screen.getByText("Fossil optimizer"));
        fireEvent.click(button("Compare fossils"));
        expect(screen.queryByRole("alert")).toBeNull();
        const optimization = CraftingWorker.instances.at(-1)!.postMessage.mock.calls[0]![0];
        expect(optimization.type).toBe("optimize");
        expect(optimization.project.target.groups).toEqual([]);
        expect(optimization.project.target.stats).toEqual(project.target.stats);
        expect(optimization.options.fossils).toContain(sanctified.id);
    });

    it("selects Catalysing Exaltation, consumes quality and restores it through undo and saves", async () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const model = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, entry]) => entry.item_class === "Ring" && !entry.corrupted,
        )![0];
        const catalyst = data.crafting.catalysts.find(
            (entry) => entry.itemClasses.includes("Ring") && entry.tags.includes("life"),
        )!;
        const exalt = data.crafting.currencies.find((entry) => entry.action === "add_mod_to_rare")!;
        const omen = data.crafting.currencies.find((entry) =>
            entry.id.endsWith("/OmenOnExaltConsumeQuality"),
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item: {
                ...model.createItem(base),
                rarity: "rare",
                catalyst: { id: catalyst.id, quality: 20 },
            },
            method: { kind: "currency", id: exalt.id },
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 2,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ catalysing: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "catalysing" },
        });
        fireEvent.click(button("Load project"));
        fireEvent.click(screen.getByRole("checkbox", { name: omen.name }));
        expect(screen.getByRole("spinbutton", { name: /^Catalyst quality/ })).toHaveProperty(
            "value",
            "20",
        );
        expect(
            screen.getByRole("region", { name: "Catalysing Exaltation model" }).textContent,
        ).toContain("multiplied by 5 at 20%");
        fireEvent.change(screen.getByRole("textbox", { name: "Search modifiers" }), {
            target: { value: "IncreasedLife1" },
        });
        const pool = screen.getByRole("region", { name: "Modifier pool" });
        fireEvent.click(within(pool).getByRole("button", { name: "Require" }));
        fireEvent.click(button("Calculate odds"));
        expect(CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project.method).toEqual({
            ...project.method,
            omens: [omen.id],
        });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.queryByRole("spinbutton", { name: /^Catalyst quality/ })).toBeNull();
        expect(
            screen.getByRole("region", { name: "Catalysing Exaltation model" }).textContent,
        ).toContain("is not consumed");
        const spending = screen.getByText("Emulator spending").closest("details")!;
        expect(spending.textContent).toContain(`${omen.name}1`);
        fireEvent.click(button("Undo"));
        expect(screen.getByRole("spinbutton", { name: /^Catalyst quality/ })).toHaveProperty(
            "value",
            "20",
        );
        fireEvent.click(button("Redo"));
        expect(screen.queryByRole("spinbutton", { name: /^Catalyst quality/ })).toBeNull();
        fireEvent.click(button("Apply craft"));
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${omen.name}1`,
        );
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.catalyst).toBeUndefined();
        expect(saved.item.mods).toHaveLength(2);
        expect(saved.method.omens).toEqual([omen.id]);
        expect(saved.target.groups).toEqual([{ mods: ["IncreasedLife1"], minimum: 1 }]);
    });

    it("targets a Conflict-only tier, applies Conflict and retains its result through history and saves", async () => {
        const base = Object.entries(catalog.bases).find(
            ([, entry]) => entry.item_class === "Gloves",
        )![0];
        const exarch = "IncreasedAttackSpeedEldritchImplicitUniquePresence";
        const eater = "ChanceToSuppressSpellsEldritchImplicit";
        const item = {
            ...engine.createItem(base),
            implicits: [
                engine.rollMod(`${exarch}2`, seededRandom(42)),
                engine.rollMod(`${eater}2`, seededRandom(42)),
            ],
        };
        const method = currency("conflict_orb");
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method,
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 2,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ conflict: project }));
        mount();
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "conflict" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: "Orb of Conflict" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Orb of Conflict" }));
        expect(screen.getByRole("region", { name: "Orb of Conflict model" }).textContent).toContain(
            "50/50",
        );
        fireEvent.change(screen.getByLabelText("Modifier source"), {
            target: { value: "eldritch" },
        });
        fireEvent.change(screen.getByRole("textbox", { name: "Search modifiers" }), {
            target: { value: `${exarch}1` },
        });
        const pool = screen.getByRole("region", { name: "Modifier pool" });
        expect(within(pool).getByText("Conflict")).toBeTruthy();
        expect(pool.textContent).toContain("Searing Exarch · Lesser (1/6)");
        fireEvent.click(within(pool).getByRole("button", { name: "Require" }));
        expect(screen.getByRole("region", { name: "Crafting requirements" }).textContent).toContain(
            "Searing Exarch · Lesser (1/6)",
        );
        fireEvent.click(button("Calculate odds"));
        const dispatched = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(dispatched.method).toEqual(method);
        expect(dispatched.target.groups).toEqual([{ mods: [`${exarch}1`], minimum: 1 }]);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const current = screen.getByRole("region", { name: "Current item" });
        expect(current.textContent).toContain("Searing Exarch · Lesser (1/6)");
        expect(current.textContent).toContain("Eater of Worlds · Grand (3/6)");
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Orb of Conflict1",
        );
        fireEvent.click(button("Undo"));
        expect(current.textContent).toContain("Searing Exarch · Greater (2/6)");
        expect(screen.queryByText("Emulator spending")).toBeNull();
        fireEvent.click(button("Redo"));
        expect(current.textContent).toContain("Searing Exarch · Lesser (1/6)");
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.implicits.map((entry: { id: string }) => entry.id)).toEqual([
            `${exarch}1`,
            `${eater}3`,
        ]);
        expect(saved.target.groups).toEqual(dispatched.target.groups);
    });

    it.each([
        ["poe1", "Body Armour", false],
        ["poe2", "Wand", false],
        ["poe1", "Body Armour", true],
    ] as const)("applies %s %s base quality (tainted=%s), edits targets and preserves history", async (game, itemClass, corrupted) => {
        const data =
            game === "poe1"
                ? catalog
                : craftingCatalogSchema.parse(
                      JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
                  );
        const model = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, entry]) => entry.item_class === itemClass && !entry.corrupted,
        )![0];
        const recipe = data.crafting.baseQuality.find(
            (entry) => entry.corrupted === corrupted && entry.itemClasses.includes(itemClass),
        )!;
        const method = { kind: "currency" as const, id: recipe.id };
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: data.patch,
            item: { ...model.createItem(base), corrupted, level: 86, quality: corrupted ? 30 : 18 },
            method,
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 2,
        });
        const key = `poe-boats:crafting:${game}:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ quality: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "quality" } });
        fireEvent.click(button("Load project"));
        const name = model.costName(recipe.id);
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name }));
        expect(screen.getByRole("region", { name: "Base quality model" }).textContent).toContain(
            corrupted ? "uniformly modeled" : "Rarity does not change",
        );
        fireEvent.click(screen.getByText("Base quality requirement"));
        fireEvent.click(button("Add quality requirement"));
        fireEvent.change(screen.getByRole("spinbutton", { name: "Maximum base quality (%)" }), {
            target: { value: "20" },
        });
        fireEvent.click(button("Calculate odds"));
        const dispatched = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(dispatched.method).toEqual(method);
        expect(dispatched.target.quality).toEqual({ min: 20, max: 20 });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const quality = screen.getByRole("spinbutton", {
            name: "Base quality (%)",
        }) as HTMLInputElement;
        const rolled = Number(quality.value);
        expect(rolled).toBeGreaterThanOrEqual(corrupted ? 0 : 19);
        expect(rolled).toBeLessThanOrEqual(20);
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${name}1`,
        );
        fireEvent.click(button("Undo"));
        expect(quality.value).toBe(String(project.item.quality));
        expect(screen.queryByText("Emulator spending")).toBeNull();
        fireEvent.click(button("Redo"));
        expect(quality.value).toBe(String(rolled));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.quality).toBe(rolled);
        expect(saved.item.corrupted).toBe(corrupted);
        expect(saved.target.quality).toEqual({ min: 20, max: 20 });
    });

    it.each([
        "apply_zana_influence",
        "mutated_add_mod_to_magic",
    ])("selects %s, explains strand probabilities and preserves spending through undo", async (action) => {
        const rem = action === "apply_zana_influence";
        const item = {
            ...engine.createItem("Metadata/Items/Amulets/Amulet8"),
            rarity: rem ? "normal" : "magic",
            memoryStrands: rem ? 100 : 22,
        };
        const method = currency(action);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: catalog.game,
            patch: catalog.patch,
            item,
            method,
            target: { groups: [], memoryStrands: { min: 0, max: 100 } },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ memory: project }));
        mount();
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "memory" } });
        fireEvent.click(button("Load project"));
        const name = engine.costName(method.kind === "currency" ? method.id : "");
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name }));
        expect(
            screen.getByRole("region", {
                name: rem ? "Remembrance model" : "Memory strand consumption",
            }).textContent,
        ).toContain(rem ? "2,255 observations" : "0–32 strand cost");
        fireEvent.click(button("Calculate odds"));
        expect(CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project.method).toEqual(
            method,
        );
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const strands = screen.getByRole("spinbutton", {
            name: "Memory strands",
        }) as HTMLInputElement;
        const remaining = Number(strands.value);
        expect(remaining).toBeGreaterThanOrEqual(rem ? 10 : 0);
        expect(remaining).toBeLessThan(rem ? 100 : 22);
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${name}1`,
        );
        fireEvent.click(button("Undo"));
        expect(strands.value).toBe(String(item.memoryStrands));
        expect(screen.queryByText("Emulator spending")).toBeNull();
        fireEvent.click(button("Redo"));
        expect(strands.value).toBe(String(remaining));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.memoryStrands ?? 0).toBe(remaining);
    });

    it("edits memory strands and requirements, calculates Unravelling, and preserves history and saves", async () => {
        const item = {
            ...engine.addStartingMod(
                engine.createItem("Metadata/Items/Amulets/Amulet8"),
                "Strength1",
                seededRandom(1),
            ),
            memoryStrands: 32,
        };
        const method = currency("consume_zana_influence_upgrade_mods");
        const project = craftingProjectSchema.parse({
            format: 1,
            game: catalog.game,
            patch: catalog.patch,
            item,
            method,
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ strands: project }));
        mount();
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "strands" } });
        fireEvent.click(button("Load project"));
        fireEvent.change(screen.getByRole("spinbutton", { name: "Memory strands" }), {
            target: { value: "31" },
        });
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: "Orb of Unravelling" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Orb of Unravelling" }));
        expect(
            screen.getByRole("region", { name: "Memory strand crafting" }).textContent,
        ).toContain("empirical research model");
        fireEvent.click(screen.getByText("Memory strand requirement"));
        fireEvent.click(button("Add strand requirement"));
        fireEvent.change(screen.getByRole("spinbutton", { name: "Maximum memory strands" }), {
            target: { value: "0" },
        });
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.target.memoryStrands).toEqual({ min: 0, max: 0 });
        expect(sent.item.memoryStrands).toBe(31);
        expect(sent.method).toEqual(method);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        const card = screen.getByRole("region", { name: "Current item" });
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).not.toContain("Memory Strands");
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Orb of Unravelling1",
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("Memory Strands: 31");
        expect(screen.queryByText("Emulator spending")).toBeNull();
        fireEvent.click(button("Redo"));
        expect(card.textContent).not.toContain("Memory Strands");
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.memoryStrands).toBeUndefined();
        expect(saved.target.memoryStrands).toEqual({ min: 0, max: 0 });
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).not.toContain("Memory Strands");
        fireEvent.click(button("Clear strand requirement"));
        expect(screen.queryByRole("spinbutton", { name: "Maximum memory strands" })).toBeNull();
    });

    it.each([
        ["poe1", "Ring"],
        ["poe2", "Ring"],
        ["poe2", "Jewel"],
    ] as const)("applies %s %s catalysts, edits quality requirements and preserves spending and history", async (game, itemClass) => {
        const data =
            game === "poe1"
                ? catalog
                : craftingCatalogSchema.parse(
                      JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
                  );
        const crafting = new CraftingEngine(data);
        const selected = data.crafting.catalysts.find((entry) =>
            entry.itemClasses.includes(itemClass),
        )!;
        const name = crafting.costName(selected.id);
        const method = { kind: "currency" as const, id: selected.id };
        const base = Object.entries(data.bases).find(
            ([, entry]) => entry.item_class === itemClass && !entry.corrupted,
        )![0];
        const item = {
            ...crafting.createItem(base),
            level: 84,
            catalyst: { id: selected.id, quality: 18 },
        };
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: data.patch,
            item,
            method,
            target: { groups: [] },
            steps: [],
            prices: { [selected.id]: 3 },
            seed: 42,
            iterations: 100,
            maxActions: 2,
        });
        const key = `poe-boats:crafting:${game}:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ catalysts: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "catalysts" },
        });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name }));
        expect(screen.getByRole("region", { name: "Catalyst application" }).textContent).toContain(
            "One use adds 2% quality",
        );
        fireEvent.click(screen.getByText("Catalyst quality requirement"));
        const targetPicker = screen.getByRole("combobox", { name: "Required catalyst" });
        fireEvent.change(targetPicker, { target: { value: name } });
        fireEvent.keyDown(targetPicker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name }));
        fireEvent.change(screen.getByRole("spinbutton", { name: "Maximum catalyst quality (%)" }), {
            target: { value: "20" },
        });
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.target.catalyst).toEqual({ id: selected.id, min: 20, max: 20 });
        expect(sent.method).toEqual(method);
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain(`${selected.description}: +20%`);
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${name}1`,
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain(`${selected.description}: +18%`);
        expect(screen.queryByText("Emulator spending")).toBeNull();
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain(`${selected.description}: +20%`);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.catalyst).toEqual({ id: selected.id, quality: 20 });
        expect(saved.target.catalyst).toEqual(sent.target.catalyst);
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain(`${selected.description}: +20%`);
        fireEvent.click(button("Clear catalyst requirement"));
        expect(
            screen.queryByRole("spinbutton", { name: "Maximum catalyst quality (%)" }),
        ).toBeNull();
    });

    it.each([
        ["Potent Liquid Ferocity", "Metadata/Items/Jewels/JewelStr"],
        ["Potent Liquid Contempt", "Metadata/Items/Jewels/JewelStr"],
        ["Ancient Potent Liquid Contempt", "Metadata/Items/Jewels/JewelRadiusStr"],
    ])("selects %s, dispatches both outcomes and preserves the craft in history and saves", async (name, baseId) => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const crafting = new CraftingEngine(data);
        const selected = data.crafting.currencies.find((entry) => entry.name === name)!;
        const method = { kind: "currency" as const, id: selected.id };
        let item: CraftingItem = { ...crafting.createItem(baseId!), rarity: "rare" };
        for (const side of ["prefix", "suffix"])
            item = crafting.addStartingMod(
                item,
                crafting.pool(item, { side })[0]!.id,
                seededRandom(1),
            );
        const outcomes = crafting.emotionRule(item, selected.id)!.mods;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            target: { groups: [{ mods: outcomes }] },
            method,
            steps: [],
            prices: { [selected.id]: 9 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ potent: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "potent" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name }));
        const description = screen.getByRole("region", { name: "Liquid Emotion outcome" });
        for (const id of outcomes) expect(description.textContent).toContain(crafting.mod(id).text);
        expect(description.textContent).toContain("equal weights as a model assumption");
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method).toEqual(method);
        expect(sent.target.groups[0].mods).toEqual(outcomes);
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const after = card.textContent;
        expect(after).not.toBe(before);
        expect(after).toContain("crafted");
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(outcomes).toContain(
            saved.item.mods.find((entry: { crafted: boolean }) => entry.crafted).id,
        );
        expect(saved.method).toEqual(method);
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(screen.getByText("Emulator spending"));
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${name}1`,
        );
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
    });

    it("browses Glyphic guarantees with fossil weights and shares targets, rolls and spending across modes", () => {
        const glyphic = catalog.crafting.fossils.find(
            (entry) => entry.corruptedEssenceChance === 100,
        )!;
        const resonator = catalog.crafting.currencies.find(
            (entry) => entry.action === "delve_currency_reroll" && entry.id.endsWith("1"),
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: { ...engine.createItem(baseId), rarity: "rare", level: 1 },
            target: { groups: [] },
            method: {
                kind: "fossils",
                ids: [glyphic.id],
                resonator: resonator.id,
                logic: "additive",
            },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ glyphic: project }));
        mount();
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "glyphic" } });
        fireEvent.click(button("Load project"));
        fireEvent.change(screen.getByLabelText("Modifier source"), {
            target: { value: "corrupted-essence" },
        });
        const pool = screen.getByRole("region", { name: "Modifier pool" });
        expect(within(pool).getAllByRole("button", { name: "Require" })).toHaveLength(4);
        expect(pool.textContent).toContain("25.000%");
        fireEvent.click(screen.getByRole("checkbox", { name: /^Opulent Fossil/ }));
        expect(within(pool).getAllByRole("button", { name: "Require" })).toHaveLength(2);
        expect(pool.textContent).toContain("50.000%");
        fireEvent.click(screen.getByRole("checkbox", { name: /^Jagged Fossil/ }));
        expect(within(pool).getAllByRole("button", { name: "Require" })).toHaveLength(1);
        expect(pool.textContent).toContain("100.000%");
        fireEvent.click(within(pool).getByRole("button", { name: "Require" }));
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method.ids).toHaveLength(3);
        expect(sent.method.resonator).toMatch(/3$/);
        const critical = catalog.crafting.essences.find(
            (entry) => entry.name === "Essence of Horror",
        )!.mods["Body Armour"]!;
        expect(sent.target.groups[0].mods).toEqual([critical]);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("reduced Extra Damage from Critical Strikes");
        const after = card.textContent;
        fireEvent.click(button("Undo"));
        expect(card.textContent).not.toContain("reduced Extra Damage from Critical Strikes");
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(screen.getByText("Emulator spending"));
        const spending = screen.getByText("Emulator spending").closest("details")!;
        expect(spending.textContent).toContain("Glyphic Fossil1");
        expect(spending.textContent).toContain("Powerful Chaotic Resonator1");
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.level).toBe(1);
        expect(saved.item.mods.some((entry: { id: string }) => entry.id === critical)).toBe(true);
        expect(saved.method).toEqual(sent.method);
        expect(saved.target).toEqual(sent.target);
    });

    it("selects special fossils, requires a fractured target and preserves spending, history and saved state", async () => {
        const opulent = catalog.crafting.fossils.find((entry) =>
            entry.effects.includes("NoTagless"),
        )!;
        const fractured = catalog.crafting.fossils.find((entry) =>
            entry.effects.includes("Fracture"),
        )!;
        const resonator = catalog.crafting.currencies.find(
            (entry) => entry.action === "delve_currency_reroll" && entry.id.endsWith("1"),
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: { ...engine.createItem(baseId), rarity: "rare" },
            target: { groups: [{ mods: ["IncreasedLife1"] }] },
            method: {
                kind: "fossils",
                ids: [opulent.id],
                resonator: resonator.id,
                logic: "additive",
            },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ fossils: project }));
        mount();
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "fossils" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(screen.getByRole("checkbox", { name: /^Fractured Fossil/ }));
        fireEvent.click(
            screen.getByRole("checkbox", { name: "Require fractured modifiers in group 1" }),
        );
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.target.groups[0].fractured).toBe(true);
        expect(sent.method.ids).toEqual([opulent.id, fractured.id]);
        expect(sent.method.resonator).toMatch(/2$/);
        expect(sent.method.resonator).toBe(`${resonator.id.slice(0, -1)}2`);
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(within(card).getAllByRole("button", { name: "Unfracture" })).toHaveLength(1);
        const after = card.textContent;
        fireEvent.click(screen.getByText("Emulator spending"));
        const spending = screen.getByText("Emulator spending").closest("details")!;
        expect(spending.textContent).toContain("Opulent Fossil1");
        expect(spending.textContent).toContain("Fractured Fossil1");
        expect(spending.textContent).toContain("Potent Chaotic Resonator1");
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        expect(screen.queryByText("Emulator spending")).toBeNull();
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(
            saved.item.mods.filter((entry: { fractured: boolean }) => entry.fractured),
        ).toHaveLength(1);
        expect(saved.target.groups[0].fractured).toBe(true);
        fireEvent.click(
            screen.getByRole("checkbox", { name: "Require fractured modifiers in group 1" }),
        );
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(
            screen
                .getByRole("checkbox", { name: "Require fractured modifiers in group 1" })
                .getAttribute("aria-checked"),
        ).toBe("true");
        expect(card.textContent).toBe(after);
        fireEvent.click(screen.getByRole("checkbox", { name: /^Fractured Fossil/ }));
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].method.ids).toEqual([
            opulent.id,
        ]);
    });

    it("edits, targets, removes and saves an existing allocated passive", async () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const engine = new CraftingEngine(data);
        mount("emulate", data);
        fireEvent.click(screen.getByText("Existing Delirium passive"));
        const picker = screen.getByRole("combobox", { name: "Allocated notable" });
        fireEvent.change(picker, { target: { value: "Harness the Elements" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Harness the Elements" }));
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Allocates Harness the Elements");
        expect(card.textContent).toContain("20% increased Damage");
        fireEvent.click(screen.getByText("Allocated passive requirement"));
        const requirement = screen.getByRole("combobox", { name: "Require allocated notable" });
        fireEvent.change(requirement, { target: { value: "Harness the Elements" } });
        fireEvent.keyDown(requirement, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Harness the Elements" }));
        fireEvent.click(button("Calculate odds"));
        const project = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(project.target.grantedPassives).toEqual(["elemental32"]);
        expect(engine.matches(project.item, project.target)).toBe(true);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(within(card).getByRole("button", { name: "Remove" }));
        expect(card.textContent).not.toContain("Allocates Harness");
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("Allocates Harness");
        fireEvent.click(button("Redo"));
        expect(card.textContent).not.toContain("Allocates Harness");
        fireEvent.click(button("Undo"));
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.click(button("Save project"));
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.mods[0].grantedPassive).toBe("elemental32");
        expect(saved.target.grantedPassives).toEqual(["elemental32"]);
        fireEvent.click(button("Clear allocated passive requirement"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(requirement).toHaveProperty("value", "Harness the Elements");
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("switches away from an exhausted Putrefaction slot and preserves it through history and saves", () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const current = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, entry]) => entry.name === "Golden Plate",
        )![0];
        const bone = data.crafting.desecration.find((entry) =>
            entry.itemClasses.includes("Body Armour"),
        )!.id;
        const omen = "Metadata/Items/Currency/OmenOnAbyssVeilAllAndCorrupt";
        const random = {
            pick: <T,>(choices: { value: T; weight: number }[]) =>
                choices.find((entry) => entry.value === 6)?.value ?? choices[0]!.value,
            integer: (min: number) => min,
        };
        let item = current.apply(
            { ...current.createItem(base, 1), rarity: "rare" },
            { kind: "currency", id: bone, omens: [omen] },
            random,
        ).item;
        for (const preferred of [["IncreasedLife1"], ["AttackerTakesDamage1"]])
            item = current.apply(item, { kind: "reveal", preferred }, random).item;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            method: { kind: "reveal", preferred: [] },
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ exhausted: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "exhausted" },
        });
        fireEvent.click(button("Load project"));
        const panel = screen.getByRole("region", { name: "Reveal modifier" });
        expect(within(panel).getByRole("status").textContent).toContain(
            "No eligible reveal choices",
        );
        expect(within(panel).queryByRole("button", { name: "Reveal choices" })).toBeNull();
        fireEvent.click(within(panel).getByRole("button", { name: "Affix 4 · suffix" }));
        fireEvent.click(button("Reveal choices"));
        fireEvent.click(within(panel).getByRole("button", { name: /^1\./ }));
        expect(panel.textContent).toContain("3 unrevealed modifiers remain");
        expect(within(panel).getByRole("status").textContent).toContain(
            "No eligible reveal choices",
        );
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.reveal.index).toBe(2);
        expect(current.unrevealedCount(current.validateItem(saved.item))).toBe(3);
        fireEvent.click(button("Undo"));
        expect(panel.textContent).toContain("4 unrevealed modifiers remain");
        fireEvent.click(button("Redo"));
        expect(panel.textContent).toContain("3 unrevealed modifiers remain");
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(within(panel).getByRole("status").textContent).toContain(
            "No eligible reveal choices",
        );
    });

    it("applies Putrefaction, selects a reveal slot and preserves partial and completed states", () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const engine = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, entry]) => entry.name === "Golden Hoop",
        )![0];
        const bone = "Metadata/Items/Currency/AbyssalBenchTicketJewellery";
        const omen = "Metadata/Items/Currency/OmenOnAbyssVeilAllAndCorrupt";
        const echoes = "Metadata/Items/Currency/OmenOnAbyssRerollOptions";
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item: { ...engine.createItem(base), rarity: "rare" },
            method: { kind: "currency", id: bone },
            target: { groups: [] },
            steps: [],
            prices: { [bone]: 2, [omen]: 3, [echoes]: 1 },
            seed: 42,
            iterations: 1000,
            maxActions: 7,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ putrefaction: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "putrefaction" },
        });
        fireEvent.click(button("Load project"));
        fireEvent.click(screen.getByRole("checkbox", { name: /^Omen of Putrefaction/ }));
        expect(screen.getByRole("note", { name: "Putrefaction model" }).textContent).toContain(
            "not supplied by the client",
        );
        expect(
            screen
                .getByRole("checkbox", { name: /^Omen of Sinistral Necromancy/ })
                .getAttribute("aria-disabled"),
        ).toBe("true");
        fireEvent.click(screen.getByText("Item conditions"));
        fireEvent.change(screen.getByRole("spinbutton", { name: "Maximum unrevealed modifiers" }), {
            target: { value: "0" },
        });
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method.omens).toEqual([omen]);
        expect(sent.target.unrevealedCount).toEqual({ min: 0, max: 0 });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Corrupted");
        let panel = screen.getByRole("region", { name: "Reveal modifier" });
        const count = within(
            screen.getByRole("group", { name: "Unrevealed affixes" }),
        ).getAllByRole("button").length;
        expect(count).toBeGreaterThanOrEqual(4);
        fireEvent.click(
            within(screen.getByRole("group", { name: "Unrevealed affixes" }))
                .getAllByRole("button")
                .at(-1)!,
        );
        fireEvent.click(button("Reveal with Omen of Abyssal Echoes"));
        fireEvent.click(button("Save project"));
        const partial = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(partial.item.reveal.index).toBe(count - 1);
        expect(partial.item.reveal.echoes).toEqual({ omen: echoes, remaining: 1 });
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        fireEvent.click(button("Reroll reveal choices"));
        fireEvent.click(within(panel).getByRole("button", { name: /^1\./ }));
        expect(panel.textContent).toContain(`${count - 1} unrevealed modifiers remain`);
        for (let i = 1; i < count; i++) {
            panel = screen.getByRole("region", { name: "Reveal modifier" });
            fireEvent.click(button("Reveal choices"));
            fireEvent.click(within(panel).getByRole("button", { name: /^1\./ }));
        }
        expect(screen.queryByRole("region", { name: "Reveal modifier" })).toBeNull();
        expect(screen.queryByRole("alert")).toBeNull();
        const completed = card.textContent;
        fireEvent.click(button("Undo"));
        expect(screen.getByRole("region", { name: "Reveal modifier" }).textContent).toContain(
            "1 unrevealed",
        );
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(completed);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.putrefied).toBe(true);
        expect(saved.item.reveal).toBeUndefined();
        expect(
            craftingProjectSchema
                .parse(saved)
                .item.mods.every((entry) => engine.isDesecrated(entry)),
        ).toBe(true);
    });

    it("shows fixed Astrolabe influences, accepts all six targets and preserves them through history and save/load", () => {
        const item = engine.addStartingMod(
            engine.createItem("Metadata/Items/Amulets/AmuletE1"),
            "IncreasedLife1",
            seededRandom(1),
        );
        const method = currency("reroll_mod_values");
        const cost = engine.costs(method)[0]!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method,
            target: { groups: [] },
            steps: [],
            prices: { [cost.id]: 2 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ astrolabe: project }));
        mount();
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "astrolabe" },
        });
        fireEvent.click(button("Load project"));
        fireEvent.click(screen.getByText("Influences"));
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain(
            "Shaper · Elder · Crusader · Redeemer · Hunter · Warlord influence (fixed by implicit)",
        );
        expect(within(card).queryByRole("button", { name: "Fracture" })).toBeNull();
        fireEvent.click(screen.getByText("Item conditions"));
        for (const name of ["Shaper", "Elder", "Crusader", "Redeemer", "Hunter", "Warlord"]) {
            const influence = screen.getByRole("checkbox", { name: new RegExp(`^${name}$`) });
            expect(influence).toHaveProperty("checked", true);
            expect(influence).toHaveProperty("disabled", true);
            fireEvent.click(screen.getByRole("checkbox", { name: `Require ${name}` }));
        }
        fireEvent.click(button("Calculate odds"));
        expect(screen.queryByRole("alert")).toBeNull();
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.target.influences).toEqual([0, 1, 2, 3, 4, 5]);
        expect(sent.item.influences).toEqual([]);
        fireEvent.click(button("Stop simulation"));
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const after = card.textContent;
        expect(after).toContain("(fixed by implicit)");
        fireEvent.click(screen.getByText("Emulator spending"));
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${cost.name}1`,
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.influences).toEqual([]);
        expect(saved.target.influences).toEqual([0, 1, 2, 3, 4, 5]);
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Clear item conditions"));
        expect(screen.getByRole("checkbox", { name: "Require Warlord" })).toHaveProperty(
            "checked",
            false,
        );
    });

    it("selects Harvest influence randomisation, targets an influence and saves the result with undo and costs", async () => {
        const recipe = catalog.crafting.harvest.find(
            (entry) => entry.id === "RerollInfluenceType",
        )!;
        const method = { kind: "harvest" as const, id: recipe.id };
        const cost = engine.costs(method)[0]!;
        const item = engine.validateItem({
            ...engine.createItem(baseId),
            rarity: "rare",
            influences: [0],
            quality: 20,
            mods: [engine.rollMod("IncreasedLife1", seededRandom(1))],
        });
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: currency("reroll"),
            target: { groups: [] },
            steps: [],
            prices: { [cost.id]: 0.01 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ influence: project }));
        mount();
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "influence" },
        });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: "Randomise the Influence" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: `Harvest · ${recipe.name}` }));
        expect(
            screen.getByRole("note", { name: "Harvest influence reroll" }).textContent,
        ).toContain("Protected influenced modifiers prevent use");
        fireEvent.click(screen.getByText("Item conditions"));
        fireEvent.click(screen.getByRole("checkbox", { name: "Require Elder" }));
        fireEvent.click(button("Calculate odds"));
        expect(screen.queryByRole("alert")).toBeNull();
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method).toEqual(method);
        expect(sent.target.influences).toEqual([1]);
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        expect(before).toContain("Shaper influence");
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).not.toContain("Shaper influence");
        expect(card.textContent).toContain("Quality: +20%");
        const after = card.textContent;
        fireEvent.click(screen.getByText("Emulator spending"));
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${cost.name}${cost.amount.toLocaleString("en-US")}`,
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.target.influences).toEqual([1]);
        expect(saved.item.influences).not.toEqual([0]);
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Clear item conditions"));
        expect(screen.getByRole("checkbox", { name: "Require Elder" })).toHaveProperty(
            "checked",
            false,
        );
    });

    it("selects Sanctification, dispatches stat targets and preserves state and costs through undo and save/load", () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const poe2 = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, entry]) => entry.name === "Golden Hoop",
        )![0];
        const divine = data.crafting.currencies.find(
            (entry) => entry.action === "reroll_mod_values",
        )!;
        const omen = data.crafting.currencies.find((entry) =>
            entry.id.endsWith("/OmenOnDivineSanctify"),
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item: {
                ...poe2.createItem(base),
                rarity: "rare",
                mods: [poe2.rollMod("IncreasedLife1", seededRandom(1))],
            },
            method: { kind: "currency", id: divine.id },
            target: { groups: [], stats: [{ id: "base_maximum_life", min: 23 }] },
            steps: [],
            prices: { [divine.id]: 2, [omen.id]: 3 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ sanctify: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "sanctify" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(screen.getByRole("checkbox", { name: /^Omen of Sanctification/ }));
        expect(
            screen.getByText(/The model uses equally likely whole-percent/).textContent,
        ).toContain("78% to 122%");
        expect(
            screen
                .getByRole("checkbox", { name: /^Omen of the Blessed/ })
                .getAttribute("aria-disabled"),
        ).toBe("true");
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method.omens).toEqual([omen.id]);
        expect(sent.target.stats).toEqual(project.target.stats);
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain("Sanctified");
        expect(card.textContent).toContain("Sanctification");
        expect(within(card).queryByRole("button", { name: "Fracture" })).toBeNull();
        fireEvent.click(screen.getByText("Emulator spending"));
        const spending = screen.getByText("Emulator spending").closest("details")!;
        expect(spending.textContent).toContain("Omen of Sanctification1");
        expect(spending.textContent).toContain("Divine Orb1");
        fireEvent.click(button("Apply craft"));
        expect(screen.getByRole("alert").textContent).toContain("Sanctified items");
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain("Sanctified");
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.sanctified).toBe(true);
        expect(saved.item.mods[0].sanctification).toBeGreaterThanOrEqual(78);
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Sanctified");
    });

    it("selects an ordinary reveal, retains its status through history and saves, and removes it with Light", async () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const poe2 = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, entry]) => entry.name === "Golden Hoop",
        )![0];
        const bone = data.crafting.currencies.find(
            (entry) => entry.action === "abyssal_bench_ticket_jewellery",
        )!;
        const item = poe2.apply(
            { ...poe2.createItem(base), rarity: "rare" },
            { kind: "currency", id: bone.id },
            seededRandom(1),
        ).item;
        const id = poe2
            .revealPool(item)
            .find((entry) => entry.mod.domain === poe2.base(item).domain)!.id;
        item.reveal!.choices = [id];
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            method: { kind: "reveal", preferred: [id] },
            target: { groups: [{ mods: [id] }] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ mixed: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "mixed" } });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("region", { name: "Reveal modifier" }).textContent).toContain(
            "80%, 15% or 5% probability",
        );
        fireEvent.click(button("Calculate odds"));
        expect(
            CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project.method.preferred,
        ).toEqual([id]);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(
            within(screen.getByRole("region", { name: "Reveal modifier" })).getByRole("button", {
                name: /^1\./,
            }),
        );
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain(" · desecrated");
        expect(within(card).queryByRole("button", { name: "Fracture" })).toBeNull();
        expect(screen.queryByRole("region", { name: "Reveal modifier" })).toBeNull();
        fireEvent.click(button("Undo"));
        expect(screen.getByRole("region", { name: "Reveal modifier" })).toBeDefined();
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain(" · desecrated");
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.mods[0]).toMatchObject({ id, desecrated: true, crafted: false });
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain(" · desecrated");
        const annul = data.crafting.currencies.find(
            (entry) => entry.action === "remove_random_mod",
        )!;
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: annul.name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: annul.name }));
        fireEvent.click(screen.getByRole("checkbox", { name: /^Omen of Light/ }));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain("No explicit modifiers");
        fireEvent.click(screen.getByText("Emulator spending"));
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Omen of Light1",
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain(" · desecrated");
    });

    it.each([
        "ReforgeMoreLikely",
        "ReforgeLessLikely",
    ])("selects %s with its extracted multiplier, costs and undo history", async (id) => {
        const recipe = catalog.crafting.harvest.find((entry) => entry.id === id)!;
        const method = { kind: "harvest" as const, id };
        const cost = engine.costs(method)[0]!;
        const item = engine.addStartingMod(
            engine.createItem(baseId),
            "IncreasedLife1",
            seededRandom(1),
        );
        item.quality = 20;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: { kind: "harvest", id: "ReforgeLife" },
            target: { groups: [{ mods: ["IncreasedLife1", "IncreasedLife2"] }] },
            steps: [],
            prices: { [cost.id]: 0.01 },
            seed: 3,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ affinity: project }));
        mount();
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "affinity" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: recipe.name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: `Harvest · ${recipe.name}` }));
        expect(
            screen.getByRole("region", { name: "Harvest modifier weighting" }).textContent,
        ).toContain(`${recipe.affinityMultiplier}×`);
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method).toEqual(method);
        expect(sent.item.mods).toEqual(item.mods);
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).not.toBe(before);
        expect(card.textContent).toContain("Quality: +20%");
        fireEvent.click(screen.getByText("Emulator spending"));
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${cost.name}${cost.amount}`,
        );
        const after = card.textContent;
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.method).toEqual(method);
        expect(saved.item.mods.length).toBeGreaterThanOrEqual(4);
        expect(saved.item.quality).toBe(20);
        fireEvent.click(button("Undo"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
    });

    it("calculates and applies Breach essence, retaining raised quality after annulment, undo and save/load", async () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const crafting = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, base]) => base.item_class === "Ring" && !base.corrupted,
        )![0];
        const essence = data.crafting.poe2Essences.find(
            (entry) => entry.name === "Essence of the Breach",
        )!;
        const mod = essence.rules[0]!.mod!;
        const annul = data.crafting.currencies.find(
            (entry) => entry.action === "remove_random_mod",
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item: {
                ...crafting.createItem(base),
                rarity: "rare",
                mods: [
                    crafting.rollMod("IncreasedLife1", seededRandom(1)),
                    crafting.rollMod("ColdResist1", seededRandom(1)),
                ],
            },
            method: { kind: "currency", id: annul.id },
            target: { groups: [{ mods: [mod] }] },
            steps: [],
            prices: {},
            seed: 1,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ breach: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "breach" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: essence.name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: essence.name }));
        fireEvent.click(
            screen.getByRole("checkbox", { name: /Omen of Sinistral Crystallisation/ }),
        );
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method).toMatchObject({ kind: "essence", id: essence.id });
        expect(sent.target.groups[0].mods).toEqual([mod]);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("+20% to Maximum Quality");
        const catalyst = data.crafting.catalysts.find((entry) => entry.tags.includes("life"))!;
        fireEvent.change(screen.getByRole("combobox", { name: "Catalyst" }), {
            target: { value: catalyst.id },
        });
        fireEvent.change(screen.getByRole("spinbutton", { name: /Catalyst quality/ }), {
            target: { value: "40" },
        });
        expect(screen.getByText(/Current crafting maximum 40%/)).toBeDefined();
        fireEvent.change(picker, { target: { value: annul.name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: annul.name }));
        fireEvent.click(screen.getByRole("checkbox", { name: /Omen of Sinistral Annulment/ }));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).not.toContain("+20% to Maximum Quality");
        expect(card.textContent).toContain(`${catalyst.description}: +40%`);
        expect(screen.getByText(/Starting items can retain up to 50%/)).toBeDefined();
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("+20% to Maximum Quality");
        expect(card.textContent).toContain(`${catalyst.description}: +40%`);
        fireEvent.click(button("Redo"));
        expect(card.textContent).not.toContain("+20% to Maximum Quality");
        fireEvent.click(screen.getByText("Emulator spending"));
        const spending = screen.getByText("Emulator spending").closest("details")!;
        expect(spending.textContent).toContain("Essence of the Breach1");
        expect(spending.textContent).toContain("Omen of Sinistral Annulment1");
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.catalyst.quality).toBe(40);
        expect(saved.item.mods).toHaveLength(1);
        fireEvent.change(screen.getByRole("combobox", { name: "Catalyst" }), {
            target: { value: "" },
        });
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain(`${catalyst.description}: +40%`);
        expect(card.textContent).not.toContain("+20% to Maximum Quality");
    });

    it("sets base quality, targets Harvest enchantment life, and retains the result through undo and saves", async () => {
        mount();
        fireEvent.change(screen.getByLabelText("Base quality (%)"), { target: { value: "20" } });
        const recipe = catalog.crafting.harvest.find((entry) => entry.id === "LifeBodyEnchant")!;
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: "Enchant a Body Armour" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: `Harvest · ${recipe.name}` }));
        expect(screen.getByRole("region", { name: "Harvest enchantment" }).textContent).toContain(
            "Grants +1 to Maximum Life per 2% Quality",
        );
        fireEvent.click(screen.getByText("Enchantment requirement"));
        const targetPicker = screen.getByRole("combobox", { name: "Require enchantment" });
        fireEvent.change(targetPicker, { target: { value: "Maximum Life" } });
        fireEvent.keyDown(targetPicker, { key: "ArrowDown" });
        fireEvent.click(
            await screen.findByRole("option", {
                name: /Grants \+1 to Maximum Life per 2% Quality/,
            }),
        );
        fireEvent.click(screen.getByText("Final item property conditions"));
        fireEvent.click(button("Require Flat Life"));
        fireEvent.change(screen.getByLabelText("Minimum Flat Life"), { target: { value: "10" } });
        fireEvent.click(button("Calculate odds"));
        expect(screen.queryByRole("alert")).toBeNull();
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.target.enchantments).toEqual([recipe.enchantment!.mod]);
        expect(sent.target.properties).toEqual({ flatLife: { min: 10 } });
        const simulation = new CraftingSimulation(catalog, sent, false);
        for (let index = 0; index < 20; index++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({ probability: 1, errors: {} });
        act(() =>
            CraftingWorker.instances[0]!.onmessage?.({
                data: { type: "done", result: simulation.result() },
            }),
        );
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Quality: +20%");
        expect(card.textContent).toContain("0/0 prefixes · 0/0 suffixes");
        expect(card.textContent).toContain("Grants +1 to Maximum Life per 2% Quality");
        expect(
            within(card).getByRole("region", { name: "Final item properties" }).textContent,
        ).toContain("Flat Life10");
        fireEvent.click(screen.getByText("Emulator spending"));
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Wild Crystallised Lifeforce3,250",
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).not.toContain("Grants +1 to Maximum Life");
        expect(
            within(card).getByRole("region", { name: "Final item properties" }).textContent,
        ).toContain("Flat Life0");
        expect(card.textContent).toContain("Quality: +20%");
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain("Grants +1 to Maximum Life");
        fireEvent.change(screen.getByLabelText("Base quality (%)"), { target: { value: "19" } });
        expect(
            within(card).getByRole("region", { name: "Final item properties" }).textContent,
        ).toContain("Flat Life9");
        fireEvent.change(screen.getByLabelText("Base quality (%)"), { target: { value: "20" } });
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.click(button("Save project"));
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.quality).toBe(20);
        expect(saved.item.enchantments[0].id).toBe(recipe.enchantment!.mod);
        expect(saved.target.enchantments).toEqual([recipe.enchantment!.mod]);
        expect(saved.target.properties).toEqual({ flatLife: { min: 10 } });
        fireEvent.click(within(card).getByRole("button", { name: "Remove enchantment" }));
        expect(card.textContent).not.toContain("Grants +1 to Maximum Life");
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Grants +1 to Maximum Life");
        expect(
            within(card).getByRole("region", { name: "Final item properties" }).textContent,
        ).toContain("Flat Life10");
    });

    it("selects an influence reforge, dispatches it, and restores both lifeforce costs with undo", async () => {
        const method = { kind: "harvest" as const, id: "BossInfluence1" };
        const recipe = catalog.crafting.harvest.find((entry) => entry.id === method.id)!;
        const costs = engine.costs(method);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: { ...engine.createItem(baseId), rarity: "rare", influences: [0, 1] },
            target: { groups: [], rarity: "rare" },
            method: currency("reroll"),
            steps: [],
            prices: { [costs[0]!.id]: 0.01, [costs[1]!.id]: 10 },
            seed: 3,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ influenced: project }));
        mount();
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "influenced" },
        });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: "Reforge an Influenced Rare" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: `Harvest · ${recipe.name}` }));
        fireEvent.click(button("Calculate odds"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project.method).toEqual(
            method,
        );
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).not.toBe(before);
        expect(screen.getByText("Emulator spending")).toBeDefined();
        fireEvent.click(screen.getByText("Emulator spending"));
        const spending = screen.getByText("Emulator spending").closest("details")!;
        expect(spending.textContent).toContain("Primal Crystallised Lifeforce5,000");
        expect(spending.textContent).toContain("Sacred Crystallised Lifeforce1");
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.method).toEqual(method);
        expect(saved.item.influences).toEqual([0, 1]);
        expect(
            saved.item.mods.some(
                (entry: { id: string }) => catalog.crafting.modRules[entry.id]?.influence != null,
            ),
        ).toBe(true);
        const after = card.textContent;
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        expect(screen.queryByText("Emulator spending")).toBeNull();
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        expect(screen.getByText("Emulator spending")).toBeDefined();
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("selects, targets and saves an anointment in %s", async (game) => {
        const data =
            game === "poe1"
                ? catalog
                : craftingCatalogSchema.parse(
                      JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
                  );
        const crafting = new CraftingEngine(data);
        const amulet = Object.entries(data.bases).find(
            ([, base]) => base.item_class === "Amulet" && !base.corrupted,
        )![0];
        const recipe = data.crafting.anointing.recipes.find((entry) => entry.passive)!;
        const name = data.crafting.anointing.passives[recipe.passive!]!.name;
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: data.patch,
            item: crafting.createItem(amulet),
            target: { groups: [] },
            method: {
                kind: "currency",
                id: data.crafting.currencies.find((entry) => entry.action === "transmute_to_rare")!
                    .id,
            },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 10,
        });
        const key = `poe-boats:crafting:${game}:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ amulet: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "amulet" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(
            await screen.findByRole("option", { name: new RegExp(`Allocates ${name}$`) }),
        );
        expect(screen.getByRole("region", { name: "Anointing recipe" }).textContent).toContain(
            "Ingredients in recipe order",
        );
        fireEvent.click(screen.getByText("Anointment requirements"));
        const targetPicker = screen.getByRole("combobox", { name: "Require anointment" });
        fireEvent.change(targetPicker, { target: { value: name } });
        fireEvent.keyDown(targetPicker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: `Allocates ${name}` }));
        fireEvent.click(button("Calculate odds"));
        expect(screen.queryByRole("alert")).toBeNull();
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.target.anointments).toEqual([recipe.id]);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain(`Allocates ${name}`);
        expect(card.textContent).toContain("0/0 prefixes · 0/0 suffixes");
        expect(screen.getByText("Emulator spending")).toBeDefined();
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].item.anointments,
        ).toEqual([recipe.id]);
        fireEvent.click(button("Undo"));
        expect(card.textContent).not.toContain(`Allocates ${name}`);
        expect(screen.queryByText("Emulator spending")).toBeNull();
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain(`Allocates ${name}`);
        fireEvent.click(within(card).getByRole("button", { name: "Remove anointment" }));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain(`Allocates ${name}`);
    });

    it("selects a Liquid Emotion, targets its guarantee, and restores the crafted jewel and spending", async () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const crafting = new CraftingEngine(data);
        const item = crafting.addStartingMod(
            crafting.createItem("Metadata/Items/Jewels/JewelStr"),
            "JewelFireDamage",
            seededRandom(1),
        );
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            method: { kind: "currency", id: "Metadata/Items/Currency/DistilledEmotion1" },
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 10,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ jewel: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "jewel" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: "Potent Liquid Melancholy" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: /^Potent Liquid Melancholy$/ }));
        expect(
            screen.getByRole("region", { name: "Liquid Emotion outcome" }).textContent,
        ).toContain("Debilitate");
        fireEvent.change(screen.getByLabelText("Modifier source"), {
            target: { value: "emotion" },
        });
        fireEvent.change(screen.getByRole("textbox", { name: "Search modifiers" }), {
            target: { value: "Debilitate" },
        });
        const pool = screen.getByRole("region", { name: "Modifier pool" });
        fireEvent.click(within(pool).getByRole("button", { name: "Require" }));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Debilitate");
        expect(screen.getByText("Emulator spending").parentElement!.textContent).toContain(
            "Potent Liquid Melancholy",
        );
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.mods[0]).toMatchObject({
            id: "CraftedJewelDebilitateOnHitWhileEmeraldSapphireSocketed",
            crafted: true,
        });
        expect(saved.target.groups[0].mods).toEqual([
            "CraftedJewelDebilitateOnHitWhileEmeraldSapphireSocketed",
        ]);
        fireEvent.click(button("Undo"));
        expect(card.textContent).not.toContain("Debilitate");
        expect(screen.queryByText("Emulator spending")).toBeNull();
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain("Debilitate");
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Debilitate");
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("edits and saves independent stat requirements in %s", async (game) => {
        const data =
            game === "poe1"
                ? catalog
                : craftingCatalogSchema.parse(
                      JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
                  );
        mount("calculate", data);
        const requirements = screen.getByRole("region", { name: "Crafting requirements" });
        fireEvent.click(within(requirements).getByText("Stat value conditions"));
        const picker = within(requirements).getByRole("combobox", { name: "Add stat requirement" });
        fireEvent.change(picker, { target: { value: "base_maximum_life" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: /· base_maximum_life$/ }));
        fireEvent.change(within(requirements).getByLabelText("Minimum stat value"), {
            target: { value: "20" },
        });
        fireEvent.change(within(requirements).getByLabelText("Count values from"), {
            target: { value: "explicit" },
        });
        expect(within(requirements).getByText("Current item total: 0")).toBeDefined();
        fireEvent.click(button("Calculate odds"));
        expect(screen.queryByRole("alert")).toBeNull();
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.target.stats).toEqual([
            { id: "base_maximum_life", scope: "explicit", min: 20 },
        ]);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        fireEvent.click(button("Add condition check"));
        const processRegion = screen.getByRole("region", { name: "Crafting process" });
        fireEvent.click(within(processRegion).getByText("Edit step condition"));
        const step = within(processRegion).getByRole("region", { name: "Step 1 condition" });
        fireEvent.click(within(step).getByText("Stat value conditions"));
        fireEvent.change(within(step).getByLabelText("Minimum stat value"), {
            target: { value: "15" },
        });
        fireEvent.change(within(step).getByLabelText("Maximum stat value"), {
            target: { value: "30" },
        });
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(`poe-boats:crafting:${game}:${data.patch}`)!)[
            "My crafting project"
        ];
        expect(saved.target.stats).toEqual([
            { id: "base_maximum_life", scope: "explicit", min: 20 },
        ]);
        expect(saved.steps[0].condition.stats).toEqual([
            { id: "base_maximum_life", scope: "explicit", min: 15, max: 30 },
        ]);
        fireEvent.click(
            within(requirements).getByRole("button", { name: "Remove stat requirement" }),
        );
        fireEvent.click(button("Calculate odds"));
        expect(screen.getByRole("alert").textContent).toContain("at least one target");
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(
            (within(requirements).getByLabelText("Minimum stat value") as HTMLInputElement).value,
        ).toBe("20");
    });

    it("loads an editable currency sequence and saves its condition-only step", () => {
        mount();
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        const transmute = catalog.crafting.currencies.find(
            (entry) => entry.action === "transmute_to_magic",
        )!;
        fireEvent.change(screen.getByLabelText("Currency sequence"), {
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
        fireEvent.change(within(requirements).getByLabelText("Required rarity"), {
            target: { value: "normal" },
        });
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        fireEvent.click(button("Add condition check"));
        const processRegion = screen.getByRole("region", { name: "Crafting process" });
        fireEvent.click(within(processRegion).getByText("Edit step condition"));
        const condition = within(processRegion).getByRole("region", { name: "Step 1 condition" });
        fireEvent.click(within(condition).getByText("Item conditions"));
        fireEvent.change(within(condition).getByLabelText("Maximum total affixes"), {
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
        fireEvent.change(within(processRegion).getByLabelText("Step action"), {
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
        fireEvent.change(screen.getByLabelText("Currency sequence"), {
            target: { value: alteration.id },
        });
        expect(button("Use currency sequence").hasAttribute("disabled")).toBe(true);
        fireEvent.change(screen.getByRole("combobox", { name: "Rarity" }), {
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
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "process" } });
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

    it("combines three Waystone omens, saves their result, and restores spending with undo", () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const crafting = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, value]) => value.name === "Waystone (Tier 15)",
        )![0];
        let item: CraftingItem = { ...crafting.createItem(base), rarity: "rare" };
        for (let index = 0; index < 6; index++)
            item = crafting.addStartingMod(item, crafting.pool(item)[0]!.id, seededRandom(index));
        const method = {
            kind: "currency",
            id: data.crafting.currencies.find((entry) => entry.action === "reroll")!.id,
        };
        const project = craftingProjectSchema.parse({
            format: 1,
            game: data.game,
            patch: data.patch,
            item,
            method,
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 10,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ waystone: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "waystone" } });
        fireEvent.click(button("Load project"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        const names = [
            "Omen of Chaotic Quantity",
            "Omen of Chaotic Monsters",
            "Omen of Chaotic Effectiveness",
        ];
        for (const name of names)
            fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(`^${name}`) }));
        expect(
            screen
                .getByRole("checkbox", { name: /^Omen of Chaotic Rarity/ })
                .getAttribute("aria-disabled"),
        ).toBe("true");
        expect(
            screen
                .getByRole("checkbox", { name: /^Omen of Whittling/ })
                .getAttribute("aria-disabled"),
        ).toBe("true");
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain("3/3 prefixes · 3/3 suffixes");
        const spending = screen.getByText("Emulator spending").parentElement!;
        for (const name of ["Chaos Orb", ...names])
            expect(within(spending).getByText(name)).toBeDefined();
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.method.omens).toHaveLength(3);
        expect(
            saved.item.mods.every((entry: { id: string }) =>
                crafting.mod(entry.id).implicit_tags.includes("map_item_rarity"),
            ),
        ).toBe(true);
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        expect(screen.queryByText("Emulator spending")).toBeNull();
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        for (const name of names)
            expect(
                screen
                    .getByRole("checkbox", { name: new RegExp(`^${name}`) })
                    .getAttribute("aria-checked"),
            ).toBe("true");
        expect(card.textContent).not.toBe(before);
        expect(card.textContent).toContain("3/3 prefixes · 3/3 suffixes");
    });

    it("selects a level 30 Aspect, targets its tier, and preserves the craft through undo and save", async () => {
        mount();
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(picker, { target: { value: "Level 30 Aspect of the Spider" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(
            await screen.findByRole("option", { name: /Level 30 Aspect of the Spider/ }),
        );
        expect(screen.queryByLabelText("Beast level")).toBeNull();
        fireEvent.change(screen.getByLabelText("Modifier source"), {
            target: { value: "aspect" },
        });
        const pool = screen.getByRole("region", { name: "Modifier pool" });
        expect(within(pool).getAllByRole("button", { name: "Require" })).toHaveLength(8);
        const row = within(pool).getByText("Grants Level 30 Aspect of the Spider Skill")
            .parentElement!.parentElement!;
        fireEvent.click(within(row).getByRole("button", { name: "Tier or better" }));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Grants Level 30 Aspect of the Spider Skill");
        expect(card.textContent).toContain("0/1 prefixes · 1/1 suffixes");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(`poe-boats:crafting:poe1:${catalog.patch}`)!)[
            "My crafting project"
        ];
        expect(saved.method).toEqual({ kind: "beast", id: "EinharMasterCraftMorrigan3" });
        expect(saved.target.groups).toEqual([
            { mods: ["GrantsSpiderAspectCrafted30"], minimum: 1 },
        ]);
        expect(saved.item.mods[0]).toMatchObject({
            id: "GrantsSpiderAspectCrafted30",
            crafted: false,
        });
        expect(screen.getByText("Emulator spending")).toBeDefined();
        expect(screen.getByText("Emulator spending").parentElement!.textContent).toContain(
            "Beastcraft · Craft an Aspect Skill onto an Item: Level 30 Aspect of the Spider skill",
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).not.toContain("Aspect of the Spider");
        expect(screen.queryByText("Emulator spending")).toBeNull();
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain("Grants Level 30 Aspect of the Spider Skill");
        expect(screen.getByText("Emulator spending")).toBeDefined();
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("edits %s catalyst quality and preserves it through undo and save/load", (game) => {
        const data =
            game === "poe1"
                ? catalog
                : craftingCatalogSchema.parse(
                      JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
                  );
        const crafting = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, base]) => base.item_class === "Ring" && !base.corrupted,
        )![0];
        const item = crafting.addStartingMod(
            crafting.createItem(base),
            "IncreasedLife1",
            seededRandom(1),
        );
        item.mods[0]!.values = [15];
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: data.patch,
            item,
            method: {
                kind: "currency",
                id: data.crafting.currencies.find((entry) => entry.action === "reroll_mod_values")!
                    .id,
            },
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 10,
        });
        const key = `poe-boats:crafting:${game}:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ quality: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "quality" } });
        fireEvent.click(button("Load project"));
        const catalyst = data.crafting.catalysts.find((entry) =>
            entry.tags.includes(game === "poe1" ? "resource" : "life"),
        )!;
        fireEvent.change(screen.getByRole("combobox", { name: "Catalyst" }), {
            target: { value: catalyst.id },
        });
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("+18 to maximum Life");
        fireEvent.change(screen.getByRole("spinbutton", { name: /Catalyst quality/ }), {
            target: { value: "10" },
        });
        expect(card.textContent).toContain("+16 to maximum Life");
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("+18 to maximum Life");
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.catalyst).toEqual({ id: catalyst.id, quality: 20 });
        expect(saved.item.mods[0].values).toEqual([15]);
        fireEvent.change(screen.getByRole("combobox", { name: "Catalyst" }), {
            target: { value: "" },
        });
        expect(card.textContent).toContain("+15 to maximum Life");
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("+18 to maximum Life");
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain("+20%");
    });

    it.each([
        { game: "poe1", format: "ranged" },
        { game: "poe2", format: "ranged" },
        { game: "poe1", format: "blueprint" },
        { game: "poe2", format: "blueprint" },
    ] as const)("imports $game $format PoB rolls through preview, calculation, history and saves", ({
        game,
        format,
    }) => {
        const data =
            game === "poe1"
                ? catalog
                : craftingCatalogSchema.parse(
                      JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
                  );
        const current = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, entry]) => entry.item_class === "Body Armour" && entry.drop_level === 1,
        )![0];
        const divine = data.crafting.currencies.find(
            (entry) => entry.action === "reroll_mod_values",
        )!;
        const maximum = current.mod("IncreasedLife1").stats[0]!.max;
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: data.patch,
            item: current.createItem(base),
            method: { kind: "currency", id: divine.id },
            target: { groups: [], properties: { flatLife: { min: maximum } } },
            steps: [],
            prices: { [divine.id]: 2 },
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:${game}:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ ranges: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "ranges" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(screen.getByText("Import or export item text"));
        const field = screen.getByRole("textbox", { name: "Item text" });
        const value = game === "poe1" ? 17 : 15;
        const text =
            format === "blueprint"
                ? `Rarity: Rare\nTest\n${data.bases[base]!.name}\nCrafted: true\nPrefix: {range:0.5}IncreasedLife1\nSuffix: None\nItem Level: 86\nImplicits: 0\n{prefix}+${value} to maximum Life`
                : `Rarity: Rare\nTest\n${data.bases[base]!.name}\nItem Level: 86\nImplicits: 0\n{range:0.5}{modGroup:IncreasedLife1}${current.mod("IncreasedLife1").text}`;
        fireEvent.change(field, { target: { value: text } });
        fireEvent.click(button("Preview import"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByRole("region", { name: "Item import preview" }).textContent).toContain(
            `+${value} to maximum Life`,
        );
        fireEvent.click(button("Import selected item"));
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain(`+${value} to maximum Life`);
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[0]!;
        const sent = worker.postMessage.mock.calls[0]![0].project;
        expect(sent.item.mods[0].values).toEqual([value]);
        const simulation = new CraftingSimulation(data, sent, false);
        for (let index = 0; index < 100; index++) simulation.runTrial();
        expect(simulation.result().errors).toEqual({});
        expect(simulation.result().meanCost).toBe(2);
        act(() => worker.onmessage?.({ data: { type: "done", result: simulation.result() } }));
        fireEvent.click(button("Export current item text"));
        expect(field).toHaveProperty("value", expect.stringContaining(`+${value} to maximum Life`));
        expect((field as HTMLTextAreaElement).value).not.toContain("{range:");
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].item.mods[0].values,
        ).toEqual([value]);
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("normal");
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain(`+${value} to maximum Life`);
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        fireEvent.change(field, { target: { value: text.replace("{range:0.5}", "{range:1.5}") } });
        fireEvent.click(button("Preview import"));
        expect(screen.getByRole("alert").textContent).toContain("between 0 and 1");
        expect(screen.queryByRole("region", { name: "Item import preview" })).toBeNull();
        expect(card.textContent).toContain(`+${value} to maximum Life`);
        fireEvent.change(field, {
            target: {
                value: text.replace(
                    "Item Level: 86",
                    "Prefix: {range:0.5}UnknownModifier\nItem Level: 86",
                ),
            },
        });
        fireEvent.click(button("Preview import"));
        expect(screen.getByRole("alert").textContent).toContain(
            "does not match an extracted modifier",
        );
        expect(screen.queryByRole("region", { name: "Item import preview" })).toBeNull();
        expect(card.textContent).toContain(`+${value} to maximum Life`);
    });

    it("exports, copies and imports an item through a preview with undo support", async () => {
        mount();
        fireEvent.click(button("Apply craft"));
        fireEvent.click(screen.getByText("Import or export item text"));
        fireEvent.click(button("Export current item text"));
        const field = screen.getByRole("textbox", { name: "Item text" });
        const text = (field as HTMLTextAreaElement).value;
        expect(text).toContain("Rarity: RARE");
        expect(text).toContain("{modGroup:");
        const copy = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
        await act(async () => fireEvent.click(button("Copy item text")));
        expect(copy).toHaveBeenCalledWith(text);
        expect(screen.getByText("Item text copied.")).toBeDefined();
        fireEvent.click(button("Reset"));
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain(
            "normal",
        );
        fireEvent.click(button("Preview import"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByRole("region", { name: "Item import preview" }).textContent).toContain(
            "rare",
        );
        fireEvent.click(button("Import selected item"));
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain("rare");
        fireEvent.click(button("Undo"));
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain(
            "normal",
        );
    });

    it("exposes ambiguous hybrid matches and rejects unknown modifier text", () => {
        mount();
        fireEvent.click(screen.getByText("Import or export item text"));
        const text = `Rarity: RARE\nTest\nPlate Vest\nItem Level: 86\nImplicits: 0\n+100 to Armour\n+35 to maximum Life`;
        fireEvent.change(screen.getByRole("textbox", { name: "Item text" }), {
            target: { value: text },
        });
        fireEvent.click(button("Preview import"));
        const options = within(
            screen.getByRole("combobox", { name: "Matching item" }),
        ).getAllByRole("option");
        expect(options.length).toBeGreaterThan(1);
        const hybrid = options.findIndex((option) => option.textContent?.includes("Crocodile"));
        expect(hybrid).toBeGreaterThanOrEqual(0);
        fireEvent.change(screen.getByRole("combobox", { name: "Matching item" }), {
            target: { value: String(hybrid) },
        });
        expect(screen.getByRole("region", { name: "Item import preview" }).textContent).toContain(
            "1/3 prefixes",
        );
        fireEvent.click(button("Import selected item"));
        fireEvent.change(screen.getByRole("textbox", { name: "Item text" }), {
            target: { value: `${text}\nUnknown modifier` },
        });
        fireEvent.click(button("Preview import"));
        expect(screen.getByRole("alert").textContent).toContain("Unknown modifier");
        expect(screen.queryByRole("region", { name: "Item import preview" })).toBeNull();
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain(
            "1/3 prefixes",
        );
    });

    it("replaces a full item's modifier with a lich omen and keeps its restriction through rerolls", () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const poe2 = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(([, base]) => base.item_class === "Ring")![0];
        const bone = data.crafting.currencies.find(
            (entry) => entry.action === "abyssal_bench_ticket_jewellery",
        )!;
        const omen = data.crafting.currencies.find((entry) =>
            entry.id.endsWith("/OmenOnAbyssGuarenteeLichTypeMod1"),
        )!;
        let item: CraftingItem = { ...poe2.createItem(base), rarity: "rare" };
        for (let i = 0; i < 6; i++)
            item = poe2.addStartingMod(item, poe2.pool(item)[0]!.id, seededRandom(i));
        const project = craftingProjectSchema.parse({
            format: 1,
            game: data.game,
            patch: data.patch,
            item,
            method: { kind: "currency", id: bone.id },
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 10,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ lich: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "lich" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(screen.getByRole("checkbox", { name: /^Omen of the Sovereign/ }));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const panel = screen.getByRole("region", { name: "Reveal modifier" });
        expect(panel.textContent).toContain("Applied during desecration: Omen of the Sovereign");
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain(
            "3/3 prefixes · 3/3 suffixes",
        );
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].item.reveal.omens,
        ).toEqual([omen.id]);
        fireEvent.click(button("Reveal with Omen of Abyssal Echoes"));
        fireEvent.click(button("Reroll reveal choices"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.reveal.omens).toEqual([omen.id]);
        expect(saved.item.reveal.choices.length).toBeGreaterThan(0);
        expect(saved.item.mods).toHaveLength(6);
        expect(
            saved.item.mods.filter((entry: { id: string }) =>
                item.mods.some((original) => original.id === entry.id),
            ),
        ).toHaveLength(5);
        expect(
            saved.item.reveal.choices.some((id: string) =>
                poe2.mod(id).implicit_tags.includes("ulaman_mod"),
            ),
        ).toBe(true);
        fireEvent.click(within(panel).getByRole("button", { name: /^1\./ }));
        expect(screen.queryByRole("region", { name: "Reveal modifier" })).toBeNull();
        fireEvent.click(button("Undo"));
        expect(screen.getByRole("region", { name: "Reveal modifier" }).textContent).toContain(
            "Applied during desecration: Omen of the Sovereign",
        );
    });

    it("reveals with Echoes, tracks spending, and preserves reroll state through undo and load", () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const poe2 = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, base]) => base.item_class === "Body Armour" && base.tags.includes("str_armour"),
        )![0];
        const bone = data.crafting.currencies.find(
            (entry) => entry.action === "abyssal_bench_ticket_armour",
        )!;
        const omen = data.crafting.currencies.find((entry) =>
            entry.id.endsWith("/OmenOnAbyssRerollOptions"),
        )!;
        const item = poe2.apply(
            { ...poe2.createItem(base), rarity: "rare" },
            { kind: "currency", id: bone.id },
            seededRandom(1),
        ).item;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: data.game,
            patch: data.patch,
            item,
            method: { kind: "reveal", preferred: [] },
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 10,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ echoes: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "echoes" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(screen.getByRole("checkbox", { name: /^Omen of Abyssal Echoes/ }));
        fireEvent.click(screen.getByText("Custom prices in chaos"));
        fireEvent.change(screen.getByRole("spinbutton", { name: omen.name }), {
            target: { value: "7" },
        });
        fireEvent.click(button(`Reveal with ${omen.name}`));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(button("Reroll reveal choices").hasAttribute("disabled")).toBe(false);
        fireEvent.click(screen.getByText("Emulator spending"));
        const spending = screen.getByText("Emulator spending").parentElement!;
        expect(within(spending).getByText(omen.name)).toBeDefined();
        expect(within(spending).getByText("1")).toBeDefined();
        fireEvent.click(button("Save project"));
        const initialSave = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(initialSave.item.reveal.echoes).toEqual({ omen: omen.id, remaining: 1 });
        expect(initialSave.method.omens).toEqual([omen.id]);
        expect(initialSave.prices[omen.id]).toBe(7);
        fireEvent.click(button("Reroll reveal choices"));
        expect(button("Reroll reveal choices").hasAttribute("disabled")).toBe(true);
        expect(within(spending).getByText("1")).toBeDefined();
        fireEvent.click(button("Undo"));
        expect(button("Reroll reveal choices").hasAttribute("disabled")).toBe(false);
        fireEvent.click(button("Redo"));
        expect(button("Reroll reveal choices").hasAttribute("disabled")).toBe(true);
        fireEvent.click(button("Save project"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(button("Reroll reveal choices").hasAttribute("disabled")).toBe(true);
        fireEvent.click(
            within(screen.getByRole("region", { name: "Reveal modifier" })).getByRole("button", {
                name: /^1\./,
            }),
        );
        expect(screen.queryByRole("region", { name: "Reveal modifier" })).toBeNull();
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("edits beast level, applies a swap and saves its modifier provenance", () => {
        const empty = { ...engine.createItem(baseId, 5), rarity: "rare" as const };
        const item = engine.addStartingMod(
            empty,
            engine.pool(empty, { side: "suffix" })[0]!.id,
            seededRandom(1),
        );
        const project = craftingProjectSchema.parse({
            format: 1,
            game: catalog.game,
            patch: catalog.patch,
            item,
            method: { kind: "beast", id: "EinharMasterCraft31", level: 5 },
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 10,
        });
        localStorage.setItem(
            `poe-boats:crafting:poe1:${catalog.patch}`,
            JSON.stringify({ beast: project }),
        );
        mount();
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "beast" } });
        fireEvent.click(button("Load project"));
        fireEvent.change(screen.getByLabelText("Beast level"), { target: { value: "86" } });
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain(
            "beast level 86",
        );
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(`poe-boats:crafting:poe1:${catalog.patch}`)!)[
            "My crafting project"
        ];
        expect(saved.method.level).toBe(86);
        expect(saved.item.level).toBe(5);
        expect(saved.item.mods[0].origin).toEqual({
            kind: "beast",
            level: 86,
            recipe: "EinharMasterCraft31",
        });
    });

    it("selects an inventory donor, prices it and applies an Awakener transfer", () => {
        const target = { ...engine.createItem(baseId), influences: [0] };
        const donor = {
            id: "elder-donor",
            name: "Elder donor",
            item: { ...engine.createItem(baseId), influences: [1] },
            tab: "Donors",
        };
        const method = currency("transfer_item_influence");
        const project = craftingProjectSchema.parse({
            format: 1,
            game: catalog.game,
            patch: catalog.patch,
            item: target,
            inventory: [donor],
            inventoryTabs: ["Donors"],
            method,
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 10,
        });
        localStorage.setItem(
            `poe-boats:crafting:poe1:${catalog.patch}`,
            JSON.stringify({ awakening: project }),
        );
        mount();
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "awakening" },
        });
        fireEvent.click(button("Load project"));
        fireEvent.change(screen.getByLabelText("Donor item"), {
            target: { value: donor.id },
        });
        fireEvent.click(screen.getByText("Custom prices in chaos"));
        fireEvent.change(screen.getByLabelText("Donor · Elder donor"), {
            target: { value: "50" },
        });
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByText(/Awakener's Orb · 1 crafts/)).toBeDefined();
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(`poe-boats:crafting:poe1:${catalog.patch}`)!);
        expect(saved["My crafting project"].item.influences).toEqual([0, 1]);
        expect(saved["My crafting project"].method.donor).toEqual(donor);
        expect(saved["My crafting project"].prices["donor:elder-donor"]).toBe(50);
        expect(saved["My crafting project"].inventory).toEqual([donor]);
        fireEvent.click(button("Undo"));
        expect(screen.queryByText("Emulator spending")).toBeNull();
    });

    it("stores and loads independent inventory snapshots and includes them in a saved project", () => {
        mount();
        fireEvent.click(button("Apply craft"));
        const crafted = screen.getByRole("region", { name: "Current item" }).textContent;
        fireEvent.click(screen.getByText("Item inventory (0)"));
        fireEvent.change(screen.getByLabelText("Inventory item name"), {
            target: { value: "First attempt" },
        });
        fireEvent.click(button("Store current item"));
        fireEvent.click(button("Reset"));
        fireEvent.click(button("Load First attempt"));
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toBe(crafted);
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.click(button("Save project"));
        const saves = JSON.parse(localStorage.getItem(`poe-boats:crafting:poe1:${catalog.patch}`)!);
        expect(saves["My crafting project"].inventory[0].name).toBe("First attempt");
        fireEvent.click(button("Delete First attempt"));
        expect(screen.getByText("Item inventory (0)")).toBeDefined();
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
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "veiled" } });
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
    it("applies a craft, undoes and redoes both the item and spending", () => {
        mount();
        const before = screen.getByRole("region", { name: "Current item" }).textContent;
        fireEvent.click(button("Apply craft"));
        const crafted = screen.getByRole("region", { name: "Current item" }).textContent;
        expect(crafted).not.toBe(before);
        expect(screen.getByText(/Orb of Alchemy · 1 crafts/)).toBeDefined();
        fireEvent.click(button("Undo"));
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toBe(before);
        expect(screen.queryByText("Emulator spending")).toBeNull();
        fireEvent.click(button("Redo"));
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toBe(crafted);
        expect(screen.getByText("Emulator spending")).toBeDefined();
    });

    it("saves and restores a build-specific project, including its item", () => {
        mount();
        fireEvent.click(button("Apply craft"));
        const crafted = screen.getByRole("region", { name: "Current item" }).textContent;
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Project name"), {
            target: { value: "Life armour" },
        });
        fireEvent.click(button("Save project"));
        fireEvent.click(button("Reset"));
        expect(screen.getByRole("region", { name: "Current item" }).textContent).not.toBe(crafted);
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "Life armour" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toBe(crafted);
        const saved = JSON.parse(localStorage.getItem(`poe-boats:crafting:poe1:${catalog.patch}`)!);
        expect(saved["Life armour"].game).toBe("poe1");
        expect(saved["Life armour"].patch).toBe(catalog.patch);
    });

    it("requires targets, dispatches worker jobs, cancels and ignores stale results", () => {
        const view = mount("calculate");
        fireEvent.click(button("Calculate odds"));
        expect(screen.getByRole("alert").textContent).toContain("at least one target");
        fireEvent.click(screen.getAllByRole("button", { name: "Require" })[0]!);
        fireEvent.click(button("Mass simulate"));
        const worker = CraftingWorker.instances[0]!;
        const project: CraftingProject = worker.postMessage.mock.calls[0]![0].project;
        expect(project.target.groups).toHaveLength(1);
        const simulation = new CraftingSimulation(catalog, project);
        simulation.runTrial();
        act(() => worker.onmessage?.({ data: { type: "progress", result: simulation.result() } }));
        expect(screen.getByRole("region", { name: "Crafting results" })).toBeDefined();
        fireEvent.click(button("Stop simulation"));
        expect(worker.terminate).toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText("Item level"), { target: { value: "80" } });
        act(() => worker.onmessage?.({ data: { type: "done", result: simulation.result() } }));
        expect(screen.queryByRole("region", { name: "Crafting results" })).toBeNull();
        view.unmount();
    });

    it("selects a tier or better as one alternative group and exposes recipe guarantees", () => {
        mount("calculate");
        fireEvent.change(screen.getByRole("textbox", { name: "Search modifiers" }), {
            target: { value: "maximum Life" },
        });
        fireEvent.click(screen.getAllByRole("button", { name: "Tier or better" })[2]!);
        expect(screen.getByRole("region", { name: "Crafting requirements" }).textContent).toContain(
            "Group 1",
        );
        fireEvent.change(screen.getByLabelText("Modifier source"), {
            target: { value: "essence" },
        });
        expect(screen.getByText(/provided by extracted recipes/)).toBeDefined();
    });

    it("dispatches Allflame fossil optimization with sulphur prices and retains the selected method", () => {
        const item = { ...engine.createItem(baseId), rarity: "rare" as const };
        const fossil = engine
            .availableFossils(item)
            .find((entry) => entry.name === "Pristine Fossil")!;
        const resonator = catalog.crafting.currencies.find(
            (entry) =>
                entry.action === "delve_currency_reroll" &&
                entry.id.endsWith("1") &&
                catalog.crafting.allflame!.currencies.some(
                    (bracket) => bracket.currency === entry.id,
                ),
        )!;
        const method = {
            kind: "fossils",
            ids: [fossil.id],
            resonator: resonator.id,
            logic: "additive",
            allflame: true,
        };
        const sulphur = catalog.crafting.allflame!.sulphur;
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method,
            target: { groups: [], intangibility: { min: 5, max: 100 } },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 10,
            maxActions: 1,
        });
        localStorage.setItem(key, JSON.stringify({ allflame: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "allflame" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(screen.getByText("Fossil optimizer"));
        const optimizer = within(screen.getByText("Fossil optimizer").closest("details")!);
        expect(optimizer.getByRole("note").textContent).toContain("Uses Allflame");
        fireEvent.click(optimizer.getByText("Optimizer prices in chaos"));
        fireEvent.change(optimizer.getByLabelText("Dead Man's Sulphur"), {
            target: { value: "0.01" },
        });
        fireEvent.click(button("Compare fossils"));
        const worker = CraftingWorker.instances[0]!;
        expect(worker.postMessage.mock.calls[0]![0]).toMatchObject({
            type: "optimize",
            options: { allflame: true },
            project: { prices: { [sulphur]: 0.01 } },
        });
        const candidate = {
            method,
            probability: 0.5,
            interval: [0.4, 0.6],
            trials: 100,
            successes: 50,
            cost: 38.6,
            costPerSuccess: 77.2,
        };
        act(() =>
            worker.onmessage?.({
                data: {
                    type: "done",
                    result: {
                        completed: 1,
                        total: 1,
                        failed: 0,
                        errors: [],
                        byAttempts: [candidate],
                        byCost: [candidate],
                    },
                },
            }),
        );
        fireEvent.click(button("Use combination"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.method).toEqual(method);
        expect(saved.prices[sulphur]).toBe(0.01);
        fireEvent.click(screen.getByRole("checkbox", { name: "Use Allflame crafting" }));
        expect(optimizer.queryByRole("note")).toBeNull();
        fireEvent.click(button("Compare fossils"));
        expect(
            CraftingWorker.instances[1]!.postMessage.mock.calls[0]![0].options.allflame,
        ).toBeUndefined();
    });

    it("dispatches fossil optimization and clears stale results when requirements change", () => {
        mount("calculate");
        fireEvent.click(screen.getAllByRole("button", { name: "Require" })[0]!);
        fireEvent.click(screen.getByText("Fossil optimizer"));
        fireEvent.change(screen.getByLabelText("Maximum resonator sockets"), {
            target: { value: "2" },
        });
        fireEvent.click(button("Compare fossils"));
        const worker = CraftingWorker.instances[0]!;
        expect(worker.postMessage.mock.calls[0]![0]).toMatchObject({
            type: "optimize",
            options: { maxSockets: 2 },
        });
        act(() =>
            worker.onmessage?.({
                data: {
                    type: "progress",
                    result: {
                        completed: 1,
                        total: 3,
                        failed: 0,
                        errors: [],
                        byAttempts: [],
                        byCost: [],
                    },
                },
            }),
        );
        expect(screen.getByText("1 / 3 combinations completed")).toBeDefined();
        fireEvent.click(button("Stop optimizer"));
        expect(worker.terminate).toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText("Maximum resonator sockets"), {
            target: { value: "1" },
        });
        expect(screen.queryByText("1 / 3 combinations completed")).toBeNull();
    });
});

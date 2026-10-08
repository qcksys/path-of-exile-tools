// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import { CraftingSimulation, calculateExact } from "~/lib/crafting-simulation";
import { craftingProjectSchema } from "~/schemas/crafting";
import { changeControl, expectControlValue } from "./control-helpers";
import { catalog, getCatalog } from "./crafting-fixtures";
import { button, CraftingWorker, mount } from "./crafting-workbench-ui-fixtures";

describe("crafting workbench", () => {
    it.each([
        "poe1",
        "poe2",
    ] as const)("uses %s required character level across crafting modes and saved history", (game) => {
        const data = getCatalog(game);
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "level" } });
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
        changeControl(screen.getByLabelText("Minimum Required Character Level"), {
            target: { value: "0" },
        });
        changeControl(screen.getByLabelText("Maximum Required Character Level"), {
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        expectControlValue(screen.getByLabelText("Maximum Required Character Level"), "10");
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("uses %s attribute requirements in targets and saved crafting history", (game) => {
        const data = getCatalog(game);
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
        changeControl(screen.getByLabelText("Saved project"), {
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
        changeControl(screen.getByLabelText("Minimum Strength Requirement"), {
            target: { value: "0" },
        });
        changeControl(screen.getByLabelText("Maximum Strength Requirement"), {
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        expectControlValue(screen.getByLabelText("Maximum Strength Requirement"), String(maximum));
    });

    it("uses extracted reload time for PoE 2 targets, calculation, simulation and saved history", () => {
        const data = getCatalog("poe2");
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "reload" } });
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
        changeControl(screen.getByLabelText("Minimum Reload Time (s)"), {
            target: { value: "0" },
        });
        changeControl(screen.getByLabelText("Maximum Reload Time (s)"), {
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        expectControlValue(screen.getByLabelText("Maximum Reload Time (s)"), "0.64");
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("edits %s aggregate resistance and life targets through calculation, history and saves", (game) => {
        const data = game === "poe1" ? catalog : getCatalog("poe2");
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "totals" } });
        fireEvent.click(button("Load project"));
        const card = screen.getByRole("region", { name: "Current item" });
        const properties = within(card).getByRole("region", { name: "Final item properties" });
        expect(properties.textContent).toContain("Flat Life10");
        expect(properties.textContent).toContain("Total Resistance (%)");
        fireEvent.click(screen.getByText("Final item property conditions"));
        fireEvent.click(button("Require Total Resistance (%)"));
        const input = screen.getByLabelText("Minimum Total Resistance (%)");
        expect(input.hasAttribute("min")).toBe(false);
        changeControl(input, { target: { value: "-1" } });
        fireEvent.click(button("Require Flat Life"));
        const maximum = current.mod("IncreasedLife1").stats[0]!.max;
        changeControl(screen.getByLabelText("Minimum Flat Life"), {
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expectControlValue(screen.getByLabelText("Minimum Total Resistance (%)"), "-1");
        expectControlValue(screen.getByLabelText("Minimum Flat Life"), String(maximum));
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("uses %s flask properties in calculation, simulation, history and saves", (game) => {
        const data = game === "poe1" ? catalog : getCatalog("poe2");
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "flask" } });
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
        changeControl(screen.getByLabelText("Minimum Life Recovery"), {
            target: { value: String(maximum) },
        });
        fireEvent.click(button("Require Charges per Use"));
        changeControl(screen.getByLabelText("Minimum Charges per Use"), {
            target: { value: "" },
        });
        fireEvent.click(button("Require Charges per Use"));
        changeControl(screen.getByLabelText("Maximum Charges per Use"), {
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expectControlValue(screen.getByLabelText("Minimum Life Recovery"), String(maximum));
        expectControlValue(screen.getByLabelText("Maximum Charges per Use"), "10");
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("edits and saves independent stat requirements in %s", async (game) => {
        const data = game === "poe1" ? catalog : getCatalog("poe2");
        mount("calculate", data);
        const requirements = screen.getByRole("region", { name: "Crafting requirements" });
        fireEvent.click(within(requirements).getByText("Stat value conditions"));
        const picker = within(requirements).getByRole("combobox", { name: "Add stat requirement" });
        changeControl(picker, { target: { value: "base_maximum_life" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: /· base_maximum_life$/ }));
        changeControl(within(requirements).getByLabelText("Minimum stat value"), {
            target: { value: "20" },
        });
        changeControl(within(requirements).getByLabelText("Count values from"), {
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
        changeControl(within(step).getByLabelText("Minimum stat value"), {
            target: { value: "15" },
        });
        changeControl(within(step).getByLabelText("Maximum stat value"), {
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(
            (within(requirements).getByLabelText("Minimum stat value") as HTMLInputElement).value,
        ).toBe("20");
    });

    it("selects a tier or better as one alternative group and exposes recipe guarantees", () => {
        mount("calculate");
        changeControl(screen.getByRole("textbox", { name: "Search modifiers" }), {
            target: { value: "maximum Life" },
        });
        fireEvent.click(screen.getAllByRole("button", { name: "Tier or better" })[2]!);
        expect(screen.getByRole("region", { name: "Crafting requirements" }).textContent).toContain(
            "Group 1",
        );
        changeControl(screen.getByLabelText("Modifier source"), {
            target: { value: "essence" },
        });
        expect(screen.getByText(/provided by extracted recipes/)).toBeDefined();
    });
});

// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ProcessRouteResults } from "~/components/crafting/process-route-results";
import { CraftingWorkbench } from "~/components/crafting/workbench";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import { availableOmens } from "~/lib/crafting-omens";
import {
    CraftingProcess,
    CraftingSimulation,
    calculateProcessExact,
} from "~/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "~/schemas/crafting";
import { catalog } from "./crafting-fixtures";

class CraftingWorker {
    static instances: CraftingWorker[] = [];
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: { message: string }) => void) | null = null;
    terminate = vi.fn();
    postMessage = vi.fn();
    constructor() {
        CraftingWorker.instances.push(this);
    }
}
const catalogs = [
    catalog,
    craftingCatalogSchema.parse(
        JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
    ),
];
const button = (name: string) =>
    within(screen.getByText(name, { selector: "button" }).parentElement!).getByRole("button", {
        name,
    });
async function selectRouteDestination(control: HTMLElement, name: string) {
    fireEvent.click(control);
    const option = within(await screen.findByRole("listbox")).getByRole("option", { name });
    act(() => option.focus());
    fireEvent.keyDown(option, { key: "Enter" });
}
const scrollIntoView = vi.fn();

beforeEach(() => {
    CraftingWorker.instances = [];
    localStorage.clear();
    vi.stubGlobal("Worker", CraftingWorker);
    vi.stubGlobal(
        "DOMMatrixReadOnly",
        class {
            m22 = 1;
        },
    );
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: scrollIntoView,
    });
    scrollIntoView.mockClear();
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

function fixture(data = catalog) {
    const engine = new CraftingEngine(data);
    const base = Object.entries(data.bases).find(
        ([, entry]) => entry.item_class === "Body Armour" && !entry.implicits.length,
    )![0];
    let item = engine.addStartingMod(engine.createItem(base), "IncreasedLife1", seededRandom(1));
    item = engine.addStartingMod({ ...item, rarity: "rare" }, "ColdResist1", seededRandom(1));
    const annul = data.crafting.currencies.find((entry) => entry.action === "remove_random_mod")!;
    const method = { kind: "currency", id: annul.id } as const;
    const target = engine.validateTarget({ groups: [{ mods: ["IncreasedLife1"] }] });
    const project = craftingProjectSchema.parse({
        format: 1,
        game: data.game,
        patch: data.patch,
        item,
        method,
        target,
        useProcess: true,
        steps: [
            {
                id: "annul",
                name: "Keep life",
                description: "Remove resistance and keep life",
                position: { x: 100, y: 60 },
                method,
                condition: target,
                onSuccess: "finish",
                onFailure: "restart",
            },
            { id: "finish", name: "Final check", condition: { groups: [] } },
        ],
        prices: { [annul.id]: 2 },
        seed: 42,
        iterations: 10,
        maxActions: 3,
    });
    const key = `poe-boats:crafting:${data.game}:${data.patch}`;
    function mount(mode: "calculate" | "simulate" = "calculate") {
        localStorage.setItem(key, JSON.stringify({ process: project }));
        render(
            <MemoryRouter>
                <CraftingWorkbench catalog={data} mode={mode} />
            </MemoryRouter>,
        );
        fireEvent.change(screen.getByLabelText("Search modifiers"), {
            target: { value: "IncreasedLife1" },
        });
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "process" } });
        fireEvent.click(button("Load project"));
    }
    return { engine, project, key, mount };
}

describe.each(catalogs)("$game process routes and flowchart", (data) => {
    it("creates a restart process from nested calculator requirements and preserves the setup", () => {
        const { engine, project, key, mount } = fixture(data);
        project.useProcess = false;
        project.steps = [];
        project.baseCost = 5;
        project.target = engine.validateTarget({
            groups: [],
            expression: {
                operator: "and",
                operands: [
                    project.target,
                    {
                        groups: [],
                        expression: {
                            operator: "and",
                            negated: true,
                            operands: [{ groups: [{ mods: ["ColdResist1"] }] }],
                        },
                    },
                ],
            },
        });
        mount();
        const before = screen.getByRole("region", { name: "Current item" }).textContent;
        const spendingBefore = screen
            .getByText("Emulator spending")
            .closest("details")!.textContent;
        fireEvent.click(button("Mass simulate"));
        const previous = CraftingWorker.instances[0]!;
        fireEvent.click(button("Create process from calculator"));
        expect(previous.terminate).toHaveBeenCalled();
        expect(screen.queryByText("Create process from calculator")).toBeNull();
        expect(screen.getByLabelText("Condition failed")).toHaveProperty("value", "restart");
        expect(screen.getByLabelText("Combine crafting steps")).toHaveProperty("checked", true);
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toBe(before);
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toBe(
            spendingBefore,
        );
        expect(CraftingWorker.instances).toHaveLength(1);
        act(() => previous.onmessage?.({ data: { type: "error", message: "Obsolete job" } }));
        expect(screen.queryByText("Obsolete job")).toBeNull();

        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[1]!;
        const converted = craftingProjectSchema.parse(worker.postMessage.mock.calls[0]![0].project);
        expect(converted).toEqual({
            ...project,
            useProcess: true,
            steps: [
                {
                    id: expect.any(String),
                    method: project.method,
                    condition: project.target,
                    onSuccess: "success",
                    onFailure: "restart",
                },
            ],
        });
        const result = calculateProcessExact(engine, converted);
        expect(result).toMatchObject({
            probability: 7 / 8,
            baseItems: 7 / 4,
            baseSpending: 8.75,
            meanCost: 12.25,
        });
        act(() => worker.onmessage?.({ data: { type: "done", result } }));
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"]).toEqual(converted);
        expect(JSON.parse(localStorage.getItem(`${key}:draft:v1`)!)).toEqual(converted);
        cleanup();
        render(
            <MemoryRouter>
                <CraftingWorkbench catalog={data} />
            </MemoryRouter>,
        );
        expect(screen.getByLabelText("Condition failed")).toHaveProperty("value", "restart");
        expect(CraftingWorker.instances).toHaveLength(2);
    });

    it("explicitly replaces an existing process while retaining method options and item history", () => {
        const { project, key, mount } = fixture(data);
        project.useProcess = false;
        project.method = {
            ...project.method,
            ...(data.game === "poe1"
                ? { allflame: true }
                : { omens: [availableOmens(data, project.method)[0]!.id] }),
        };
        const previousSteps = structuredClone(project.steps);
        mount();
        fireEvent.change(screen.getByLabelText("Item level"), { target: { value: "100" } });
        const before = screen.getByRole("region", { name: "Current item" }).textContent;
        expect(screen.getByText(/Replaces the existing process\./)).toBeDefined();
        fireEvent.click(button("Replace process from calculator"));
        fireEvent.click(button("Save project"));
        const saved = craftingProjectSchema.parse(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"],
        );
        expect(saved.steps).toHaveLength(1);
        expect(saved.steps[0]!.method).toEqual(project.method);
        expect(saved.steps[0]!.condition).toEqual(project.target);
        expect(saved.item).toEqual({ ...project.item, level: 100 });
        expect(project.steps).toEqual(previousSteps);
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toBe(before);
        fireEvent.change(screen.getByLabelText("Step action"), { target: { value: "check" } });
        fireEvent.click(button("Save project"));
        const edited = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(edited.steps[0].method).toBeUndefined();
        expect(edited.method).toEqual(project.method);
        fireEvent.click(button("Undo"));
        expect(screen.getByLabelText("Item level")).toHaveProperty(
            "value",
            String(project.item.level),
        );
        expect(screen.queryByText("Emulator spending")).toBeNull();
    });

    it("omits the unused calculator trial count on the continuous simulator page", () => {
        const { project, mount } = fixture(data);
        project.simulationLimit = { kind: "manual" };
        mount("simulate");
        expect(screen.queryByText("Create process from calculator")).toBeNull();
        expect(screen.queryByText("Replace process from calculator")).toBeNull();
        expect(screen.queryByLabelText("Calculator trials")).toBeNull();
        expect(screen.queryByLabelText("Maximum trials")).toBeNull();
        fireEvent.click(button("Run simulation"));
        expect(CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0]).toMatchObject({
            type: "process",
            project: { simulationLimit: { kind: "manual" }, iterations: project.iterations },
        });
        fireEvent.click(button("Stop simulation"));
        fireEvent.change(screen.getByLabelText("Stop simulation after"), {
            target: { value: "trials" },
        });
        expect(screen.getByLabelText("Trials")).toHaveProperty("value", String(project.iterations));
    });

    it("persists continuous simulation and retains its last batch when stopped", () => {
        const { key, mount } = fixture(data);
        mount();
        fireEvent.change(screen.getByLabelText("Stop simulation after"), {
            target: { value: "manual" },
        });
        expect(screen.queryByLabelText("Simulation action limit")).toBeNull();
        expect(screen.queryByLabelText("Successful item target")).toBeNull();
        fireEvent.change(screen.getByLabelText("Calculator trials"), { target: { value: "1" } });
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].simulationLimit,
        ).toEqual({ kind: "manual" });
        expect(JSON.parse(localStorage.getItem(`${key}:draft:v1`)!).simulationLimit).toEqual({
            kind: "manual",
        });
        fireEvent.click(button("Mass simulate"));
        const worker = CraftingWorker.instances[0]!;
        const simulation = new CraftingSimulation(
            data,
            worker.postMessage.mock.calls[0]![0].project,
        );
        for (let i = 0; i < 12; i++) simulation.runTrial();
        const result = simulation.result();
        act(() => worker.onmessage?.({ data: { type: "progress", result } }));
        expect(
            screen.getByRole("progressbar", { name: "Simulation progress" }).hasAttribute("value"),
        ).toBe(false);
        expect(screen.getByText("12 completed trials · Running until stopped")).toBeDefined();
        expect(screen.getByRole("region", { name: "Crafting results" }).textContent).not.toContain(
            "95% interval",
        );
        fireEvent.click(button("Stop simulation"));
        expect(worker.terminate).toHaveBeenCalled();
        expect(screen.getByText("Stopped. Results show only completed trials.")).toBeDefined();
        simulation.runTrial();
        act(() => worker.onmessage?.({ data: { type: "progress", result: simulation.result() } }));
        expect(screen.getByRole("region", { name: "Crafting results" }).textContent).toContain(
            "12 trials",
        );
        expect(screen.getByRole("region", { name: "Crafting results" }).textContent).not.toContain(
            "13 trials",
        );
        fireEvent.change(screen.getByLabelText("Stop simulation after"), {
            target: { value: "successes" },
        });
        expect(screen.getByLabelText("Successful item target")).toHaveProperty("value", "100");
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.getByLabelText("Stop simulation after")).toHaveProperty("value", "manual");
        fireEvent.click(button("Mass simulate"));
        const next = CraftingWorker.instances[1]!;
        fireEvent.change(screen.getByLabelText("Random seed"), { target: { value: "77" } });
        expect(next.terminate).toHaveBeenCalled();
        act(() => next.onmessage?.({ data: { type: "progress", result } }));
        expect(screen.queryByRole("region", { name: "Crafting results" })).toBeNull();
    });

    it("shows finite calculator progress with continuous simulation selected", () => {
        const { project, engine, mount } = fixture(data);
        project.simulationLimit = { kind: "manual" };
        mount();
        fireEvent.click(button("Calculate odds"));
        expect(
            screen.getByRole("progressbar", { name: "Simulation progress" }).getAttribute("value"),
        ).toBe("0");
        expect(screen.getByText("0 / 10 trials")).toBeDefined();
        const worker = CraftingWorker.instances[0]!;
        act(() =>
            worker.onmessage?.({
                data: { type: "done", result: calculateProcessExact(engine, project) },
            }),
        );
        expect(screen.getByText("Calculated odds")).toBeDefined();
        expect(screen.queryByText(/No fixed simulation target/)).toBeNull();
        expect(worker.terminate).toHaveBeenCalled();
    });

    it("shows successful cost extremes and the quantities for each selected stored outcome", () => {
        const { project, mount } = fixture(data);
        project.baseCost = 5;
        project.sampleStorage = { mode: "all", limit: 10 };
        mount();
        fireEvent.click(button("Mass simulate"));
        const worker = CraftingWorker.instances[0]!;
        const simulation = new CraftingSimulation(
            data,
            worker.postMessage.mock.calls[0]![0].project,
        );
        while (!simulation.done) simulation.runTrial();
        const result = simulation.result();
        act(() => worker.onmessage?.({ data: { type: "done", result } }));
        const extremes = within(screen.getByRole("region", { name: "Successful trial costs" }));
        expect(extremes.getAllByRole("definition").map((entry) => entry.textContent)).toEqual([
            result.successCosts!.cheapest!.toString(),
            result.successCosts!.costliest!.toString(),
        ]);
        fireEvent.click(screen.getByText("Sample outcomes"));
        for (const index of [0, 1]) {
            if (index) fireEvent.click(screen.getByRole("button", { name: "Next outcome" }));
            const cost = result.samples[index]!.cost!;
            const costRegion = screen.getByRole("region", { name: "Stored outcome cost" });
            const displayed = within(costRegion);
            expect(costRegion.textContent).toContain(`Trial cost (chaos): ${cost.total}`);
            expect(displayed.getAllByRole("definition").map((entry) => entry.textContent)).toEqual([
                cost.baseItems!.toString(),
                cost.baseSpending!.toString(),
                ...Object.values(cost.spending).map(String),
            ]);
        }
    });

    it("retains quantities and explains unknown totals when successful crafts have missing prices", () => {
        const { project, mount } = fixture(data);
        project.prices = {};
        mount();
        fireEvent.click(button("Mass simulate"));
        const worker = CraftingWorker.instances[0]!;
        const simulation = new CraftingSimulation(
            data,
            worker.postMessage.mock.calls[0]![0].project,
        );
        while (!simulation.done) simulation.runTrial();
        act(() => worker.onmessage?.({ data: { type: "done", result: simulation.result() } }));
        const extremes = within(screen.getByRole("region", { name: "Successful trial costs" }));
        expect(extremes.getAllByRole("definition").map((entry) => entry.textContent)).toEqual([
            "—",
            "—",
        ]);
        expect(extremes.getByText(/The full cost range is unknown/)).toBeDefined();
        fireEvent.click(screen.getByText("Sample outcomes"));
        const costRegion = screen.getByRole("region", { name: "Stored outcome cost" });
        const cost = within(costRegion);
        expect(costRegion.textContent).toContain("Trial cost (chaos): —");
        expect(cost.getByText(/Missing prices: Orb of Annulment/)).toBeDefined();
        expect(cost.getByText("Orb of Annulment", { selector: "dt" })).toBeDefined();
        expect(cost.getByText("Starting item costs are excluded.")).toBeDefined();
    });

    it("persists outcome settings, navigates retained successes and uses the selected item", () => {
        const { project, key, mount } = fixture(data);
        project.steps[0]!.onSuccess = "success";
        project.steps[0]!.onFailure = "failure";
        mount();
        fireEvent.change(screen.getByLabelText("Store outcomes"), {
            target: { value: "successes" },
        });
        fireEvent.change(screen.getByLabelText("Maximum stored outcomes"), {
            target: { value: "2" },
        });
        fireEvent.click(screen.getByLabelText("Successful item affix distribution"));
        fireEvent.click(button("Mass simulate"));
        const worker = CraftingWorker.instances[0]!;
        const sent = worker.postMessage.mock.calls[0]![0];
        expect(sent.project).toMatchObject({
            sampleStorage: { mode: "successes", limit: 2 },
            successDistribution: true,
        });
        const simulation = new CraftingSimulation(data, sent.project);
        while (!simulation.done) simulation.runTrial();
        const result = simulation.result();
        expect(result.successes).toBeGreaterThan(2);
        act(() => worker.onmessage?.({ data: { type: "done", result } }));
        fireEvent.click(screen.getByText("Affix distribution on success"));
        const table = within(screen.getByRole("table", { name: "Prefixes" }));
        expect(table.getByText("100.0%")).toBeDefined();
        expect(table.getByText(result.successes.toString())).toBeDefined();
        expect(screen.queryByRole("table", { name: "Suffixes" })).toBeNull();
        fireEvent.click(screen.getByText("Sample outcomes"));
        expect(screen.getByText("Item 1 of 2")).toBeDefined();
        expect(screen.getByRole("button", { name: "Previous outcome" })).toHaveProperty(
            "disabled",
            true,
        );
        fireEvent.click(screen.getByRole("button", { name: "Next outcome" }));
        expect(screen.getByText("Item 2 of 2")).toBeDefined();
        expect(screen.getByRole("button", { name: "Next outcome" })).toHaveProperty(
            "disabled",
            true,
        );
        expect(screen.getByText(`Trial ${result.samples[1]!.trial} · Target met`)).toBeDefined();
        fireEvent.click(screen.getByRole("button", { name: "Use this item" }));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved).toMatchObject({
            item: result.samples[1]!.item,
            sampleStorage: { mode: "successes", limit: 2 },
            successDistribution: true,
        });
        fireEvent.click(button("Undo"));
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item).toEqual(
            project.item,
        );
        fireEvent.change(screen.getByLabelText("Store outcomes"), { target: { value: "none" } });
        expect(screen.queryByLabelText("Maximum stored outcomes")).toBeNull();
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.getByLabelText("Store outcomes")).toHaveProperty("value", "successes");
        expect(screen.getByLabelText("Maximum stored outcomes")).toHaveProperty("value", "2");
        expect(screen.getByLabelText("Successful item affix distribution")).toHaveProperty(
            "checked",
            true,
        );
    });

    it("cancels an active run when retention changes and shows disabled storage independently", () => {
        const { mount } = fixture(data);
        mount();
        fireEvent.click(button("Mass simulate"));
        const active = CraftingWorker.instances[0]!;
        fireEvent.change(screen.getByLabelText("Store outcomes"), { target: { value: "none" } });
        expect(active.terminate).toHaveBeenCalled();
        fireEvent.click(screen.getByLabelText("Successful item affix distribution"));
        fireEvent.click(button("Mass simulate"));
        const worker = CraftingWorker.instances[1]!;
        const simulation = new CraftingSimulation(
            data,
            worker.postMessage.mock.calls[0]![0].project,
        );
        while (!simulation.done) simulation.runTrial();
        act(() => worker.onmessage?.({ data: { type: "done", result: simulation.result() } }));
        expect(screen.getByText("Outcome storage is disabled.")).toBeDefined();
        expect(screen.queryByText("Sample outcomes")).toBeNull();
        expect(screen.getByText("Affix distribution on success")).toBeDefined();
    });

    it("saves fixed simulation limits, sends them to the worker and displays the reached target", () => {
        const { project, key, mount } = fixture(data);
        mount();
        expect(screen.getByLabelText("Stop simulation after")).toHaveProperty("value", "trials");
        fireEvent.change(screen.getByLabelText("Stop simulation after"), {
            target: { value: "successes" },
        });
        fireEvent.change(screen.getByLabelText("Successful item target"), {
            target: { value: "2" },
        });
        fireEvent.change(screen.getByLabelText("Maximum trials"), { target: { value: "17" } });
        fireEvent.click(button("Mass simulate"));
        const worker = CraftingWorker.instances[0]!;
        const sent = worker.postMessage.mock.calls[0]![0];
        expect(sent.project).toMatchObject({
            simulationLimit: { kind: "successes", count: 2 },
            iterations: 17,
            item: project.item,
            useProcess: true,
        });
        const simulation = new CraftingSimulation(data, sent.project);
        while (!simulation.done) simulation.runTrial();
        act(() => worker.onmessage?.({ data: { type: "done", result: simulation.result() } }));
        const results = screen.getByRole("region", { name: "Crafting results" });
        expect(results.textContent).toContain("Successful item target reached.");
        expect(results.textContent).not.toContain("95% interval");
        expect(worker.terminate).toHaveBeenCalled();
        fireEvent.click(button("Save project"));
        const saved = craftingProjectSchema.parse(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"],
        );
        expect(saved.simulationLimit).toEqual({ kind: "successes", count: 2 });
        expect(saved.item).toEqual(project.item);
        fireEvent.change(screen.getByLabelText("Stop simulation after"), {
            target: { value: "trials" },
        });
        expect(screen.queryByLabelText("Successful item target")).toBeNull();
        expect(screen.getByLabelText("Trials")).toHaveProperty("value", "17");
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.getByLabelText("Stop simulation after")).toHaveProperty("value", "successes");
        expect(screen.getByLabelText("Successful item target")).toHaveProperty("value", "2");
    });

    it("displays unfinished processes without invalid averages and can use their retained item", () => {
        const { project, key, mount } = fixture(data);
        mount();
        fireEvent.change(screen.getByLabelText("Stop simulation after"), {
            target: { value: "actions" },
        });
        fireEvent.change(screen.getByLabelText("Simulation action limit"), {
            target: { value: "1" },
        });
        fireEvent.click(button("Mass simulate"));
        const worker = CraftingWorker.instances[0]!;
        const simulation = new CraftingSimulation(
            data,
            worker.postMessage.mock.calls[0]![0].project,
        );
        while (!simulation.done) simulation.runTrial();
        const result = simulation.result();
        expect(result.trials).toBe(0);
        expect(result.unfinished!.item.mods).toHaveLength(1);
        act(() => worker.onmessage?.({ data: { type: "done", result } }));
        const results = screen.getByRole("region", { name: "Crafting results" });
        expect(results.textContent).toContain("No completed trials.");
        expect(results.textContent).toContain("Simulation action limit reached.");
        expect(results.textContent).not.toMatch(/NaN|Infinity/);
        const unfinished = within(screen.getByRole("region", { name: "Unfinished trial" }));
        expect(unfinished.getByText(/does not count as a failed trial/)).toBeDefined();
        expect(
            within(unfinished.getByLabelText("Unfinished trial spending")).getByRole("definition")
                .textContent,
        ).toBe("1");
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item).toEqual(
            project.item,
        );
        fireEvent.click(unfinished.getByText("Inspect unfinished item"));
        fireEvent.click(unfinished.getByRole("button", { name: "Use unfinished item" }));
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item).toEqual(
            result.unfinished!.item,
        );
        fireEvent.click(button("Undo"));
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item).toEqual(
            project.item,
        );
    });

    it("copies craft and condition steps, preserves routes and saves independent editable copies", async () => {
        const { engine, project, key, mount } = fixture(data);
        mount();
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[0]!;
        const result = calculateProcessExact(engine, project);
        act(() => worker.onmessage?.({ data: { type: "done", result } }));
        const source = within(screen.getByRole("article", { name: "Keep life editor" }));
        fireEvent.click(source.getByRole("button", { name: "Copy step" }));
        expect(screen.queryByRole("region", { name: "Crafting results" })).toBeNull();
        const copy = within(screen.getByRole("article", { name: "Keep life (copy) editor" }));
        fireEvent.change(copy.getByRole("textbox", { name: "Step name" }), {
            target: { value: "Independent copy" },
        });
        fireEvent.click(copy.getByRole("button", { name: "Always pass" }));
        fireEvent.click(
            within(screen.getByRole("article", { name: "Final check editor" })).getByRole(
                "button",
                { name: "Copy step" },
            ),
        );
        fireEvent.click(button("Save project"));
        const saved = craftingProjectSchema.parse(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"],
        );
        expect(saved.steps).toHaveLength(4);
        expect(saved.steps[0]).toEqual(project.steps[0]);
        expect(saved.steps[2]).toEqual(project.steps[1]);
        expect(saved.steps[1]).toMatchObject({
            name: "Independent copy",
            method: project.steps[0]!.method,
            condition: { groups: [] },
            onSuccess: "finish",
            onFailure: "restart",
            position: { x: 140, y: 100 },
        });
        expect(saved.steps[3]!.method).toBeUndefined();
        expect(new Set(saved.steps.map((step) => step.id)).size).toBe(4);
        expect(saved.item).toEqual(project.item);
        expect(calculateProcessExact(engine, saved).probability).toBe(result.probability);
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("article", { name: "Independent copy editor" })).toBeDefined();
        expect(screen.getByRole("article", { name: "Final check (copy) editor" })).toBeDefined();
        fireEvent.click(button("Show process flow"));
        await act(() => vi.dynamicImportSettled());
        expect(await screen.findByTestId(`rf__node-step:${saved.steps[1]!.id}`)).toBeDefined();
        expect(await screen.findByTestId(`rf__node-step:${saved.steps[3]!.id}`)).toBeDefined();
        fireEvent.click(copy.getByRole("button", { name: "Remove step" }));
        expect(screen.getByRole("article", { name: "Keep life editor" })).toBeDefined();
        expect(screen.queryByRole("article", { name: "Independent copy editor" })).toBeNull();
    });

    it("adds, orders and saves conditional routes, displaying per-route odds and dynamic flow handles", async () => {
        const { engine, key, mount } = fixture(data);
        mount();
        const editor = within(screen.getByRole("article", { name: "Keep life editor" }));
        fireEvent.click(editor.getByRole("button", { name: "Add conditional route" }));
        const route2 = within(editor.getByRole("region", { name: "Route 2" }));
        fireEvent.click(route2.getByRole("button", { name: "Always pass" }));
        await selectRouteDestination(
            route2.getByRole("combobox", { name: "Route 2 destination" }),
            "Finish as failure",
        );
        fireEvent.click(button("Show process flow"));
        const node = await screen.findByTestId("rf__node-step:annul");
        expect(within(node).getByLabelText("Keep life Route 1 output")).toBeDefined();
        expect(within(node).getByLabelText("Keep life Route 2 output")).toBeDefined();
        expect(within(node).getByLabelText("Keep life Fallback output")).toBeDefined();
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[0]!;
        const input = worker.postMessage.mock.calls[0]![0].project;
        expect(input.steps[0].branches).toHaveLength(2);
        const result = calculateProcessExact(engine, input);
        expect(result.probability).toBe(0.5);
        act(() => worker.onmessage?.({ data: { type: "done", result } }));
        const routes = within(screen.getByRole("article", { name: "Keep life route results" }));
        expect(routes.getByRole("row", { name: "Route 1 Final check 0.5" })).toBeDefined();
        expect(routes.getByRole("row", { name: "Route 2 failure 0.5" })).toBeDefined();
        fireEvent.click(editor.getByRole("button", { name: "Move route 2 up" }));
        expect(screen.queryByRole("region", { name: "Crafting results" })).toBeNull();
        fireEvent.click(button("Save project"));
        const saved = craftingProjectSchema.parse(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"],
        );
        expect(saved.steps[0]!.branches!.map((branch) => branch.id)).toEqual(
            [...input.steps[0].branches].reverse().map((branch) => branch.id),
        );
        expect(calculateProcessExact(engine, saved).probability).toBe(0);
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(editor.getByRole("combobox", { name: "Route 1 destination" }).textContent).toContain(
            "Finish as failure",
        );
        fireEvent.click(editor.getByRole("button", { name: "Remove route 1" }));
        expect(within(node).queryByLabelText("Keep life Route 2 output")).toBeNull();
        fireEvent.click(
            within(screen.getByRole("article", { name: "Final check editor" })).getByRole(
                "button",
                { name: "Remove step" },
            ),
        );
        fireEvent.click(button("Save project"));
        const remaining = craftingProjectSchema.parse(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"],
        );
        expect(remaining.steps[0]!.branches![0]!.destination).toBe("failure");
        expect(remaining.steps[0]!.branches![0]!.condition).toEqual(
            input.steps[0].branches[0].condition,
        );
        fireEvent.click(editor.getByRole("button", { name: "Remove route 1" }));
        expect(within(node).queryByLabelText("Keep life Route 1 output")).toBeNull();
        expect(within(node).getByLabelText("Keep life Fallback output")).toBeDefined();
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].steps[0].branches,
        ).toEqual([]);
    });

    it("edits later-route conditions and preserves the result and costs through emulator history", async () => {
        const { engine, key, mount } = fixture(data);
        mount();
        const editor = within(screen.getByRole("article", { name: "Keep life editor" }));
        fireEvent.click(editor.getByRole("button", { name: "Add conditional route" }));
        const second = within(editor.getByRole("region", { name: "Route 2" }));
        fireEvent.click(second.getByText("Edit route 2 condition"));
        fireEvent.click(second.getByRole("button", { name: "Always pass" }));
        fireEvent.click(second.getByText("Item conditions", { exact: true }));
        fireEvent.change(second.getByLabelText("Required rarity"), { target: { value: "rare" } });
        await selectRouteDestination(
            editor.getByRole("combobox", { name: "No route matched" }),
            "Finish as failure",
        );
        fireEvent.click(button("Apply process"));
        const worker = CraftingWorker.instances[0]!;
        const input = worker.postMessage.mock.calls[0]![0].project;
        expect(input.steps[0].branches[1].condition.rarity).toBe("rare");
        expect(input.steps[0].onFailure).toBe("failure");
        const process = new CraftingProcess(engine, input, seededRandom(input.seed));
        while (!process.done) process.advance();
        act(() => worker.onmessage?.({ data: { type: "emulated", result: process.result() } }));
        fireEvent.click(button("Save project"));
        const crafted = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(crafted.item).toEqual(process.result().item);
        expect(crafted.steps[0].branches).toEqual(input.steps[0].branches);
        expect(screen.getByRole("region", { name: "Process route results" }).textContent).toContain(
            "Route 2",
        );
        const spending = screen.getByText("Emulator spending").closest("details")!.textContent;
        fireEvent.click(button("Undo"));
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item).toEqual(
            input.item,
        );
        fireEvent.click(button("Redo"));
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toBe(
            spending,
        );
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item).toEqual(
            crafted.item,
        );
    });

    it("prices starting items in process results, saves the price and excludes it when cleared", () => {
        const { engine, project, key, mount } = fixture(data);
        mount();
        fireEvent.click(screen.getByText("Custom prices in chaos"));
        fireEvent.change(screen.getByLabelText("Starting item cost (chaos)"), {
            target: { value: "8" },
        });
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[0]!;
        const request = worker.postMessage.mock.calls[0]![0].project;
        expect(request.baseCost).toBe(8);
        const result = calculateProcessExact(engine, request);
        expect(result).toMatchObject({ baseItems: 1.75, baseSpending: 14, meanCost: 17.5 });
        act(() => worker.onmessage?.({ data: { type: "done", result } }));
        const results = within(screen.getByRole("region", { name: "Crafting results" }));
        expect(results.getByText("Starting items / attempt").nextElementSibling?.textContent).toBe(
            "1.75",
        );
        expect(
            results.getByText("Starting item cost / attempt (chaos)").nextElementSibling
                ?.textContent,
        ).toBe("14");
        expect(results.getByText("Average cost (chaos)").nextElementSibling?.textContent).toBe(
            "17.5",
        );
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].baseCost).toBe(8);
        fireEvent.change(screen.getByLabelText("Starting item cost (chaos)"), {
            target: { value: "" },
        });
        expect(screen.queryByRole("region", { name: "Crafting results" })).toBeNull();
        fireEvent.click(button("Calculate odds"));
        const withoutPrice = CraftingWorker.instances[1]!;
        expect(withoutPrice.postMessage.mock.calls[0]![0].project.baseCost).toBeUndefined();
        act(() =>
            withoutPrice.onmessage?.({
                data: { type: "done", result: calculateProcessExact(engine, project) },
            }),
        );
        expect(screen.getByText(/Starting item costs are excluded/)).toBeDefined();
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.getByLabelText("Starting item cost (chaos)")).toHaveProperty("value", "8");
        fireEvent.click(button("Calculate odds"));
        const running = CraftingWorker.instances[2]!;
        fireEvent.change(screen.getByLabelText("Starting item cost (chaos)"), {
            target: { value: "0" },
        });
        expect(running.terminate).toHaveBeenCalled();
        act(() => running.onmessage?.({ data: { type: "done", result } }));
        expect(screen.queryByRole("region", { name: "Crafting results" })).toBeNull();
        fireEvent.click(button("Calculate odds"));
        const free = CraftingWorker.instances[3]!;
        expect(free.postMessage.mock.calls[0]![0].project.baseCost).toBe(0);
    });

    it("counts restored bases once, discards cancelled counts and restores emulator base spending with history", () => {
        const { engine, project, mount } = fixture(data);
        project.baseCost = 8;
        project.steps = [
            {
                id: "check",
                condition: engine.validateTarget({ groups: [] }),
                onSuccess: "restart",
                onFailure: "failure",
            },
        ];
        mount();
        const quantity = () =>
            screen.getByText("Starting items used").nextElementSibling?.textContent;
        const cost = () =>
            screen.getByText("Starting item spending (chaos)").nextElementSibling?.textContent;
        expect(quantity()).toBe("1");
        fireEvent.click(button("Apply process"));
        const discarded = CraftingWorker.instances[0]!;
        const process = new CraftingProcess(engine, project, seededRandom(project.seed));
        process.advance();
        process.advance();
        expect(process.result().baseItems).toBe(2);
        act(() => discarded.onmessage?.({ data: { type: "emulating", result: process.result() } }));
        expect(quantity()).toBe("1");
        fireEvent.click(button("Stop process"));
        process.advance();
        act(() => discarded.onmessage?.({ data: { type: "emulated", result: process.result() } }));
        expect(quantity()).toBe("1");
        expect(cost()).toBe("8");
        for (let run = 1; run <= 2; run++) {
            fireEvent.click(button("Apply process"));
            const worker = CraftingWorker.instances[run]!;
            act(() => worker.onmessage?.({ data: { type: "emulated", result: process.result() } }));
            expect(quantity()).toBe(String(1 + 2 * run));
            expect(cost()).toBe(String(8 * (1 + 2 * run)));
        }
        fireEvent.click(button("Undo"));
        expect(quantity()).toBe("3");
        expect(cost()).toBe("24");
        fireEvent.click(button("Redo"));
        expect(quantity()).toBe("5");
        fireEvent.click(button("Reset"));
        expect(quantity()).toBe("1");
        fireEvent.click(button("Undo"));
        expect(quantity()).toBe("5");
        fireEvent.click(button("Save project"));
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(quantity()).toBe("1");
        expect(cost()).toBe("8");
    });

    it("saves names, descriptions and keyboard layout changes while keeping presentation edits independent of results", async () => {
        const { engine, project, key, mount } = fixture(data);
        mount();
        fireEvent.click(button("Show process flow"));
        const node = await screen.findByTestId("rf__node-step:annul");
        expect(node.textContent).toContain("Remove resistance and keep life");
        fireEvent.keyDown(node, { key: "Enter" });
        fireEvent.keyDown(node, { key: "ArrowRight" });
        fireEvent.keyDown(node, { key: "ArrowDown" });
        fireEvent.click(within(node).getByText("Edit Keep life"));
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
        expect(document.activeElement).toBe(
            screen.getByRole("article", { name: "Keep life editor" }),
        );
        const editor = within(screen.getByRole("article", { name: "Keep life editor" }));
        fireEvent.change(editor.getByLabelText("Step description"), {
            target: { value: "Retry from the starting item if life is lost" },
        });
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[0]!;
        const input = worker.postMessage.mock.calls[0]![0].project;
        expect(input.steps[0]).toMatchObject({
            position: { x: 105, y: 65 },
            description: "Retry from the starting item if life is lost",
        });
        const result = calculateProcessExact(engine, project);
        act(() => worker.onmessage?.({ data: { type: "done", result } }));
        const routes = screen.getByRole("region", { name: "Process route results" });
        expect(routes.textContent).toContain("Exact within the model");
        const first = within(screen.getByRole("article", { name: "Keep life route results" }));
        expect(first.getByText("1.75 visits · 3.5 chaos / attempt")).toBeDefined();
        expect(first.getByRole("row", { name: "Passed Final check 0.875" })).toBeDefined();
        expect(first.getByRole("row", { name: "Failed restart 0.875" })).toBeDefined();
        expect(node.textContent).toContain("1.75 visits / attempt");
        fireEvent.change(editor.getByLabelText("Step name"), { target: { value: "Annul safely" } });
        expect(screen.getByRole("article", { name: "Annul safely route results" })).toBeDefined();
        expect(screen.getByRole("region", { name: "Crafting results" })).toBeDefined();
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].steps[0],
        ).toMatchObject({
            name: "Annul safely",
            position: { x: 105, y: 65 },
            description: "Retry from the starting item if life is lost",
        });
        fireEvent.click(button("Reset layout"));
        expect(node.style.transform).toContain("translate(0px,0px)");
        expect(screen.getByRole("region", { name: "Process route results" })).toBeDefined();
        fireEvent.change(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(node.style.transform).toContain("translate(105px,65px)");
        expect(editor.getByLabelText("Step name")).toHaveProperty("value", "Annul safely");
        fireEvent.click(button("Calculate odds"));
        const next = CraftingWorker.instances[1]!;
        const simulation = new CraftingSimulation(data, next.postMessage.mock.calls[0]![0].project);
        for (let index = 0; index < 10; index++) simulation.runTrial();
        const sampled = simulation.result();
        act(() => next.onmessage?.({ data: { type: "done", result: sampled } }));
        expect(screen.getByRole("region", { name: "Process route results" }).textContent).toContain(
            "10 sampled attempts",
        );
        expect(
            screen.getByRole("article", { name: "Annul safely route results" }).textContent,
        ).toContain(`${sampled.routes!.annul!.visits / 10} visits`);
        fireEvent.change(editor.getByLabelText("Condition passed"), {
            target: { value: "success" },
        });
        expect(screen.queryByRole("region", { name: "Process route results" })).toBeNull();
        expect(screen.queryByRole("region", { name: "Crafting results" })).toBeNull();
    });

    it("shows live route metrics and preserves completed costs and errors through the emulator", () => {
        const { engine, project, key, mount } = fixture(data);
        project.steps[0]!.condition = engine.validateTarget({ groups: [] });
        project.steps[1]!.method = {
            kind: "currency",
            id: data.crafting.currencies.find((entry) => entry.action === "transmute_to_magic")!.id,
        };
        mount();
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.click(button("Apply process"));
        const worker = CraftingWorker.instances[0]!;
        const process = new CraftingProcess(engine, project, seededRandom(project.seed));
        process.advance();
        act(() => worker.onmessage?.({ data: { type: "emulating", result: process.result() } }));
        expect(card.textContent).toBe(before);
        expect(
            screen.getByRole("article", { name: "Keep life route results" }).textContent,
        ).toContain("1 visits · 2 chaos / attempt");
        expect(
            screen.getByRole("article", { name: "Final check route results" }).textContent,
        ).toContain("0 visits · 0 chaos / attempt");
        fireEvent.change(screen.getAllByLabelText("Step description")[0]!, {
            target: { value: "Retain the paid Annulment on a later error" },
        });
        expect(worker.terminate).not.toHaveBeenCalled();
        process.advance();
        expect(process.result().error).toBeDefined();
        act(() => worker.onmessage?.({ data: { type: "emulated", result: process.result() } }));
        expect(card.textContent).not.toBe(before);
        expect(screen.getByText("Emulator spending")).toBeDefined();
        expect(
            within(screen.getByRole("article", { name: "Final check route results" })).getByRole(
                "row",
                { name: "Step errors failure 1" },
            ),
        ).toBeDefined();
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].steps[0].description,
        ).toBe("Retain the paid Annulment on a later error");
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        expect(screen.queryByRole("region", { name: "Process route results" })).toBeNull();
        expect(screen.queryByText("Emulator spending")).toBeNull();
        fireEvent.click(button("Redo"));
        expect(card.textContent).not.toBe(before);
        expect(screen.getByText("Emulator spending")).toBeDefined();
    });
});

it("keeps rare route probabilities visible and distinguishes missing prices from free steps", () => {
    const { engine, project } = fixture();
    const currencyId = Object.keys(project.prices)[0]!;
    project.prices = {};
    render(
        <ProcessRouteResults
            engine={engine}
            project={project}
            routes={{
                annul: {
                    visits: 0.0000004,
                    passed: 0.0000003,
                    failed: 0.0000001,
                    errors: 0,
                    spending: { [currencyId]: 0.0000004 },
                },
            }}
            attempts={1}
            label="Exact within the model"
        />,
    );
    const first = within(screen.getByRole("article", { name: "Keep life route results" }));
    expect(first.getByText("0.0000004 visits · Enter missing currency prices")).toBeDefined();
    expect(first.getByRole("row", { name: "Passed Final check 0.0000003" })).toBeDefined();
    expect(first.getByRole("row", { name: "Failed restart 0.0000001" })).toBeDefined();
    expect(
        screen.getByRole("article", { name: "Final check route results" }).textContent,
    ).toContain("0 visits · 0 chaos / attempt");
});

it.each([
    "stop",
    "error",
    "worker-error",
    "route-edit",
])("discards uncommitted routes and stale messages after %s", (reason) => {
    const { engine, project, mount } = fixture();
    mount();
    const card = screen.getByRole("region", { name: "Current item" });
    const before = card.textContent;
    fireEvent.click(button("Apply process"));
    const worker = CraftingWorker.instances[0]!;
    const process = new CraftingProcess(engine, project, seededRandom(project.seed));
    process.advance();
    act(() => worker.onmessage?.({ data: { type: "emulating", result: process.result() } }));
    expect(screen.getByRole("region", { name: "Process route results" })).toBeDefined();
    if (reason === "stop") fireEvent.click(button("Stop process"));
    else if (reason === "route-edit")
        fireEvent.change(screen.getAllByLabelText("Condition failed")[0]!, {
            target: { value: "failure" },
        });
    else if (reason === "error")
        act(() => worker.onmessage?.({ data: { type: "error", message: "Worker failed" } }));
    else act(() => worker.onerror?.({ message: "Worker failed" }));
    expect(worker.terminate).toHaveBeenCalled();
    act(() => worker.onmessage?.({ data: { type: "emulated", result: process.result() } }));
    expect(screen.queryByRole("region", { name: "Process route results" })).toBeNull();
    expect(card.textContent).toBe(before);
    expect(screen.queryByText("Emulator spending")).toBeNull();
    expect(screen.queryByRole("button", { name: "Stop process" })).toBeNull();
});

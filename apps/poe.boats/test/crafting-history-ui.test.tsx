// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { CraftingWorkbench } from "../app/components/crafting/workbench";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { CraftingProcess } from "../app/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";

class CraftingWorker {
    static instances: CraftingWorker[] = [];
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: { message: string }) => void) | null = null;
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor() {
        CraftingWorker.instances.push(this);
    }
}

beforeEach(() => {
    localStorage.clear();
    CraftingWorker.instances = [];
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

for (const game of ["poe1", "poe2"] as const) {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const base = Object.entries(catalog.bases).find(
        ([, base]) => base.item_class === "Body Armour" && base.drop_level === 1,
    )![0];
    const item = engine.validateItem({ ...engine.createItem(base), rarity: "rare" });
    const method = {
        kind: "currency" as const,
        id: catalog.crafting.currencies.find((entry) => entry.action === "add_mod_to_rare")!.id,
    };
    const project = craftingProjectSchema.parse({
        format: 1,
        game,
        patch: catalog.patch,
        item,
        method,
        target: { groups: [], affixCount: { min: 2, max: 2 } },
        steps: [{ id: "roll", method, condition: { groups: [] } }],
        prices: { [method.id]: 2 },
        baseCost: 5,
        seed: 42,
        iterations: 10,
        maxActions: 3,
        inventory: [{ id: "base", name: "Stored base", item }],
    });
    const key = `poe-boats:crafting:${game}:${catalog.patch}`;
    const button = (name: string) => screen.getByText(name, { selector: "button" });
    const currentItem = () => screen.getByRole("region", { name: "Current item" }).textContent;
    const spending = () => within(screen.getByText("Emulator spending").closest("details")!);
    const amount = (label: string) => spending().getByText(label).nextElementSibling!.textContent;
    const saved = () => JSON.parse(localStorage.getItem(key)!)["My crafting project"];
    function mount(input = project) {
        localStorage.setItem(key, JSON.stringify({ test: input }));
        render(
            <MemoryRouter>
                <CraftingWorkbench catalog={catalog} mode="emulate" />
            </MemoryRouter>,
        );
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.change(screen.getByLabelText("Saved project"), { target: { value: "test" } });
        fireEvent.click(button("Load project"));
    }
    function finishProcess() {
        const worker = CraftingWorker.instances.at(-1)!;
        const input = worker.postMessage.mock.calls[0]![0].project;
        const process = new CraftingProcess(engine, input, seededRandom(input.seed));
        while (!process.done) process.advance();
        return { worker, result: process.result() };
    }

    describe(`${game} action history list`, () => {
        const entries = () =>
            within(screen.getByRole("list", { name: "Item history" })).getAllByRole("listitem");

        it("keeps last modifier changes aligned with undo, redo, manual edits, clearing and loading", () => {
            mount();
            expect(screen.queryByRole("region", { name: "Last changes" })).toBeNull();
            fireEvent.click(button("Apply craft"));
            const first = screen.getByRole("region", { name: "Last changes" }).textContent;
            expect(
                within(screen.getByRole("region", { name: "Last changes" })).getByText("Added"),
            ).toBeDefined();
            fireEvent.click(button("Apply craft"));
            const second = screen.getByRole("region", { name: "Last changes" }).textContent;
            expect(second).not.toBe(first);
            fireEvent.click(button("Undo"));
            expect(screen.getByRole("region", { name: "Last changes" }).textContent).toBe(first);
            fireEvent.click(button("Redo"));
            expect(screen.getByRole("region", { name: "Last changes" }).textContent).toBe(second);
            fireEvent.click(
                within(screen.getByRole("region", { name: "Current item" })).getAllByText(
                    "Remove",
                    { selector: "button" },
                )[0]!,
            );
            expect(
                within(screen.getByRole("region", { name: "Last changes" })).getByText("Removed"),
            ).toBeDefined();
            fireEvent.change(screen.getByLabelText("Item level"), { target: { value: "100" } });
            expect(screen.queryByRole("alert")).toBeNull();
            expect(
                within(screen.getByRole("region", { name: "Last changes" })).getByText(
                    "No modifier changes.",
                ),
            ).toBeDefined();
            fireEvent.click(button("Clear history and spending"));
            expect(screen.queryByRole("region", { name: "Last changes" })).toBeNull();
            fireEvent.click(button("Load project"));
            expect(screen.queryByRole("region", { name: "Last changes" })).toBeNull();
        });

        it("lists changes newest first and follows undo, redo, branching, clearing and loading", () => {
            mount();
            fireEvent.click(screen.getByText("Actions history"));
            expect(entries()).toHaveLength(1);
            expect(entries()[0]!.textContent).toBe("Loaded item0 crafts · Current");
            fireEvent.click(button("Apply craft"));
            fireEvent.click(button("Apply craft"));
            const retained = currentItem();
            expect(entries().map((entry) => entry.textContent)).toEqual([
                `${engine.methodName(method)}2 crafts · Current`,
                `${engine.methodName(method)}1 crafts`,
                "Loaded item0 crafts",
            ]);
            expect(entries()[0]!.getAttribute("aria-current")).toBe("step");
            fireEvent.click(screen.getByText("Actions history"));
            fireEvent.click(screen.getByText("Actions history"));
            expect(currentItem()).toBe(retained);
            expect(amount(engine.methodName(method))).toBe("2");

            fireEvent.click(button("Undo"));
            expect(entries()[0]!.textContent).toContain("2 crafts · Undone");
            expect(entries()[0]!.hasAttribute("aria-current")).toBe(false);
            expect(entries()[1]!.getAttribute("aria-current")).toBe("step");
            expect(entries()[1]!.textContent).toContain("1 crafts · Current");
            fireEvent.click(button("Redo"));
            expect(currentItem()).toBe(retained);
            expect(entries()[0]!.getAttribute("aria-current")).toBe("step");

            fireEvent.click(button("Undo"));
            fireEvent.change(screen.getByLabelText("Item level"), { target: { value: "85" } });
            expect(entries().map((entry) => entry.textContent)).toEqual([
                "Edit item1 crafts · Current",
                `${engine.methodName(method)}1 crafts`,
                "Loaded item0 crafts",
            ]);
            expect(button("Redo")).toHaveProperty("disabled", true);
            expect(amount(engine.methodName(method))).toBe("1");
            fireEvent.click(button("Save project"));
            const before = saved();
            fireEvent.click(button("Clear history and spending"));
            expect(entries().map((entry) => entry.textContent)).toEqual([
                "History cleared0 crafts · Current",
            ]);
            fireEvent.click(button("Save project"));
            expect(saved()).toEqual(before);
            fireEvent.change(screen.getByLabelText("Saved project"), {
                target: { value: "My crafting project" },
            });
            fireEvent.click(button("Load project"));
            expect(entries().map((entry) => entry.textContent)).toEqual([
                "Loaded item0 crafts · Current",
            ]);
            expect(screen.getByLabelText("Item level")).toHaveProperty("value", "85");
            expect(button("Undo")).toHaveProperty("disabled", true);
        });

        it("discards old entries at the existing retention limit and keeps the current row correct", () => {
            mount();
            fireEvent.click(screen.getByText("Actions history"));
            const level = screen.getByLabelText("Item level");
            for (let index = 0; index < 105; index++)
                fireEvent.change(level, {
                    target: { value: String(70 + (index % 2)) },
                });
            expect(entries()).toHaveLength(101);
            expect(entries().every((entry) => entry.textContent!.startsWith("Edit item"))).toBe(
                true,
            );
            expect(entries()[0]!.textContent).toBe("Edit item0 crafts · Current");
            expect(entries().filter((entry) => entry.hasAttribute("aria-current"))).toHaveLength(1);
            fireEvent.click(button("Undo"));
            expect(entries()[0]!.textContent).toBe("Edit item0 crafts · Undone");
            expect(entries()[1]!.getAttribute("aria-current")).toBe("step");
            expect(screen.getByLabelText("Item level")).toHaveProperty("value", "71");
            fireEvent.click(button("Redo"));
            expect(entries()[0]!.getAttribute("aria-current")).toBe("step");
            expect(screen.getByLabelText("Item level")).toHaveProperty("value", "70");
        });
    });

    describe(`${game} clearing emulator history`, () => {
        it("retains the selected undo state and project settings, drops redo, and starts new spending", () => {
            mount();
            expect(button("Clear history and spending")).toHaveProperty("disabled", true);
            fireEvent.click(button("Apply craft"));
            fireEvent.click(button("Apply craft"));
            expect(amount(engine.methodName(method))).toBe("2");
            fireEvent.click(button("Undo"));
            const retained = currentItem();
            fireEvent.click(button("Save project"));
            const before = saved();
            expect(before.item.mods).toHaveLength(1);
            fireEvent.click(button("Clear history and spending"));
            expect(currentItem()).toBe(retained);
            expect(button("Undo")).toHaveProperty("disabled", true);
            expect(button("Redo")).toHaveProperty("disabled", true);
            expect(button("Clear history and spending")).toHaveProperty("disabled", true);
            expect(screen.getByText("History cleared · 0 crafts")).toBeDefined();
            expect(spending().queryByText(engine.methodName(method))).toBeNull();
            expect(amount("Starting items used")).toBe("1");
            expect(amount("Starting item spending (chaos)")).toBe("5");
            fireEvent.click(button("Save project"));
            expect(saved()).toEqual(before);
            fireEvent.click(button("Apply craft"));
            expect(amount(engine.methodName(method))).toBe("1");
            fireEvent.click(button("Save project"));
            expect(saved().item).toEqual(
                engine.apply(before.item, method, seededRandom(project.seed)).item,
            );
            fireEvent.click(button("Undo"));
            expect(currentItem()).toBe(retained);
            expect(spending().queryByText(engine.methodName(method))).toBeNull();
            fireEvent.click(button("Redo"));
            expect(amount(engine.methodName(method))).toBe("1");
            expect(currentItem()).not.toBe(retained);
        });

        it("stops an in-flight process and ignores late progress, completion and errors", () => {
            mount();
            fireEvent.change(screen.getByLabelText("Item level"), { target: { value: "85" } });
            fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
            const retained = currentItem();
            fireEvent.click(button("Apply process"));
            const { worker, result } = finishProcess();
            act(() => worker.onmessage?.({ data: { type: "emulating", result } }));
            expect(screen.getByText("1 steps completed")).toBeDefined();
            fireEvent.click(button("Clear history and spending"));
            expect(worker.terminate).toHaveBeenCalled();
            expect(currentItem()).toBe(retained);
            act(() => {
                worker.onmessage?.({ data: { type: "emulating", result } });
                worker.onmessage?.({ data: { type: "emulated", result } });
                worker.onerror?.({ message: "late failure" });
            });
            expect(currentItem()).toBe(retained);
            expect(screen.queryByText("1 steps completed")).toBeNull();
            expect(screen.queryByRole("alert")).toBeNull();
            expect(spending().queryByText(engine.methodName(method))).toBeNull();
            expect(button("Undo")).toHaveProperty("disabled", true);
            expect(button("Apply process")).toHaveProperty("disabled", false);
        });

        it("resets accumulated process restarts to one retained starting item", () => {
            mount({
                ...project,
                useProcess: true,
                steps: [{ ...project.steps[0]!, onSuccess: "restart" }],
            });
            fireEvent.click(button("Apply process"));
            const { worker, result } = finishProcess();
            expect(result.baseItems).toBeGreaterThan(1);
            act(() => worker.onmessage?.({ data: { type: "emulated", result } }));
            expect(amount("Starting items used")).toBe(String(result.baseItems));
            const retained = currentItem();
            fireEvent.click(button("Clear history and spending"));
            expect(currentItem()).toBe(retained);
            expect(amount("Starting items used")).toBe("1");
            expect(amount("Starting item spending (chaos)")).toBe("5");
            expect(spending().queryByText(engine.methodName(method))).toBeNull();
        });
    });

    if (game === "poe1") {
        it("keeps pending Allflame copies and charges only the subsequently selected craft", () => {
            mount({ ...project, method: { ...method, allflame: true } });
            fireEvent.click(button("Apply craft"));
            const copies = screen.getByRole("region", { name: "Allflame copies" }).textContent;
            fireEvent.click(button("Save project"));
            const pending = saved();
            fireEvent.click(button("Clear history and spending"));
            expect(screen.getByRole("region", { name: "Allflame copies" }).textContent).toBe(
                copies,
            );
            fireEvent.click(button("Save project"));
            expect(saved()).toEqual(pending);
            fireEvent.click(button("Keep copy 1"));
            expect(amount(engine.methodName(method))).toBe("1");
            const selected = currentItem();
            fireEvent.click(button("Undo"));
            expect(screen.getByRole("region", { name: "Allflame copies" }).textContent).toBe(
                copies,
            );
            expect(spending().queryByText(engine.methodName(method))).toBeNull();
            fireEvent.click(button("Redo"));
            expect(currentItem()).toBe(selected);
            expect(amount(engine.methodName(method))).toBe("1");
        });
    }
}

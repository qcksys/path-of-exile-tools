// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { CraftingWorkbench } from "~/components/crafting/workbench";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import { calculateProcessExact } from "~/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "~/schemas/crafting";
import { changeControl, expectControlValue } from "./control-helpers";

class Worker {
    static instances: Worker[] = [];
    onmessage: ((event: { data: unknown }) => void) | null = null;
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor() {
        Worker.instances.push(this);
    }
}
beforeEach(() => {
    localStorage.clear();
    Worker.instances = [];
    vi.stubGlobal("Worker", Worker);
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

describe.each(["poe1", "poe2"] as const)("%s Strongbox workbench", (game) => {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const baseId = `Metadata/Chests/StrongBoxes/${game === "poe1" ? "StrongboxScarab" : "ResearchStrongboxLow"}`;
    const initial = engine.createItem(baseId);
    const pool = engine.pool({ ...initial, rarity: "rare" });
    const prefix = pool.find((entry) => entry.mod.generation_type === "prefix")!;
    const suffix = pool.find((entry) => entry.mod.generation_type === "suffix")!;
    const item = engine.addStartingMod(
        engine.addStartingMod({ ...initial, rarity: "rare" }, prefix.id, seededRandom(1)),
        suffix.id,
        seededRandom(2),
    );
    const annul = catalog.crafting.currencies.find(
        (entry) => entry.action === "remove_random_mod",
    )!;
    const project = craftingProjectSchema.parse({
        format: 1,
        game,
        patch: catalog.patch,
        item,
        target: { groups: [{ mods: [prefix.id] }] },
        method: { kind: "currency", id: annul.id },
        prices: { [annul.id]: 2 },
        steps: [],
        seed: 42,
        iterations: 1000,
        maxActions: 1,
    });
    const key = `poe-boats:crafting:${game}:${catalog.patch}`;
    const mount = (mode: string, input = project) => {
        localStorage.setItem(key, JSON.stringify({ strongbox: input }));
        render(
            <MemoryRouter>
                <CraftingWorkbench catalog={catalog} mode={mode} />
            </MemoryRouter>,
        );
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "strongbox" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Load project" }));
    };

    it("shows extracted variants, level bounds and encounter properties, and preserves affixes through history and saves", async () => {
        mount("emulate");
        const current = within(screen.getByRole("region", { name: "Current item" }));
        expect(current.getByRole("heading", { name: catalog.bases[baseId]!.name })).toBeDefined();
        expect(screen.getByRole("note", { name: "Strongbox crafting scope" })).toBeDefined();
        expect(current.getByText("Encounter properties")).toBeDefined();
        expect(screen.getByLabelText("Item level")).toHaveProperty(
            "max",
            game === "poe1" ? "100" : "44",
        );
        const startingMods = item.mods.map((mod) => mod.id);
        fireEvent.click(screen.getByRole("button", { name: "Apply craft" }));
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Save project" }));
        let saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.baseId).toBe(baseId);
        expect(saved.item.mods).toHaveLength(1);
        expect(startingMods).toContain(saved.item.mods[0].id);
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            annul.name,
        );
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
        fireEvent.click(screen.getByRole("button", { name: "Save project" }));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item).toEqual(item);
        fireEvent.click(screen.getByRole("button", { name: "Redo" }));
        fireEvent.click(screen.getByRole("button", { name: "Save project" }));
        saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.mods).toHaveLength(1);
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Load project" }));
        expect(screen.queryByRole("alert")).toBeNull();

        const picker = screen.getByRole("combobox", { name: "Item base" });
        const nextId = `Metadata/Chests/StrongBoxes/${game === "poe1" ? "Arcanist" : "ResearchStrongboxHigh"}`;
        changeControl(picker, { target: { value: nextId.split("/").at(-1) } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(
            await screen.findByRole("option", {
                name: new RegExp(` · ${nextId.split("/").at(-1)}$`),
            }),
        );
        expectControlValue(screen.getByLabelText("Item level"), game === "poe1" ? "86" : "65");
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("dispatches a conditional Strongbox calculation with real currencies and saves its requirements", () => {
        mount("calculate");
        expect(screen.queryByText("Fossil optimizer")).toBeNull();
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        fireEvent.click(screen.getByRole("button", { name: "Add crafting step" }));
        fireEvent.click(screen.getByRole("button", { name: "Calculate odds" }));
        const worker = Worker.instances[0]!;
        const input = worker.postMessage.mock.calls[0]![0].project;
        expect(input.item).toEqual(item);
        expect(input.steps[0].method).toEqual(project.method);
        const result = calculateProcessExact(engine, input);
        expect(result).toMatchObject({ probability: 0.5, meanCost: 2 });
        act(() => worker.onmessage?.({ data: { type: "done", result } }));
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Save project" }));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.target).toEqual(project.target);
        expect(saved.steps[0].condition).toEqual(project.target);
    });

    if (game === "poe2") {
        const currency = (suffix: string) =>
            catalog.crafting.currencies.find((entry) => entry.id.endsWith(`/${suffix}`))!;
        const save = () => {
            fireEvent.click(screen.getByRole("button", { name: "Save project" }));
            return craftingProjectSchema.parse(
                JSON.parse(localStorage.getItem(key)!)["My crafting project"],
            );
        };

        it("selects tiered Exalted Orbs and combined omens, retaining their costs and history", async () => {
            const exalt = currency("CurrencyAddModToRare3");
            const greater = currency("OmenOnExaltAddTwoMods");
            const directional = currency("OmenOnExaltAddSuffixes");
            mount("emulate", {
                ...project,
                prices: { [exalt.id]: 2, [greater.id]: 3, [directional.id]: 4 },
            });
            const picker = screen.getByRole("combobox", { name: "Crafting method" });
            changeControl(picker, { target: { value: exalt.name } });
            fireEvent.keyDown(picker, { key: "ArrowDown" });
            fireEvent.click(await screen.findByRole("option", { name: exalt.name }));
            fireEvent.click(screen.getByRole("checkbox", { name: greater.name }));
            fireEvent.click(screen.getByRole("checkbox", { name: directional.name }));
            expect(
                screen.queryByRole("checkbox", {
                    name: currency("OmenOnExaltConsumeQuality").name,
                }),
            ).toBeNull();
            fireEvent.click(screen.getByRole("button", { name: "Apply craft" }));
            expect(screen.queryByRole("alert")).toBeNull();
            const crafted = save();
            expect(engine.counts(crafted.item)).toEqual({ prefixes: 1, suffixes: 3 });
            expect(crafted.item.mods.slice(0, 2)).toEqual(item.mods);
            expect(crafted.method).toEqual({
                kind: "currency",
                id: exalt.id,
                omens: [greater.id, directional.id],
            });
            const spending = screen.getByText("Emulator spending").closest("details")!;
            for (const entry of [exalt, greater, directional])
                expect(spending.textContent).toContain(entry.name);
            fireEvent.click(screen.getByRole("button", { name: "Undo" }));
            expect(save().item).toEqual(item);
            fireEvent.click(screen.getByRole("button", { name: "Redo" }));
            expect(save()).toEqual(crafted);
            changeControl(screen.getByLabelText("Saved project"), {
                target: { value: "My crafting project" },
            });
            fireEvent.click(screen.getByRole("button", { name: "Load project" }));
            expect(save()).toEqual(crafted);
        });

        it("calculates guaranteed directional Annulment and includes the selected omen price", () => {
            const omen = currency("OmenOnAnnulRemoveSuffixes");
            mount("calculate", { ...project, prices: { [annul.id]: 2, [omen.id]: 3 } });
            fireEvent.click(screen.getByRole("checkbox", { name: omen.name }));
            fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
            fireEvent.click(screen.getByRole("button", { name: "Add crafting step" }));
            fireEvent.click(screen.getByRole("button", { name: "Calculate odds" }));
            const worker = Worker.instances[0]!;
            const sent = worker.postMessage.mock.calls[0]![0].project;
            expect(sent.steps[0].method.omens).toEqual([omen.id]);
            const result = calculateProcessExact(engine, sent);
            expect(result).toMatchObject({
                probability: 1,
                meanCost: 5,
                spending: { [annul.id]: 1, [omen.id]: 1 },
            });
            act(() => worker.onmessage?.({ data: { type: "done", result } }));
            expect(screen.queryByRole("alert")).toBeNull();
            expect(save().steps[0]!.method).toEqual(sent.steps[0].method);
        });

        it("explains and preserves the Strongbox outcome while consuming Omen of Corruption", () => {
            const vaal = currency("CurrencyCorrupt");
            const omen = currency("OmenOnVaalRemoveDoNothingOutcome");
            mount("emulate", {
                ...project,
                method: { kind: "currency", id: vaal.id },
                prices: { [vaal.id]: 2, [omen.id]: 3 },
            });
            fireEvent.click(screen.getByRole("checkbox", { name: omen.name }));
            const explanation = screen.getByRole("region", { name: "Vaal Orb model" });
            expect(explanation.textContent).toContain(
                "Omen of Corruption is consumed without changing this Strongbox outcome",
            );
            expect(explanation.textContent).not.toContain("removes the explicit no-change");
            fireEvent.click(screen.getByRole("button", { name: "Apply craft" }));
            expect(screen.queryByRole("alert")).toBeNull();
            expect(save().item).toEqual({ ...item, corrupted: true });
            const spending = screen.getByText("Emulator spending").closest("details")!;
            expect(spending.textContent).toContain(omen.name);
            expect(spending.textContent).toContain(vaal.name);
        });

        it("sanctifies a Strongbox and restores its exact rolls through undo, redo and saves", () => {
            const divine = currency("CurrencyModValues");
            const omen = currency("OmenOnDivineSanctify");
            mount("emulate", {
                ...project,
                method: { kind: "currency", id: divine.id },
                prices: { [divine.id]: 2, [omen.id]: 3 },
            });
            fireEvent.click(screen.getByRole("checkbox", { name: omen.name }));
            fireEvent.click(screen.getByRole("button", { name: "Apply craft" }));
            expect(screen.queryByRole("alert")).toBeNull();
            const crafted = save();
            expect(crafted.item.sanctified).toBe(true);
            for (const entry of crafted.item.mods) {
                expect(entry.sanctification).toBeGreaterThanOrEqual(
                    catalog.crafting.sanctification!.min,
                );
                expect(entry.sanctification).toBeLessThanOrEqual(
                    catalog.crafting.sanctification!.max,
                );
            }
            const card = screen.getByRole("region", { name: "Current item" });
            expect(card.textContent).toContain("Sanctified");
            expect(card.textContent).toContain("Encounter properties");
            fireEvent.click(screen.getByRole("button", { name: "Undo" }));
            expect(save().item).toEqual(item);
            fireEvent.click(screen.getByRole("button", { name: "Redo" }));
            expect(save()).toEqual(crafted);
            changeControl(screen.getByLabelText("Saved project"), {
                target: { value: "My crafting project" },
            });
            fireEvent.click(screen.getByRole("button", { name: "Load project" }));
            expect(save()).toEqual(crafted);
        });
    }
});

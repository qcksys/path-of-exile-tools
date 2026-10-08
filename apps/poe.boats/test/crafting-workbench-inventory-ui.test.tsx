// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { seededRandom } from "~/lib/crafting-engine";
import { CraftingSimulation } from "~/lib/crafting-simulation";
import type { CraftingProject } from "~/schemas/crafting";
import { craftingProjectSchema } from "~/schemas/crafting";
import { changeControl, expectControlValue } from "./control-helpers";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";
import { button, CraftingWorker, mount } from "./crafting-workbench-ui-fixtures";

describe("crafting workbench", () => {
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "recombination" },
        });
        fireEvent.click(button("Load project"));
        const choose = async (name: string, label: string) => {
            const picker = screen.getByRole("combobox", { name });
            changeControl(picker, { target: { value: label } });
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
        expectControlValue(screen.getByLabelText("Rarity"), "rare");
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
        expectControlValue(screen.getByLabelText("Rarity"), "magic");
        if (advanced) expectControlValue(screen.getByLabelText("Memory strands"), "82");
        expect(screen.queryByText("Emulator spending")).toBeNull();
        fireEvent.click(button("Redo"));
        expectControlValue(screen.getByLabelText("Rarity"), "rare");
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expectControlValue(
            screen.getByRole("combobox", { name: "Recombination donor" }),
            donor.name,
        );
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "awakening" },
        });
        fireEvent.click(button("Load project"));
        changeControl(screen.getByLabelText("Donor item"), {
            target: { value: donor.id },
        });
        fireEvent.click(screen.getByText("Custom prices in chaos"));
        changeControl(screen.getByLabelText("Donor · Elder donor"), {
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
        changeControl(screen.getByLabelText("Inventory item name"), {
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
        changeControl(screen.getByLabelText("Project name"), {
            target: { value: "Life armour" },
        });
        fireEvent.click(button("Save project"));
        fireEvent.click(button("Reset"));
        expect(screen.getByRole("region", { name: "Current item" }).textContent).not.toBe(crafted);
        changeControl(screen.getByLabelText("Saved project"), {
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
        changeControl(screen.getByLabelText("Item level"), { target: { value: "80" } });
        act(() => worker.onmessage?.({ data: { type: "done", result: simulation.result() } }));
        expect(screen.queryByRole("region", { name: "Crafting results" })).toBeNull();
        view.unmount();
    });
});

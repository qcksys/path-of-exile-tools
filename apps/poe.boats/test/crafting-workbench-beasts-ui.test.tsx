// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { seededRandom } from "~/lib/crafting-engine";
import { CraftingSimulation, calculateExact } from "~/lib/crafting-simulation";
import type { CraftingItem } from "~/schemas/crafting";
import { craftingProjectSchema } from "~/schemas/crafting";
import { changeControl } from "./control-helpers";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";
import { button, CraftingWorker, mount } from "./crafting-workbench-ui-fixtures";

describe("crafting workbench", () => {
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "bench" } });
        fireEvent.click(button("Load project"));
        const card = screen.getByRole("region", { name: "Current item" });
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: recipe.name } });
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        expect(screen.getByRole("note", { name: "Bench reroll model" })).toBeDefined();
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "matron" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: "Meta-modifier" } });
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
        changeControl(screen.getByLabelText("Saved project"), {
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "beast" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: "Add a Mod to" } });
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(result);
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "talisman" } });
        fireEvent.click(button("Load project"));
        const select = async (name: string) => {
            const picker = screen.getByRole("combobox", { name: "Crafting method" });
            changeControl(picker, { target: { value: name } });
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain("Memory Strands: 82");
    });

    it("selects a level 30 Aspect, targets its tier, and preserves the craft through undo and save", async () => {
        mount();
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: "Level 30 Aspect of the Spider" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(
            await screen.findByRole("option", { name: /Level 30 Aspect of the Spider/ }),
        );
        expect(screen.queryByLabelText("Beast level")).toBeNull();
        changeControl(screen.getByLabelText("Modifier source"), {
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "beast" } });
        fireEvent.click(button("Load project"));
        changeControl(screen.getByLabelText("Beast level"), { target: { value: "86" } });
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
});

// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { seededRandom } from "~/lib/crafting-engine";
import { CraftingSimulation } from "~/lib/crafting-simulation";
import { craftingProjectSchema } from "~/schemas/crafting";
import { changeControl } from "./control-helpers";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";
import { button, CraftingWorker, mount } from "./crafting-workbench-ui-fixtures";

describe("crafting workbench", () => {
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "conflict" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: "Orb of Conflict" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Orb of Conflict" }));
        expect(screen.getByRole("region", { name: "Orb of Conflict model" }).textContent).toContain(
            "50/50",
        );
        changeControl(screen.getByLabelText("Modifier source"), {
            target: { value: "eldritch" },
        });
        changeControl(screen.getByRole("textbox", { name: "Search modifiers" }), {
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "memory" } });
        fireEvent.click(button("Load project"));
        const name = engine.costName(method.kind === "currency" ? method.id : "");
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: name } });
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "strands" } });
        fireEvent.click(button("Load project"));
        changeControl(screen.getByRole("spinbutton", { name: "Memory strands" }), {
            target: { value: "31" },
        });
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: "Orb of Unravelling" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Orb of Unravelling" }));
        expect(
            screen.getByRole("region", { name: "Memory strand crafting" }).textContent,
        ).toContain("empirical research model");
        fireEvent.click(screen.getByText("Memory strand requirement"));
        fireEvent.click(button("Add strand requirement"));
        changeControl(screen.getByRole("spinbutton", { name: "Maximum memory strands" }), {
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).not.toContain("Memory Strands");
        fireEvent.click(button("Clear strand requirement"));
        expect(screen.queryByRole("spinbutton", { name: "Maximum memory strands" })).toBeNull();
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "influence" },
        });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: "Randomise the Influence" } });
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Clear item conditions"));
        expect(
            screen.getByRole("checkbox", { name: "Require Elder" }).getAttribute("aria-checked"),
        ).toBe(String(false));
    });

    it("sets base quality, targets Harvest enchantment life, and retains the result through undo and saves", async () => {
        mount();
        changeControl(screen.getByLabelText("Base quality (%)"), { target: { value: "20" } });
        const recipe = catalog.crafting.harvest.find((entry) => entry.id === "LifeBodyEnchant")!;
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: "Enchant a Body Armour" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: `Harvest · ${recipe.name}` }));
        expect(screen.getByRole("region", { name: "Harvest enchantment" }).textContent).toContain(
            "Grants +1 to Maximum Life per 2% Quality",
        );
        fireEvent.click(screen.getByText("Enchantment requirement"));
        const targetPicker = screen.getByRole("combobox", { name: "Require enchantment" });
        changeControl(targetPicker, { target: { value: "Maximum Life" } });
        fireEvent.keyDown(targetPicker, { key: "ArrowDown" });
        fireEvent.click(
            await screen.findByRole("option", {
                name: /Grants \+1 to Maximum Life per 2% Quality/,
            }),
        );
        fireEvent.click(screen.getByText("Final item property conditions"));
        fireEvent.click(button("Require Flat Life"));
        changeControl(screen.getByLabelText("Minimum Flat Life"), { target: { value: "10" } });
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
        changeControl(screen.getByLabelText("Base quality (%)"), { target: { value: "19" } });
        expect(
            within(card).getByRole("region", { name: "Final item properties" }).textContent,
        ).toContain("Flat Life9");
        changeControl(screen.getByLabelText("Base quality (%)"), { target: { value: "20" } });
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
        changeControl(screen.getByLabelText("Saved project"), {
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "influenced" },
        });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: "Reforge an Influenced Rare" } });
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
});

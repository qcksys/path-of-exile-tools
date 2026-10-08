// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { craftingProjectSchema } from "~/schemas/crafting";
import { changeControl, expectControlValue } from "./control-helpers";
import { baseId, catalog, engine } from "./crafting-fixtures";
import { button, CraftingWorker, mount } from "./crafting-workbench-ui-fixtures";

describe("crafting workbench", () => {
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "tangled" } });
        fireEvent.click(button("Load project"));
        const effects = within(
            screen.getAllByRole("group", { name: "Tangled Fossil revealed effects" })[0]!,
        );
        expectControlValue(effects.getByLabelText("Greatly more modifiers"), "life");
        expectControlValue(effects.getByLabelText("Blocked modifiers"), "resistance");
        const blocked = effects.getByLabelText("Blocked modifiers");
        fireEvent.click(blocked);
        const blockedMenu = document.getElementById(blocked.getAttribute("aria-controls")!)!;
        expect(
            within(blockedMenu).getByRole("option", { name: "life" }).getAttribute("aria-disabled"),
        ).toBe("true");
        fireEvent.keyDown(blockedMenu, { key: "Escape" });
        const more = effects.getByLabelText("Greatly more modifiers");
        fireEvent.click(more);
        const moreMenu = document.getElementById(more.getAttribute("aria-controls")!)!;
        expect(within(moreMenu).getAllByRole("option")).toHaveLength(22);
        fireEvent.keyDown(moreMenu, { key: "Escape" });
        const pool = screen.getByRole("region", { name: "Modifier pool" });
        changeControl(screen.getByRole("textbox", { name: "Search modifiers" }), {
            target: { value: "maximum Life" },
        });
        expect(pool.querySelector('[data-modifier-id="IncreasedLife1"]')?.textContent).toContain(
            "40,000",
        );
        changeControl(effects.getByLabelText("Greatly more modifiers"), {
            target: { value: "critical" },
        });
        expect(pool.querySelector('[data-modifier-id="IncreasedLife1"]')?.textContent).toContain(
            "10,000",
        );
        changeControl(effects.getByLabelText("Blocked modifiers"), {
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
        changeControl(screen.getByLabelText("Project name"), {
            target: { value: "revealed pair" },
        });
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["revealed pair"].method.tangled).toBe(
            pair("critical", "fire"),
        );
        fireEvent.click(screen.getByText("Fossil optimizer"));
        const optimizer = within(screen.getByText("Fossil optimizer").closest("details")!);
        expectControlValue(optimizer.getByLabelText("Greatly more modifiers"), "critical");
        changeControl(optimizer.getByLabelText("Blocked modifiers"), {
            target: { value: "cold" },
        });
        fireEvent.click(button("Compare fossils"));
        const worker = CraftingWorker.instances.at(-1)!;
        expect(worker.postMessage.mock.calls[0]![0].options.tangled).toBe(pair("critical", "cold"));
        changeControl(optimizer.getByLabelText("Blocked modifiers"), {
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "bloodstained" },
        });
        fireEvent.click(button("Load project"));
        expect(
            screen.getByRole("region", { name: "Bloodstained Fossil model" }).textContent,
        ).toContain("locked implicits remain");
        changeControl(screen.getByLabelText("Modifier source"), {
            target: { value: "corrupted" },
        });
        const desired = engine
            .corruptedModifiers(item)
            .find((entry) => entry.mod.required_level > 1)!;
        changeControl(screen.getByRole("textbox", { name: "Search modifiers" }), {
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
        changeControl(screen.getByLabelText("Saved project"), {
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "gilded" } });
        fireEvent.click(button("Load project"));
        const fossils = within(screen.getByRole("group", { name: "Choose up to four fossils" }));
        fireEvent.click(fossils.getByRole("checkbox", { name: "Gilded Fossil" }));
        fireEvent.click(fossils.getByRole("checkbox", { name: "Jagged Fossil" }));
        expect(screen.getByRole("region", { name: "Gilded Fossil model" }).textContent).toContain(
            "vendor reward outcomes are not simulated",
        );
        changeControl(screen.getByLabelText("Modifier source"), { target: { value: "gilded" } });
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
        changeControl(screen.getByLabelText("Saved project"), {
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "sanctified" },
        });
        fireEvent.click(button("Load project"));
        const fossils = within(screen.getByRole("group", { name: "Choose up to four fossils" }));
        fireEvent.click(fossils.getByRole("checkbox", { name: "Sanctified Fossil" }));
        fireEvent.click(fossils.getByRole("checkbox", { name: "Jagged Fossil" }));
        expect(
            screen.getByRole("region", { name: "Sanctified Fossil model" }).textContent,
        ).toContain("0.61×");
        changeControl(screen.getByRole("textbox", { name: "Search modifiers" }), {
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
        changeControl(screen.getByLabelText("Saved project"), {
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "glyphic" } });
        fireEvent.click(button("Load project"));
        changeControl(screen.getByLabelText("Modifier source"), {
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "fossils" } });
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
        changeControl(screen.getByLabelText("Saved project"), {
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "allflame" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(screen.getByText("Fossil optimizer"));
        const optimizer = within(screen.getByText("Fossil optimizer").closest("details")!);
        expect(optimizer.getByRole("note").textContent).toContain("Uses Allflame");
        fireEvent.click(optimizer.getByText("Optimizer prices in chaos"));
        changeControl(optimizer.getByLabelText("Dead Man's Sulphur"), {
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
        changeControl(screen.getByLabelText("Maximum resonator sockets"), {
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
        changeControl(screen.getByLabelText("Maximum resonator sockets"), {
            target: { value: "1" },
        });
        expect(screen.queryByText("1 / 3 combinations completed")).toBeNull();
    });
});

// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import { craftingProjectSchema } from "~/schemas/crafting";
import { changeControl, expectControlValue } from "./control-helpers";
import { catalog, currency, engine, getCatalog } from "./crafting-fixtures";
import { button, CraftingWorker, mount } from "./crafting-workbench-ui-fixtures";

describe("crafting workbench", () => {
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "flask" } });
        fireEvent.click(button("Load project"));
        expect(screen.getByText(/one of 15 eligible outcomes/)).toBeDefined();
        fireEvent.click(screen.getByText("Enchantment requirement"));
        const targetPicker = screen.getByRole("combobox", { name: "Require enchantment" });
        changeControl(targetPicker, { target: { value: "Charges reach full" } });
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
        changeControl(picker, { target: { value: "Bench Charges reach full" } });
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
        changeControl(picker, { target: { value: "Remove Enchantments" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Bench · Remove Enchantments" }));
        fireEvent.click(button("Apply craft"));
        expect(card.textContent).not.toContain("Used when Charges reach full");
        expect(screen.queryByRole("alert")).toBeNull();
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Used when Charges reach full");
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "tainted" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: "Tainted Catalyst" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Tainted Catalyst" }));
        expect(
            screen.getByRole("region", { name: "Tainted Catalyst model" }).textContent,
        ).toContain("12 eligible types");
        fireEvent.click(screen.getByText("Catalyst quality requirement", { exact: true }));
        changeControl(screen.getByLabelText("Minimum catalyst quality (%)"), {
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain(engine.costName(result.catalyst!.id));
    });

    it("selects Catalysing Exaltation, consumes quality and restores it through undo and saves", async () => {
        const data = getCatalog("poe2");
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "catalysing" },
        });
        fireEvent.click(button("Load project"));
        fireEvent.click(screen.getByRole("checkbox", { name: omen.name }));
        expectControlValue(screen.getByRole("spinbutton", { name: /^Catalyst quality/ }), "20");
        expect(
            screen.getByRole("region", { name: "Catalysing Exaltation model" }).textContent,
        ).toContain("multiplied by 5 at 20%");
        changeControl(screen.getByRole("textbox", { name: "Search modifiers" }), {
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
        expectControlValue(screen.getByRole("spinbutton", { name: /^Catalyst quality/ }), "20");
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

    it.each([
        ["poe1", "Body Armour", false],
        ["poe2", "Wand", false],
        ["poe1", "Body Armour", true],
    ] as const)("applies %s %s base quality (tainted=%s), edits targets and preserves history", async (game, itemClass, corrupted) => {
        const data = game === "poe1" ? catalog : getCatalog("poe2");
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "quality" } });
        fireEvent.click(button("Load project"));
        const name = model.costName(recipe.id);
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name }));
        expect(screen.getByRole("region", { name: "Base quality model" }).textContent).toContain(
            corrupted ? "uniformly modeled" : "Rarity does not change",
        );
        fireEvent.click(screen.getByText("Base quality requirement"));
        fireEvent.click(button("Add quality requirement"));
        changeControl(screen.getByRole("spinbutton", { name: "Maximum base quality (%)" }), {
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
        ["poe1", "Ring"],
        ["poe2", "Ring"],
        ["poe2", "Jewel"],
    ] as const)("applies %s %s catalysts, edits quality requirements and preserves spending and history", async (game, itemClass) => {
        const data = game === "poe1" ? catalog : getCatalog("poe2");
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "catalysts" },
        });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name }));
        expect(screen.getByRole("region", { name: "Catalyst application" }).textContent).toContain(
            "One use adds 2% quality",
        );
        fireEvent.click(screen.getByText("Catalyst quality requirement"));
        const targetPicker = screen.getByRole("combobox", { name: "Required catalyst" });
        changeControl(targetPicker, { target: { value: name } });
        fireEvent.keyDown(targetPicker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name }));
        changeControl(screen.getByRole("spinbutton", { name: "Maximum catalyst quality (%)" }), {
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain(`${selected.description}: +20%`);
        fireEvent.click(button("Clear catalyst requirement"));
        expect(
            screen.queryByRole("spinbutton", { name: "Maximum catalyst quality (%)" }),
        ).toBeNull();
    });

    it("selects Sanctification, dispatches stat targets and preserves state and costs through undo and save/load", () => {
        const data = getCatalog("poe2");
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "sanctify" } });
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Sanctified");
    });

    it("calculates and applies Breach essence, retaining raised quality after annulment, undo and save/load", async () => {
        const data = getCatalog("poe2");
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "breach" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: essence.name } });
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
        changeControl(screen.getByRole("combobox", { name: "Catalyst" }), {
            target: { value: catalyst.id },
        });
        changeControl(screen.getByRole("spinbutton", { name: /Catalyst quality/ }), {
            target: { value: "40" },
        });
        expect(screen.getByText(/Current crafting maximum 40%/)).toBeDefined();
        changeControl(picker, { target: { value: annul.name } });
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
        changeControl(screen.getByRole("combobox", { name: "Catalyst" }), {
            target: { value: "" },
        });
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain(`${catalyst.description}: +40%`);
        expect(card.textContent).not.toContain("+20% to Maximum Quality");
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("edits %s catalyst quality and preserves it through undo and save/load", (game) => {
        const data = game === "poe1" ? catalog : getCatalog("poe2");
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "quality" } });
        fireEvent.click(button("Load project"));
        const catalyst = data.crafting.catalysts.find((entry) =>
            entry.tags.includes(game === "poe1" ? "resource" : "life"),
        )!;
        changeControl(screen.getByRole("combobox", { name: "Catalyst" }), {
            target: { value: catalyst.id },
        });
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("+18 to maximum Life");
        changeControl(screen.getByRole("spinbutton", { name: /Catalyst quality/ }), {
            target: { value: "10" },
        });
        expect(card.textContent).toContain("+16 to maximum Life");
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("+18 to maximum Life");
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.catalyst).toEqual({ id: catalyst.id, quality: 20 });
        expect(saved.item.mods[0].values).toEqual([15]);
        changeControl(screen.getByRole("combobox", { name: "Catalyst" }), {
            target: { value: "" },
        });
        expect(card.textContent).toContain("+15 to maximum Life");
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("+18 to maximum Life");
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain("+20%");
    });
});

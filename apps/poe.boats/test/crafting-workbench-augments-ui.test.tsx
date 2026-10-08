// @vitest-environment jsdom

import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import type { CraftingItem } from "~/schemas/crafting";
import { craftingProjectSchema } from "~/schemas/crafting";
import { changeControl } from "./control-helpers";
import { getCatalog } from "./crafting-fixtures";
import { button, CraftingWorker, mount } from "./crafting-workbench-ui-fixtures";

describe("crafting workbench", () => {
    it("uses the Rune quality maximum for controls, targets, spending and saved items", async () => {
        const data = getCatalog("poe2");
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "serle" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Maximum Quality is 52%");
        expect(
            screen.getByRole("spinbutton", { name: "Base quality (%)" }).getAttribute("max"),
        ).toBe("62");
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: current.costName(recipe.id) } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: current.costName(recipe.id) }));
        expect(screen.getByRole("region", { name: "Base quality model" }).textContent).toContain(
            "up to 52%",
        );
        fireEvent.click(screen.getByText("Base quality requirement"));
        fireEvent.click(button("Add quality requirement"));
        changeControl(screen.getByRole("spinbutton", { name: "Maximum base quality (%)" }), {
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
        const data = getCatalog("poe2");
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "upgrade" } });
        fireEvent.click(button("Load project"));
        const choose = async (name: string, query: string, label: string) => {
            const picker = screen.getByRole("combobox", { name });
            changeControl(picker, { target: { value: query } });
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
        changeControl(screen.getByLabelText("Project name"), { target: { value: "upgraded" } });
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
        const data = getCatalog("poe2");
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
        changeControl(screen.getByLabelText("Saved project"), {
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
        changeControl(screen.getByLabelText("Project name"), { target: { value: "result" } });
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!).result;
        expect(current.statTotals(current.validateItem(saved.item)).get(scenario.stat)).toBe(
            scenario.min,
        );
        expect(saved.item.augments).toEqual([...project.item.augments!, augment.id]);
    });

    it("explains an Atziri core's corruption odds and dispatches its socketed state", async () => {
        const data = getCatalog("poe2");
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "atziri" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: vaal.name } });
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
        const data = getCatalog("poe2");
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "aldur" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: "Betrayal of Aldur" } });
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
        changeControl(screen.getByLabelText("Project name"), { target: { value: "converted" } });
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
        const data = getCatalog("poe2");
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
            changeControl(picker, { target: { value: "Grasping Ring" } });
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "serle" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(button("Apply craft"));
        const card = screen.getByRole("region", { name: "Current item" });
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain("3/4 suffixes");
        expect(card.textContent).toContain("Socket 1 · Serle's Triumph");
        fireEvent.click(screen.getByText("Item conditions"));
        expect(screen.getByLabelText("Maximum total affixes").getAttribute("max")).toBe("7");
        const openAffixes = screen.getByRole("combobox", { name: "Open affixes of either type" });
        fireEvent.click(openAffixes);
        const affixMenu = document.getElementById(openAffixes.getAttribute("aria-controls")!)!;
        expect(within(affixMenu).getByRole("option", { name: "At least 7" })).toBeDefined();
        fireEvent.keyDown(affixMenu, { key: "Escape" });
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: "Exalted Orb" } });
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
        changeControl(screen.getByLabelText("Project name"), {
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
        const data = getCatalog("poe2");
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
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "augments" } });
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
            changeControl(picker, { target: { value } });
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
        changeControl(screen.getByLabelText("Project name"), { target: { value: "socketed" } });
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!).socketed;
        expect(saved.item.augments).toEqual([cold.id]);
        expect(saved.method).toEqual({ kind: "augment", id: cold.id, replace: 0 });
    });

    it("sets augment sockets, targets a Vaal socket outcome and preserves the result through history and saves", () => {
        const data = getCatalog("poe2");
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "corruption" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("region", { name: "Vaal Orb model" }).textContent).toContain(
            "four equally likely outcomes",
        );
        changeControl(screen.getByRole("spinbutton", { name: "Augment sockets" }), {
            target: { value: "2" },
        });
        fireEvent.click(screen.getByText("Socket requirement", { exact: true }));
        fireEvent.click(button("Add socket requirement"));
        changeControl(screen.getByRole("spinbutton", { name: "Minimum augment sockets" }), {
            target: { value: "3" },
        });
        changeControl(screen.getByRole("spinbutton", { name: "Maximum augment sockets" }), {
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
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Augment sockets: 3");
        expect(card.textContent).toContain("Corrupted");
        fireEvent.click(button("Apply craft"));
        expect(screen.getByRole("alert").textContent).toContain("uncorrupted");
    });
});

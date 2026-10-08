// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import type { CraftingItem } from "~/schemas/crafting";
import { craftingProjectSchema } from "~/schemas/crafting";
import { changeControl } from "./control-helpers";
import { baseId, catalog, currency, engine, getCatalog } from "./crafting-fixtures";
import { button, CraftingWorker, mount } from "./crafting-workbench-ui-fixtures";

describe("crafting workbench", () => {
    it.each([
        ["reroll_rare_hellscape", "Tainted Chaos Orb", "Tainted Chaos model", 0],
        ["add_mod_to_rare_hellscape", "Tainted Exalted Orb", "Tainted Exalted model", 3],
        ["upgrade_mod_tier_hellscape", "Tainted Divine Teardrop", "Tainted Divine model", 4],
    ] as const)("selects %s and retains corrupted outcomes, costs, targets, history and saves", async (action, name, note, count) => {
        let item: CraftingItem = {
            ...engine.createItem(baseId),
            rarity: "rare",
            corrupted: true,
            sockets: 6,
        };
        while (item.mods.length < 4)
            item = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(1));
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: currency(action),
            target: { groups: [], affixCount: { min: count, max: count } },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ tainted: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "tainted" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name }));
        expect(screen.getByRole("note", { name: note })).toBeDefined();
        fireEvent.click(button("Calculate odds"));
        const request = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0];
        expect(request.project.method).toEqual(project.method);
        expect(request.project.target.affixCount).toEqual({ min: count, max: count });
        expect(request.project.item.corrupted).toBe(true);
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const after = card.textContent;
        expect(after).toContain("Corrupted");
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${name}1`,
        );
        if (count === 0) {
            expect(after).toContain("No explicit modifiers");
            fireEvent.click(button("Apply craft"));
            expect(screen.getByRole("alert").textContent).toContain("rare item");
            expect(card.textContent).toBe(after);
        }
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.mods).toHaveLength(count);
        expect(saved.item.rarity).toBe(count === 0 ? "normal" : "rare");
        expect(saved.item.sockets).toBe(6);
        expect(saved.item.corrupted).toBe(true);
        fireEvent.click(button("Undo"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
    });

    it("fractures PoE 2 crafted modifiers and retains their slot, targets, spending, history and saves", async () => {
        const data = getCatalog("poe2");
        const engine = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(([, entry]) => entry.name === "Ruby Ring")![0];
        const essence = data.crafting.poe2Essences.find(
            (entry) => entry.name === "Essence of the Breach",
        )!;
        const fracture = data.crafting.currencies.find(
            (entry) => entry.action === "fracture_random_mod",
        )!;
        let item = engine.addStartingMod(
            { ...engine.createItem(base), rarity: "rare" },
            essence.rules[0]!.mod!,
            seededRandom(1),
            "essence",
        );
        while (item.mods.length < 4)
            item = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(1));
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            method: { kind: "currency", id: fracture.id },
            target: { groups: [{ mods: [item.mods[0]!.id], fractured: true }] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ fracture: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "fracture" } });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("note", { name: "Fracturing model" }).textContent).toContain(
            "still occupy a crafted slot",
        );
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.item.mods[0].crafted).toBe(true);
        expect(sent.target.groups[0].fractured).toBe(true);
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        const craftedRow = within(card)
            .getByText(/crafted$/)
            .closest("li")!;
        fireEvent.click(within(craftedRow).getByRole("button", { name: "Fracture" }));
        expect(craftedRow.textContent).toContain("crafted · fractured");
        fireEvent.click(within(craftedRow).getByRole("button", { name: "Unfracture" }));
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const after = card.textContent;
        expect(within(card).getAllByRole("button", { name: "Unfracture" })).toHaveLength(1);
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Fracturing Orb1",
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.mods[0].crafted).toBe(true);
        expect(
            saved.item.mods.filter((entry: { fractured: boolean }) => entry.fractured),
        ).toHaveLength(1);
        fireEvent.click(button("Undo"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
    });

    it.each([
        0, 5,
    ])("selects PoE 1 equipment Vaal Orbs and keeps seed %s through dispatch, history and saves", async (seed) => {
        const id = Object.keys(catalog.bases).find(
            (id) => catalog.bases[id]!.name === "Coral Ring",
        )!;
        const vaal = catalog.crafting.currencies.find((entry) => entry.action === "corrupt_item")!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: engine.createItem(id),
            method: currency("transmute_to_rare"),
            target:
                seed === 0
                    ? {
                          groups: [],
                          rarity: "rare",
                          affixCount: { min: 6, max: 6 },
                          corrupted: true,
                      }
                    : { groups: [{ mods: ["V2CannotBePoisonedCorrupted"] }], corrupted: true },
            steps: [],
            prices: { [vaal.id]: 3 },
            seed,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ vaal: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "vaal" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: "Vaal Orb" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Vaal Orb" }));
        expect(screen.getByRole("region", { name: "Vaal Orb model" }).textContent).toContain(
            "white-socket branch leaves modeled properties unchanged",
        );
        fireEvent.click(button("Calculate odds"));
        expect(CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project).toMatchObject({
            method: { kind: "currency", id: vaal.id },
            target: project.target,
            prices: project.prices,
        });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Corrupted");
        expect(card.textContent).toContain(seed === 0 ? "3/3 prefixes" : "Cannot be Poisoned");
        fireEvent.click(button("Undo"));
        expect(card.textContent).not.toContain("Corrupted");
        expect(card.textContent).toContain("0/0 prefixes");
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(
            engine.apply(project.item, { kind: "currency", id: vaal.id }, seededRandom(seed)).item,
        );
        expect(saved.target).toEqual(project.target);
        fireEvent.click(button("Undo"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Corrupted");
        const requirements = screen.getByRole("region", { name: "Crafting requirements" });
        fireEvent.click(within(requirements).getByText("Item conditions", { exact: true }));
        fireEvent.click(
            within(requirements).getByRole("button", { name: "Clear item conditions" }),
        );
        expect(
            within(
                within(requirements).getByRole("group", { name: "Required corruption" }),
            ).getByRole("button", { name: "Any", pressed: true }),
        ).toBeDefined();
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].target.corrupted,
        ).toBeUndefined();
    });

    it.each([
        { base: "Rusted Cuirass", action: "incursion_armour_quality", seed: 0, corrupted: false },
        { base: "Gold Ring", action: "incursion_jewellery_quality", seed: 5, corrupted: true },
    ])("keeps $action quality and corruption conditions through dispatch, history and saves", ({
        base,
        action,
        seed,
        corrupted,
    }) => {
        const data = getCatalog("poe2");
        const model = new CraftingEngine(data);
        const baseId = Object.keys(data.bases).find((id) => data.bases[id]!.name === base)!;
        const currency = data.crafting.currencies.find((entry) => entry.action === action)!;
        const catalyst = data.crafting.catalysts.find((entry) => entry.tags.includes("life"))!;
        const jewellery = action === "incursion_jewellery_quality";
        const item = model.createItem(baseId);
        if (jewellery) item.catalyst = { id: catalyst.id, quality: 29 };
        else item.quality = 29;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            method: { kind: "currency", id: currency.id },
            target: {
                groups: [],
                ...(jewellery
                    ? { catalyst: { id: catalyst.id, min: 30, max: 30 } }
                    : { quality: { min: 30, max: 30 } }),
            },
            steps: [],
            prices: { [currency.id]: 7 },
            seed,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ infuser: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "infuser" } });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("region", { name: "Quality Infuser model" }).textContent).toContain(
            "Modeled corruption chance for this use: 45%",
        );
        const requirements = screen.getByRole("region", { name: "Crafting requirements" });
        fireEvent.click(within(requirements).getByText("Item conditions", { exact: true }));
        const conditions = within(requirements).getByRole("group", { name: "Required corruption" });
        fireEvent.click(
            within(conditions).getByRole("button", {
                name: corrupted ? "Corrupted" : "Uncorrupted",
            }),
        );
        const target = { ...project.target, corrupted };
        fireEvent.click(button("Calculate odds"));
        expect(CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project).toMatchObject({
            method: project.method,
            target,
            prices: project.prices,
        });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("30%");
        expect(card.textContent?.includes("Corrupted")).toBe(corrupted);
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("29%");
        expect(card.textContent).not.toContain("Corrupted");
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(model.apply(item, project.method, seededRandom(seed)).item);
        expect(saved.target).toEqual(target);
        fireEvent.click(button("Undo"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("30%");
        expect(card.textContent?.includes("Corrupted")).toBe(corrupted);
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        fireEvent.click(button("Add crafting step"));
        fireEvent.click(button("Use current requirements"));
        expect(screen.getByRole("region", { name: "Crafting process" }).textContent).toContain(
            corrupted ? "corrupted" : "uncorrupted",
        );
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].steps[0].condition,
        ).toEqual(target);
        fireEvent.click(within(conditions).getByRole("button", { name: "Any" }));
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].target.corrupted,
        ).toBeUndefined();
    });

    it.each([
        {
            name: "Ancient Infuser",
            action: "incursion_corrupt_tablet",
            base: "Irradiated Tablet",
            seed: 1,
        },
        {
            name: "Architect's Orb",
            action: "incursion_corrupt_equipment",
            base: "Gold Ring",
            seed: 0,
        },
        {
            name: "Architect's Orb",
            action: "incursion_corrupt_equipment",
            base: "Gold Ring",
            seed: 4,
        },
    ])("keeps $name outcomes through dispatch, history and saves at seed $seed", ({
        name,
        action,
        base,
        seed,
    }) => {
        const data = getCatalog("poe2");
        const model = new CraftingEngine(data);
        const baseId = Object.keys(data.bases).find((id) => data.bases[id]!.name === base)!;
        const currency = data.crafting.currencies.find((entry) => entry.action === action)!;
        const item = model.createItem(baseId);
        const tablet = action === "incursion_corrupt_tablet";
        item.corrupted = !tablet;
        const stat = data.mods[item.implicits[0]!.id]!.stats[0]!.id;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            method: { kind: "currency", id: currency.id },
            target: {
                groups: [],
                ...(tablet
                    ? { stats: [{ id: stat, scope: "implicit", min: 20 }] }
                    : { rarity: "normal" }),
            },
            steps: [],
            prices: { [currency.id]: 7 },
            seed,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ tablet: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "tablet" } });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("region", { name: `${name} model` }).textContent).toContain(
            tablet ? "three equally likely" : "twice corrupted",
        );
        fireEvent.click(button("Calculate odds"));
        expect(CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project).toMatchObject({
            method: project.method,
            target: project.target,
            prices: project.prices,
        });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        if (tablet) {
            expect(card.textContent).toContain("20 uses remaining");
            expect((screen.getByLabelText(`Value for ${stat}`) as HTMLInputElement).max).toBe("20");
        } else if (seed === 4) {
            expect(card.textContent).toContain("Destroyed. This item cannot be crafted");
            expect((button("Apply craft") as HTMLButtonElement).disabled).toBe(true);
            expect(within(card).queryByRole("spinbutton")).toBeNull();
        } else {
            expect(card.textContent).toContain("Twice Corrupted");
        }
        fireEvent.click(button("Undo"));
        if (tablet) expect(card.textContent).toContain("10 uses remaining");
        else expect(card.textContent).not.toContain("Twice Corrupted");
        expect(card.textContent).not.toContain("Destroyed.");
        expect((button("Apply craft") as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(model.apply(item, project.method, seededRandom(seed)).item);
        expect(saved.target).toEqual(project.target);
        fireEvent.click(button("Undo"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain(
            tablet ? "20 uses remaining" : seed === 4 ? "Destroyed." : "Twice Corrupted",
        );
    });

    it("calculates a jewel value target and keeps Vaal scaling through history, worker requests and saves", () => {
        const data = getCatalog("poe2");
        const model = new CraftingEngine(data);
        const ruby = Object.entries(data.bases).find(([, entry]) => entry.name === "Ruby")![0];
        const item = model.addStartingMod(model.createItem(ruby), "JewelArmour", seededRandom(1));
        const vaal = data.crafting.currencies.find((entry) =>
            entry.id.endsWith("/CurrencyCorrupt"),
        )!;
        const omen = data.crafting.currencies.find((entry) => entry.name === "Omen of Corruption")!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            method: { kind: "currency", id: vaal.id, omens: [omen.id] },
            target: { groups: [], stats: [{ id: "physical_damage_reduction_rating_+%", min: 24 }] },
            steps: [],
            prices: { [vaal.id]: 2, [omen.id]: 3 },
            seed: 729,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ jewel: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "jewel" } });
        fireEvent.click(button("Load project"));
        const modelDescription = screen.getByRole("region", { name: "Vaal Orb model" });
        expect(modelDescription.textContent).toContain("50% no-change chance");
        expect(modelDescription.textContent).toContain("78–122%");
        fireEvent.click(button("Calculate odds"));
        expect(CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project).toMatchObject({
            item,
            method: project.method,
            target: project.target,
        });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("24% increased Armour");
        expect(card.textContent).toContain("Corruption value roll 119%");
        expect(card.textContent).toContain("Corrupted");
        const spending = screen.getByText("Emulator spending").closest("details")!;
        expect(spending.textContent).toContain("Vaal Orb1");
        expect(spending.textContent).toContain("Omen of Corruption1");
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("16% increased Armour");
        expect(card.textContent).not.toContain("Corruption value roll");
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].item.mods[0],
        ).toMatchObject({ values: [20], corruptionScale: 119 });
        fireEvent.click(button("Undo"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("24% increased Armour");
        expect(card.textContent).toContain("Corruption value roll 119%");
        fireEvent.click(button("Calculate odds"));
        expect(
            CraftingWorker.instances.at(-1)!.postMessage.mock.calls.at(-1)![0].project.item.mods[0]
                .corruptionScale,
        ).toBe(119);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.getByRole("alert").textContent).toContain("uncorrupted");
    });
});

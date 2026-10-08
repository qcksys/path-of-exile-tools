// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import type { CraftingItem } from "~/schemas/crafting";
import { craftingProjectSchema } from "~/schemas/crafting";
import { changeControl, expectControlValue } from "./control-helpers";
import { catalog, getCatalog } from "./crafting-fixtures";
import { button, CraftingWorker, mount } from "./crafting-workbench-ui-fixtures";

describe("crafting workbench", () => {
    it.each([
        ["Potent Liquid Ferocity", "Metadata/Items/Jewels/JewelStr"],
        ["Potent Liquid Contempt", "Metadata/Items/Jewels/JewelStr"],
        ["Ancient Potent Liquid Contempt", "Metadata/Items/Jewels/JewelRadiusStr"],
    ])("selects %s, dispatches both outcomes and preserves the craft in history and saves", async (name, baseId) => {
        const data = getCatalog("poe2");
        const crafting = new CraftingEngine(data);
        const selected = data.crafting.currencies.find((entry) => entry.name === name)!;
        const method = { kind: "currency" as const, id: selected.id };
        let item: CraftingItem = { ...crafting.createItem(baseId!), rarity: "rare" };
        for (const side of ["prefix", "suffix"])
            item = crafting.addStartingMod(
                item,
                crafting.pool(item, { side })[0]!.id,
                seededRandom(1),
            );
        const outcomes = crafting.emotionRule(item, selected.id)!.mods;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            target: { groups: [{ mods: outcomes }] },
            method,
            steps: [],
            prices: { [selected.id]: 9 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ potent: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "potent" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name }));
        const description = screen.getByRole("region", { name: "Liquid Emotion outcome" });
        for (const id of outcomes) expect(description.textContent).toContain(crafting.mod(id).text);
        expect(description.textContent).toContain("equal weights as a model assumption");
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method).toEqual(method);
        expect(sent.target.groups[0].mods).toEqual(outcomes);
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const after = card.textContent;
        expect(after).not.toBe(before);
        expect(after).toContain("crafted");
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(outcomes).toContain(
            saved.item.mods.find((entry: { crafted: boolean }) => entry.crafted).id,
        );
        expect(saved.method).toEqual(method);
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(screen.getByText("Emulator spending"));
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${name}1`,
        );
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
    });

    it("edits, targets, removes and saves an existing allocated passive", async () => {
        const data = getCatalog("poe2");
        const engine = new CraftingEngine(data);
        mount("emulate", data);
        fireEvent.click(screen.getByText("Existing Delirium passive"));
        const picker = screen.getByRole("combobox", { name: "Allocated notable" });
        changeControl(picker, { target: { value: "Harness the Elements" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Harness the Elements" }));
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Allocates Harness the Elements");
        expect(card.textContent).toContain("20% increased Damage");
        fireEvent.click(screen.getByText("Allocated passive requirement"));
        const requirement = screen.getByRole("combobox", { name: "Require allocated notable" });
        changeControl(requirement, { target: { value: "Harness the Elements" } });
        fireEvent.keyDown(requirement, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Harness the Elements" }));
        fireEvent.click(button("Calculate odds"));
        const project = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(project.target.grantedPassives).toEqual(["elemental32"]);
        expect(engine.matches(project.item, project.target)).toBe(true);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(within(card).getByRole("button", { name: "Remove" }));
        expect(card.textContent).not.toContain("Allocates Harness");
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("Allocates Harness");
        fireEvent.click(button("Redo"));
        expect(card.textContent).not.toContain("Allocates Harness");
        fireEvent.click(button("Undo"));
        fireEvent.click(screen.getByText("Save, load, and export"));
        fireEvent.click(button("Save project"));
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.mods[0].grantedPassive).toBe("elemental32");
        expect(saved.target.grantedPassives).toEqual(["elemental32"]);
        fireEvent.click(button("Clear allocated passive requirement"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expectControlValue(requirement, "Harness the Elements");
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("selects, targets and saves an anointment in %s", async (game) => {
        const data = game === "poe1" ? catalog : getCatalog("poe2");
        const crafting = new CraftingEngine(data);
        const amulet = Object.entries(data.bases).find(
            ([, base]) => base.item_class === "Amulet" && !base.corrupted,
        )![0];
        const recipe = data.crafting.anointing.recipes.find((entry) => entry.passive)!;
        const name = data.crafting.anointing.passives[recipe.passive!]!.name;
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: data.patch,
            item: crafting.createItem(amulet),
            target: { groups: [] },
            method: {
                kind: "currency",
                id: data.crafting.currencies.find((entry) => entry.action === "transmute_to_rare")!
                    .id,
            },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 10,
        });
        const key = `poe-boats:crafting:${game}:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ amulet: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "amulet" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(
            await screen.findByRole("option", { name: new RegExp(`Allocates ${name}$`) }),
        );
        expect(screen.getByRole("region", { name: "Anointing recipe" }).textContent).toContain(
            "Ingredients in recipe order",
        );
        fireEvent.click(screen.getByText("Anointment requirements"));
        const targetPicker = screen.getByRole("combobox", { name: "Require anointment" });
        changeControl(targetPicker, { target: { value: name } });
        fireEvent.keyDown(targetPicker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: `Allocates ${name}` }));
        fireEvent.click(button("Calculate odds"));
        expect(screen.queryByRole("alert")).toBeNull();
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.target.anointments).toEqual([recipe.id]);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain(`Allocates ${name}`);
        expect(card.textContent).toContain("0/0 prefixes · 0/0 suffixes");
        expect(screen.getByText("Emulator spending")).toBeDefined();
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].item.anointments,
        ).toEqual([recipe.id]);
        fireEvent.click(button("Undo"));
        expect(card.textContent).not.toContain(`Allocates ${name}`);
        expect(screen.queryByText("Emulator spending")).toBeNull();
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain(`Allocates ${name}`);
        fireEvent.click(within(card).getByRole("button", { name: "Remove anointment" }));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain(`Allocates ${name}`);
    });

    it("selects a Liquid Emotion, targets its guarantee, and restores the crafted jewel and spending", async () => {
        const data = getCatalog("poe2");
        const crafting = new CraftingEngine(data);
        const item = crafting.addStartingMod(
            crafting.createItem("Metadata/Items/Jewels/JewelStr"),
            "JewelFireDamage",
            seededRandom(1),
        );
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            method: { kind: "currency", id: "Metadata/Items/Currency/DistilledEmotion1" },
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 10,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ jewel: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "jewel" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: "Potent Liquid Melancholy" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: /^Potent Liquid Melancholy$/ }));
        expect(
            screen.getByRole("region", { name: "Liquid Emotion outcome" }).textContent,
        ).toContain("Debilitate");
        changeControl(screen.getByLabelText("Modifier source"), {
            target: { value: "emotion" },
        });
        changeControl(screen.getByRole("textbox", { name: "Search modifiers" }), {
            target: { value: "Debilitate" },
        });
        const pool = screen.getByRole("region", { name: "Modifier pool" });
        fireEvent.click(within(pool).getByRole("button", { name: "Require" }));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Debilitate");
        expect(screen.getByText("Emulator spending").parentElement!.textContent).toContain(
            "Potent Liquid Melancholy",
        );
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.mods[0]).toMatchObject({
            id: "CraftedJewelDebilitateOnHitWhileEmeraldSapphireSocketed",
            crafted: true,
        });
        expect(saved.target.groups[0].mods).toEqual([
            "CraftedJewelDebilitateOnHitWhileEmeraldSapphireSocketed",
        ]);
        fireEvent.click(button("Undo"));
        expect(card.textContent).not.toContain("Debilitate");
        expect(screen.queryByText("Emulator spending")).toBeNull();
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain("Debilitate");
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Debilitate");
    });
});

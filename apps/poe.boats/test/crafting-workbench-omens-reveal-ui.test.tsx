// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import type { CraftingItem } from "~/schemas/crafting";
import { craftingProjectSchema } from "~/schemas/crafting";
import { changeControl } from "./control-helpers";
import { baseId, catalog, engine, getCatalog } from "./crafting-fixtures";
import { button, CraftingWorker, mount } from "./crafting-workbench-ui-fixtures";

describe("crafting workbench", () => {
    it.each([
        false,
        true,
    ])("selects Abyss essence, replaces its Mark (fractured: %s), and retains the reveal floor through Echoes and saves", async (fractured) => {
        const data = getCatalog("poe2");
        const crafting = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, entry]) => entry.name === "Golden Hoop",
        )![0];
        const item = crafting.addStartingMod(
            crafting.createItem(base),
            "IncreasedLife1",
            seededRandom(1),
        );
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            method: { kind: "currency", id: "Metadata/Items/Currency/AbyssalBenchTicketJewellery" },
            target: { groups: [], unrevealedCount: { min: 1, max: 1 } },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 3,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ abyss: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "abyss" } });
        fireEvent.click(button("Load project"));
        const select = async (name: string) => {
            const picker = screen.getByRole("combobox", { name: "Crafting method" });
            changeControl(picker, { target: { value: name } });
            fireEvent.keyDown(picker, { key: "ArrowDown" });
            fireEvent.click(await screen.findByRole("option", { name }));
        };
        await select("Essence of the Abyss");
        expect(screen.getByRole("region", { name: "Abyssal Mark model" }).textContent).toContain(
            "not extracted",
        );
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Bears the Mark of the Abyssal Lord");
        if (fractured) fireEvent.click(within(card).getByRole("button", { name: "Fracture" }));
        const beforeBone = card.textContent;
        fireEvent.click(button("Save project"));
        const marked = JSON.parse(localStorage.getItem(key)!)["My crafting project"].item;
        expect(marked.mods[0].crafted).toBe(true);
        expect(marked.mods[0].fractured).toBe(fractured);
        await select("Preserved Collarbone");
        fireEvent.click(screen.getByRole("checkbox", { name: /^Omen of Sinistral Necromancy/ }));
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.item).toEqual(marked);
        expect(sent.target.unrevealedCount).toEqual({ min: 1, max: 1 });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).not.toContain("Bears the Mark");
        expect(within(card).queryByRole("button", { name: "Unfracture" })).toBeNull();
        const afterBone = card.textContent;
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(beforeBone);
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).not.toContain(
            "Preserved Collarbone1",
        );
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(afterBone);
        expect(screen.getByLabelText("Abyssal Mark reveal").textContent).toContain(
            "Minimum modifier level: 34",
        );
        expect(screen.getByRole("region", { name: "Reveal modifier" }).textContent).toContain(
            "80%, 15% or 5% probability",
        );
        fireEvent.click(button("Reveal with Omen of Abyssal Echoes"));
        fireEvent.click(button("Reroll reveal choices"));
        fireEvent.click(screen.getByText("Emulator spending"));
        const spending = screen.getByText("Emulator spending").closest("details")!;
        expect(spending.textContent).toContain("Essence of the Abyss1");
        expect(spending.textContent).toContain("Preserved Collarbone1");
        expect(spending.textContent).toContain("Omen of Abyssal Echoes1");
        expect(spending.textContent).not.toContain("Omen of Sinistral Necromancy");
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.reveal.mark).toBe(marked.mods[0].id);
        expect(saved.item.reveal.echoes.remaining).toBe(0);
        expect(crafting.mod(saved.item.reveal.choices[0]).domain).toBe("desecrated");
        expect(
            saved.item.reveal.choices.every((id: string) => crafting.mod(id).required_level >= 34),
        ).toBe(true);
        fireEvent.click(button("Undo"));
        expect(button("Reroll reveal choices").hasAttribute("disabled")).toBe(false);
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(button("Reroll reveal choices").hasAttribute("disabled")).toBe(true);
        expect(screen.getByLabelText("Abyssal Mark reveal").textContent).toContain(
            "Minimum modifier level: 34",
        );
        fireEvent.click(
            within(screen.getByRole("region", { name: "Reveal modifier" })).getByRole("button", {
                name: /^1\./,
            }),
        );
        expect(screen.queryByRole("region", { name: "Reveal modifier" })).toBeNull();
        expect(card.textContent).toContain("desecrated");
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.click(button("Undo"));
        expect(screen.getByLabelText("Abyssal Mark reveal")).toBeDefined();
        fireEvent.click(button("Redo"));
        expect(screen.queryByLabelText("Abyssal Mark reveal")).toBeNull();
    });

    it("switches away from an exhausted Putrefaction slot and preserves it through history and saves", () => {
        const data = getCatalog("poe2");
        const current = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, entry]) => entry.name === "Golden Plate",
        )![0];
        const bone = data.crafting.desecration.find((entry) =>
            entry.itemClasses.includes("Body Armour"),
        )!.id;
        const omen = "Metadata/Items/Currency/OmenOnAbyssVeilAllAndCorrupt";
        const random = {
            pick: <T,>(choices: { value: T; weight: number }[]) =>
                choices.find((entry) => entry.value === 6)?.value ?? choices[0]!.value,
            integer: (min: number) => min,
        };
        let item = current.apply(
            { ...current.createItem(base, 1), rarity: "rare" },
            { kind: "currency", id: bone, omens: [omen] },
            random,
        ).item;
        for (const preferred of [["IncreasedLife1"], ["AttackerTakesDamage1"]])
            item = current.apply(item, { kind: "reveal", preferred }, random).item;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            method: { kind: "reveal", preferred: [] },
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ exhausted: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "exhausted" },
        });
        fireEvent.click(button("Load project"));
        const panel = screen.getByRole("region", { name: "Reveal modifier" });
        expect(within(panel).getByRole("status").textContent).toContain(
            "No eligible reveal choices",
        );
        expect(within(panel).queryByRole("button", { name: "Reveal choices" })).toBeNull();
        fireEvent.click(within(panel).getByRole("button", { name: "Affix 4 · suffix" }));
        fireEvent.click(button("Reveal choices"));
        fireEvent.click(within(panel).getByRole("button", { name: /^1\./ }));
        expect(panel.textContent).toContain("3 unrevealed modifiers remain");
        expect(within(panel).getByRole("status").textContent).toContain(
            "No eligible reveal choices",
        );
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.reveal.index).toBe(2);
        expect(current.unrevealedCount(current.validateItem(saved.item))).toBe(3);
        fireEvent.click(button("Undo"));
        expect(panel.textContent).toContain("4 unrevealed modifiers remain");
        fireEvent.click(button("Redo"));
        expect(panel.textContent).toContain("3 unrevealed modifiers remain");
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(within(panel).getByRole("status").textContent).toContain(
            "No eligible reveal choices",
        );
    });

    it("applies Putrefaction, selects a reveal slot and preserves partial and completed states", () => {
        const data = getCatalog("poe2");
        const engine = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, entry]) => entry.name === "Golden Hoop",
        )![0];
        const bone = "Metadata/Items/Currency/AbyssalBenchTicketJewellery";
        const omen = "Metadata/Items/Currency/OmenOnAbyssVeilAllAndCorrupt";
        const echoes = "Metadata/Items/Currency/OmenOnAbyssRerollOptions";
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item: { ...engine.createItem(base), rarity: "rare" },
            method: { kind: "currency", id: bone },
            target: { groups: [] },
            steps: [],
            prices: { [bone]: 2, [omen]: 3, [echoes]: 1 },
            seed: 42,
            iterations: 1000,
            maxActions: 7,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ putrefaction: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "putrefaction" },
        });
        fireEvent.click(button("Load project"));
        fireEvent.click(screen.getByRole("checkbox", { name: /^Omen of Putrefaction/ }));
        expect(screen.getByRole("note", { name: "Putrefaction model" }).textContent).toContain(
            "not supplied by the client",
        );
        expect(
            screen
                .getByRole("checkbox", { name: /^Omen of Sinistral Necromancy/ })
                .getAttribute("aria-disabled"),
        ).toBe("true");
        fireEvent.click(screen.getByText("Item conditions"));
        changeControl(screen.getByRole("spinbutton", { name: "Maximum unrevealed modifiers" }), {
            target: { value: "0" },
        });
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method.omens).toEqual([omen]);
        expect(sent.target.unrevealedCount).toEqual({ min: 0, max: 0 });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Corrupted");
        let panel = screen.getByRole("region", { name: "Reveal modifier" });
        const count = within(
            screen.getByRole("group", { name: "Unrevealed affixes" }),
        ).getAllByRole("button").length;
        expect(count).toBeGreaterThanOrEqual(4);
        fireEvent.click(
            within(screen.getByRole("group", { name: "Unrevealed affixes" }))
                .getAllByRole("button")
                .at(-1)!,
        );
        fireEvent.click(button("Reveal with Omen of Abyssal Echoes"));
        fireEvent.click(button("Save project"));
        const partial = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(partial.item.reveal.index).toBe(count - 1);
        expect(partial.item.reveal.echoes).toEqual({ omen: echoes, remaining: 1 });
        fireEvent.click(button("Undo"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        fireEvent.click(button("Reroll reveal choices"));
        fireEvent.click(within(panel).getByRole("button", { name: /^1\./ }));
        expect(panel.textContent).toContain(`${count - 1} unrevealed modifiers remain`);
        for (let i = 1; i < count; i++) {
            panel = screen.getByRole("region", { name: "Reveal modifier" });
            fireEvent.click(button("Reveal choices"));
            fireEvent.click(within(panel).getByRole("button", { name: /^1\./ }));
        }
        expect(screen.queryByRole("region", { name: "Reveal modifier" })).toBeNull();
        expect(screen.queryByRole("alert")).toBeNull();
        const completed = card.textContent;
        fireEvent.click(button("Undo"));
        expect(screen.getByRole("region", { name: "Reveal modifier" }).textContent).toContain(
            "1 unrevealed",
        );
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(completed);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.putrefied).toBe(true);
        expect(saved.item.reveal).toBeUndefined();
        expect(
            craftingProjectSchema
                .parse(saved)
                .item.mods.every((entry) => engine.isDesecrated(entry)),
        ).toBe(true);
    });

    it("selects an ordinary reveal, retains its status through history and saves, and removes it with Light", async () => {
        const data = getCatalog("poe2");
        const poe2 = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, entry]) => entry.name === "Golden Hoop",
        )![0];
        const bone = data.crafting.currencies.find(
            (entry) => entry.action === "abyssal_bench_ticket_jewellery",
        )!;
        const item = poe2.apply(
            { ...poe2.createItem(base), rarity: "rare" },
            { kind: "currency", id: bone.id },
            seededRandom(1),
        ).item;
        const id = poe2
            .revealPool(item)
            .find((entry) => entry.mod.domain === poe2.base(item).domain)!.id;
        item.reveal!.choices = [id];
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            method: { kind: "reveal", preferred: [id] },
            target: { groups: [{ mods: [id] }] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ mixed: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "mixed" } });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("region", { name: "Reveal modifier" }).textContent).toContain(
            "80%, 15% or 5% probability",
        );
        fireEvent.click(button("Calculate odds"));
        expect(
            CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project.method.preferred,
        ).toEqual([id]);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(
            within(screen.getByRole("region", { name: "Reveal modifier" })).getByRole("button", {
                name: /^1\./,
            }),
        );
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain(" · desecrated");
        expect(within(card).queryByRole("button", { name: "Fracture" })).toBeNull();
        expect(screen.queryByRole("region", { name: "Reveal modifier" })).toBeNull();
        fireEvent.click(button("Undo"));
        expect(screen.getByRole("region", { name: "Reveal modifier" })).toBeDefined();
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain(" · desecrated");
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.mods[0]).toMatchObject({ id, desecrated: true, crafted: false });
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain(" · desecrated");
        const annul = data.crafting.currencies.find(
            (entry) => entry.action === "remove_random_mod",
        )!;
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: annul.name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: annul.name }));
        fireEvent.click(screen.getByRole("checkbox", { name: /^Omen of Light/ }));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain("No explicit modifiers");
        fireEvent.click(screen.getByText("Emulator spending"));
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Omen of Light1",
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain(" · desecrated");
    });

    it.each([
        "ReforgeMoreLikely",
        "ReforgeLessLikely",
    ])("selects %s with its extracted multiplier, costs and undo history", async (id) => {
        const recipe = catalog.crafting.harvest.find((entry) => entry.id === id)!;
        const method = { kind: "harvest" as const, id };
        const cost = engine.costs(method)[0]!;
        const item = engine.addStartingMod(
            engine.createItem(baseId),
            "IncreasedLife1",
            seededRandom(1),
        );
        item.quality = 20;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: { kind: "harvest", id: "ReforgeLife" },
            target: { groups: [{ mods: ["IncreasedLife1", "IncreasedLife2"] }] },
            steps: [],
            prices: { [cost.id]: 0.01 },
            seed: 3,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ affinity: project }));
        mount();
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "affinity" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: recipe.name } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: `Harvest · ${recipe.name}` }));
        expect(
            screen.getByRole("region", { name: "Harvest modifier weighting" }).textContent,
        ).toContain(`${recipe.affinityMultiplier}×`);
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method).toEqual(method);
        expect(sent.item.mods).toEqual(item.mods);
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).not.toBe(before);
        expect(card.textContent).toContain("Quality: +20%");
        fireEvent.click(screen.getByText("Emulator spending"));
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${cost.name}${cost.amount}`,
        );
        const after = card.textContent;
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.method).toEqual(method);
        expect(saved.item.mods.length).toBeGreaterThanOrEqual(4);
        expect(saved.item.quality).toBe(20);
        fireEvent.click(button("Undo"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
    });

    it("combines three Waystone omens, saves their result, and restores spending with undo", () => {
        const data = getCatalog("poe2");
        const crafting = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, value]) => value.name === "Waystone (Tier 15)",
        )![0];
        let item: CraftingItem = { ...crafting.createItem(base), rarity: "rare" };
        for (let index = 0; index < 6; index++)
            item = crafting.addStartingMod(item, crafting.pool(item)[0]!.id, seededRandom(index));
        const method = {
            kind: "currency",
            id: data.crafting.currencies.find((entry) => entry.action === "reroll")!.id,
        };
        const project = craftingProjectSchema.parse({
            format: 1,
            game: data.game,
            patch: data.patch,
            item,
            method,
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 10,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ waystone: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "waystone" } });
        fireEvent.click(button("Load project"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        const names = [
            "Omen of Chaotic Quantity",
            "Omen of Chaotic Monsters",
            "Omen of Chaotic Effectiveness",
        ];
        for (const name of names)
            fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(`^${name}`) }));
        expect(
            screen
                .getByRole("checkbox", { name: /^Omen of Chaotic Rarity/ })
                .getAttribute("aria-disabled"),
        ).toBe("true");
        expect(
            screen
                .getByRole("checkbox", { name: /^Omen of Whittling/ })
                .getAttribute("aria-disabled"),
        ).toBe("true");
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain("3/3 prefixes · 3/3 suffixes");
        const spending = screen.getByText("Emulator spending").parentElement!;
        for (const name of ["Chaos Orb", ...names])
            expect(within(spending).getByText(name)).toBeDefined();
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.method.omens).toHaveLength(3);
        expect(
            saved.item.mods.every((entry: { id: string }) =>
                crafting.mod(entry.id).implicit_tags.includes("map_item_rarity"),
            ),
        ).toBe(true);
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        expect(screen.queryByText("Emulator spending")).toBeNull();
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        for (const name of names)
            expect(
                screen
                    .getByRole("checkbox", { name: new RegExp(`^${name}`) })
                    .getAttribute("aria-checked"),
            ).toBe("true");
        expect(card.textContent).not.toBe(before);
        expect(card.textContent).toContain("3/3 prefixes · 3/3 suffixes");
    });

    it("replaces a full item's modifier with a lich omen and keeps its restriction through rerolls", () => {
        const data = getCatalog("poe2");
        const poe2 = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(([, base]) => base.item_class === "Ring")![0];
        const bone = data.crafting.currencies.find(
            (entry) => entry.action === "abyssal_bench_ticket_jewellery",
        )!;
        const omen = data.crafting.currencies.find((entry) =>
            entry.id.endsWith("/OmenOnAbyssGuarenteeLichTypeMod1"),
        )!;
        let item: CraftingItem = { ...poe2.createItem(base), rarity: "rare" };
        for (let i = 0; i < 6; i++)
            item = poe2.addStartingMod(item, poe2.pool(item)[0]!.id, seededRandom(i));
        const project = craftingProjectSchema.parse({
            format: 1,
            game: data.game,
            patch: data.patch,
            item,
            method: { kind: "currency", id: bone.id },
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 10,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ lich: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "lich" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(screen.getByRole("checkbox", { name: /^Omen of the Sovereign/ }));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const panel = screen.getByRole("region", { name: "Reveal modifier" });
        expect(panel.textContent).toContain("Applied during desecration: Omen of the Sovereign");
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain(
            "3/3 prefixes · 3/3 suffixes",
        );
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].item.reveal.omens,
        ).toEqual([omen.id]);
        fireEvent.click(button("Reveal with Omen of Abyssal Echoes"));
        fireEvent.click(button("Reroll reveal choices"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.reveal.omens).toEqual([omen.id]);
        expect(saved.item.reveal.choices.length).toBeGreaterThan(0);
        expect(saved.item.mods).toHaveLength(6);
        expect(
            saved.item.mods.filter((entry: { id: string }) =>
                item.mods.some((original) => original.id === entry.id),
            ),
        ).toHaveLength(5);
        expect(
            saved.item.reveal.choices.some((id: string) =>
                poe2.mod(id).implicit_tags.includes("ulaman_mod"),
            ),
        ).toBe(true);
        fireEvent.click(within(panel).getByRole("button", { name: /^1\./ }));
        expect(screen.queryByRole("region", { name: "Reveal modifier" })).toBeNull();
        fireEvent.click(button("Undo"));
        expect(screen.getByRole("region", { name: "Reveal modifier" }).textContent).toContain(
            "Applied during desecration: Omen of the Sovereign",
        );
    });

    it("reveals with Echoes, tracks spending, and preserves reroll state through undo and load", () => {
        const data = getCatalog("poe2");
        const poe2 = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, base]) => base.item_class === "Body Armour" && base.tags.includes("str_armour"),
        )![0];
        const bone = data.crafting.currencies.find(
            (entry) => entry.action === "abyssal_bench_ticket_armour",
        )!;
        const omen = data.crafting.currencies.find((entry) =>
            entry.id.endsWith("/OmenOnAbyssRerollOptions"),
        )!;
        const item = poe2.apply(
            { ...poe2.createItem(base), rarity: "rare" },
            { kind: "currency", id: bone.id },
            seededRandom(1),
        ).item;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: data.game,
            patch: data.patch,
            item,
            method: { kind: "reveal", preferred: [] },
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 10,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ echoes: project }));
        mount("emulate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "echoes" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(screen.getByRole("checkbox", { name: /^Omen of Abyssal Echoes/ }));
        fireEvent.click(screen.getByText("Custom prices in chaos"));
        changeControl(screen.getByRole("spinbutton", { name: omen.name }), {
            target: { value: "7" },
        });
        fireEvent.click(button(`Reveal with ${omen.name}`));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(button("Reroll reveal choices").hasAttribute("disabled")).toBe(false);
        fireEvent.click(screen.getByText("Emulator spending"));
        const spending = screen.getByText("Emulator spending").parentElement!;
        expect(within(spending).getByText(omen.name)).toBeDefined();
        expect(within(spending).getByText("1")).toBeDefined();
        fireEvent.click(button("Save project"));
        const initialSave = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(initialSave.item.reveal.echoes).toEqual({ omen: omen.id, remaining: 1 });
        expect(initialSave.method.omens).toEqual([omen.id]);
        expect(initialSave.prices[omen.id]).toBe(7);
        fireEvent.click(button("Reroll reveal choices"));
        expect(button("Reroll reveal choices").hasAttribute("disabled")).toBe(true);
        expect(within(spending).getByText("1")).toBeDefined();
        fireEvent.click(button("Undo"));
        expect(button("Reroll reveal choices").hasAttribute("disabled")).toBe(false);
        fireEvent.click(button("Redo"));
        expect(button("Reroll reveal choices").hasAttribute("disabled")).toBe(true);
        fireEvent.click(button("Save project"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(button("Reroll reveal choices").hasAttribute("disabled")).toBe(true);
        fireEvent.click(
            within(screen.getByRole("region", { name: "Reveal modifier" })).getByRole("button", {
                name: /^1\./,
            }),
        );
        expect(screen.queryByRole("region", { name: "Reveal modifier" })).toBeNull();
        expect(screen.queryByRole("alert")).toBeNull();
    });
});

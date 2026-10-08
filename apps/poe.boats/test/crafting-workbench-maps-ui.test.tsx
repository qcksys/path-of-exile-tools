// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import { craftingProjectSchema } from "~/schemas/crafting";
import { changeControl } from "./control-helpers";
import { catalog, currency, engine, getCatalog } from "./crafting-fixtures";
import { button, CraftingWorker, mount } from "./crafting-workbench-ui-fixtures";

describe("crafting workbench", () => {
    it("sets up a Blight-ravaged map, selects repeated oils and retains targets, costs and history", async () => {
        const map = catalog.crafting.maps.find(
            (entry) => catalog.bases[entry.id]?.name === "Beach Map",
        )!;
        const blight = catalog.crafting.anointing.maps.find((entry) => entry.ravaged)!;
        const recipe = catalog.crafting.anointing.recipes.find(
            (entry) => entry.type === "InfectedMap",
        )!;
        const oil = recipe.items[0]!;
        const stat = catalog.mods[recipe.mod!]!.stats.find((entry) =>
            entry.id.includes("pack_size"),
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: engine.createItem(map.id),
            method: { kind: "anoint", id: recipe.id },
            target: { groups: [], stats: [{ id: stat.id, scope: "all", min: stat.min * 3 }] },
            steps: [],
            prices: { [oil]: 2 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ blight: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "blight" } });
        fireEvent.click(button("Load project"));
        const choose = async (name: string, label: string) => {
            const picker = screen.getByRole("combobox", { name });
            changeControl(picker, { target: { value: label } });
            fireEvent.keyDown(picker, { key: "ArrowDown" });
            fireEvent.click(await screen.findByRole("option", { name: label }));
        };
        await choose("Blight map type", "Blight-ravaged map");
        await choose("Add map oil", engine.costName(oil));
        await choose("Add map oil", engine.costName(oil));
        expect(
            within(screen.getByRole("group", { name: "Map oil selection" })).getByText(
                (_, element) =>
                    element?.tagName === "SPAN" &&
                    element.textContent === `Oil 3: ${engine.costName(oil)}`,
            ),
        ).toBeDefined();
        fireEvent.click(button("Calculate odds"));
        expect(screen.queryByRole("alert")).toBeNull();
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.item.blight).toBe(blight.mod);
        expect(sent.method.additional).toEqual([recipe.id, recipe.id]);
        expect(sent.target.stats).toEqual(project.target.stats);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Can be Anointed up to 9 times");
        expect(card.textContent).toContain("Area level 85");
        expect(card.textContent).toContain("× 3");
        expect(screen.getByText("Emulator spending")).toBeDefined();
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.anointments).toEqual([recipe.id, recipe.id, recipe.id]);
        expect(saved.item.blight).toBe(blight.mod);
        expect(saved.method.additional).toEqual([recipe.id, recipe.id]);
        fireEvent.click(button("Undo"));
        expect(card.textContent).not.toContain("× 3");
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain("× 3");
        fireEvent.click(button("Remove oil 2"));
        expect(screen.queryByRole("button", { name: "Remove oil 3" })).toBeNull();
        await choose("Blight map type", "Ordinary map");
        expect(card.textContent).not.toContain("Can be Anointed");
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("× 3");
        expect(screen.getByRole("button", { name: "Remove oil 3" })).toBeDefined();
    });

    it("edits map quality types and requirements, applies chisels and preserves history and saved state", async () => {
        const rarity = catalog.crafting.mapQuality.find(
            (entry) => entry.description === "Quality (Rarity)",
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: engine.createItem("Metadata/Items/Maps/MapAtlasBeach", 86),
            method: currency("transmute_to_rare"),
            target: { groups: [] },
            steps: [],
            prices: { [rarity.id]: 3 },
            seed: 42,
            iterations: 1000,
            maxActions: 4,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ map: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "map" } });
        fireEvent.click(button("Load project"));
        const choose = async (name: string, value: string) => {
            const picker = screen.getByRole("combobox", { name });
            changeControl(picker, { target: { value } });
            fireEvent.keyDown(picker, { key: "ArrowDown" });
            fireEvent.click(await screen.findByRole("option", { name: value }));
        };
        await choose("Map quality type", "Quality (Rarity)");
        changeControl(screen.getByLabelText("Map quality (%)"), { target: { value: "18" } });
        await choose("Crafting method", "Maven's Chisel of Procurement");
        expect(screen.getByRole("region", { name: "Map quality model" }).textContent).toContain(
            "Adds 5%",
        );
        fireEvent.click(screen.getByText("Map quality requirement", { exact: true }));
        fireEvent.click(button("Add quality requirement"));
        await choose("Required map quality type", "Quality (Rarity)");
        changeControl(screen.getByLabelText("Maximum map quality (%)"), {
            target: { value: "20" },
        });
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.item).toMatchObject({ mapQuality: rarity.id, quality: 18 });
        expect(sent.target.quality).toEqual({ min: 20, max: 20, mapType: rarity.id });
        expect(sent.method).toEqual({ kind: "currency", id: rarity.id });
        expect(sent.prices[rarity.id]).toBe(3);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Quality (Rarity): +20%");
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("Quality (Rarity): +18%");
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toMatchObject({ mapQuality: rarity.id, quality: 20 });
        expect(saved.target).toEqual(sent.target);
        fireEvent.click(button("Undo"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Quality (Rarity): +20%");
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        fireEvent.click(button("Add crafting step"));
        expect(screen.getByRole("region", { name: "Crafting process" }).textContent).toContain(
            "20–20% Quality (Rarity)",
        );
    });

    it("sets up memory maps and retains Intention uses, conditions, costs, history and saves", async () => {
        const method = currency("enchant_map_zana_influence_drops");
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: engine.createItem("Metadata/Items/Maps/MapAtlasBeach", 86),
            method: currency("transmute_to_rare"),
            target: { groups: [] },
            steps: [],
            prices: { [catalog.crafting.memoryMaps!.currency]: 7 },
            seed: 42,
            iterations: 1000,
            maxActions: 3,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ map: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "map" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(screen.getByRole("checkbox", { name: "Memory Influenced Map" }));
        const uses = screen.getByLabelText("Existing Intention uses") as HTMLInputElement;
        expect(uses.max).toBe("3");
        changeControl(uses, { target: { value: "1" } });
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: "Orb of Intention" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Orb of Intention" }));
        expect(
            screen.getByRole("region", { name: "Orb of Intention model" }).textContent,
        ).toContain("not modeled");
        fireEvent.click(screen.getByText("Orb of Intention requirement", { exact: true }));
        fireEvent.click(button("Add Intention requirement"));
        expect((screen.getByLabelText("Minimum Intention uses") as HTMLInputElement).value).toBe(
            "3",
        );
        changeControl(screen.getByLabelText("Minimum Intention uses"), {
            target: { value: "2" },
        });
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method).toEqual(method);
        expect(sent.item.memoryMap).toEqual({ intentions: 1 });
        expect(sent.target.intentions).toEqual({ min: 2, max: 3 });
        expect(sent.prices[catalog.crafting.memoryMaps!.currency]).toBe(7);
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain("40% less Quantity");
        expect(card.textContent).toContain("+24 Memory Strands");
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("+12 Memory Strands");
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Apply craft"));
        expect(card.textContent).toContain("Orb of Intention uses: 3/3");
        fireEvent.click(button("Apply craft"));
        expect(screen.getByRole("alert").textContent).toContain("Intention limit");
        expect(card.textContent).toContain("Orb of Intention uses: 3/3");
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.memoryMap).toEqual({ intentions: 3 });
        expect(saved.target).toEqual(sent.target);
        fireEvent.click(button("Undo"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("+36 Memory Strands");
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        fireEvent.click(button("Add crafting step"));
        fireEvent.click(button("Use current requirements"));
        expect(screen.getByRole("region", { name: "Crafting process" }).textContent).toContain(
            "2–3 Intention uses",
        );
        fireEvent.click(screen.getByRole("checkbox", { name: "Memory Influenced Map" }));
        expect(screen.queryByLabelText("Existing Intention uses")).toBeNull();
        expect(card.textContent).not.toContain("Memory Strands");
    });

    it.each([
        { label: "Locus of Corruption", seed: 7, destroyed: false },
        { label: "Locus of Corruption", seed: 4, destroyed: true },
        { label: "Vaal Orb", seed: 1, destroyed: false },
    ])("preserves PoE 1 jewel $label results at seed $seed through dispatch, history and saves", async ({
        label,
        seed,
        destroyed,
    }) => {
        const locus = label === "Locus of Corruption";
        const method = locus
            ? { kind: "locus" as const, id: catalog.crafting.locus!.id }
            : {
                  kind: "currency" as const,
                  id: catalog.crafting.currencies.find((entry) => entry.action === "corrupt_item")!
                      .id,
              };
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: engine.createItem("Metadata/Items/Jewels/JewelInt", 86),
            method: currency("transmute_to_rare"),
            target: { groups: [], corrupted: true },
            steps: [],
            prices: { [method.id]: 7 },
            seed,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ jewel: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "jewel" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: label } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: label }));
        expect(screen.getByRole("region", { name: `${label} model` }).textContent).toContain(
            locus ? "destroyed outcomes still spend" : "unique-jewel",
        );
        fireEvent.click(button("Calculate odds"));
        expect(CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project).toMatchObject({
            method,
            target: project.target,
            prices: project.prices,
        });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain(destroyed ? "Destroyed" : "Corrupted");
        expect(card.textContent).not.toContain("Twice Corrupted");
        fireEvent.click(button("Undo"));
        expect(card.textContent).not.toContain("Corrupted");
        expect(card.textContent).not.toContain("Destroyed");
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(engine.apply(project.item, method, seededRandom(seed)).item);
        expect(saved.target).toEqual(project.target);
        expect(saved.method).toEqual(method);
        if (locus && !destroyed) expect(saved.item.implicits).toHaveLength(2);
        fireEvent.click(button("Undo"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain(destroyed ? "Destroyed" : "Corrupted");
    });

    it.each([
        false,
        true,
    ])("selects map corruption, edits tier and affix requirements, and preserves results (twice: %s)", async (twice) => {
        const recipe = catalog.crafting.beasts.find((entry) => entry.mapCorruption === "twice")!;
        const method = twice
            ? { kind: "beast" as const, id: recipe.id }
            : {
                  kind: "currency" as const,
                  id: catalog.crafting.currencies.find((entry) => entry.action === "corrupt_item")!
                      .id,
              };
        const label = twice ? `Beastcraft · ${recipe.category}: ${recipe.description}` : "Vaal Orb";
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: engine.createItem("Metadata/Items/Maps/MapAtlasBeach", 86),
            method: currency("transmute_to_rare"),
            target: { groups: [] },
            steps: [],
            prices: { [method.id]: 7 },
            seed: twice ? 7 : 1,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ map: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "map" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: twice ? "Corrupt a Map" : "Vaal Orb" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: label }));
        expect(screen.queryByLabelText("Beast level")).toBeNull();
        expect(
            screen.getByRole("region", { name: twice ? "Double map corruption" : "Vaal Orb model" })
                .textContent,
        ).toContain(twice ? "two different Vaal outcomes" : "eight explicit modifiers");
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Map tier 2 · Area level 69");
        fireEvent.click(screen.getByText("Map tier requirement", { exact: true }));
        fireEvent.click(button("Add tier requirement"));
        expect((screen.getByLabelText("Minimum Map tier") as HTMLInputElement).value).toBe("3");
        expect((screen.getByLabelText("Maximum Map tier") as HTMLInputElement).max).toBe("17");
        changeControl(screen.getByLabelText("Maximum Map tier"), { target: { value: "3" } });
        if (!twice) {
            fireEvent.click(button("Clear tier requirement"));
            fireEvent.click(screen.getByText("Item conditions", { exact: true }));
            expect((screen.getByLabelText("Maximum total affixes") as HTMLInputElement).max).toBe(
                "8",
            );
            for (const bound of ["Minimum", "Maximum"])
                changeControl(screen.getByLabelText(`${bound} total affixes`), {
                    target: { value: "8" },
                });
        }
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method).toEqual(method);
        expect(sent.target).toMatchObject(
            twice ? { mapTier: { min: 3, max: 3 } } : { affixCount: { min: 8, max: 8 } },
        );
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain(twice ? "Vaal Pyramid Map" : "4/3 prefixes");
        expect(card.textContent).toContain(
            twice ? "Map tier 3 · Area level 70" : "Map tier 2 · Area level 69",
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("Map tier 2 · Area level 69");
        expect(card.textContent).not.toContain("Corrupted");
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(
            engine.apply(project.item, method, seededRandom(project.seed)).item,
        );
        expect(saved.target).toEqual(sent.target);
        fireEvent.click(button("Undo"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Corrupted");
        if (twice) {
            fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
            fireEvent.click(button("Add crafting step"));
            fireEvent.click(button("Use current requirements"));
            expect(screen.getByRole("region", { name: "Crafting process" }).textContent).toContain(
                "Map tier 3–3",
            );
        }
    });

    it("selects the build-derived map corruption recipe and retains its result, requirements and cost", async () => {
        const recipe = catalog.crafting.beasts.find((entry) => entry.mapCorruption === "implicit")!;
        const method = { kind: "beast" as const, id: recipe.id };
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: engine.createItem("Metadata/Items/Maps/MapAtlasBeach", 86),
            method: currency("transmute_to_rare"),
            target: { groups: [{ mods: ["MapCorruptionItemRarity"] }], corrupted: true },
            steps: [],
            prices: { [recipe.id]: 7 },
            seed: 0,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ map: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "map" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: "Corrupt a Map" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(
            await screen.findByRole("option", {
                name: `Beastcraft · ${recipe.category}: ${recipe.description}`,
            }),
        );
        expect(screen.queryByLabelText("Beast level")).toBeNull();
        changeControl(screen.getByLabelText("Modifier source"), {
            target: { value: "corrupted" },
        });
        changeControl(screen.getByLabelText("Search modifiers"), {
            target: { value: "Item Rarity" },
        });
        expect(screen.getAllByText("+(8-12)% Item Rarity").length).toBeGreaterThan(0);
        expect(
            screen.getByRole("region", { name: "Map corruption beastcraft" }).textContent,
        ).toContain("Guarantees one corrupted implicit");
        fireEvent.click(button("Calculate odds"));
        expect(CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project).toMatchObject({
            method,
            target: project.target,
            prices: project.prices,
        });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("+8% Item Rarity");
        expect(card.textContent).toContain("Corrupted");
        fireEvent.click(button("Undo"));
        expect(card.textContent).not.toContain("+8% Item Rarity");
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual(engine.apply(project.item, method, seededRandom(0)).item);
        expect(saved.target).toEqual(project.target);
        fireEvent.click(button("Undo"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("+8% Item Rarity");
    });

    it("targets an extracted Waystone tier, updates area level and keeps tier changes through history and saves", () => {
        const data = getCatalog("poe2");
        const model = new CraftingEngine(data);
        const base = data.crafting.waystones.find((entry) => entry.tier === 15)!;
        const vaal = data.crafting.currencies.find((entry) =>
            entry.id.endsWith("/CurrencyCorrupt"),
        )!;
        const omen = data.crafting.currencies.find((entry) => entry.name === "Omen of Corruption")!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item: model.createItem(base.id),
            method: { kind: "currency", id: vaal.id, omens: [omen.id] },
            target: { groups: [] },
            steps: [],
            prices: { [vaal.id]: 2, [omen.id]: 3 },
            seed: 8,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ waystone: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "waystone" } });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("region", { name: "Vaal Orb model" }).textContent).toContain(
            "change tier by one",
        );
        fireEvent.click(screen.getByText("Waystone tier requirement", { exact: true }));
        fireEvent.click(button("Add tier requirement"));
        expect((screen.getByLabelText("Minimum Waystone tier") as HTMLInputElement).value).toBe(
            "16",
        );
        expect((screen.getByLabelText("Maximum Waystone tier") as HTMLInputElement).max).toBe("16");
        fireEvent.click(button("Calculate odds"));
        expect(
            CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project.target.waystoneTier,
        ).toEqual({ min: 16, max: 16 });
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Waystone (Tier 16)");
        expect(card.textContent).toContain("Area level 80");
        expect(card.textContent).toContain("Corrupted");
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("Waystone (Tier 15)");
        expect(card.textContent).toContain("Area level 79");
        fireEvent.click(button("Redo"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(model.waystone(saved.item)?.tier).toBe(16);
        expect(saved.target.waystoneTier).toEqual({ min: 16, max: 16 });
        fireEvent.click(button("Undo"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Waystone (Tier 16)");
        fireEvent.click(button("Clear tier requirement"));
        expect(screen.queryByLabelText("Minimum Waystone tier")).toBeNull();
        fireEvent.click(button("Add tier requirement"));
        fireEvent.click(screen.getByRole("checkbox", { name: "Combine crafting steps" }));
        fireEvent.click(button("Add crafting step"));
        fireEvent.click(button("Use current requirements"));
        expect(screen.getByRole("region", { name: "Crafting process" }).textContent).toContain(
            "Waystone tier 16–16",
        );
    });

    it("accepts eight-affix Waystone requirements and persists all corrupted modifiers", () => {
        const data = getCatalog("poe2");
        const model = new CraftingEngine(data);
        let item = {
            ...model.createItem(data.crafting.waystones.find((entry) => entry.tier === 15)!.id),
            rarity: "rare" as const,
        };
        for (let index = 0; index < 6; index++)
            item = {
                ...model.addStartingMod(item, model.pool(item)[0]!.id, seededRandom(index)),
                rarity: "rare",
            };
        const vaal = data.crafting.currencies.find((entry) =>
            entry.id.endsWith("/CurrencyCorrupt"),
        )!;
        const random = seededRandom(42);
        vi.spyOn(random, "pick")
            .mockImplementationOnce(
                (choices) => choices.find((entry) => entry.value === "extra")!.value,
            )
            .mockImplementationOnce((choices) => choices.find((entry) => entry.value === 4)!.value);
        const corrupted = model.apply(item, { kind: "currency", id: vaal.id }, random).item;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item: corrupted,
            method: { kind: "currency", id: vaal.id },
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ eight: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "eight" } });
        fireEvent.click(button("Load project"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain(
            "4/3 prefixes",
        );
        fireEvent.click(screen.getByText("Item conditions", { exact: true }));
        changeControl(screen.getByLabelText("Minimum total affixes"), {
            target: { value: "8" },
        });
        changeControl(screen.getByLabelText("Maximum total affixes"), {
            target: { value: "8" },
        });
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.mods).toHaveLength(8);
        expect(saved.target.affixCount).toEqual({ min: 8, max: 8 });
        fireEvent.click(button("Calculate odds"));
        expect(
            CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project.item.mods,
        ).toHaveLength(8);
    });

    it("shows fixed Astrolabe influences, accepts all six targets and preserves them through history and save/load", () => {
        const item = engine.addStartingMod(
            engine.createItem("Metadata/Items/Amulets/AmuletE1"),
            "IncreasedLife1",
            seededRandom(1),
        );
        const method = currency("reroll_mod_values");
        const cost = engine.costs(method)[0]!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method,
            target: { groups: [] },
            steps: [],
            prices: { [cost.id]: 2 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ astrolabe: project }));
        mount();
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "astrolabe" },
        });
        fireEvent.click(button("Load project"));
        fireEvent.click(screen.getByText("Influences"));
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain(
            "Shaper · Elder · Crusader · Redeemer · Hunter · Warlord influence (fixed by implicit)",
        );
        expect(within(card).queryByRole("button", { name: "Fracture" })).toBeNull();
        fireEvent.click(screen.getByText("Item conditions"));
        for (const name of ["Shaper", "Elder", "Crusader", "Redeemer", "Hunter", "Warlord"]) {
            const influence = screen.getByRole("checkbox", { name: new RegExp(`^${name}$`) });
            expect(influence.getAttribute("aria-checked")).toBe(String(true));
            expect(influence.getAttribute("aria-disabled")).toBe("true");
            fireEvent.click(screen.getByRole("checkbox", { name: `Require ${name}` }));
        }
        fireEvent.click(button("Calculate odds"));
        expect(screen.queryByRole("alert")).toBeNull();
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.target.influences).toEqual([0, 1, 2, 3, 4, 5]);
        expect(sent.item.influences).toEqual([]);
        fireEvent.click(button("Stop simulation"));
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const after = card.textContent;
        expect(after).toContain("(fixed by implicit)");
        fireEvent.click(screen.getByText("Emulator spending"));
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${cost.name}1`,
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.influences).toEqual([]);
        expect(saved.target.influences).toEqual([0, 1, 2, 3, 4, 5]);
        fireEvent.click(button("Undo"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Clear item conditions"));
        expect(
            screen.getByRole("checkbox", { name: "Require Warlord" }).getAttribute("aria-checked"),
        ).toBe(String(false));
    });
});

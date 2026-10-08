// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import { CraftingSimulation } from "~/lib/crafting-simulation";
import { craftingProjectSchema } from "~/schemas/crafting";
import { changeControl } from "./control-helpers";
import { baseId, catalog, currency, engine, getCatalog } from "./crafting-fixtures";
import { button, CraftingWorker, mount } from "./crafting-workbench-ui-fixtures";

describe("crafting workbench", () => {
    it.each([
        "bench",
        "beast",
    ] as const)("links sockets through the %s with targets, spending, history and persistence", async (kind) => {
        const recipe = catalog.crafting.bench.find((entry) => entry.linkCount === 6)!;
        const linkingBeast = catalog.crafting.beasts.find((entry) => entry.maximumLinks)!;
        const method = { kind, id: kind === "bench" ? recipe.id : linkingBeast.id };
        const priceId = kind === "bench" ? recipe.cost[0]!.id : linkingBeast.id;
        const vaal = catalog.crafting.currencies.find(
            (entry) => entry.action === "corrupt_item",
        )!.id;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: {
                ...engine.createItem(baseId),
                sockets: 6,
                memoryStrands: 82,
                quality: 20,
                corrupted: kind === "bench",
            },
            method: currency("transmute_to_magic"),
            target: { groups: [] },
            steps: [],
            prices: { [priceId]: 0.5, [vaal]: 1 },
            seed: 42,
            iterations: 10,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ linking: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "linking" } });
        fireEvent.click(button("Load project"));
        const connection = screen.getByRole("combobox", { name: "Socket 1 to 2" });
        changeControl(connection, { target: { value: "Linked" } });
        fireEvent.keyDown(connection, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Linked" }));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: engine.methodName(method) } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(
            await screen.findByRole("option", {
                name: `${kind === "bench" ? "Bench" : "Beastcraft"} · ${engine.methodName(method)}`,
            }),
        );
        expect(screen.getByRole("note", { name: "Socket linking model" }).textContent).toContain(
            kind === "bench" ? "Remaining links are unknown" : "Links all current",
        );
        fireEvent.click(screen.getByText("Linked socket requirement"));
        fireEvent.click(button("Add linked socket requirement"));
        changeControl(screen.getByRole("spinbutton", { name: "Minimum linked sockets" }), {
            target: { value: "6" },
        });
        fireEvent.click(button("Calculate odds"));
        const request = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0];
        expect(request.project.item.socketLinks).toEqual([true, null, null, null, null]);
        expect(request.project.target.linkedSockets).toEqual({ min: 6, max: 6 });
        expect(request.project.method).toEqual(method);
        const sampled = new CraftingSimulation(catalog, request.project);
        sampled.runTrial();
        expect(sampled.result()).toMatchObject({
            probability: 1,
            meanCost: kind === "bench" ? 2250 : 0.5,
        });
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain("Largest linked group: 6 sockets");
        expect(card.textContent).toContain("Memory Strands: 82");
        const after = card.textContent;
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            engine.costName(priceId),
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.socketLinks).toEqual([true, true, true, true, true]);
        expect(saved.target.linkedSockets).toEqual({ min: 6, max: 6 });
        expect(saved.method).toEqual(method);
        fireEvent.click(button("Undo"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
        changeControl(screen.getByRole("spinbutton", { name: "Gem sockets" }), {
            target: { value: "4" },
        });
        expect(card.textContent).toContain("Largest linked group: 1–4 sockets");
    });

    it("converts an occupied glove socket, targets the Jewel socket and retains it through history and saves", async () => {
        const data = getCatalog("poe2");
        const current = new CraftingEngine(data);
        const rune = "Metadata/Items/SoulCores/RuneFire";
        const conversion = data.crafting.augments.find(
            (entry) => entry.name === "Cadigan's Epiphany",
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item: {
                ...current.createItem("Metadata/Items/Armours/Gloves/FourGlovesStr1"),
                sockets: 1,
                augments: [rune],
            },
            method: { kind: "augment", id: rune },
            target: { groups: [] },
            steps: [],
            prices: { [conversion.id]: 7 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ conversion: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "conversion" },
        });
        fireEvent.click(button("Load project"));
        const choose = async (name: string, query: string, label: string) => {
            const picker = screen.getByRole("combobox", { name });
            changeControl(picker, { target: { value: query } });
            fireEvent.keyDown(picker, { key: "ArrowDown" });
            fireEvent.click(await screen.findByRole("option", { name: label }));
        };
        await choose("Crafting method", "Cadigan", "Socket · Cadigan's Epiphany");
        expect(screen.getByRole("note", { name: "Jewel socket conversion" }).textContent).toContain(
            "socket-bound",
        );
        await choose("Augment destination", "Replace socket 1", "Replace socket 1 · Desert Rune");
        const requirement = within(screen.getByRole("group", { name: "Jewel socket requirement" }));
        fireEvent.click(requirement.getByRole("button", { name: "Present" }));
        fireEvent.click(button("Calculate odds"));
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method).toEqual({ kind: "augment", id: conversion.id, replace: 0 });
        expect(sent.target.jewelSocket).toBe(true);
        expect(sent.prices[conversion.id]).toBe(7);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Jewel sockets: 1 · Cadigan's Epiphany");
        expect(card.textContent).toContain("Augment sockets: 0");
        expect(card.textContent).not.toContain("Desert Rune");
        expect(screen.queryByRole("spinbutton", { name: "Augment sockets" })).toBeNull();
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Cadigan's Epiphany1",
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("Desert Rune");
        expect(card.textContent).not.toContain("Jewel sockets");
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain("Jewel sockets: 1");
        changeControl(screen.getByLabelText("Project name"), {
            target: { value: "Jewel socket" },
        });
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["Jewel socket"];
        expect(saved.item).toEqual({
            ...project.item,
            sockets: 0,
            augments: [],
            jewelSocket: conversion.id,
        });
        expect(saved.target.jewelSocket).toBe(true);
        expect(current.validateItem(saved.item)).toEqual(saved.item);
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "Jewel socket" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Jewel sockets: 1");
        fireEvent.click(button("Apply craft"));
        expect(screen.getByRole("alert").textContent).toContain("converted Jewel socket");
        expect(card.textContent).toContain("Jewel sockets: 1");
    });

    it("sockets an inventory Jewel, targets its presence and preserves independent contents through saves and history", async () => {
        const data = getCatalog("poe2");
        const current = new CraftingEngine(data);
        const conversion = data.crafting.augments.find(
            (entry) => entry.name === "Cadigan's Epiphany",
        )!;
        const host = current.apply(
            { ...current.createItem("Metadata/Items/Armours/Gloves/FourGlovesStr1"), sockets: 1 },
            { kind: "augment", id: conversion.id },
            seededRandom(42),
        ).item;
        const jewelBase = Object.entries(data.bases).find(([, base]) => base.name === "Ruby")![0];
        const blank = { ...current.createItem(jewelBase), rarity: "rare" as const };
        const jewel = current.addStartingMod(blank, current.pool(blank)[0]!.id, seededRandom(42));
        const entry = { id: "ruby", name: "Crafted Ruby", item: jewel, tab: "Jewels" };
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item: host,
            method: { kind: "remove_jewel", id: "remove_jewel" },
            target: { groups: [] },
            inventory: [entry],
            inventoryTabs: ["Jewels"],
            steps: [],
            prices: {},
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe2:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ jewel: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "jewel" } });
        fireEvent.click(button("Load project"));
        const choose = async (name: string, label: string) => {
            const picker = screen.getByRole("combobox", { name });
            changeControl(picker, { target: { value: label } });
            fireEvent.keyDown(picker, { key: "ArrowDown" });
            fireEvent.click(await screen.findByRole("option", { name: label }));
        };
        await choose("Crafting method", "Socket inventory Jewel");
        await choose("Jewel from inventory", entry.name);
        fireEvent.click(
            within(screen.getByRole("group", { name: "Socketed Jewel requirement" })).getByRole(
                "button",
                { name: "Present" },
            ),
        );
        fireEvent.click(button("Calculate odds"));
        expect(screen.queryByRole("alert")).toBeNull();
        const sent = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0].project;
        expect(sent.method).toEqual({ kind: "socket_jewel", id: "socket_jewel", jewel: entry });
        expect(sent.target.socketedJewel).toBe(true);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByRole("region", { name: "Socketed Jewel" }).textContent).toContain(
            "Ruby",
        );
        fireEvent.click(screen.getByText("Item inventory (1)"));
        changeControl(screen.getByLabelText("Inventory tab"), { target: { value: "Jewels" } });
        fireEvent.click(button("Store socketed Jewel"));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item).toEqual({ ...host, socketedJewel: jewel });
        expect(saved.inventory).toHaveLength(2);
        expect(saved.inventory[0]).toEqual(entry);
        expect(saved.inventory[1].item).toEqual(jewel);
        expect(saved.inventory[1].tab).toBe("Jewels");
        expect(saved.target.socketedJewel).toBe(true);
        expect(current.validateItem(saved.item)).toEqual(saved.item);
        fireEvent.click(button("Undo"));
        expect(screen.queryByRole("region", { name: "Socketed Jewel" })).toBeNull();
        fireEvent.click(button("Redo"));
        expect(screen.getByRole("region", { name: "Socketed Jewel" })).toBeDefined();
        await choose("Crafting method", "Remove socketed Jewel");
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("region", { name: "Socketed Jewel" })).toBeNull();
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain(
            "Jewel sockets: 1",
        );
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("region", { name: "Socketed Jewel" }).textContent).toContain(
            "Ruby",
        );
        fireEvent.click(button("Load Ruby"));
        expect(screen.queryByRole("region", { name: "Socketed Jewel" })).toBeNull();
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain("Ruby");
    });

    it("selects Tainted Jeweller's Orbs and retains socket targets, spending and history", async () => {
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: { ...engine.createItem(baseId), corrupted: true, sockets: 5 },
            method: currency("reroll_socket_numbers_hellscape"),
            target: { groups: [], sockets: { min: 6, max: 6 } },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ sockets: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "sockets" } });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: "Tainted Jeweller" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Tainted Jeweller's Orb" }));
        expect(screen.getByRole("note", { name: "Tainted Jeweller model" }).textContent).toContain(
            "maximum of 6",
        );
        fireEvent.click(button("Calculate odds"));
        const request = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0];
        expect(request.project.target.sockets).toEqual({ min: 6, max: 6 });
        expect(request.project.method).toEqual(project.method);
        fireEvent.click(button("Stop simulation"));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Gem sockets: 4");
        expect(card.textContent).toContain("Corrupted");
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Tainted Jeweller's Orb1",
        );
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("Gem sockets: 5");
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain("Gem sockets: 4");
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item.sockets).toBe(4);
        changeControl(screen.getByRole("spinbutton", { name: "Gem sockets" }), {
            target: { value: "6" },
        });
        fireEvent.click(button("Apply craft"));
        expect(screen.getByRole("alert").textContent).toContain("maximum sockets");
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toContain("Gem sockets: 4");
    });

    it.each([
        false,
        true,
    ])("selects socket-count bench recipes with corruption=%s and retains targets, spending, history and saves", async (corrupted) => {
        const recipe = catalog.crafting.bench.find((entry) => entry.socketCount === 6)!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: { ...engine.createItem(baseId, 1), corrupted },
            method: { kind: "bench", id: recipe.id },
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ sockets: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "sockets" } });
        fireEvent.click(button("Load project"));
        const count = screen.getByRole("spinbutton", { name: "Gem sockets" }) as HTMLInputElement;
        fireEvent.click(screen.getByText("Custom prices in chaos"));
        expect(screen.getByRole("spinbutton", { name: "Vaal Orb" })).toBeDefined();
        expect(count.max).toBe("6");
        changeControl(count, { target: { value: "2" } });
        fireEvent.click(screen.getByText("Socket requirement"));
        fireEvent.click(button("Add socket requirement"));
        changeControl(screen.getByRole("spinbutton", { name: "Minimum gem sockets" }), {
            target: { value: "6" },
        });
        fireEvent.click(button("Calculate odds"));
        expect(screen.queryByRole("alert")).toBeNull();
        const request = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0];
        expect(request.project.item.sockets).toBe(2);
        expect(request.project.target.sockets).toEqual({ min: 6, max: 6 });
        fireEvent.click(button("Stop simulation"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: "Six Sockets" } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Bench · Six Sockets" }));
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain("Gem sockets: 6");
        expect(count.value).toBe("6");
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            "Jeweller's Orb350",
        );
        const spending = screen.getByText("Emulator spending").closest("details")!.textContent;
        if (corrupted) expect(spending).toContain("Vaal Orb350");
        else expect(spending).not.toContain("Vaal Orb350");
        fireEvent.click(button("Undo"));
        expect(count.value).toBe("2");
        fireEvent.click(button("Redo"));
        expect(count.value).toBe("6");
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.item.sockets).toBe(6);
        expect(saved.item.corrupted).toBe(corrupted);
        expect(saved.target.sockets).toEqual({ min: 6, max: 6 });
        changeControl(count, { target: { value: "0" } });
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(count.value).toBe("6");
    });

    it("selects the maximum-socket beastcraft and retains calculation, costs, history and saves", async () => {
        const recipe = catalog.crafting.beasts.find((entry) => entry.maximumSockets)!;
        const method = { kind: "beast" as const, id: recipe.id };
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: { ...engine.createItem(baseId, 1), sockets: 2, memoryStrands: 82, quality: 20 },
            method: currency("transmute_to_magic"),
            target: { groups: [] },
            steps: [],
            prices: { [recipe.id]: 4 },
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:poe1:${catalog.patch}`;
        localStorage.setItem(key, JSON.stringify({ beastSockets: project }));
        mount("calculate");
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "beastSockets" },
        });
        fireEvent.click(button("Load project"));
        const picker = screen.getByRole("combobox", { name: "Crafting method" });
        changeControl(picker, { target: { value: recipe.description } });
        fireEvent.keyDown(picker, { key: "ArrowDown" });
        fireEvent.click(
            await screen.findByRole("option", {
                name: `Beastcraft · ${engine.methodName(method)}`,
            }),
        );
        expect(screen.getByLabelText("Socket beastcraft model").textContent).toContain(
            "full capacity",
        );
        expect(screen.queryByRole("spinbutton", { name: "Beast level" })).toBeNull();
        fireEvent.click(screen.getByText("Socket requirement"));
        fireEvent.click(button("Add socket requirement"));
        changeControl(screen.getByRole("spinbutton", { name: "Minimum gem sockets" }), {
            target: { value: "6" },
        });
        fireEvent.click(button("Calculate odds"));
        expect(screen.queryByRole("alert")).toBeNull();
        const request = CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0];
        expect(request.project.method).toEqual(method);
        expect(request.project.target.sockets).toEqual({ min: 6, max: 6 });
        expect(request.project.prices[recipe.id]).toBe(4);
        fireEvent.click(button("Stop simulation"));
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.click(button("Apply craft"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).toContain("Gem sockets: 6");
        expect(card.textContent).toContain("Memory Strands: 82");
        const after = card.textContent;
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
            `${engine.methodName(method)}1`,
        );
        fireEvent.click(button("Apply craft"));
        expect(screen.getByRole("alert").textContent).toContain("already has the maximum");
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        fireEvent.click(button("Redo"));
        expect(card.textContent).toBe(after);
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved.method).toEqual(method);
        expect(saved.item).toEqual({ ...project.item, sockets: 6 });
        expect(saved.target.sockets).toEqual({ min: 6, max: 6 });
        fireEvent.click(button("Undo"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(card.textContent).toBe(after);
    });
});

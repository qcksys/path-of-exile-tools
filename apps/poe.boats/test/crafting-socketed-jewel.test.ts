import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { augmentCreatesJewelSocket } from "../app/lib/crafting-augments";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    hasCraftingRequirements,
    validateProject,
} from "../app/lib/crafting-simulation";
import {
    type CraftingItem,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";
import { engine as poe1, baseId as poe1Base } from "./crafting-fixtures";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const source = catalog.crafting.augments.find(augmentCreatesJewelSocket)!;
const conversion = { kind: "augment" as const, id: source.id };
const gloves = "Metadata/Items/Armours/Gloves/FourGlovesStr1";
const jewelBases = Object.entries(catalog.bases).filter(
    ([, base]) => base.item_class === "Jewel" && base.rarities.includes("rare"),
);
const blank = () => ({ ...engine.createItem(gloves), sockets: 1 });
const converted = () => engine.apply(blank(), conversion, seededRandom(42)).item;
const jewel = () => {
    const item = { ...engine.createItem(jewelBases[0]![0]), rarity: "rare" as const };
    return engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(42));
};
const socket = (item = jewel()) => ({
    kind: "socket_jewel" as const,
    id: "socket_jewel" as const,
    jewel: { id: "jewel", name: "Crafted Jewel", item },
});
const remove = { kind: "remove_jewel" as const, id: "remove_jewel" as const };
const currency = (action: string) => ({
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
});

describe("Jewels in converted equipment sockets", () => {
    it("accepts the extracted Jewel bases and preserves their independent item state", () => {
        expect(jewelBases.length).toBeGreaterThan(4);
        const host = converted();
        for (const [baseId] of jewelBases) {
            const child = { ...engine.createItem(baseId), corrupted: true, mirrored: true };
            const result = engine.apply(host, socket(child), seededRandom(1));
            expect(result.item.socketedJewel).toEqual(engine.validateItem(child));
            expect(result.cost).toEqual([]);
            expect(engine.apply(result.item, remove, seededRandom(1))).toEqual({
                item: host,
                cost: [],
            });
        }
    });

    it.each([
        "ordinary",
        "corrupted",
        "mirrored",
        "sanctified",
    ])("allows free socketing and removal on %s equipment without changing rolls or input snapshots", (state) => {
        const host: CraftingItem = { ...converted(), rarity: "rare" };
        if (state === "corrupted") host.corrupted = true;
        if (state === "mirrored") host.mirrored = true;
        if (state === "sanctified") host.sanctified = true;
        const child = jewel();
        child.mods[0]!.fractured = true;
        const method = socket(child);
        const original = structuredClone({ host, method });
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        const integer = vi.spyOn(random, "integer");
        const result = engine.apply(host, method, random);
        expect(result.item).toEqual({ ...host, socketedJewel: child });
        expect(result.item.socketedJewel).not.toBe(child);
        expect(engine.statTotals(result.item)).toEqual(engine.statTotals(host));
        expect(
            engine.matches(
                result.item,
                engine.validateTarget({ groups: [{ mods: [child.mods[0]!.id] }] }),
            ),
        ).toBe(false);
        expect(engine.apply(result.item, remove, random)).toEqual({ item: host, cost: [] });
        expect({ host, method }).toEqual(original);
        expect(pick).not.toHaveBeenCalled();
        expect(integer).not.toHaveBeenCalled();
    });

    it("rejects invalid operations before consuming randomness or changing either item", () => {
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        const integer = vi.spyOn(random, "integer");
        const host = converted();
        const method = socket();
        const filled = engine.apply(host, method, random).item;
        expect(() => engine.apply(blank(), method, random)).toThrow("no converted Jewel socket");
        expect(() =>
            engine.apply(host, { kind: "socket_jewel", id: "socket_jewel" }, random),
        ).toThrow("Choose a Jewel");
        expect(() => engine.apply(filled, method, random)).toThrow(
            "Remove the socketed Jewel first",
        );
        expect(() => engine.apply(host, remove, random)).toThrow("already empty");
        expect(() =>
            engine.apply(
                { ...filled, corrupted: true, twiceCorrupted: true, destroyed: true },
                remove,
                random,
            ),
        ).toThrow("Destroyed items");
        expect(() => engine.apply(host, socket(blank()), random)).toThrow("intact PoE 2 Jewel");
        expect(() =>
            engine.apply(
                host,
                socket({ ...jewel(), corrupted: true, twiceCorrupted: true, destroyed: true }),
                random,
            ),
        ).toThrow("intact PoE 2 Jewel");
        expect(() => engine.validateItem({ ...blank(), socketedJewel: jewel() })).toThrow(
            "converted Jewel socket",
        );
        expect(() =>
            engine.validateItem({ ...host, socketedJewel: { ...jewel(), socketedJewel: jewel() } }),
        ).toThrow();
        expect(() =>
            engine.validateItem({ ...host, socketedJewel: { ...jewel(), imprint: jewel() } }),
        ).toThrow();
        expect(() => poe1.apply(poe1.createItem(poe1Base), remove, random)).toThrow("PoE 2");
        expect(() => poe1.validateTarget({ groups: [], socketedJewel: false })).toThrow("PoE 2");
        expect(pick).not.toHaveBeenCalled();
        expect(integer).not.toHaveBeenCalled();
    });

    it("preserves the Jewel through equipment rerolls and corruption without adding its modifiers to the host", () => {
        const child = jewel();
        let host = engine.apply(converted(), socket(child), seededRandom(42)).item;
        host = engine.apply(host, currency("transmute_to_rare"), seededRandom(42)).item;
        expect(host.socketedJewel).toEqual(child);
        expect(host.mods.length).toBeGreaterThan(3);
        expect(engine.validateItem(host)).toEqual(host);
        const random = seededRandom(1);
        vi.spyOn(random, "pick").mockImplementation((choices) => {
            const socketOutcome = choices.find((entry) => entry.value === "socket");
            if (!socketOutcome) throw new Error("Expected the Vaal socket outcome.");
            return socketOutcome.value;
        });
        const corrupted = engine.apply(host, currency("corrupt_item"), random).item;
        expect(corrupted).toEqual({ ...host, corrupted: true });
        expect(corrupted.socketedJewel!.corrupted).toBe(false);
    });

    it("round-trips separate host and Jewel rolls, flags and text with validation at both levels", () => {
        const child = { ...jewel(), corrupted: true };
        child.mods[0]!.fractured = true;
        const item = engine.apply(converted(), socket(child), seededRandom(42)).item;
        const text = exportCraftingItemText(engine, item);
        expect(text).toContain("Socketed Jewel:\n");
        expect(importCraftingItemText(engine, text).map((entry) => entry.item)).toContainEqual(
            item,
        );
        expect(
            importCraftingItemText(engine, text.replaceAll("\n", "\r\n")).map(
                (entry) => entry.item,
            ),
        ).toContainEqual(item);
        expect(engine.validateItem(JSON.parse(JSON.stringify(item)))).toEqual(item);
        const childText = exportCraftingItemText(engine, child);
        expect(() =>
            importCraftingItemText(engine, `${text}\nSocketed Jewel:\n${childText}`),
        ).toThrow("Only one");
        expect(() =>
            importCraftingItemText(
                engine,
                `${exportCraftingItemText(engine, blank())}\nSocketed Jewel:\n${childText}`,
            ),
        ).toThrow("converted Jewel socket");
        expect(() =>
            importCraftingItemText(
                engine,
                `${exportCraftingItemText(engine, converted())}\nSocketed Jewel:\n${exportCraftingItemText(engine, blank())}`,
            ),
        ).toThrow("intact PoE 2 Jewel");
        expect(() =>
            importCraftingItemText(
                engine,
                `${exportCraftingItemText(engine, converted())}\nSocketed Jewel:\n`,
            ),
        ).toThrow("normal, magic or rare item");
    });

    it("calculates and simulates conversion, socketing and removal with only the conversion cost", () => {
        const method = socket();
        const present = engine.validateTarget({ groups: [], socketedJewel: true });
        const absent = engine.validateTarget({ groups: [], socketedJewel: false });
        expect(hasCraftingRequirements(present)).toBe(true);
        expect(hasCraftingRequirements(absent)).toBe(true);
        expect(calculateExact(engine, converted(), method, present).probability).toBe(1);
        expect(calculateExact(engine, converted(), method, absent).probability).toBe(0);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item: blank(),
            method,
            target: { groups: [], jewelSocket: true, socketedJewel: false },
            inventory: [method.jewel],
            steps: [
                {
                    id: "convert",
                    method: conversion,
                    condition: { groups: [], jewelSocket: true },
                    onSuccess: "insert",
                    onFailure: "failure",
                },
                {
                    id: "insert",
                    method,
                    condition: present,
                    onSuccess: "remove",
                    onFailure: "failure",
                },
                {
                    id: "remove",
                    method: remove,
                    condition: absent,
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
            useProcess: true,
            prices: { [source.id]: 7 },
            seed: 42,
            iterations: 100,
            maxActions: 3,
        });
        expect(validateProject(catalog, JSON.parse(JSON.stringify(project)))).toEqual(project);
        expect(calculateProcessExact(engine, project)).toMatchObject({
            probability: 1,
            meanCost: 7,
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let index = 0; index < 25; index++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            successes: 25,
            totalActions: 75,
            meanCost: 7,
            errors: {},
            spending: { [source.id]: 25 },
        });
        expect(project.inventory).toEqual([method.jewel]);
    });
});

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import {
    augmentCreatesJewelSocket,
    augmentRule,
    availableAugments,
} from "../app/lib/crafting-augments";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    hasCraftingRequirements,
} from "../app/lib/crafting-simulation";
import { retainedSocketLimit, socketLimit } from "../app/lib/crafting-sockets";
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
const method = { kind: "augment" as const, id: source.id };
const gloves = "Metadata/Items/Armours/Gloves/FourGlovesStr1";
const fireRune = "Metadata/Items/SoulCores/RuneFire";
const currency = (action: string) => ({
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
});
const blank = (): CraftingItem => ({ ...engine.createItem(gloves, 1), sockets: 1 });
const convert = (item = blank(), replace?: number) =>
    engine.apply(item, { ...method, replace }, seededRandom(42));

describe("Cadigan's Epiphany Jewel socket conversion", () => {
    it("derives its identity and eligible bases from the extracted augment effect", () => {
        expect(source.name).toBe("Cadigan's Epiphany");
        expect(source.rules.flatMap((entry) => entry.itemClasses)).toEqual(["Gloves"]);
        let eligible = 0;
        for (const [baseId, base] of Object.entries(catalog.bases)) {
            if (!base.rarities.includes("normal") || base.corrupted) continue;
            const item = engine.createItem(baseId);
            const available = availableAugments(catalog, item).some(
                (entry) => entry.id === source.id,
            );
            expect(available).toBe(base.item_class === "Gloves" && socketLimit(catalog, item) > 0);
            if (!available) continue;
            const result = convert({ ...item, sockets: 1 }).item;
            expect(result.jewelSocket).toBe(source.id);
            expect(result.sockets).toBe(0);
            expect(result.augments).toEqual([]);
            expect(engine.validateItem(result)).toEqual(result);
            eligible++;
        }
        expect(eligible).toBeGreaterThan(20);
    });

    it.each([
        "normal",
        "magic",
        "rare",
    ] as const)("converts an empty socket on a %s item without altering its affixes or spending more than one augment", (rarity) => {
        let item = { ...blank(), rarity, quality: 20, mirrored: true };
        if (rarity !== "normal") {
            const mod = engine.pool(item, { side: "prefix" })[0]!;
            item = { ...item, mods: [engine.rollMod(mod.id, seededRandom(1))] };
            if (rarity === "rare") item.mods[0]!.fractured = true;
        }
        const original = structuredClone(item);
        const result = convert(item);
        expect(result.item).toEqual({
            ...engine.validateItem(item),
            sockets: 0,
            augments: [],
            jewelSocket: source.id,
        });
        expect(result.cost).toEqual([{ id: source.id, name: source.name, amount: 1 }]);
        expect(item).toEqual(original);
        expect(engine.statTotals(result.item).get("num_socketed_runes") ?? 0).toBe(0);
        expect(
            engine.statTotals(result.item).get("dummy_display_stat_rune_create_jewel_socket") ?? 0,
        ).toBe(0);
    });

    it("replaces an unbound occupied socket and removes the previous augment's bonuses", () => {
        const item = { ...blank(), augments: [fireRune] };
        expect(engine.statTotals(item).get("base_fire_damage_resistance_%")).toBe(14);
        expect(() => convert(item)).toThrow("empty augment socket");
        const result = convert(item, 0).item;
        expect(engine.statTotals(result).get("base_fire_damage_resistance_%") ?? 0).toBe(0);
        expect(availableAugments(catalog, result)).toEqual([]);
        expect(socketLimit(catalog, result)).toBe(0);
        expect(retainedSocketLimit(catalog, { ...result, corrupted: true })).toBe(0);
    });

    it("rejects socket-bound contents, locked items, missing sockets and other games before randomness", () => {
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        const integer = vi.spyOn(random, "integer");
        const bound = catalog.crafting.augments.filter(
            (entry) =>
                entry.socketBound &&
                !augmentCreatesJewelSocket(entry) &&
                augmentRule(catalog, blank(), entry),
        );
        expect(bound.length).toBeGreaterThan(1);
        for (const entry of bound) {
            const item = { ...blank(), augments: [entry.id] };
            engine.validateItem(item);
            for (const replace of [undefined, 0])
                expect(() => engine.apply(item, { ...method, replace }, random)).toThrow(
                    "socket-bound",
                );
        }
        for (const item of [
            { ...blank(), corrupted: true },
            { ...blank(), rarity: "rare" as const, sanctified: true as const },
        ])
            expect(() => engine.apply(item, method, random)).toThrow("corrupted or Sanctified");
        expect(() => engine.apply({ ...blank(), sockets: 0 }, method, random)).toThrow(
            "empty augment socket",
        );
        expect(() => engine.apply(blank(), { ...method, replace: 0 }, random)).toThrow(
            "occupied augment socket",
        );
        expect(() =>
            engine.apply(
                { ...blank(), baseId: "Metadata/Items/Armours/BodyArmours/FourBodyStr1" },
                method,
                random,
            ),
        ).toThrow("no effect");
        expect(() => poe1.apply(poe1.createItem(poe1Base), method, random)).toThrow(
            "Unknown socketable",
        );
        expect(pick).not.toHaveBeenCalled();
        expect(integer).not.toHaveBeenCalled();
    });

    it("preserves the conversion through later crafts and the Vaal socket outcome", () => {
        let item = convert().item;
        expect(() => engine.apply(item, currency("add_equipment_socket"), seededRandom(1))).toThrow(
            "cannot have augment sockets",
        );
        expect(() => convert(item)).toThrow("converted Jewel socket");
        expect(() =>
            engine.apply(item, { kind: "augment", id: fireRune }, seededRandom(1)),
        ).toThrow("converted Jewel socket");
        item = engine.apply(item, currency("transmute_to_magic"), seededRandom(1)).item;
        expect(item.jewelSocket).toBe(source.id);
        const random = seededRandom(1);
        vi.spyOn(random, "pick").mockImplementation((choices) => {
            const socket = choices.find((entry) => entry.value === "socket");
            if (!socket) throw new Error("Expected the Vaal socket outcome.");
            return socket.value;
        });
        const corrupted = engine.apply(item, currency("corrupt_item"), random).item;
        expect(corrupted).toEqual({ ...item, corrupted: true });
        expect(engine.validateItem(corrupted)).toEqual(corrupted);
    });

    it("rejects forged conversion sources, retained augments and augment socket counts", () => {
        const result = convert().item;
        expect(() => engine.validateItem({ ...result, jewelSocket: fireRune })).toThrow(
            "valid extracted Jewel socket",
        );
        expect(() =>
            engine.validateItem({
                ...result,
                baseId: "Metadata/Items/Armours/BodyArmours/FourBodyStr1",
            }),
        ).toThrow("valid extracted Jewel socket");
        expect(() => engine.validateItem({ ...result, augments: [fireRune] })).toThrow(
            "cannot coexist",
        );
        expect(() => engine.validateItem({ ...result, sockets: 1 })).toThrow("Socket count");
        expect(() => engine.validateItem({ ...blank(), augments: [source.id] })).toThrow(
            "cannot remain socketed",
        );
        expect(() =>
            poe1.validateItem({ ...poe1.createItem(poe1Base), jewelSocket: source.id }),
        ).toThrow("Unknown socketable");
        expect(() => poe1.validateTarget({ groups: [], jewelSocket: false })).toThrow(
            "only available in PoE 2",
        );
    });

    it("calculates and simulates a conditional conversion process using the same targets and costs", () => {
        const target = engine.validateTarget({ groups: [], jewelSocket: true });
        const absent = engine.validateTarget({ groups: [], jewelSocket: false });
        expect(hasCraftingRequirements(target)).toBe(true);
        expect(hasCraftingRequirements(absent)).toBe(true);
        expect(engine.matches(blank(), absent)).toBe(true);
        expect(engine.matches(convert().item, absent)).toBe(false);
        expect(calculateExact(engine, blank(), method, target).probability).toBe(1);
        expect(calculateExact(engine, blank(), method, absent).probability).toBe(0);
        const artificer = currency("add_equipment_socket");
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item: { ...blank(), sockets: 0 },
            method,
            target,
            steps: [
                {
                    id: "socket",
                    method: artificer,
                    condition: absent,
                    onSuccess: "convert",
                    onFailure: "failure",
                },
                {
                    id: "convert",
                    method,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
            useProcess: true,
            prices: { [source.id]: 7, [artificer.id]: 2 },
            seed: 42,
            iterations: 100,
            maxActions: 2,
        });
        expect(calculateProcessExact(engine, project)).toMatchObject({
            probability: 1,
            meanCost: 9,
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let index = 0; index < 25; index++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            successes: 25,
            totalActions: 50,
            meanCost: 9,
            errors: {},
            spending: { [source.id]: 25, [artificer.id]: 25 },
        });
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });

    it("round-trips conversion provenance through named item text and rejects ambiguous or contradictory socket headers", () => {
        const item = { ...convert().item, corrupted: true };
        const text = exportCraftingItemText(engine, item);
        const header = `Jewel Socket: ${source.name}`;
        expect(text).toContain(header);
        expect(importCraftingItemText(engine, text).map((entry) => entry.item)).toContainEqual(
            item,
        );
        expect(() => importCraftingItemText(engine, `${text}\n${header}`)).toThrow("must name one");
        expect(() =>
            importCraftingItemText(engine, text.replace(header, "Jewel Socket: Missing")),
        ).toThrow("must name one");
        expect(() => importCraftingItemText(engine, `${text}\nSockets: S`)).toThrow(
            "cannot coexist",
        );
        expect(() => importCraftingItemText(engine, `${text}\nAugment: Desert Rune`)).toThrow(
            "cannot coexist",
        );
        expect(() =>
            importCraftingItemText(engine, text.replace(header, "Jewel Socket: Desert Rune")),
        ).toThrow();
    });
});

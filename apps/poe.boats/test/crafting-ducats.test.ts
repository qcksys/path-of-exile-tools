import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { allflameBracket, allflameQuote } from "../app/lib/crafting-allflame";
import { CraftingEngine, type CraftingRandom, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    validateProject,
} from "../app/lib/crafting-simulation";
import {
    type CraftingItem,
    type CraftingMethod,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const ducat = (action: string) => ({
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
    allflame: true as const,
});
const tzamoto = ducat("reset_ghostliness_or_delete");
const kishara = ducat("split_to_single_explicit");
const sulphur = catalog.crafting.allflame!.sulphur;
const item = (): CraftingItem => ({
    ...engine.createItem(baseId, 86),
    rarity: "magic",
    mods: [
        engine.rollMod("IncreasedLife1", seededRandom(1)),
        engine.rollMod("FireResist1", seededRandom(2)),
    ],
    intangibility: 80,
    memoryStrands: 82,
    quality: 20,
    sockets: 6,
    socketLinks: [true, true, false, true, true],
});
const reset = engine.validateTarget({ groups: [], intangibility: { min: 0, max: 0 } });
const desired = engine.validateTarget({ groups: [{ mods: ["IncreasedLife1"] }] });
const force = (outcome: string): CraftingRandom => ({
    pick: (choices) =>
        choices.find((entry) => entry.value === outcome)?.value ??
        choices.find((entry) => entry.weight > 0)!.value,
    integer: (min) => min,
});
const project = (start: CraftingItem, method: CraftingMethod, patch = {}) =>
    craftingProjectSchema.parse({
        format: 1,
        game: "poe1",
        patch: catalog.patch,
        item: start,
        method,
        target: reset,
        steps: [],
        prices: { [tzamoto.id]: 2, [sulphur]: 0.001 },
        seed: 42,
        iterations: 500,
        maxActions: 2,
        ...patch,
    });

describe("Allflame Ducats", () => {
    it("requires Allflame and uses the extracted brackets and sulphur cost", () => {
        for (const method of [tzamoto, kishara]) {
            expect(engine.validateMethod(method)).toEqual(method);
            expect(() => engine.validateMethod({ ...method, allflame: undefined })).toThrow(
                "requires Allflame",
            );
            expect(() =>
                engine.apply(item(), { ...method, allflame: undefined }, seededRandom(1)),
            ).toThrow("requires Allflame");
            expect(allflameQuote(catalog, item(), method)).not.toBeNull();
        }
        expect(allflameBracket(catalog, tzamoto)).toMatchObject({
            outcomes: { min: 1, max: 1 },
            intangibility: { min: 0, max: 0 },
        });
        expect(allflameBracket(catalog, kishara)).toMatchObject({
            outcomes: { min: 4, max: 4 },
            intangibility: { min: 8, max: 12 },
        });
        expect(allflameQuote(catalog, item(), tzamoto)?.amount).toBe(6100);
        expect(allflameQuote(catalog, { ...item(), level: 1 }, tzamoto)?.amount).toBe(850);
        const second = new CraftingEngine(
            craftingCatalogSchema.parse(
                JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
            ),
        );
        expect(second.currencySupported("reset_ghostliness_or_delete")).toBe(false);
        expect(second.currencySupported("split_to_single_explicit")).toBe(false);
        expect(() => second.validateMethod(tzamoto)).toThrow("Allflame");
    });

    it.each([
        "reset",
        "destroy",
    ])("offers and persists Tzamoto's %s outcome with one cost and no old imprint", (outcome) => {
        const start = engine.apply(
            item(),
            { kind: "beast", id: "EinharMasterCraft27" },
            seededRandom(1),
        ).item;
        const before = structuredClone(start);
        const offered = engine.prepareAllflame(start, tzamoto, force(outcome));
        expect(start).toEqual(before);
        expect(offered.item.allflameCopies).toHaveLength(1);
        expect(offered.item.imprint).toBeUndefined();
        expect(offered.cost).toEqual([
            { id: tzamoto.id, name: "Tzamoto's Ducat", amount: 1 },
            { id: sulphur, name: "Dead Man's Sulphur", amount: 6100 },
        ]);
        const saved = validateProject(
            catalog,
            JSON.parse(JSON.stringify(project(offered.item, tzamoto))),
        );
        const selected = engine.chooseAllflame(saved.item, 0);
        expect(selected.imprint).toBeUndefined();
        expect(selected.mods).toEqual(start.mods);
        expect(selected.memoryStrands).toBe(82);
        expect(selected.quality).toBe(20);
        expect(selected.socketLinks).toEqual(start.socketLinks);
        expect(selected.allflameCrafted).toBe(true);
        expect(selected.intangibility).toBe(outcome === "reset" ? 0 : 80);
        expect(Boolean(selected.destroyed)).toBe(outcome === "destroy");
        expect(selected.destroyedBy).toBe(outcome === "destroy" ? tzamoto.id : undefined);
        expect(engine.matches(selected, reset)).toBe(outcome === "reset");
        expect(engine.matches(selected, engine.validateTarget({ groups: [] }))).toBe(
            outcome === "reset",
        );
        expect(engine.validateItem(JSON.parse(JSON.stringify(selected)))).toEqual(selected);
        if (outcome === "destroy") {
            expect(() => exportCraftingItemText(engine, selected)).toThrow("destroyed");
            expect(() =>
                engine.apply(selected, currency("restore_imprint"), seededRandom(1)),
            ).toThrow("Destroyed");
            expect(() => engine.apply(selected, tzamoto, seededRandom(1))).toThrow("intact");
        } else {
            expect(
                importCraftingItemText(engine, exportCraftingItemText(engine, selected))[0]!.item,
            ).toEqual(selected);
        }
    });

    it("rejects forged destruction sources and destroyed imprint snapshots", () => {
        const destroyed = engine.apply(item(), tzamoto, force("destroy")).item;
        expect(() => engine.validateItem({ ...item(), destroyedBy: tzamoto.id })).toThrow(
            "destruction source",
        );
        expect(() => engine.validateItem({ ...destroyed, destroyedBy: kishara.id })).toThrow(
            "destruction source",
        );
        expect(() => engine.validateItem({ ...destroyed, allflameCrafted: undefined })).toThrow(
            "destruction source",
        );
        expect(() => engine.validateItem({ ...destroyed, destroyedBy: undefined })).toThrow(
            "Destroyed outcomes",
        );
        expect(() => engine.validateItem({ ...destroyed, imprint: item() })).toThrow(
            "destruction source",
        );
        expect(() =>
            engine.validateItem({ ...item(), allflameCrafted: true, imprint: destroyed }),
        ).toThrow("ineligible state");
        for (const patch of [{ corrupted: true }, { mirrored: true }])
            expect(() =>
                engine.prepareAllflame({ ...item(), ...patch }, tzamoto, seededRandom(1)),
            ).toThrow("intact");
    });

    it("calculates Tzamoto's reset and destruction as equally likely and charges failed outcomes", () => {
        for (const intangibility of [0, 50, 100])
            expect(
                calculateExact(engine, { ...item(), intangibility }, tzamoto, reset).probability,
            ).toBe(0.5);
        const simulation = new CraftingSimulation(catalog, project(item(), tzamoto));
        for (let index = 0; index < 500; index++) simulation.runTrial();
        const result = simulation.result();
        expect(result.errors).toEqual({});
        expect(result.probability).toBeCloseTo(0.5, 1);
        expect(result.totalActions).toBe(500);
        expect(result.spending).toEqual({ [tzamoto.id]: 500, [sulphur]: 3050000 });
        expect(result.meanCost).toBeCloseTo(8.1);
        const scour = currency("convert_to_normal");
        const target = engine.validateTarget({ groups: [], rarity: "normal" });
        const process = calculateProcessExact(
            engine,
            project(item(), tzamoto, {
                target,
                useProcess: true,
                prices: { [tzamoto.id]: 2, [sulphur]: 0.001, [(scour as { id: string }).id]: 1 },
                steps: [
                    {
                        id: "reset",
                        method: tzamoto,
                        condition: reset,
                        onSuccess: "scour",
                        onFailure: "failure",
                    },
                    {
                        id: "scour",
                        method: scour,
                        condition: target,
                        onSuccess: "success",
                        onFailure: "failure",
                    },
                ],
            }),
        );
        expect(process.probability).toBe(0.5);
        expect(process.errors).toEqual({});
        expect(process.totalActions).toBe(1.5);
        expect(process.spending[tzamoto.id]).toBe(1);
        expect(process.spending[(scour as { id: string }).id]).toBe(0.5);
        expect(process.meanCost).toBeCloseTo(8.6);
        const retries = calculateProcessExact(
            engine,
            project(item(), tzamoto, {
                useProcess: true,
                steps: [
                    {
                        id: "reset",
                        method: tzamoto,
                        condition: reset,
                        onSuccess: "success",
                        onFailure: "restart",
                    },
                ],
            }),
        );
        expect(retries.probability).toBeCloseTo(0.75, 12);
        expect(retries.errors).toEqual({});
        expect(retries.totalActions).toBeCloseTo(1.5, 12);
        expect(retries.baseItems).toBeCloseTo(1.5, 12);
        expect(retries.spending[tzamoto.id]).toBeCloseTo(1.5, 12);
    });

    it("keeps one exact modifier per Kishara copy, including its fracture, and preserves other item properties", () => {
        const start = { ...item(), intangibility: 0 };
        start.mods[0]!.fractured = true;
        const before = structuredClone(start);
        const result = engine.prepareAllflame(start, kishara, seededRandom(42));
        expect(start).toEqual(before);
        expect(result.item.allflameCopies).toHaveLength(4);
        for (const copy of result.item.allflameCopies!) {
            expect(copy.mods).toHaveLength(1);
            expect(start.mods).toContainEqual(copy.mods[0]);
            expect(copy.rarity).toBe("rare");
            expect(copy.intangibility).toBeGreaterThanOrEqual(8);
            expect(copy.intangibility).toBeLessThanOrEqual(12);
            expect(copy.memoryStrands).toBe(82);
            expect(copy.quality).toBe(20);
            expect(copy.socketLinks).toEqual(start.socketLinks);
            expect(copy.implicits).toEqual(start.implicits);
            expect(copy.influences).toEqual(start.influences);
        }
        expect(result.cost.find((entry) => entry.id === kishara.id)?.amount).toBe(1);
        expect(
            calculateExact(engine, { ...start, intangibility: 100 }, kishara, desired).probability,
        ).toBe(0.5);
        expect(() =>
            engine.prepareAllflame({ ...start, mods: [] }, kishara, seededRandom(1)),
        ).toThrow("explicit modifier");
    });

    it("does not preserve other modifiers through metamod locks and removes stale reveal state", () => {
        const lock = catalog.crafting.bench.find(
            (entry) =>
                entry.mod &&
                engine
                    .mod(entry.mod)
                    .stats.some((stat) => stat.id === "item_generation_cannot_change_prefixes"),
        )!;
        const start = engine.apply(
            { ...item(), rarity: "rare", intangibility: 100 },
            { kind: "bench", id: lock.id },
            seededRandom(1),
        ).item;
        expect(calculateExact(engine, start, kishara, desired).probability).toBeCloseTo(1 / 3);
        const veiled = engine.apply(
            { ...item(), rarity: "rare", intangibility: 100 },
            currency("replace_rare_mod_veiled"),
            seededRandom(1),
        ).item;
        expect(veiled.reveal).toBeDefined();
        const seen = new Set<boolean>();
        for (let seed = 0; seed < 20; seed++) {
            const result = engine.apply(veiled, kishara, seededRandom(seed)).item;
            const kept = result.mods[0]!.id === veiled.reveal!.mod;
            seen.add(kept);
            expect(Boolean(result.reveal)).toBe(kept);
            expect(engine.validateItem(result)).toEqual(result);
        }
        expect(seen).toEqual(new Set([true, false]));
    });

    it("selects a matching Kishara copy for sampled calculations and preserves the selected item in text and JSON", () => {
        const start = { ...item(), intangibility: 0 };
        const simulation = new CraftingSimulation(
            catalog,
            project(start, kishara, { target: desired }),
        );
        for (let index = 0; index < 500; index++) simulation.runTrial();
        expect(simulation.result().errors).toEqual({});
        expect(simulation.result().probability).toBeCloseTo(1 - 0.5 ** 4, 1);
        const result = engine.apply(start, kishara, seededRandom(42), [desired]).item;
        expect(engine.matches(result, desired)).toBe(true);
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result))[0]!.item,
        ).toEqual(result);
        expect(
            validateProject(catalog, JSON.parse(JSON.stringify(project(result, kishara)))).item,
        ).toEqual(result);
    });
});

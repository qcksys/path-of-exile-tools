import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { allflameBracket, allflameQuote } from "../app/lib/crafting-allflame";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingProcess,
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

const method = (action: string): CraftingMethod =>
    ({ ...currency(action), allflame: true }) as CraftingMethod;
const blank = (rarity: CraftingItem["rarity"] = "rare"): CraftingItem => ({
    ...engine.createItem(baseId, 86),
    rarity,
});
const roll = (id: string) => engine.rollMod(id, seededRandom(1));
const pair = (): CraftingItem => ({
    ...blank(),
    mods: [roll("IncreasedLife1"), roll("FireResist1")],
});
const sulphur = catalog.crafting.allflame!.sulphur;
const target = engine.validateTarget({ groups: [{ mods: ["IncreasedLife1"] }] });
const project = (item: CraftingItem, craft: CraftingMethod, patch = {}) =>
    craftingProjectSchema.parse({
        format: 1,
        game: "poe1",
        patch: catalog.patch,
        item,
        method: craft,
        target,
        steps: [],
        prices: {},
        seed: 42,
        iterations: 500,
        maxActions: 10,
        ...patch,
    });

describe("Allflame crafting", () => {
    it.each([
        "essence",
        "fossils",
    ] as const)("offers %s outcomes with the same extracted guarantees and one set of ingredients", (kind) => {
        const essence = catalog.crafting.essences.find(
            (entry) =>
                entry.level >= 5 &&
                entry.mods["Body Armour"] &&
                allflameBracket(catalog, { kind: "essence", id: entry.id }),
        )!;
        const fossil = engine
            .availableFossils(blank())
            .find((entry) => entry.name === "Pristine Fossil")!;
        const resonator = catalog.crafting.currencies.find(
            (entry) =>
                entry.action === "delve_currency_reroll" &&
                entry.id.endsWith("1") &&
                catalog.crafting.allflame!.currencies.some(
                    (bracket) => bracket.currency === entry.id,
                ),
        )!;
        const craft: CraftingMethod =
            kind === "essence"
                ? { kind, id: essence.id, allflame: true }
                : {
                      kind,
                      ids: [fossil.id],
                      resonator: resonator.id,
                      logic: "additive",
                      allflame: true,
                  };
        const result = engine.prepareAllflame(blank(), craft, seededRandom(9));
        expect(result.item.allflameCopies).toHaveLength(
            allflameBracket(catalog, craft)!.outcomes.max,
        );
        for (const copy of result.item.allflameCopies!) {
            expect(copy.rarity).toBe("rare");
            expect(copy.mods.length).toBeGreaterThanOrEqual(4);
            if (kind === "essence")
                expect(copy.mods.some((mod) => mod.id === essence.mods["Body Armour"])).toBe(true);
        }
        expect(
            result.cost
                .filter((entry) => entry.id !== sulphur)
                .every((entry) => entry.amount === 1),
        ).toBe(true);
        expect(result.cost).toHaveLength(kind === "essence" ? 2 : 3);
        if (kind === "fossils") {
            const corrupting = catalog.crafting.fossils.find((entry) =>
                entry.effects.includes("CorruptedImplicit"),
            )!;
            expect(() =>
                engine.prepareAllflame(
                    blank(),
                    {
                        ...craft,
                        kind,
                        ids: [corrupting.id],
                        resonator: resonator.id,
                        logic: "additive",
                    },
                    seededRandom(1),
                ),
            ).toThrow("corrupts");
        }
    });

    it("prices the highest extracted bracket using class and level factors", () => {
        const craft = method("add_mod_to_rare");
        expect(allflameQuote(catalog, blank(), craft)?.amount).toBe(5490);
        expect(allflameQuote(catalog, { ...blank(), level: 1 }, craft)?.amount).toBe(765);
        const jewel = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "Jewel",
        )![0];
        for (const level of [1, 67, 86, 100])
            expect(allflameQuote(catalog, engine.createItem(jewel, level), craft)?.amount).toBe(
                3375,
            );
        expect(allflameBracket(catalog, craft)?.tier).toBe(2);
        expect(engine.costs(craft, blank()).find((cost) => cost.id === sulphur)?.amount).toBe(5490);
    });

    it("offers independent copies, keeps the original immutable and charges once", () => {
        const item = { ...blank(), memoryStrands: 82 };
        const before = structuredClone(item);
        const craft = method("add_mod_to_rare");
        const result = engine.prepareAllflame(item, craft, seededRandom(7));
        expect(result.item.allflameCopies).toHaveLength(4);
        expect(item).toEqual(before);
        for (const copy of result.item.allflameCopies!) {
            expect(copy.mods).toHaveLength(1);
            expect(copy.memoryStrands).toBeLessThan(82);
            expect(copy.intangibility).toBeGreaterThanOrEqual(8);
            expect(copy.intangibility).toBeLessThanOrEqual(12);
            expect(copy.allflameCrafted).toBe(true);
        }
        expect(result.cost).toHaveLength(2);
        expect(result.cost.find((cost) => cost.id !== sulphur)?.amount).toBe(1);
        const selected = engine.chooseAllflame(result.item, 2);
        expect(selected).toEqual(result.item.allflameCopies![2]);
        expect(selected.allflameCopies).toBeUndefined();
        expect(() => engine.chooseAllflame(result.item, 4)).toThrow("offered");
        expect(() => engine.apply(result.item, currency("reroll"), seededRandom(1))).toThrow(
            "Choose",
        );
        expect(() => engine.matches(result.item, target)).toThrow("Choose");
    });

    it("uses starting intangibility for the single-copy branch and caps each resulting value", () => {
        const craft = method("remove_random_mod");
        const full = engine.prepareAllflame(
            { ...pair(), intangibility: 100 },
            craft,
            seededRandom(1),
        );
        expect(full.item.allflameCopies).toHaveLength(1);
        expect(full.item.allflameCopies![0]!.intangibility).toBe(100);
        let singles = 0;
        const random = seededRandom(42);
        for (let index = 0; index < 400; index++) {
            const result = engine.prepareAllflame({ ...pair(), intangibility: 50 }, craft, random);
            if (result.item.allflameCopies!.length === 1) singles++;
            expect(
                result.item.allflameCopies!.every(
                    (copy) => copy.mods.length === 1 && copy.intangibility! > 50,
                ),
            ).toBe(true);
        }
        expect(singles).toBeGreaterThan(170);
        expect(singles).toBeLessThan(230);
    });

    it("rejects invalid states, unsupported methods and cross-game flags", () => {
        const craft = method("add_mod_to_rare");
        for (const item of [
            { ...blank(), corrupted: true },
            { ...blank(), mirrored: true },
        ])
            expect(() => engine.prepareAllflame(item, craft, seededRandom(1))).toThrow("Allflame");
        expect(() =>
            engine.validateMethod({ kind: "generate", id: "rare", allflame: true }),
        ).toThrow("itemized");
        expect(() =>
            validateProject(catalog, {
                ...project(blank(), craft),
                method: { kind: "generate", id: "rare", allflame: true },
            }),
        ).toThrow("itemized");
        expect(() =>
            engine.validateMethod({ ...currency("corrupt_item"), allflame: true }),
        ).toThrow("unavailable");
        const second = new CraftingEngine(
            craftingCatalogSchema.parse(
                JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
            ),
        );
        const item = second.createItem(Object.keys(second.catalog.bases)[0]!);
        expect(() => second.validateItem({ ...item, intangibility: 1 })).toThrow("PoE 1");
        expect(() =>
            second.validateTarget({ groups: [], intangibility: { min: 0, max: 100 } }),
        ).toThrow("PoE 1");
        expect(() => second.validateMethod(craft)).toThrow("Allflame");
        expect(() => engine.validateItem({ ...blank(), intangibility: 101 })).toThrow();
    });

    it("discards an existing imprint but allows a new imprint of the chosen result", () => {
        const imprinted = engine.apply(
            blank("magic"),
            currency("inital_imprint"),
            seededRandom(1),
        ).item;
        const result = engine.apply(imprinted, method("reroll_magic"), seededRandom(2)).item;
        expect(result.imprint).toBeUndefined();
        expect(() => engine.validateItem({ ...result, imprint: imprinted.imprint })).toThrow(
            "imprint",
        );
        expect(() => engine.apply(result, currency("restore_imprint"), seededRandom(1))).toThrow(
            "no stored imprint",
        );
        const fresh = engine.apply(result, currency("inital_imprint"), seededRandom(1)).item;
        const changed = engine.apply(fresh, currency("reroll_magic"), seededRandom(3)).item;
        const restored = engine.apply(changed, currency("restore_imprint"), seededRandom(1)).item;
        expect(restored).toEqual(result);
        expect(
            engine.apply(restored, { kind: "generate", id: "normal" }, seededRandom(1)).item
                .intangibility,
        ).toBeUndefined();
    });

    it("preserves selected and pending states through JSON and selected state through item text", () => {
        const offered = engine.prepareAllflame(
            pair(),
            method("remove_random_mod"),
            seededRandom(1),
        ).item;
        const saved = validateProject(
            catalog,
            JSON.parse(JSON.stringify(project(offered, method("remove_random_mod")))),
        );
        expect(saved.item).toEqual(offered);
        expect(() => exportCraftingItemText(engine, offered)).toThrow("JSON");
        const selected = engine.chooseAllflame(saved.item, 0);
        const text = exportCraftingItemText(engine, selected);
        expect(importCraftingItemText(engine, text)[0]!.item).toEqual(selected);
        expect(() => importCraftingItemText(engine, `${text}\nIntangibility: 5%`)).toThrow(
            "Intangibility",
        );
    });

    it("selects a target-matching outcome and samples the independent-copy success probability", () => {
        const craft = method("remove_random_mod");
        const count = allflameBracket(catalog, craft)!.outcomes.max;
        const cost = allflameQuote(catalog, pair(), craft)!.amount;
        const configuration = project(pair(), craft, {
            prices: { [(craft as { id: string }).id]: 2, [sulphur]: 0.001 },
        });
        const simulation = new CraftingSimulation(catalog, configuration);
        for (let index = 0; index < 500; index++) simulation.runTrial();
        expect(simulation.result().probability).toBeCloseTo(1 - 0.5 ** count, 1);
        expect(simulation.result().meanCost).toBeCloseTo(2 + cost * 0.001, 8);
        expect(simulation.result().spending[sulphur]).toBe(cost * 500);
        const one = new CraftingSimulation(catalog, {
            ...configuration,
            item: { ...pair(), intangibility: 100 },
        });
        for (let index = 0; index < 500; index++) one.runTrial();
        expect(one.result().probability).toBeCloseTo(0.5, 1);
    });

    it("calculates deterministic Allflame workflows and their sulphur costs exactly", () => {
        const craft = method("convert_to_normal");
        const desired = engine.validateTarget({
            groups: [],
            rarity: "normal",
            intangibility: { min: 40, max: 40 },
        });
        const item = { ...pair(), intangibility: 40 };
        expect(calculateExact(engine, item, craft, desired).probability).toBe(1);
        const config = project(item, craft, {
            target: desired,
            useProcess: true,
            prices: { [(craft as { id: string }).id]: 1, [sulphur]: 0.01 },
            steps: [
                {
                    id: "scour",
                    method: craft,
                    condition: desired,
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
        });
        const result = calculateProcessExact(engine, config);
        expect(result.probability).toBe(1);
        expect(result.spending[sulphur]).toBe(allflameQuote(catalog, item, craft)!.amount);
    });

    it("selects the earliest passing process route without choosing a copy captured by an earlier failure route", () => {
        const craft = method("remove_random_mod");
        const failed = engine.validateTarget({
            groups: [{ mods: ["IncreasedLife1"], negated: true }],
        });
        const any = engine.validateTarget({ groups: [] });
        const config = project(pair(), craft, {
            useProcess: true,
            steps: [
                {
                    id: "annul",
                    method: craft,
                    condition: any,
                    branches: [
                        { id: "bad", condition: failed, destination: "failure" },
                        { id: "good", condition: any, destination: "success" },
                    ],
                    onFailure: "failure",
                },
            ],
        });
        for (let seed = 0; seed < 30; seed++) {
            const offered = engine.prepareAllflame(pair(), craft, seededRandom(seed));
            const possible = offered.item.allflameCopies!.some((copy) =>
                engine.matches(copy, target),
            );
            const process = new CraftingProcess(engine, config, seededRandom(seed));
            process.advance();
            expect(process.result().success).toBe(possible);
            expect(process.result().actions).toBe(1);
        }
    });
});

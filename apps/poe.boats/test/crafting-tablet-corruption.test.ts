import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { supportsTabletCorruption } from "../app/lib/crafting-corruption";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { availableOmens } from "../app/lib/crafting-omens";
import {
    CraftingProcess,
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { rolledModText } from "../app/lib/crafting-text";
import {
    type CraftingItem,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const tablets = Object.keys(catalog.bases).filter((baseId) =>
    supportsTabletCorruption(catalog, { baseId }),
);
const baseId = tablets.find((id) => catalog.bases[id]!.name === "Irradiated Tablet")!;
const method = {
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === "incursion_corrupt_tablet")!
        .id,
};
const currency = (action: string) => ({
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
});
const blank = (id = baseId) => engine.createItem(id);
function prepared(rarity: CraftingItem["rarity"] = "rare", id = baseId) {
    let item = { ...blank(id), rarity };
    for (const side of rarity === "rare"
        ? ["prefix", "prefix", "suffix", "suffix"]
        : rarity === "magic"
          ? ["prefix", "suffix"]
          : [])
        item = engine.addStartingMod(item, engine.pool(item, { side })[0]!.id, seededRandom(1));
    return item;
}
function force(outcome: string, base?: string) {
    const random = seededRandom(42);
    const pick = vi
        .spyOn(random, "pick")
        .mockImplementationOnce(
            (choices) => choices.find((entry) => entry.value === outcome)!.value,
        );
    if (base)
        pick.mockImplementationOnce(
            (choices) => choices.find((entry) => entry.value === base)!.value,
        );
    return random;
}

describe("PoE 2 Ancient Infuser tablet corruption", () => {
    it("uses the extracted currency and tablet records while ordinary Vaal Orbs remain unavailable", () => {
        expect(tablets).toHaveLength(8);
        expect(catalog.crafting.currencies.find((entry) => entry.id === method.id)?.name).toBe(
            "Ancient Infuser",
        );
        expect(engine.currencySupported("incursion_corrupt_tablet")).toBe(true);
        expect(availableOmens(catalog, method)).toEqual([]);
        for (const id of tablets) {
            const item = blank(id);
            expect(engine.corruptionKind(item)).toBeUndefined();
            expect(() => engine.apply(item, currency("corrupt_item"), seededRandom(1))).toThrow(
                "not supported",
            );
            expect(engine.apply(item, method, force("uses")).cost).toMatchObject([
                { id: method.id, amount: 1 },
            ]);
        }
    });

    it("limits ordinary rare tablets to four affixes and two per side", () => {
        const item = prepared();
        expect(engine.limits(item)).toEqual({ min: 4, max: 4, prefixes: 2, suffixes: 2 });
        expect(engine.pool(item)).toEqual([]);
        expect(() => engine.apply(item, currency("add_mod_to_rare"), seededRandom(1))).toThrow();
        for (let seed = 0; seed < 20; seed++) {
            const result = engine.apply(
                blank(),
                currency("transmute_to_rare"),
                seededRandom(seed),
            ).item;
            expect(result.mods).toHaveLength(4);
            expect(engine.counts(result)).toEqual({ prefixes: 2, suffixes: 2 });
        }
    });

    it.each([
        "normal",
        "magic",
        "rare",
    ] as const)("adds one affix to a full %s tablet while preserving its rarity and existing rolls", (rarity) => {
        const item = prepared(rarity);
        const before = structuredClone(item);
        const result = engine.apply(item, method, force("modifier")).item;
        expect(result.rarity).toBe(rarity);
        expect(result.corrupted).toBe(true);
        expect(result.mods).toHaveLength(item.mods.length + 1);
        expect(result.mods.slice(0, item.mods.length)).toEqual(item.mods);
        expect(result.implicits).toEqual(item.implicits);
        expect(engine.validateItem(result)).toEqual(result);
        expect(() => engine.validateItem({ ...result, corrupted: false })).toThrow("affix limits");
        expect(item).toEqual(before);
        const text = exportCraftingItemText(engine, result);
        expect(
            importCraftingItemText(engine, text).some(
                (entry) => exportCraftingItemText(engine, entry.item) === text,
            ),
        ).toBe(true);
    });

    it("adds ten uses to each extracted native implicit and preserves their text and JSON", () => {
        for (const id of tablets) {
            const item = prepared("rare", id);
            const result = engine.apply(item, method, force("uses")).item;
            expect(result.mods).toEqual(item.mods);
            expect(result.implicits[0]!.values[0]).toBe(item.implicits[0]!.values[0]! + 10);
            expect(rolledModText(catalog, result.implicits[0]!, result)).toContain(
                "20 uses remaining",
            );
            const text = exportCraftingItemText(engine, result);
            expect(
                importCraftingItemText(engine, text).some(
                    (entry) => JSON.stringify(entry.item) === JSON.stringify(result),
                ),
            ).toBe(true);
            expect(engine.validateItem(JSON.parse(JSON.stringify(result)))).toEqual(result);
            expect(() => engine.validateItem({ ...result, corrupted: false })).toThrow("ranges");
            const invalid = structuredClone(result);
            invalid.implicits[0]!.values[0] = 21;
            expect(() => engine.validateItem(invalid)).toThrow("ranges");
        }
    });

    it("can choose every tablet including the original base, resetting its implicit and rerolling its affixes", () => {
        for (const rarity of ["normal", "magic", "rare"] as const) {
            const item = prepared(rarity);
            for (const id of tablets) {
                const result = engine.apply(item, method, force("base", id)).item;
                expect(result).toMatchObject({
                    baseId: id,
                    rarity,
                    level: item.level,
                    corrupted: true,
                });
                expect(result.mods).toHaveLength(item.mods.length);
                expect(result.implicits.map((entry) => entry.id)).toEqual(
                    catalog.bases[id]!.implicits,
                );
                expect(result.implicits[0]!.values).toEqual([10]);
                expect(engine.validateItem(result)).toEqual(result);
            }
        }
    });

    it("enumerates survival, extra affixes, use-count targets and conditional costs after the removal of destruction", () => {
        const item = blank();
        const implicit = item.implicits[0]!;
        const prefix = engine.pool({ ...item, rarity: "rare" }, { side: "prefix" })[0]!.id;
        const native = tablets.flatMap((id) => catalog.bases[id]!.implicits);
        const model = new CraftingEngine({
            ...catalog,
            mods: Object.fromEntries(
                Object.entries(catalog.mods).filter(([id]) => id === prefix || native.includes(id)),
            ),
        });
        for (const [requirement, probability] of [
            [{ rarity: "normal" }, 1],
            [{ affixCount: { min: 1, max: 1 } }, 1 / 3],
            [
                {
                    stats: [
                        { id: catalog.mods[implicit.id]!.stats[0]!.id, scope: "implicit", min: 20 },
                    ],
                },
                1 / 3,
            ],
        ] as const) {
            const target = model.validateTarget({ groups: [], ...requirement });
            expect(calculateExact(model, item, method, target).probability).toBeCloseTo(
                probability,
            );
            const project = craftingProjectSchema.parse({
                format: 1,
                game: "poe2",
                patch: catalog.patch,
                item,
                method,
                target,
                steps: [{ id: "infuse", method, condition: target }],
                useProcess: true,
                prices: { [method.id]: 7 },
                seed: 42,
                iterations: 1000,
                maxActions: 1,
            });
            expect(calculateProcessExact(model, project)).toMatchObject({
                probability: expect.closeTo(probability),
                meanCost: expect.closeTo(7),
                errors: {},
            });
            const simulation = new CraftingSimulation(catalog, project, true);
            for (let index = 0; index < project.iterations; index++) simulation.runTrial();
            expect(simulation.result()).toMatchObject({
                errors: {},
                meanCost: 7,
                spending: { [method.id]: 1000 },
            });
            expect(Math.abs(simulation.result().probability - probability)).toBeLessThan(0.04);
        }
    });

    it("allows a conditional process to restart after a missed use-count target and charges both attempts", () => {
        const item = blank();
        const target = engine.validateTarget({
            groups: [],
            stats: [
                {
                    id: catalog.mods[item.implicits[0]!.id]!.stats[0]!.id,
                    scope: "implicit",
                    min: 20,
                },
            ],
        });
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item: blank(),
            method,
            target,
            steps: [{ id: "infuse", method, condition: target, onFailure: "restart" }],
            prices: {},
            seed: 42,
            iterations: 1,
            maxActions: 2,
        });
        const random = force("base", baseId);
        vi.mocked(random.pick).mockImplementationOnce(
            (choices) => choices.find((entry) => entry.value === "uses")!.value,
        );
        const process = new CraftingProcess(engine, project, random);
        process.advance();
        expect(process.item.implicits[0]!.values).toEqual([10]);
        process.advance();
        expect(process.result()).toMatchObject({
            success: true,
            actions: 2,
            spending: { [method.id]: 2 },
            item: { corrupted: true, implicits: [{ values: [20] }] },
        });
        expect(process.item.destroyed).toBeUndefined();
    });

    it("rejects destroyed tablet snapshots because the current build cannot produce them", () => {
        expect(() => engine.validateItem({ ...blank(), corrupted: true, destroyed: true })).toThrow(
            "Destroyed outcomes",
        );
    });

    it("rejects incompatible bases, corrupted and mirrored inputs and unsupported omens without randomness", () => {
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        const map = engine.createItem(catalog.crafting.waystones[0]!.id);
        for (const item of [map, { ...blank(), corrupted: true }, { ...blank(), mirrored: true }])
            expect(() => engine.apply(item, method, random)).toThrow();
        const omen = catalog.crafting.currencies.find(
            (entry) => entry.name === "Omen of Corruption",
        )!;
        expect(() => engine.apply(blank(), { ...method, omens: [omen.id] }, random)).toThrow();
        expect(pick).not.toHaveBeenCalled();
    });
});

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { supportsTempleCorruption } from "../app/lib/crafting-corruption";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { availableOmens } from "../app/lib/crafting-omens";
import {
    CraftingProcess,
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const action = "incursion_corrupt_equipment";
const currency = catalog.crafting.currencies.find((entry) => entry.action === action)!;
const method = { kind: "currency" as const, id: currency.id };
const baseId = (name: string) =>
    Object.keys(catalog.bases).find((id) => catalog.bases[id]!.name === name)!;
const blank = (name = "Gold Ring") => ({ ...engine.createItem(baseId(name)), corrupted: true });
function force(outcome: string) {
    const random = seededRandom(42);
    vi.spyOn(random, "pick").mockImplementationOnce(
        (choices) => choices.find((entry) => entry.value === outcome)!.value,
    );
    return random;
}

describe("PoE 2 Architect's Orb", () => {
    it("uses extracted action eligibility and excludes tablets, Waystones and flasks", () => {
        expect(currency.name).toBe("Architect's Orb");
        expect(engine.currencySupported(action)).toBe(true);
        expect(availableOmens(catalog, method)).toEqual([]);
        for (const name of ["Gold Ring", "Sapphire", "Hunting Spear"])
            expect(supportsTempleCorruption(catalog, blank(name), action)).toBe(true);
        for (const item of [
            blank("Irradiated Tablet"),
            engine.createItem(catalog.crafting.waystones[0]!.id),
            engine.createItem(
                Object.keys(catalog.bases).find((id) => catalog.bases[id]!.domain === "flask")!,
            ),
        ]) {
            expect(supportsTempleCorruption(catalog, item, action)).toBe(false);
            expect(() =>
                engine.apply({ ...item, corrupted: true }, method, seededRandom(1)),
            ).toThrow("eligible");
        }
        const changed = structuredClone(catalog);
        changed.crafting.templeCorruption!.currencies.find(
            (entry) => entry.id === method.id,
        )!.itemClasses = ["Jewel"];
        expect(() => new CraftingEngine(changed).apply(blank(), method, seededRandom(1))).toThrow(
            "eligible",
        );
    });

    it.each([
        "Gold Ring",
        "Sapphire",
    ])("adds or replaces a weighted implicit on %s and round trips Twice Corrupted text", (name) => {
        const item = blank(name);
        const random = force("implicit");
        const result = engine.apply(item, method, random);
        expect(result.item).toMatchObject({
            corrupted: true,
            twiceCorrupted: true,
            rarity: item.rarity,
            mods: item.mods,
        });
        expect(result.item.implicits).toHaveLength(1);
        expect(engine.mod(result.item.implicits[0]!.id).generation_type).toBe("corrupted");
        const choices = vi
            .mocked(random.pick)
            .mock.calls.find(([choices]) =>
                choices.some((entry) => entry.value === result.item.implicits[0]!.id),
            )![0];
        expect(choices).toEqual(
            engine
                .corruptedModifiers(item)
                .map((entry) => ({ value: entry.id, weight: entry.weight })),
        );
        expect(result.cost).toMatchObject([{ id: method.id, amount: 1 }]);
        const text = exportCraftingItemText(engine, result.item);
        expect(text.split("\n").at(-1)).toBe("Twice Corrupted");
        expect(
            importCraftingItemText(engine, text).some(
                (entry) => JSON.stringify(entry.item) === JSON.stringify(result.item),
            ),
        ).toBe(true);
        expect(engine.validateItem(JSON.parse(JSON.stringify(result.item)))).toEqual(result.item);
        expect(item.twiceCorrupted).toBeUndefined();
    });

    it("can replace either a native or corrupted implicit and prevents duplicate corruption groups", () => {
        const original = blank("Sinew Belt");
        const first = engine.corruptedModifiers(original)[0]!;
        const item = engine.addStartingMod(original, first.id, seededRandom(1));
        expect(item.implicits).toHaveLength(2);
        for (const removed of item.implicits) {
            const random = force("implicit");
            vi.mocked(random.pick).mockImplementationOnce((choices) => {
                expect(choices).toEqual(item.implicits.map((value) => ({ value, weight: 1 })));
                return choices.find((entry) => (entry.value as { id: string }).id === removed.id)!
                    .value;
            });
            const result = engine.apply(item, method, random).item;
            const retained = item.implicits.find((entry) => entry.id !== removed.id)!;
            expect(result.implicits[0]).toEqual(retained);
            expect(result.implicits).toHaveLength(2);
            expect(
                result.implicits.filter(
                    (entry) => engine.mod(entry.id).generation_type === "corrupted",
                ),
            ).toHaveLength(engine.mod(removed.id).generation_type === "corrupted" ? 1 : 2);
            expect(engine.validateItem(result)).toEqual(result);
            const choices = vi.mocked(random.pick).mock.calls[2]![0];
            const retainedGroups = engine.mod(retained.id).groups;
            expect(
                choices.every(
                    (entry) =>
                        !engine
                            .mod(String(entry.value))
                            .groups.some((group) => retainedGroups.includes(group)),
                ),
            ).toBe(true);
            const text = exportCraftingItemText(engine, result);
            expect(
                importCraftingItemText(engine, text).some(
                    (entry) => JSON.stringify(entry.item) === JSON.stringify(result),
                ),
            ).toBe(true);
        }
    });

    it("rejects uncorrupted, mirrored, twice-corrupted and unsupported omen inputs before randomness", () => {
        const item = blank();
        const twice = engine.apply(item, method, force("implicit")).item;
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        for (const invalid of [
            { ...item, corrupted: false },
            { ...item, mirrored: true },
        ])
            expect(() => engine.apply(invalid, method, random)).toThrow("corrupted, unmirrored");
        expect(() => engine.apply(twice, method, random)).toThrow("already Twice Corrupted");
        const omen = catalog.crafting.currencies.find(
            (entry) => entry.name === "Omen of Corruption",
        )!;
        expect(() => engine.apply(item, { ...method, omens: [omen.id] }, random)).toThrow();
        expect(pick).not.toHaveBeenCalled();
        expect(() => engine.validateItem({ ...twice, corrupted: false })).toThrow(
            "Twice-corrupted",
        );
        expect(() =>
            engine.validateItem({ ...blank("Irradiated Tablet"), twiceCorrupted: true }),
        ).toThrow("Twice-corrupted");
        expect(() =>
            engine.validateItem({ ...twice, implicits: [twice.implicits[0], twice.implicits[0]] }),
        ).toThrow("invalid corrupted implicit");
    });

    it("retains destruction costs and history, fails every target and rejects further crafts", () => {
        const item = blank();
        const result = engine.apply(item, method, force("destroy"));
        expect(result.item).toEqual({ ...item, twiceCorrupted: true, destroyed: true });
        expect(result.cost).toMatchObject([{ id: method.id, amount: 1 }]);
        expect(engine.matches(result.item, engine.validateTarget({ groups: [] }))).toBe(false);
        expect(engine.validateItem(JSON.parse(JSON.stringify(result.item)))).toEqual(result.item);
        expect(() => exportCraftingItemText(engine, result.item)).toThrow("JSON export");
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        expect(() => engine.apply(result.item, method, random)).toThrow("Destroyed items");
        expect(pick).not.toHaveBeenCalled();
        expect(() => engine.validateItem({ ...result.item, twiceCorrupted: undefined })).toThrow(
            "Destroyed outcomes",
        );
    });

    it("calculates survival and a weighted implicit target, including destruction as failure", () => {
        const item = blank();
        const pool = engine.corruptedModifiers(item);
        const wanted = pool[0]!;
        const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
        for (const [target, probability] of [
            [engine.validateTarget({ groups: [] }), 0.5],
            [
                engine.validateTarget({ groups: [{ mods: [wanted.id], min: 1 }] }),
                wanted.weight / totalWeight / 2,
            ],
        ] as const) {
            expect(calculateExact(engine, item, method, target).probability).toBeCloseTo(
                probability,
            );
        }
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item,
            method,
            target: { groups: [] },
            steps: [{ id: "architect", method, condition: { groups: [] }, onFailure: "restart" }],
            prices: { [method.id]: 7 },
            seed: 42,
            iterations: 1000,
            maxActions: 2,
        });
        expect(calculateProcessExact(engine, project)).toMatchObject({
            probability: expect.closeTo(0.75),
            meanCost: expect.closeTo(10.5),
            errors: {},
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let index = 0; index < project.iterations; index++) simulation.runTrial();
        expect(Math.abs(simulation.result().probability - 0.75)).toBeLessThan(0.04);
        const random = force("destroy");
        vi.mocked(random.pick).mockImplementationOnce(
            (choices) => choices.find((entry) => entry.value === "implicit")!.value,
        );
        const process = new CraftingProcess(engine, project, random);
        process.advance();
        expect(process.item.destroyed).toBe(true);
        process.advance();
        expect(process.result()).toMatchObject({
            success: true,
            actions: 2,
            spending: { [method.id]: 2 },
            item: { twiceCorrupted: true },
        });
        expect(process.item.destroyed).toBeUndefined();
    });

    it("excludes destroyed modifiers from frequencies while retaining the failed sample", () => {
        const original = { ...blank(), corrupted: false };
        const item = {
            ...engine.addStartingMod(
                original,
                engine.pool({ ...original, rarity: "rare" })[0]!.id,
                seededRandom(1),
            ),
            corrupted: true,
        };
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item,
            method,
            target: { groups: [] },
            steps: [],
            prices: { [method.id]: 7 },
            seed: 4,
            iterations: 1,
            maxActions: 1,
        });
        const simulation = new CraftingSimulation(catalog, project, false);
        simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            successes: 0,
            errors: {},
            meanCost: 7,
            spending: { [method.id]: 1 },
            affixes: {},
            samples: [{ success: false, item: { destroyed: true, twiceCorrupted: true } }],
        });
    });
});

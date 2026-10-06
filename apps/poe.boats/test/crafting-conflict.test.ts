import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { eldritchFamilyKey, eldritchTier } from "../app/lib/crafting-eldritch";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";
import { catalog, currency, engine } from "./crafting-fixtures";

const exarch = "IncreasedAttackSpeedEldritchImplicit";
const eater = "ChanceToSuppressSpellsEldritchImplicit";
const gloves = engine.createItem(
    Object.entries(catalog.bases).find(([, base]) => base.item_class === "Gloves")![0],
);
const method = currency("conflict_orb");
const costId = engine.costs(method)[0]!.id;
const start = (exarchTier: number, eaterTier: number) => ({
    ...gloves,
    implicits: [
        engine.rollMod(`${exarch}${exarchTier}`, seededRandom(42)),
        engine.rollMod(`${eater}${eaterTier}`, seededRandom(42)),
    ],
});

describe("PoE 1 Orb of Conflict", () => {
    it.each(
        [1, 2, 3, 4, 5, 6].flatMap((a) => [1, 2, 3, 4, 5, 6].map((b) => [a, b])),
    )("moves each direction of strength %i/%i within the original families", (a, b) => {
        const input = { ...start(a!, b!), level: 1, quality: 20, memoryStrands: 82 };
        for (const direction of [0, 1]) {
            const random = seededRandom(42);
            const pick = vi
                .spyOn(random, "pick")
                .mockImplementation((choices) => choices[direction]!.value);
            const result = engine.apply(input, method, random);
            const tiers =
                direction === 0 ? [Math.min(6, a! + 1), b! - 1] : [a! - 1, Math.min(6, b! + 1)];
            expect(result.item.implicits.map((entry) => entry.id)).toEqual(
                tiers.flatMap((tier, index) => (tier ? [`${index ? eater : exarch}${tier}`] : [])),
            );
            expect(result.item).toEqual({ ...input, implicits: result.item.implicits });
            expect(result.cost).toEqual([{ id: costId, name: "Orb of Conflict", amount: 1 }]);
            expect(pick).toHaveBeenCalledExactlyOnceWith([
                { value: 0, weight: 1 },
                { value: 1, weight: 1 },
            ]);
        }
        expect(input.implicits.map((entry) => entry.id)).toEqual([`${exarch}${a}`, `${eater}${b}`]);
    });

    it("preserves raw rolls on a capped Perfect implicit and explicit modifiers", () => {
        const perfect = engine
            .eldritchModifiers(gloves)
            .find(
                (entry) =>
                    entry.mod.generation_type === "searing_exarch_implicit" &&
                    eldritchTier(entry.mod) === 6 &&
                    entry.mod.stats.some((stat) => stat.max > stat.min),
            )!;
        let input = start(6, 1);
        input.implicits[0] = {
            ...engine.rollMod(perfect.id, seededRandom(42)),
            values: perfect.mod.stats.map((stat) => stat.min),
        };
        const explicit = engine.pool({ ...input, rarity: "rare" })[0]!;
        input = engine.addStartingMod(input, explicit.id, seededRandom(42));
        input.mods[0]!.fractured = true;
        const random = seededRandom(42);
        vi.spyOn(random, "pick").mockImplementation((choices) => choices[0]!.value);
        const integer = vi.spyOn(random, "integer");
        const result = engine.apply(input, method, random).item;
        expect(result).toEqual({ ...input, implicits: [input.implicits[0]] });
        expect(integer).not.toHaveBeenCalled();
    });

    it("admits zero-weight Conflict tiers without adding them to Ember and Ichor pools", () => {
        const input = start(2, 2);
        input.implicits[0] = engine.rollMod(`${exarch}UniquePresence2`, seededRandom(42));
        const random = seededRandom(42);
        vi.spyOn(random, "pick").mockImplementation((choices) => choices[1]!.value);
        const result = engine.apply(input, method, random).item;
        const id = `${exarch}UniquePresence1`;
        expect(result.implicits.map((entry) => entry.id)).toEqual([id, `${eater}3`]);
        expect(engine.eldritchModifiers(gloves).find((entry) => entry.id === id)?.weight).toBe(0);
        expect(
            engine.implicitPool(gloves, "searing_exarch_implicit", 1).map((entry) => entry.id),
        ).not.toContain(id);
        expect(engine.addStartingMod(gloves, id, seededRandom(42)).implicits[0]!.id).toBe(id);
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result))[0]!.item,
        ).toEqual(result);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: result,
            method,
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 2,
        });
        expect(
            engine.validateItem(
                craftingProjectSchema.parse(JSON.parse(JSON.stringify(project))).item,
            ),
        ).toEqual(result);
    });

    it("resolves complete extracted families and excludes disabled or wrong-base families", () => {
        const families = new Map<string, number[]>();
        for (const mod of Object.values(catalog.mods)) {
            if (!eldritchTier(mod)) continue;
            const key = eldritchFamilyKey(mod);
            families.set(key, [...(families.get(key) ?? []), eldritchTier(mod)]);
        }
        expect(families.size).toBe(678);
        for (const tiers of families.values()) expect(tiers.sort()).toEqual([1, 2, 3, 4, 5, 6]);
        const invalid = Object.entries(catalog.mods).find(
            ([id, mod]) =>
                eldritchTier(mod) &&
                !engine.eldritchModifiers(gloves).some((entry) => entry.id === id),
        )!;
        expect(() => engine.addStartingMod(gloves, invalid[0], seededRandom(42))).toThrow(
            "cannot be used",
        );
        expect(
            engine
                .eldritchModifiers(gloves)
                .some((entry) => entry.id.startsWith("RageOnHitImplicitEldritch")),
        ).toBe(false);
    });

    it("enumerates new stat rolls and fails before randomness for missing or ambiguous tiers", () => {
        const input = start(2, 2);
        const id = "AttackCriticalStrikeChanceEldritchImplicit3";
        input.implicits[0] = engine.rollMod(
            "AttackCriticalStrikeChanceEldritchImplicit2",
            seededRandom(42),
        );
        const stat = engine.mod(id).stats[0]!;
        const target = engine.validateTarget({
            groups: [{ mods: [id] }],
            stats: [{ id: stat.id, min: stat.max }],
        });
        expect(calculateExact(engine, input, method, target).probability).toBeCloseTo(
            0.5 / (stat.max - stat.min + 1),
        );
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        for (const duplicate of [false, true]) {
            const mods = { ...catalog.mods };
            if (duplicate) mods.duplicateConflictTier = mods[id]!;
            else delete mods[id];
            const incomplete = new CraftingEngine({ ...catalog, mods });
            expect(() => incomplete.apply(input, method, random)).toThrow(
                "unambiguous Eldritch tier",
            );
        }
        expect(pick).not.toHaveBeenCalled();
    });

    it("rejects missing implicits, corruption, mirroring, influence and unsupported games before randomness", () => {
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        for (const input of [
            gloves,
            { ...start(1, 1), implicits: start(1, 1).implicits.slice(0, 1) },
            { ...start(1, 1), corrupted: true },
            { ...start(1, 1), mirrored: true },
            { ...start(1, 1), influences: [1] },
        ])
            expect(() => engine.apply(input, method, random)).toThrow();
        const poe2 = new CraftingEngine(
            craftingCatalogSchema.parse(
                JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
            ),
        );
        expect(poe2.currencySupported("conflict_orb")).toBe(false);
        expect(() => poe2.validateMethod(method)).toThrow();
        expect(pick).not.toHaveBeenCalled();
    });

    it("calculates, simulates and prices repeated upgrades with the same reference model", () => {
        const item = start(2, 2);
        const target = engine.validateTarget({ groups: [{ mods: [`${exarch}4`] }] });
        expect(
            calculateExact(
                engine,
                item,
                method,
                engine.validateTarget({ groups: [{ mods: [`${exarch}3`] }] }),
            ).probability,
        ).toBe(0.5);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method,
            target,
            steps: [
                {
                    id: "conflict",
                    method,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "conflict",
                },
            ],
            useProcess: true,
            prices: { [costId]: 3 },
            seed: 42,
            iterations: 2000,
            maxActions: 2,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBe(0.25);
        expect(exact.meanCost).toBe(6);
        expect(exact.spending).toEqual({ [costId]: 2 });
        expect(exact.costPerSuccess).toBe(24);
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let i = 0; i < project.iterations; i++) simulation.runTrial();
        const result = simulation.result();
        expect(result.probability).toBeGreaterThan(0.22);
        expect(result.probability).toBeLessThan(0.28);
        expect(result.meanCost).toBe(6);
        expect(result.spending[costId]).toBe(4000);
        expect(result.errors).toEqual({});
    });

    it("retains completed spending when a process repeats after losing an implicit", () => {
        const target = engine.validateTarget({ groups: [{ mods: [`${exarch}6`] }] });
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: start(1, 1),
            method,
            target,
            steps: [
                {
                    id: "conflict",
                    method,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "conflict",
                },
            ],
            useProcess: true,
            prices: { [costId]: 3 },
            seed: 42,
            iterations: 100,
            maxActions: 2,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBe(0);
        expect(exact.spending).toEqual({ [costId]: 1 });
        expect(exact.meanCost).toBe(3);
        expect(exact.errors).toEqual({
            "Orb of Conflict requires both modifiable Eldritch implicits.": 1,
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        simulation.runTrial();
        expect(simulation.result().spending).toEqual(exact.spending);
        expect(simulation.result().errors).toEqual(exact.errors);
    });
});

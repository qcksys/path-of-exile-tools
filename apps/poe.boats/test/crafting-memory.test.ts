/** biome-ignore-all lint/style/useNamingConvention: Fixtures retain extracted currency action names. */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    memoryConsumption,
    memoryTierCount,
    memoryTierPool,
    remainingStrandOutcomes,
    remembranceOutcomes,
    unravellingOutcomes,
} from "../app/lib/crafting-memory";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";
import { catalog, currency, engine } from "./crafting-fixtures";

const normal = engine.createItem("Metadata/Items/Amulets/Amulet8");
const empty = { ...normal, rarity: "rare" as const };
const pool = engine.pool(empty);
const unravel = currency("consume_zana_influence_upgrade_mods");
const strength = engine.addStartingMod(normal, "Strength1", seededRandom(1));
const target = engine.validateTarget({ groups: [{ mods: ["Strength9"] }] });

describe("memory strands", () => {
    it("models Remembrance from all research buckets without making unobserved counts impossible", () => {
        expect(remembranceOutcomes.map((entry) => entry.value)).toEqual(
            Array.from({ length: 91 }, (_, index) => index + 10),
        );
        expect(remembranceOutcomes.reduce((sum, entry) => sum + entry.weight, 0)).toBeCloseTo(
            2255,
            10,
        );
        for (const value of [96, 99])
            expect(
                remembranceOutcomes.find((entry) => entry.value === value)!.weight,
            ).toBeGreaterThan(0);
        const method = currency("apply_zana_influence");
        const condition = engine.validateTarget({
            groups: [],
            memoryStrands: { min: 80, max: 100 },
        });
        expect(calculateExact(engine, normal, method, condition).probability).toBeCloseTo(
            92 / 2255,
            12,
        );
        const hundred = engine.validateTarget({
            groups: [],
            memoryStrands: { min: 100, max: 100 },
        });
        expect(calculateExact(engine, normal, method, hundred).probability).toBeCloseTo(
            3 / 2255,
            12,
        );
        const random = seededRandom(42);
        vi.spyOn(random, "pick").mockImplementation((choices) => choices[0]!.value);
        const result = engine.apply({ ...normal, memoryStrands: 100 }, method, random);
        expect(result.item).toEqual({ ...normal, memoryStrands: 10 });
        expect(result.cost[0]).toMatchObject({ name: "Orb of Remembrance", amount: 1 });
    });

    it("rejects Remembrance on non-normal items, jewels, corruption and mirroring", () => {
        const method = currency("apply_zana_influence");
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        for (const item of [
            strength,
            { ...normal, rarity: "magic" as const },
            { ...normal, corrupted: true },
            { ...normal, mirrored: true },
            engine.createItem("Metadata/Items/Jewels/JewelInt"),
        ])
            expect(() => engine.apply(item, method, random)).toThrow();
        expect(pick).not.toHaveBeenCalled();
    });

    it("calculates a Remembrance retry loop using independent empirical rolls and actual spending", () => {
        const method = currency("apply_zana_influence");
        const condition = engine.validateTarget({
            groups: [],
            memoryStrands: { min: 80, max: 100 },
        });
        const project = craftingProjectSchema.parse({
            format: 1,
            game: catalog.game,
            patch: catalog.patch,
            item: normal,
            method,
            target: condition,
            steps: [{ id: "roll", method, condition, onSuccess: "success", onFailure: "roll" }],
            useProcess: true,
            prices: { [method.kind === "currency" ? method.id : ""]: 3 },
            seed: 42,
            iterations: 1000,
            maxActions: 2,
        });
        const exact = calculateProcessExact(engine, project, 20000);
        const chance = 92 / 2255;
        expect(exact.probability).toBeCloseTo(1 - (1 - chance) ** 2, 12);
        expect(exact.meanCost).toBeCloseTo(3 * (2 - chance), 12);
        const simulation = new CraftingSimulation(catalog, project);
        for (let index = 0; index < 1000; index++) simulation.runTrial();
        const result = simulation.result();
        expect(result.errors).toEqual({});
        expect(result.probability).toBeCloseTo(exact.probability, 1);
        expect(result.meanCost).toBeCloseTo(exact.meanCost!, 1);
        expect(result.spending[method.kind === "currency" ? method.id : ""]).toBe(
            result.totalActions,
        );
    }, 30000);

    it("applies strand filtering to additional essence rolls without altering the guaranteed tier", () => {
        const essence = catalog.crafting.essences.find(
            (entry) =>
                entry.level === 7 &&
                entry.mods.Amulet &&
                engine.mod(entry.mods.Amulet).generation_type === "prefix",
        )!;
        const random = seededRandom(1);
        vi.spyOn(random, "pick").mockImplementation(
            (choices) =>
                choices.find(
                    (entry) =>
                        typeof entry.value === "string" && /^FireResist\d$/.test(entry.value),
                )?.value ?? choices.at(-1)!.value,
        );
        const result = engine.apply(
            { ...normal, memoryStrands: 22 },
            { kind: "essence", id: essence.id },
            random,
        );
        expect(result.item.mods.some((entry) => entry.id === essence.mods.Amulet)).toBe(true);
        expect(result.item.mods.some((entry) => entry.id === "FireResist5")).toBe(true);
        expect(result.item.memoryStrands).toBeUndefined();
        expect(result.cost[0]).toMatchObject({ id: essence.id, amount: 1 });
    });

    it("uses build costs and retains the entire tail probability when strands reach zero", () => {
        expect(memoryConsumption(catalog, normal, currency("reroll_magic"))).toEqual({
            maximum: 8,
            exalt: false,
        });
        expect(memoryConsumption(catalog, normal, currency("mutated_add_mod_to_magic"))).toEqual({
            maximum: 32,
            exalt: false,
        });
        expect(
            memoryConsumption(catalog, normal, currency("mutated_upgrade_magic_to_rare")),
        ).toEqual({ maximum: 48, exalt: false });
        expect(memoryConsumption(catalog, normal, currency("transmute_to_rare"))).toEqual({
            maximum: 50,
            exalt: false,
        });
        const changed = {
            ...catalog,
            crafting: {
                ...catalog.crafting,
                memoryStrandCosts: { ...catalog.crafting.memoryStrandCosts, reroll_magic: 7 },
            },
        };
        expect(memoryConsumption(changed, normal, currency("reroll_magic"))!.maximum).toBe(14);
        expect(remainingStrandOutcomes(2, 8)).toEqual([
            { value: 2, weight: 1 },
            { value: 1, weight: 1 },
            { value: 0, weight: 7 },
        ]);
        expect(remainingStrandOutcomes(1, 8)).toEqual([
            { value: 1, weight: 1 },
            { value: 0, weight: 8 },
        ]);
        expect(remainingStrandOutcomes(10, 8).map((entry) => entry.value)).toEqual([
            10, 9, 8, 7, 6, 5, 4, 3, 2,
        ]);
        const filled = {
            ...empty,
            mods: pool.slice(0, 5).map((entry) => engine.rollMod(entry.id, seededRandom(1))),
        };
        expect(memoryConsumption(catalog, filled, currency("add_mod_to_rare"))).toEqual({
            maximum: 34,
            exalt: true,
        });
        expect(memoryConsumption(catalog, filled, currency("mutated_add_mod_to_rare"))).toEqual({
            maximum: 62,
            exalt: true,
        });
    });

    it.each([
        ["transmute_to_magic", "normal", "FireResist5"],
        ["reroll_magic", "magic", "FireResist5"],
        ["add_mod_to_magic", "magic", "FireResist5"],
        ["upgrade_magic_to_rare", "magic", "FireResist5"],
        ["transmute_to_rare", "normal", "FireResist5"],
        ["reroll", "rare", "FireResist5"],
        ["add_mod_to_rare", "rare", "FireResist5"],
        ["mutated_add_mod_to_magic", "magic", "FireResist6"],
        ["mutated_upgrade_magic_to_rare", "magic", "FireResist6"],
        ["mutated_add_mod_to_rare", "rare", "FireResist6"],
    ] as const)("%s filters using starting strands then consumes once", (action, rarity, expected) => {
        const item = { ...normal, rarity, memoryStrands: 22 };
        const random = seededRandom(1);
        const pick = vi
            .spyOn(random, "pick")
            .mockImplementation(
                (choices) =>
                    choices.find(
                        (entry) =>
                            typeof entry.value === "string" && /^FireResist\d$/.test(entry.value),
                    )?.value ?? choices.at(-1)!.value,
            );
        const result = engine.apply(item, currency(action), random);
        expect(result.item.mods.some((entry) => entry.id === expected)).toBe(true);
        const maximum = memoryConsumption(catalog, item, currency(action))!.maximum;
        expect(result.item.memoryStrands ?? 0).toBe(Math.max(0, 22 - maximum));
        const consumptionCalls = pick.mock.calls.filter(
            ([choices]) =>
                choices.every((entry) => typeof entry.value === "number") &&
                choices.some((entry) => entry.value === 22),
        );
        expect(consumptionCalls).toHaveLength(1);
        expect(item.memoryStrands).toBe(22);
    });

    it("enumerates strand spending even without stat-roll conditions", () => {
        const item = { ...normal, rarity: "magic" as const, memoryStrands: 1 };
        const condition = engine.validateTarget({ groups: [], memoryStrands: { min: 0, max: 0 } });
        expect(
            calculateExact(engine, item, currency("add_mod_to_magic"), condition).probability,
        ).toBeCloseTo(8 / 9, 12);
        expect(
            calculateExact(engine, item, currency("mutated_add_mod_to_magic"), condition)
                .probability,
        ).toBeCloseTo(32 / 33, 12);
    });

    it.each([
        "add_mod_to_rare_eldritch",
        "reroll_rare_eldritch",
        "reroll_rare_veiled",
    ])("%s applies strand filtering to the ordinary pool", (action) => {
        let item = engine.validateItem({
            ...engine.createItem("Metadata/Items/Armours/BodyArmours/BodyStr1"),
            rarity: "rare",
        });
        if (action.includes("eldritch"))
            item = engine.apply(
                item,
                currency("add_great_tangle_implicit_2"),
                seededRandom(1),
            ).item;
        item = { ...item, memoryStrands: 82 };
        const random = seededRandom(1);
        vi.spyOn(random, "pick").mockImplementation(
            (choices) =>
                choices.find(
                    (entry) =>
                        typeof entry.value === "string" && /^FireResist\d$/.test(entry.value),
                )?.value ?? choices.at(-1)!.value,
        );
        const result = engine.apply(item, currency(action), random);
        expect(result.item.mods.some((entry) => entry.id === "FireResist7")).toBe(true);
        expect(result.item.memoryStrands).toBe(
            action === "add_mod_to_rare_eldritch" ? 66 : action === "reroll_rare_eldritch" ? 22 : 2,
        );
    });

    it("reproduces every supplied tier breakpoint and its preceding strand count", () => {
        const rows = [
            [1, 9, 8, 7, 7, 6, 5, 5, 4, 3, 3, 2, 1],
            [2, 8, 0, 0, 6, 0, 0, 4, 0, 0, 2, 0, 0],
            [4, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            [6, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0],
            [8, 0, 0, 6, 0, 0, 0, 0, 3, 0, 0, 0, 0],
            [10, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            [12, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0],
            [14, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0],
            [15, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            [22, 6, 0, 5, 0, 4, 0, 3, 0, 2, 0, 1, 0],
            [30, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            [32, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0],
            [35, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0],
            [38, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            [42, 0, 0, 4, 0, 0, 0, 0, 2, 0, 0, 0, 0],
            [48, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0],
            [52, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            [62, 4, 0, 0, 3, 0, 0, 2, 0, 0, 1, 0, 0],
            [75, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            [82, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0],
            [88, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            [102, 3, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0],
            [122, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0],
        ];
        for (const [strands, ...tiers] of rows)
            for (const [index, tier] of tiers.entries()) {
                if (!tier) continue;
                expect(memoryTierCount(13 - index, strands!)).toBe(tier);
                expect(memoryTierCount(13 - index, strands! - 1)).toBeGreaterThan(tier);
            }
        for (let total = 1; total <= 13; total++) {
            expect(memoryTierCount(total, 0)).toBe(total);
            expect(memoryTierCount(total, 0, true)).toBe(memoryTierCount(total, 11));
            for (let strands = 1; strands <= 100; strands++)
                expect(memoryTierCount(total, strands, true)).toBe(
                    memoryTierCount(total, strands + 30),
                );
        }
    });

    it("filters eligible tiers without changing weights or the unfiltered cache", () => {
        const resistance = pool.filter((entry) => entry.mod.type === "FireResistance");
        expect(resistance).toHaveLength(8);
        expect(memoryTierPool(resistance, 82).map((entry) => entry.id)).toEqual([
            "FireResist7",
            "FireResist8",
        ]);
        const reduced = engine.pool(empty, { memoryStrands: 82 });
        expect(reduced.filter((entry) => entry.mod.type === "FireResistance")).toEqual(
            resistance.slice(-2),
        );
        expect(engine.pool(empty)).toEqual(pool);
        const low = { ...empty, level: 22 };
        const available = engine.pool(low).filter((entry) => entry.mod.type === "Strength");
        expect(available).toHaveLength(3);
        expect(
            engine
                .pool(low, { memoryStrands: 22 })
                .filter((entry) => entry.mod.type === "Strength")
                .map((entry) => entry.id),
        ).toEqual(["Strength3"]);
    });

    it("uses extracted side totals, excludes Royale and reproduces the 32-strand guarantee", () => {
        expect(pool.some((entry) => entry.id.includes("Royale"))).toBe(false);
        expect(
            pool
                .filter((entry) => entry.mod.generation_type === "suffix")
                .reduce((sum, entry) => sum + entry.weight, 0),
        ).toBe(125250);
        for (const strands of [15, 31, 32]) {
            const item = { ...strength, memoryStrands: strands };
            const anyUpgrade = engine.validateTarget({
                groups: [{ mods: Array.from({ length: 8 }, (_, index) => `Strength${index + 2}`) }],
            });
            expect(calculateExact(engine, item, unravel, anyUpgrade).probability).toBeCloseTo(
                Math.min(1, (strands * 8000) / 250500),
                12,
            );
            expect(calculateExact(engine, item, unravel, target).probability).toBeCloseTo(
                Math.min(1, (strands * 8000) / 250500) / 36,
                12,
            );
        }
        const current = pool.find((entry) => entry.id === "Strength1")!;
        expect(unravellingOutcomes(current, pool, 32).map((entry) => entry.weight)).toEqual(
            Array.from({ length: 8 }, (_, index) => (index + 1) / 36),
        );
    });

    it("uses cumulative unequal weights and extracted wand generation weights", () => {
        const wand = {
            ...engine.createItem("Metadata/Items/Weapons/OneHandWeapons/Wands/Wand1"),
            rarity: "rare" as const,
        };
        const candidates = engine.pool(wand);
        expect(
            candidates.find((entry) => entry.id === "LocalIncreasedPhysicalDamagePercent1")!.weight,
        ).toBe(500);
        const current = candidates.find((entry) => entry.id === "SpellAddedLightningDamage6");
        expect(current).toBeDefined();
        const outcomes = unravellingOutcomes(current!, candidates, 100);
        const higher = outcomes.filter((entry) => entry.value !== current!.id);
        const total = higher.reduce((sum, entry) => sum + entry.weight, 0);
        expect(higher).toHaveLength(3);
        for (const [index, expected] of [60 / 1480, 310 / 1480, 1110 / 1480].entries())
            expect(higher[index]!.weight / total).toBeCloseTo(expected, 12);
    });

    it("calculates each explicit independently using the complete side pool", () => {
        const both = engine.addStartingMod(strength, "Dexterity1", seededRandom(1));
        const item = { ...both, memoryStrands: 15 };
        const two = engine.validateTarget({
            groups: [{ mods: ["Strength9"] }, { mods: ["Dexterity9"] }],
        });
        const chance = (15 * 8000) / 250500 / 36;
        expect(calculateExact(engine, item, unravel, two).probability).toBeCloseTo(chance ** 2, 12);
        const full = engine.pool({ ...empty, influences: [0] });
        const increased = full
            .filter((entry) => entry.mod.generation_type === "suffix")
            .reduce((sum, entry) => sum + entry.weight, 0);
        expect(increased).toBeGreaterThan(125250);
        expect(
            calculateExact(
                engine,
                { ...strength, influences: [0], memoryStrands: 15 },
                unravel,
                target,
            ).probability,
        ).toBeCloseTo((15 * 8000) / (2 * increased) / 36, 12);
    });

    it("consumes all strands, preserves unchanged values and fractures, and charges one orb", () => {
        const item = { ...strength, memoryStrands: 1 };
        const random = seededRandom(1);
        vi.spyOn(random, "pick").mockImplementation((choices) => choices.at(-1)!.value);
        const result = engine.apply(item, unravel, random);
        expect(result.item.memoryStrands).toBeUndefined();
        expect(result.item.mods).toEqual(item.mods);
        expect(result.cost).toEqual([
            {
                id: unravel.kind === "currency" ? unravel.id : "",
                name: "Orb of Unravelling",
                amount: 1,
            },
        ]);
        const fractured = structuredClone(item);
        fractured.mods[0]!.fractured = true;
        expect(engine.apply(fractured, unravel, seededRandom(1)).item.mods).toEqual(fractured.mods);
        expect(item.memoryStrands).toBe(1);
        expect(() => engine.apply(result.item, unravel, random)).toThrow("memory strands");
    });

    it("rejects unmodeled special tiers before making random decisions", () => {
        const item = { ...strength, memoryStrands: 32 };
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        const recipe = engine
            .recipePool(item, "bench")
            .find((entry) => entry.mod.generation_type === "prefix")!;
        const crafted = engine.addStartingMod(item, recipe.id, seededRandom(1));
        expect(() => engine.apply(crafted, unravel, random)).toThrow("special or crafted");
        expect(pick).not.toHaveBeenCalled();
    });

    it("preserves memory strands in text, projects, imprints and non-consuming crafts", () => {
        const item = { ...strength, memoryStrands: 32 };
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, item))[0]!.item,
        ).toEqual(item);
        const snapshot = engine.apply(item, currency("inital_imprint"), seededRandom(1)).item;
        const upgraded = engine.apply(snapshot, unravel, seededRandom(1)).item;
        expect(engine.apply(upgraded, currency("restore_imprint"), seededRandom(1)).item).toEqual(
            item,
        );
        expect(
            engine.apply(item, currency("convert_to_normal"), seededRandom(1)).item.memoryStrands,
        ).toBe(32);
        for (const count of [-1, 1.5, 101])
            expect(() => engine.validateItem({ ...item, memoryStrands: count })).toThrow();
        for (const text of [
            "Memory Strands: 2.5",
            "Memory Strands: -1",
            "Memory Strands: 101",
            "Memory Strands: 32\nMemory Strands: 32",
        ])
            expect(() =>
                importCraftingItemText(
                    engine,
                    exportCraftingItemText(engine, item).replace("Memory Strands: 32", text),
                ),
            ).toThrow();
        expect(() =>
            engine.validateItem({
                ...engine.createItem("Metadata/Items/Jewels/JewelInt"),
                memoryStrands: 1,
            }),
        ).toThrow("equipment");
    });

    it("supports strand-only process conditions, exact costs and seeded simulations", () => {
        const condition = engine.validateTarget({ groups: [], memoryStrands: { min: 0, max: 0 } });
        const project = craftingProjectSchema.parse({
            format: 1,
            game: catalog.game,
            patch: catalog.patch,
            item: { ...strength, memoryStrands: 32 },
            method: unravel,
            target: condition,
            steps: [
                {
                    id: "unravel",
                    method: unravel,
                    condition,
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
            prices: { [unravel.kind === "currency" ? unravel.id : ""]: 3 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
            useProcess: true,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBeCloseTo(1, 12);
        expect(exact.meanCost).toBeCloseTo(3, 12);
        const simulation = new CraftingSimulation(catalog, project);
        for (let trial = 0; trial < 1000; trial++) simulation.runTrial();
        expect(simulation.result().successes).toBe(1000);
        expect(simulation.result().meanCost).toBe(3);
        expect(engine.matches(project.item, condition)).toBe(false);
        const poe2 = new CraftingEngine(
            craftingCatalogSchema.parse(
                JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
            ),
        );
        expect(() => poe2.validateTarget(condition)).toThrow("PoE 1");
        expect(() =>
            engine.validateTarget({ groups: [], memoryStrands: { min: 2, max: 1 } }),
        ).toThrow();
    });

    it("enables the three extracted Foulborn currencies with the supplied zero-strand tier rating", () => {
        const outcomes = new Set(engine.pool(empty, { foulborn: true }).map((entry) => entry.id));
        for (const [action, rarity] of [
            ["mutated_add_mod_to_magic", "magic"],
            ["mutated_upgrade_magic_to_rare", "magic"],
            ["mutated_add_mod_to_rare", "rare"],
        ] as const) {
            for (let seed = 0; seed < 50; seed++) {
                const result = engine.apply(
                    { ...normal, rarity },
                    currency(action),
                    seededRandom(seed),
                );
                expect(result.item.mods).toHaveLength(1);
                expect(outcomes.has(result.item.mods[0]!.id)).toBe(true);
            }
        }
    });
});

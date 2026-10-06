import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { FossilOptimizer } from "../app/lib/crafting-optimizer";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import {
    type CraftingMethod,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const opulent = catalog.crafting.fossils.find((entry) => entry.effects.includes("NoTagless"))!;
const fractured = catalog.crafting.fossils.find((entry) => entry.effects.includes("Fracture"))!;
const method = (ids: string[], normal = false): Extract<CraftingMethod, { kind: "fossils" }> => ({
    kind: "fossils",
    ids,
    resonator: catalog.crafting.currencies.find(
        (entry) =>
            entry.action === (normal ? "delve_currency_upgrade" : "delve_currency_reroll") &&
            entry.id.endsWith(String(ids.length)),
    )!.id,
    logic: "additive",
});
const blank = () => ({ ...engine.createItem(baseId), rarity: "rare" as const });

describe("extracted special fossils", () => {
    it("uses fractured modifier requirements in PoE 2 exact and sampled calculations", () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const crafting = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, entry]) => entry.name === "Rusted Cuirass",
        )![0];
        const action = (name: string) => ({
            kind: "currency" as const,
            id: data.crafting.currencies.find((entry) => entry.action === name)!.id,
        });
        const item = crafting.apply(
            crafting.createItem(base),
            action("transmute_to_rare"),
            seededRandom(1),
        ).item;
        const target = crafting.validateTarget({
            groups: [{ mods: [item.mods[0]!.id], fractured: true }],
        });
        const fracture = action("fracture_random_mod");
        expect(crafting.matches(item, target)).toBe(false);
        expect(calculateExact(crafting, item, fracture, target).probability).toBeCloseTo(
            1 / item.mods.length,
        );
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: data.patch,
            item,
            target,
            method: fracture,
            steps: [],
            prices: { [fracture.id]: 3 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const simulation = new CraftingSimulation(data, project, false);
        for (let trial = 0; trial < 1000; trial++) simulation.runTrial();
        expect(simulation.result().probability).toBeCloseTo(1 / item.mods.length, 1);
        expect(simulation.result()).toMatchObject({ errors: {}, meanCost: 3 });
    });

    it("blocks tagless natural rolls, boosts drop weights and composes with other fossils", () => {
        const item = blank();
        const natural = engine.pool(item);
        const filtered = engine.pool(item, { fossils: [opulent.id] });
        expect(natural.some((entry) => !entry.mod.implicit_tags.length)).toBe(true);
        expect(filtered.length).toBeGreaterThan(0);
        expect(filtered.every((entry) => entry.mod.implicit_tags.length)).toBe(true);
        const ring = {
            ...engine.createItem("Metadata/Items/Rings/Ring1"),
            rarity: "rare" as const,
        };
        const drop = engine
            .pool(ring, { fossils: [opulent.id] })
            .find((entry) => entry.mod.implicit_tags.includes("drop"))!;
        expect(drop.weight).toBe(
            engine.pool(ring).find((entry) => entry.id === drop.id)!.weight * 10,
        );
        const pristine = catalog.crafting.fossils.find(
            (entry) => entry.name === "Pristine Fossil",
        )!;
        const combined = engine.pool(item, { fossils: [opulent.id, pristine.id] });
        expect(combined.every((entry) => entry.mod.implicit_tags.length)).toBe(true);
        expect(combined.every((entry) => !entry.mod.implicit_tags.includes("defences"))).toBe(true);
        for (let seed = 0; seed < 30; seed++) {
            const result = engine.apply(
                item,
                method([opulent.id, pristine.id]),
                seededRandom(seed),
            );
            expect(
                result.item.mods.every((entry) => engine.mod(entry.id).implicit_tags.length),
            ).toBe(true);
        }
    });

    it("preserves an existing tagless fracture while rerolling the other modifiers", () => {
        const item = blank();
        item.mods = [engine.rollMod("StunRecovery1", seededRandom(1), { fractured: true })];
        const result = engine.apply(item, method([opulent.id]), seededRandom(2));
        expect(result.item.mods[0]).toEqual(item.mods[0]);
        expect(
            result.item.mods.slice(1).every((entry) => engine.mod(entry.id).implicit_tags.length),
        ).toBe(true);
    });

    it.each([
        false,
        true,
    ])("rerolls then fractures one uniformly selected modifier (normal=%s)", (normal) => {
        const item = normal ? engine.createItem(baseId) : blank();
        const before = structuredClone(item);
        const selected = method([opulent.id, fractured.id], normal);
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        const result = engine.apply(item, selected, random);
        expect(item).toEqual(before);
        expect(result.item.rarity).toBe("rare");
        expect(result.item.mods.filter((entry) => entry.fractured)).toHaveLength(1);
        expect(result.item.mods.every((entry) => engine.mod(entry.id).implicit_tags.length)).toBe(
            true,
        );
        const last = pick.mock.calls.at(-1)![0];
        expect(last).toHaveLength(result.item.mods.length);
        expect(last.every((choice) => choice.weight === 1)).toBe(true);
        expect(result.cost.map((entry) => entry.id)).toEqual([...selected.ids, selected.resonator]);
        expect(engine.validateItem(result.item)).toEqual(result.item);
        const imported = importCraftingItemText(
            engine,
            exportCraftingItemText(engine, result.item),
        )[0]!.item;
        expect(imported.mods.map(({ id, fractured }) => ({ id, fractured }))).toEqual(
            result.item.mods.map(({ id, fractured }) => ({ id, fractured })),
        );
        const retained = result.item.mods.find((entry) => entry.fractured)!;
        expect(
            engine.apply(result.item, currency("reroll"), seededRandom(5)).item.mods,
        ).toContainEqual(retained);
    });

    it("rejects existing fractures, added and innate influences, and non-fracturable classes before rolling", () => {
        const already = blank();
        already.mods = [engine.rollMod("IncreasedLife1", seededRandom(1), { fractured: true })];
        const astrolabe = Object.entries(catalog.bases).find(([, base]) =>
            base.implicits.some((id) =>
                engine
                    .mod(id)
                    .stats.some((stat) => stat.id === "local_item_can_roll_all_influences"),
            ),
        )![0];
        const ineligible = Object.entries(catalog.bases).find(
            ([, base]) =>
                base.rarities.includes("rare") &&
                !base.corrupted &&
                !catalog.crafting.classes[base.item_class]?.fracture,
        )![0];
        for (const item of [
            already,
            { ...blank(), influences: [0] },
            { ...engine.createItem(astrolabe), rarity: "rare" as const },
            { ...engine.createItem(ineligible), rarity: "rare" as const },
        ]) {
            expect(engine.availableFossils(item)).not.toContainEqual(fractured);
            const random = seededRandom(1);
            const pick = vi.spyOn(random, "pick");
            expect(() => engine.apply(item, method([fractured.id]), random)).toThrow(
                "fracturable base",
            );
            expect(pick).not.toHaveBeenCalled();
        }
    });

    it("requires the matching modifier to be fractured, including in exact currency calculations", () => {
        const item = blank();
        item.mods = [
            "IncreasedLife1",
            "LocalIncreasedPhysicalDamageReductionRating1",
            "ColdResist1",
            "FireResist1",
        ].map((id) => engine.rollMod(id, seededRandom(1)));
        const target = engine.validateTarget({
            groups: [{ mods: ["IncreasedLife1"], fractured: true }],
        });
        expect(engine.matches(item, target)).toBe(false);
        expect(
            engine.matches(item, engine.validateTarget({ groups: [{ mods: ["IncreasedLife1"] }] })),
        ).toBe(true);
        item.mods[1]!.fractured = true;
        expect(engine.matches(item, target)).toBe(false);
        item.mods[1]!.fractured = false;
        expect(
            calculateExact(engine, item, currency("fracture_random_mod"), target).probability,
        ).toBeCloseTo(0.25);
        item.mods[0]!.fractured = true;
        expect(engine.matches(item, target)).toBe(true);
        expect(
            engine.matches(
                item,
                engine.validateTarget({
                    groups: [
                        { mods: ["IncreasedLife1", "ColdResist1"], minimum: 2, fractured: true },
                    ],
                }),
            ),
        ).toBe(false);
    });

    it("shares fracture requirements across exact processes, seeded trials, costs and optimization", () => {
        const ids = [
            "IncreasedLife1",
            "LocalIncreasedPhysicalDamageReductionRating1",
            "ColdResist1",
            "FireResist1",
        ];
        const reduced = {
            ...catalog,
            mods: Object.fromEntries(ids.map((id) => [id, catalog.mods[id]!])),
        };
        const crafting = new CraftingEngine(reduced);
        const selected = method([opulent.id, fractured.id]);
        const target = crafting.validateTarget({ groups: [{ mods: [ids[0]], fractured: true }] });
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: blank(),
            target,
            method: selected,
            steps: [{ id: "fracture", method: selected, condition: target }],
            prices: Object.fromEntries([...selected.ids, selected.resonator].map((id) => [id, 2])),
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        expect(calculateExact(crafting, project.item, selected, target).probability).toBeCloseTo(
            0.25,
        );
        expect(calculateProcessExact(crafting, project)).toMatchObject({
            probability: expect.closeTo(0.25),
            meanCost: expect.closeTo(6),
        });
        const simulation = new CraftingSimulation(reduced, project, true);
        for (let trial = 0; trial < 1000; trial++) simulation.runTrial();
        expect(simulation.result().probability).toBeCloseTo(0.25, 1);
        expect(simulation.result()).toMatchObject({
            errors: {},
            meanCost: 6,
            spending: Object.fromEntries(
                [...selected.ids, selected.resonator].map((id) => [id, 1000]),
            ),
        });
        const optimizer = new FossilOptimizer(crafting, project.item, target, project.prices, 42, {
            fossils: selected.ids,
            maxSockets: 2,
            trials: 100,
            logic: "additive",
        });
        while (!optimizer.runBatch()) {
            /* complete bounded batches */
        }
        expect(optimizer.result()).toMatchObject({ completed: 3, failed: 0, errors: [] });
        expect(
            optimizer.result().byAttempts.find((entry) => entry.method.ids.length === 2)
                ?.probability,
        ).toBeGreaterThan(0);
        expect(
            optimizer
                .result()
                .byAttempts.find(
                    (entry) => entry.method.ids.length === 1 && entry.method.ids[0] === opulent.id,
                )?.probability,
        ).toBe(0);
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });
});

import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { FossilOptimizer } from "../app/lib/crafting-optimizer";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { type CraftingMethod, craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, engine } from "./crafting-fixtures";

const fossil = (name: string) =>
    catalog.crafting.fossils.find((entry) => entry.name === `${name} Fossil`)!;
const glyphic = fossil("Glyphic");
const craft = (
    names: string[] = [],
    normal = false,
): Extract<CraftingMethod, { kind: "fossils" }> => ({
    kind: "fossils",
    ids: [glyphic.id, ...names.map((name) => fossil(name).id)],
    resonator: catalog.crafting.currencies.find(
        (entry) =>
            entry.action === (normal ? "delve_currency_upgrade" : "delve_currency_reroll") &&
            entry.id.endsWith(String(names.length + 1)),
    )!.id,
    logic: "additive",
});
const blank = () => ({ ...engine.createItem(baseId), rarity: "rare" as const });
const bodyMods = catalog.crafting.essences
    .filter((entry) => entry.corrupted)
    .map((entry) => entry.mods["Body Armour"]!);
const critical = bodyMods.find((id) => engine.mod(id).implicit_tags.includes("critical"))!;

describe("Glyphic Fossil", () => {
    it("resolves every supported class guarantee from corrupted essence records without an item-level floor", () => {
        const classes = new Set(
            catalog.crafting.essences
                .filter((entry) => entry.corrupted)
                .flatMap((entry) => Object.keys(entry.mods)),
        );
        expect(classes.size).toBeGreaterThan(20);
        for (const itemClass of classes) {
            const base = Object.entries(catalog.bases).find(
                ([, entry]) =>
                    entry.item_class === itemClass &&
                    !entry.corrupted &&
                    entry.rarities.includes("rare"),
            );
            if (!base) continue;
            const item = { ...engine.createItem(base[0]), level: 1 };
            const pool = engine.corruptedEssencePool(item);
            const expected = catalog.crafting.essences
                .filter((entry) => entry.corrupted)
                .map((entry) => entry.mods[itemClass])
                .filter(Boolean);
            expect(pool.map((entry) => entry.id)).toEqual([...new Set(expected)]);
            expect(pool.every((entry) => entry.weight === 1)).toBe(true);
            expect(engine.availableFossils(item)).toContainEqual(glyphic);
            const result = engine.apply(item, craft([], true), seededRandom(42));
            expect(result.item.mods.filter((entry) => expected.includes(entry.id))).toHaveLength(1);
            expect(result.item.corrupted).toBe(false);
        }
    });

    it("applies extracted fossil exclusions and weights to the separate guarantee pool", () => {
        const item = blank();
        expect(engine.corruptedEssencePool(item)).toHaveLength(4);
        const options = (names: string[]) => ({
            fossils: craft(names).ids,
            logic: "additive" as const,
        });
        const opulent = engine.corruptedEssencePool(item, options(["Opulent"]));
        expect(opulent.map((entry) => entry.id)).toEqual(
            bodyMods.filter((id) => engine.mod(id).implicit_tags.length),
        );
        expect(
            engine
                .corruptedEssencePool(item, options(["Opulent", "Jagged"]))
                .map((entry) => entry.id),
        ).toEqual([critical]);
        const boosted = engine.corruptedEssencePool(item, options(["Opulent", "Aberrant"]));
        expect(boosted.find((entry) => entry.mod.implicit_tags.includes("chaos"))?.weight).toBe(10);
        expect(boosted.find((entry) => entry.id === critical)?.weight).toBe(1);
        const gloves = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "Gloves" && !base.corrupted,
        )![0];
        const glovesItem = { ...engine.createItem(gloves), rarity: "rare" as const };
        const pair = options(["Scorched", "Prismatic"]);
        const fire = engine
            .corruptedEssencePool(glovesItem, pair)
            .find((entry) => entry.mod.implicit_tags.includes("fire"))!;
        expect(fire.weight).toBe(16);
        expect(
            engine
                .corruptedEssencePool(glovesItem, { ...pair, logic: "multiplicative" })
                .find((entry) => entry.id === fire.id)?.weight,
        ).toBe(60);
    });

    it("preserves fractures, excludes their groups and does not treat the old unfractured modifiers as blockers", () => {
        const item = blank();
        item.mods = [engine.rollMod(bodyMods[0]!, seededRandom(1), { fractured: true })];
        expect(engine.corruptedEssencePool(item).map((entry) => entry.id)).not.toContain(
            bodyMods[0],
        );
        const result = engine.apply(item, craft(), seededRandom(3));
        expect(result.item.mods).toContainEqual(item.mods[0]);
        expect(result.item.mods.filter((entry) => bodyMods.includes(entry.id))).toHaveLength(2);
        const ordinary = blank();
        ordinary.mods = [engine.rollMod(critical, seededRandom(1))];
        const replaced = engine.apply(ordinary, craft(["Opulent", "Jagged"]), seededRandom(2));
        expect(replaced.item.mods.filter((entry) => entry.id === critical)).toHaveLength(1);
    });

    it("reserves slots for Hollow's forced modifier and allows the resulting essence modifier to fracture", () => {
        const selected = craft(["Hollow", "Fractured"]);
        const forced = fossil("Hollow").forced;
        for (let seed = 0; seed < 12; seed++) {
            const result = engine.apply(blank(), selected, seededRandom(seed));
            expect(result.item.mods.filter((entry) => bodyMods.includes(entry.id))).toHaveLength(1);
            expect(result.item.mods.filter((entry) => entry.fractured)).toHaveLength(1);
            for (const id of forced)
                expect(result.item.mods.some((entry) => entry.id === id)).toBe(true);
            expect(engine.validateItem(result.item)).toEqual(result.item);
        }
        const random = seededRandom(2);
        vi.spyOn(random, "pick").mockImplementation((choices) => choices[0]!.value);
        const result = engine.apply(blank(), selected, random);
        expect(result.item.mods.find((entry) => entry.fractured)?.id).toBe(bodyMods[0]);
        const imported = importCraftingItemText(
            engine,
            exportCraftingItemText(engine, result.item),
        )[0]!.item;
        expect(imported.mods.map(({ id, fractured }) => ({ id, fractured }))).toEqual(
            result.item.mods.map(({ id, fractured }) => ({ id, fractured })),
        );
    });

    it("rejects a fully blocked guarantee and fully occupied suffixes before random selection", () => {
        const full = blank();
        full.mods = ["ColdResist1", "FireResist1", "LightningResist1"].map((id) =>
            engine.rollMod(id, seededRandom(1), { fractured: true }),
        );
        for (const [item, selected] of [
            [blank(), craft(["Opulent", "Jagged", "Fundamental"])],
            [full, craft()],
        ] as const) {
            const random = seededRandom(1);
            const pick = vi.spyOn(random, "pick");
            const integer = vi.spyOn(random, "integer");
            expect(() => engine.apply(item, selected, random)).toThrow(
                "No eligible corrupted essence",
            );
            expect(pick).not.toHaveBeenCalled();
            expect(integer).not.toHaveBeenCalled();
        }
        expect(engine.availableFossils(blank())).toContainEqual(fossil("Tangled"));
    });

    it("uses the same weighted guarantee in exact calculations, conditional simulation and optimization", () => {
        const ids = [
            ...bodyMods,
            "IncreasedLife1",
            "LocalIncreasedPhysicalDamageReductionRating1",
            "ColdResist1",
        ];
        const reduced = {
            ...catalog,
            mods: Object.fromEntries(ids.map((id) => [id, catalog.mods[id]!])),
        };
        const crafting = new CraftingEngine(reduced);
        const target = crafting.validateTarget({ groups: [{ mods: [critical] }] });
        for (const [names, probability] of [
            [[], 0.25],
            [["Opulent"], 0.5],
            [["Opulent", "Jagged"], 1],
        ] as const)
            expect(
                calculateExact(crafting, blank(), craft([...names]), target).probability,
            ).toBeCloseTo(probability);
        const method = craft(["Opulent"]);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: blank(),
            target,
            method,
            steps: [{ id: "glyphic", method, condition: target }],
            prices: Object.fromEntries([...method.ids, method.resonator].map((id) => [id, 2])),
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        expect(calculateProcessExact(crafting, project)).toMatchObject({
            probability: expect.closeTo(0.5),
            meanCost: expect.closeTo(6),
        });
        const simulation = new CraftingSimulation(reduced, project, true);
        for (let trial = 0; trial < 1000; trial++) simulation.runTrial();
        expect(simulation.result().probability).toBeCloseTo(0.5, 1);
        expect(simulation.result()).toMatchObject({
            errors: {},
            meanCost: 6,
            spending: Object.fromEntries([...method.ids, method.resonator].map((id) => [id, 1000])),
        });
        const optimizer = new FossilOptimizer(crafting, project.item, target, project.prices, 42, {
            fossils: method.ids,
            maxSockets: 2,
            trials: 100,
            logic: "additive",
        });
        while (!optimizer.runBatch()) {
            /* complete bounded batches */
        }
        expect(optimizer.result()).toMatchObject({ completed: 3, failed: 0, errors: [] });
        expect(optimizer.result().byAttempts[0]?.method.ids).toEqual(method.ids);
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });
});

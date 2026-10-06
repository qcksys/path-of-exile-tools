import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { availableOmens } from "../app/lib/crafting-omens";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { rolledModText, scaledModValues } from "../app/lib/crafting-text";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const vaal = {
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.id.endsWith("/CurrencyCorrupt"))!.id,
};
const omen = availableOmens(catalog, vaal)[0]!;
const withOmen = { ...vaal, omens: [omen.id] };
const base = (name: string) =>
    Object.entries(catalog.bases).find(([, entry]) => entry.name === name)![0];
const blank = (name = "Ruby") => engine.createItem(base(name));
const prepared = () =>
    engine.addStartingMod({ ...blank(), rarity: "rare" }, "JewelArmour", seededRandom(1));
function force(outcome: string, bound?: "min" | "max") {
    const random = seededRandom(42);
    vi.spyOn(random, "pick").mockImplementationOnce(
        (choices) => choices.find((entry) => entry.value === outcome)!.value,
    );
    if (bound)
        vi.spyOn(random, "integer").mockImplementation((min, max) => (bound === "min" ? min : max));
    return random;
}

describe("PoE 2 jewel Vaal Orbs", () => {
    it("uses both no-change entries, extracted implicit pools and the same omen cost on all eligible jewels", () => {
        for (const [id, base] of Object.entries(catalog.bases).filter(
            ([, entry]) => entry.item_class === "Jewel" && !entry.corrupted,
        )) {
            const item = engine.createItem(id);
            expect(engine.corruptionKind(item)).toBe("jewel");
            expect(engine.apply(item, vaal, force("none")).item).toEqual({
                ...item,
                corrupted: true,
            });
            expect(engine.apply(item, vaal, force("values")).item).toEqual({
                ...item,
                corrupted: true,
            });
            const pool = engine.corruptedModifiers(item);
            const result = engine.apply(item, withOmen, force("implicit"));
            expect(result.cost.map(({ id, amount }) => [id, amount])).toEqual([
                [vaal.id, 1],
                [omen.id, 1],
            ]);
            if (pool.length) {
                expect(pool.some((entry) => entry.id === result.item.implicits[0]!.id)).toBe(true);
                for (const entry of pool) {
                    expect(entry.mod.domain).toBe(base.domain);
                    expect(entry.weight).toBe(
                        ((entry.mod.spawn_weights.find((rule) => base.tags.includes(rule.tag))
                            ?.weight ?? 0) *
                            (entry.mod.generation_weights.find((rule) =>
                                base.tags.includes(rule.tag),
                            )?.weight ?? 100)) /
                            100,
                    );
                }
                const target = engine.validateTarget({
                    groups: [{ mods: pool.map((entry) => entry.id) }],
                });
                expect(calculateExact(engine, item, vaal, target).probability).toBeCloseTo(1 / 4);
                expect(calculateExact(engine, item, withOmen, target).probability).toBeCloseTo(
                    1 / 2,
                );
            } else expect(result.item.implicits).toEqual(item.implicits);
        }
    });

    it.each([
        "min",
        "max",
    ] as const)("rerolls raw values at the %s boundary, keeping extracted ranges and protected modifiers", (bound) => {
        let item = prepared();
        const suffix = engine.pool(item, { side: "suffix" })[0]!;
        item = engine.addStartingMod(item, suffix.id, seededRandom(1));
        item.mods[1]!.fractured = true;
        const original = structuredClone(item);
        const result = engine.apply(item, vaal, force("values", bound)).item;
        expect(result.mods[0]).toMatchObject({
            values: [bound === "min" ? 10 : 20],
            corruptionScale: bound === "min" ? 78 : 122,
        });
        expect(rolledModText(catalog, result.mods[0]!, result)).toBe(
            `${bound === "min" ? 8 : 24}% increased [Armour]`,
        );
        expect(result.mods[1]).toEqual(item.mods[1]);
        expect(result.implicits).toEqual(item.implicits);
        expect(result.corrupted).toBe(true);
        expect(result.rarity).toBe(item.rarity);
        expect(item).toEqual(original);
        expect(catalog.mods.JewelArmour!.stats[0]).toMatchObject({ min: 10, max: 20 });
    });

    it("shares one multiplier across hybrid stats and applies refined catalyst quality afterwards", () => {
        const radius = engine.addStartingMod(
            { ...blank("Time-Lost Ruby"), rarity: "rare" },
            "JewelRadiusMediumSize",
            seededRandom(1),
        );
        const random = force("values", "max");
        const result = engine.apply(radius, vaal, random).item;
        expect(result.mods[0]!.values).toEqual([150, 1]);
        expect(result.mods[0]!.corruptionScale).toBe(122);
        expect(scaledModValues(catalog, result.mods[0]!, result)).toEqual([183, 1]);
        expect(
            vi.mocked(random.integer).mock.calls.filter(([min, max]) => min === 78 && max === 122),
        ).toHaveLength(1);
        const catalyst = catalog.crafting.catalysts.find(
            (entry) => entry.itemClasses.includes("Jewel") && entry.tags.includes("defences"),
        )!;
        expect(catalyst).toBeDefined();
        const item = { ...prepared(), catalyst: { id: catalyst.id, quality: 20 } };
        const polished = engine.apply(item, vaal, force("values", "max")).item;
        expect(polished.catalyst).toEqual(item.catalyst);
        expect(scaledModValues(catalog, polished.mods[0]!, polished)).toEqual([28]);
        expect(rolledModText(catalog, polished.mods[0]!, polished)).toBe("28% increased [Armour]");
    });

    it("retains emotion affix-capacity modifiers and all existing jewel affixes", () => {
        let item = engine.validateItem({ ...blank(), rarity: "rare" });
        item = engine.addStartingMod(
            item,
            "CraftedJewelAdditionalPrefixAllowed",
            seededRandom(1),
            "emotion",
        );
        for (const side of ["prefix", "prefix", "prefix", "suffix"])
            item = engine.addStartingMod(item, engine.pool(item, { side })[0]!.id, seededRandom(2));
        const result = engine.apply(item, vaal, force("values", "max")).item;
        expect(result.mods.map((entry) => entry.id)).toEqual(item.mods.map((entry) => entry.id));
        expect(result.mods).toHaveLength(5);
        expect(result.mods[0]).toMatchObject({
            id: "CraftedJewelAdditionalPrefixAllowed",
            corruptionScale: 122,
        });
        expect(engine.validateItem(result)).toEqual(result);
    });

    it("rejects forged scaling on uncorrupted items, other games, implicits, fractures and out-of-range rolls", () => {
        const item = engine.apply(prepared(), vaal, force("values", "max")).item;
        const invalid = [
            { ...item, corrupted: false },
            { ...item, mods: [{ ...item.mods[0], corruptionScale: 77 }] },
            { ...item, mods: [{ ...item.mods[0], corruptionScale: 123 }] },
            { ...item, mods: [{ ...item.mods[0], corruptionScale: 100.5 }] },
            { ...item, mods: [{ ...item.mods[0], values: [24] }] },
            { ...item, mods: [{ ...item.mods[0], fractured: true }] },
            { ...item, mods: [{ ...item.mods[0], sanctification: 100 }] },
        ];
        for (const value of invalid) expect(() => engine.validateItem(value)).toThrow();
        const implicit = engine.apply(blank(), vaal, force("implicit")).item;
        implicit.implicits[0]!.corruptionScale = 100;
        expect(() => engine.validateItem(implicit)).toThrow("Corruption value multipliers");
        const equipment = engine.addStartingMod(
            { ...engine.createItem(base("Rusted Cuirass")), rarity: "rare" },
            "IncreasedLife1",
            seededRandom(1),
        );
        equipment.corrupted = true;
        equipment.mods[0]!.corruptionScale = 100;
        expect(() => engine.validateItem(equipment)).toThrow("Corruption value multipliers");
        const poe1 = new CraftingEngine(
            craftingCatalogSchema.parse(
                JSON.parse(readFileSync("public/game-data/crafting-poe1.json", "utf8")),
            ),
        );
        const ruby = poe1.createItem(
            Object.entries(poe1.catalog.bases).find(
                ([, entry]) =>
                    entry.item_class === "Jewel" &&
                    entry.rarities.includes("rare") &&
                    !entry.corrupted,
            )![0],
        );
        const mod = poe1.pool({ ...ruby, rarity: "rare" })[0]!;
        const old = poe1.addStartingMod({ ...ruby, rarity: "rare" }, mod.id, seededRandom(1));
        old.corrupted = true;
        old.mods[0]!.corruptionScale = 100;
        expect(() => poe1.validateItem(old)).toThrow("Corruption value multipliers");
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        expect(() => engine.apply(item, vaal, random)).toThrow("uncorrupted");
        expect(pick).not.toHaveBeenCalled();
    });

    it("round-trips displayed values above and below natural ranges, warning when raw rolls are ambiguous", () => {
        for (const bound of ["min", "max"] as const) {
            const item = engine.apply(prepared(), vaal, force("values", bound)).item;
            expect(engine.validateItem(JSON.parse(JSON.stringify(item)))).toEqual(item);
            const text = exportCraftingItemText(engine, item);
            const matches = importCraftingItemText(engine, text);
            expect(matches.length).toBeGreaterThan(0);
            const imported = matches[0]!;
            expect(imported.item.corrupted).toBe(true);
            expect(imported.warnings.length).toBeGreaterThan(0);
            expect(exportCraftingItemText(engine, imported.item)).toBe(text);
            expect(() => importCraftingItemText(engine, text.replace("\nCorrupted", ""))).toThrow();
        }
    });

    it("enumerates numeric targets and conditional routes with the same distribution and costs as sampling", () => {
        const item = prepared();
        const target = engine.validateTarget({
            groups: [],
            stats: [{ id: "physical_damage_reduction_rating_+%", min: 24 }],
        });
        // Only raw 20 with 118–122% reaches 24: five of 11 × 45 value outcomes.
        for (const method of [vaal, withOmen]) {
            const probability = 5 / (11 * 45 * (method === vaal ? 4 : 2));
            expect(calculateExact(engine, item, method, target, 10000).probability).toBeCloseTo(
                probability,
            );
            const project = craftingProjectSchema.parse({
                format: 1,
                game: "poe2",
                patch: catalog.patch,
                item,
                method,
                target,
                steps: [{ id: "vaal", method, condition: target }],
                prices: { [vaal.id]: 2, [omen.id]: 3 },
                seed: 42,
                iterations: 3000,
                maxActions: 1,
            });
            expect(
                calculateProcessExact(engine, { ...project, useProcess: true }, 10000),
            ).toMatchObject({
                probability: expect.closeTo(probability),
                meanCost: expect.closeTo(method === vaal ? 2 : 5),
            });
            const simulation = new CraftingSimulation(catalog, project);
            for (let index = 0; index < project.iterations; index++) simulation.runTrial();
            const sampled = simulation.result();
            expect(sampled.errors).toEqual({});
            expect(sampled.meanCost).toBe(method === vaal ? 2 : 5);
            expect(sampled.probability).toBeGreaterThan(0);
            expect(Math.abs(sampled.probability - probability)).toBeLessThan(0.005);
            expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(
                project,
            );
        }
    });
});

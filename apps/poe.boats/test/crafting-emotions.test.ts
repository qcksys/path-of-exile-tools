import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { CraftingSimulation, calculateExact } from "../app/lib/crafting-simulation";
import {
    type CraftingItem,
    type CraftingMethod,
    craftingCatalogSchema,
    craftingProjectSchema,
    craftingTargetSchema,
} from "../app/schemas/crafting";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const ruby = "Metadata/Items/Jewels/JewelStr";
const method = (id = "DistilledEmotion1"): Extract<CraftingMethod, { kind: "currency" }> => ({
    kind: "currency",
    id: `Metadata/Items/Currency/${id}`,
});
const rare = (base = ruby): CraftingItem => ({ ...engine.createItem(base), rarity: "rare" });
const starting = () => {
    let item = rare();
    for (const id of ["JewelFireDamage", "JewelLifeRegeneration"])
        item = engine.addStartingMod(item, id, seededRandom(1));
    return item;
};

describe("Liquid Emotion jewel crafting", () => {
    it("applies every single-outcome recipe to each extracted eligible base", () => {
        const supported = catalog.crafting.liquidEmotions.filter((entry) =>
            entry.rules.every((rule) => rule.mods.length === 1),
        );
        expect(supported).toHaveLength(23);
        for (const emotion of supported)
            for (const rule of emotion.rules) {
                const empty = rare(rule.base);
                const source = engine
                    .pool(empty)
                    .find(
                        (entry) =>
                            !entry.mod.groups.some((group) =>
                                engine.mod(rule.mods[0]!).groups.includes(group),
                            ),
                    )!;
                const input = engine.addStartingMod(empty, source.id, seededRandom(5));
                const result = engine.apply(
                    input,
                    { kind: "currency", id: emotion.id },
                    seededRandom(42),
                );
                expect(result.item.mods).toHaveLength(1);
                expect(result.item.mods[0]).toMatchObject({ id: rule.mods[0], crafted: true });
                expect(result.cost).toEqual([
                    {
                        id: emotion.id,
                        name: catalog.crafting.currencies.find((entry) => entry.id === emotion.id)!
                            .name,
                        amount: 1,
                    },
                ]);
                expect(input.mods[0]!.id).toBe(source.id);
            }
    });

    it("preserves retained rolls, protects fractured modifiers and charges once", () => {
        const input = starting();
        input.mods[0]!.fractured = true;
        const result = engine.apply(input, method(), seededRandom(1));
        expect(result.item.mods[0]).toEqual(input.mods[0]);
        expect(result.item.mods[1]).toMatchObject({ id: "JewelArmour", crafted: true });
        expect(result.item.mods[1]!.values[0]).toBeGreaterThanOrEqual(10);
        expect(result.item.mods[1]!.values[0]).toBeLessThanOrEqual(20);
        expect(result.cost[0]!.amount).toBe(1);
        expect(() => engine.apply(result.item, method(), seededRandom(1))).toThrow(
            "existing crafted modifier",
        );
    });

    it("rejects unavailable bases, rarities and omens before randomness", () => {
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        expect(() =>
            engine.apply(rare("Metadata/Items/Jewels/JewelDiamond"), method(), random),
        ).toThrow("no outcome");
        expect(() =>
            engine.apply(rare("Metadata/Items/Jewels/JewelRadiusStr"), method(), random),
        ).toThrow("no outcome");
        expect(() => engine.apply(engine.createItem(ruby), method(), random)).toThrow("rare item");
        expect(() => engine.apply(rare(), method(), random)).toThrow("No eligible modifier");
        expect(() => engine.apply({ ...starting(), corrupted: true }, method(), random)).toThrow(
            "uncorrupted",
        );
        expect(() => engine.apply({ ...starting(), mirrored: true }, method(), random)).toThrow(
            "unmirrored",
        );
        expect(() =>
            engine.apply(
                starting(),
                { ...method(), omens: ["Metadata/Items/Currency/OmenOnExaltAddSuffixes"] },
                random,
            ),
        ).toThrow();
        expect(pick).not.toHaveBeenCalled();
    });

    it("removes from a full guarantee side and blocks existing modifier groups before removal", () => {
        let input = starting();
        input = engine.addStartingMod(input, "JewelPhysicalDamage", seededRandom(1));
        const result = engine.apply(input, method(), seededRandom(1));
        expect(result.item.mods).toHaveLength(3);
        expect(result.item.mods).toContainEqual(input.mods[1]);
        expect(result.item.mods.some((entry) => entry.id === "JewelArmour" && entry.crafted)).toBe(
            true,
        );
        expect(
            calculateExact(
                engine,
                input,
                method(),
                craftingTargetSchema.parse({
                    groups: [{ mods: ["JewelFireDamage"], minimum: 1 }],
                }),
            ).probability,
        ).toBe(0.5);
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        input = engine.addStartingMod(rare(), "JewelArmour", seededRandom(1));
        expect(() => engine.apply(input, method(), random)).toThrow("conflicting modifier");
        input = engine.addStartingMod(input, "JewelLifeRegeneration", seededRandom(1));
        expect(() => engine.apply(input, method(), random)).toThrow("conflicting modifier");
        expect(pick).not.toHaveBeenCalled();
    });

    it("validates crafted-only outcomes against the exact base and preserves them in saves", () => {
        const input = engine.addStartingMod(
            rare(),
            "CraftedJewelDebilitateOnHitWhileEmeraldSapphireSocketed",
            seededRandom(1),
            "emotion",
        );
        expect(input.mods[0]!.crafted).toBe(true);
        expect(engine.validateItem(JSON.parse(JSON.stringify(input)))).toEqual(input);
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, input)).some(
                ({ item }) => item.mods[0]?.id === input.mods[0]!.id && item.mods[0]?.crafted,
            ),
        ).toBe(true);
        expect(() =>
            engine.validateItem({ ...input, baseId: "Metadata/Items/Jewels/JewelDex" }),
        ).toThrow("Crafted modifier flags");
        expect(() =>
            engine.validateItem({
                ...input,
                mods: input.mods.map((entry) => ({ ...entry, crafted: false })),
            }),
        ).toThrow("not available");
        expect(() =>
            engine.addStartingMod(
                rare("Metadata/Items/Jewels/JewelRadiusStr"),
                "CraftedJewelSuffixEffect",
                seededRandom(1),
                "emotion",
            ),
        ).toThrow("not available");
    });

    it("uses the same removal branches for exact calculation and seeded simulation", () => {
        const item = starting();
        const target = craftingTargetSchema.parse({
            groups: [{ mods: ["JewelFireDamage"], minimum: 1 }],
        });
        expect(calculateExact(engine, item, method(), target).probability).toBeCloseTo(0.5);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item,
            target,
            method: method(),
            steps: [],
            prices: { "Metadata/Items/Currency/DistilledEmotion1": 2 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const simulation = new CraftingSimulation(catalog, project);
        for (let trial = 0; trial < 1000; trial++) simulation.runTrial();
        const result = simulation.result();
        expect(result.probability).toBeCloseTo(0.5, 1);
        expect(result.meanCost).toBe(2);
        expect(result.errors).toEqual({});
        expect(result.spending["Metadata/Items/Currency/DistilledEmotion1"]).toBe(1000);
        expect(engine.apply(item, method(), seededRandom(42))).toEqual(
            engine.apply(item, method(), seededRandom(42)),
        );
    });
});

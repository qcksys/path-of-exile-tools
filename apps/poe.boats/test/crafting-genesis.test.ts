import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { genesisSupported } from "../app/lib/crafting-genesis";
import { modifierFamily } from "../app/lib/crafting-memory";
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
import { baseId, catalog, engine } from "./crafting-fixtures";

const method = (nodes: string[] = []): Extract<CraftingMethod, { kind: "genesis" }> => ({
    kind: "genesis",
    id: "genesis",
    nodes,
});
const item = () => ({ ...engine.createItem(baseId), rarity: "rare" as const });

describe("Genesis equipment modifier calculation", () => {
    it("uses the current build's increases and reductions, combining matching tags and separating cached pools", () => {
        const base = item();
        const ordinary = engine.pool(base);
        const boosted = engine.genesisModifiers(base, ["EquipmentNode9"]);
        for (const entry of ordinary)
            expect(boosted.find((row) => row.id === entry.id)?.weight).toBe(
                Math.round(entry.weight * (entry.mod.implicit_tags.includes("life") ? 4 : 1)),
            );
        const reduced = engine.genesisModifiers(base, ["EquipmentNode9neg"]);
        expect(reduced.find((row) => row.id === "IncreasedLife1")?.weight).toBe(400);
        const mixed = engine.genesisModifiers(base, ["EquipmentNode9", "EquipmentNode9neg"]);
        expect(mixed.find((row) => row.id === "IncreasedLife1")?.weight).toBe(3400);
        const hybrid = engine.genesisModifiers(base, ["EquipmentNode5", "EquipmentNode13"]);
        expect(hybrid.find((row) => row.id === "FireResist1")?.weight).toBe(7000);
        const blocked = engine.genesisModifiers(base, ["EquipmentNode5neg", "EquipmentNode13neg"]);
        expect(blocked.some((row) => row.id === "FireResist1")).toBe(false);
        expect(blocked.find((row) => row.id === "ColdResist1")?.weight).toBe(400);
        expect(engine.genesisModifiers(base, ["EquipmentNode9"])).toEqual(boosted);
        expect(engine.pool(base)).toEqual(ordinary);
    });

    it("cuts the lowest eligible tiers using rating, preserving surviving weights and one-tier families", () => {
        for (const level of [1, 35, 86]) {
            const base = { ...item(), level };
            const ordinary = engine.genesisModifiers(base, []);
            const family = modifierFamily(engine.mod("IncreasedLife1"));
            const tiers = ordinary
                .filter((entry) => modifierFamily(entry.mod) === family)
                .sort((a, b) => a.mod.required_level - b.mod.required_level);
            const cutoff = Math.floor((tiers.length * 60) / 160);
            const enhanced = engine.genesisModifiers(base, [
                "EquipmentNode2",
                "EquipmentNode3b",
                "EquipmentNode20a",
            ]);
            expect(
                enhanced
                    .filter((entry) => modifierFamily(entry.mod) === family)
                    .sort((a, b) => a.mod.required_level - b.mod.required_level),
            ).toEqual(tiers.slice(cutoff));
            expect(tiers.length).toBeGreaterThan(0);
            for (const entry of enhanced)
                expect(entry.mod.required_level).toBeLessThanOrEqual(level);
        }
    });

    it.each([
        false,
        true,
    ])("creates a fresh four-affix item from protected state (fractured: %s)", (fractured) => {
        const base = {
            ...item(),
            quality: 20,
            memoryStrands: 100,
            influences: fractured ? [] : [0],
            corrupted: true,
        };
        base.mods = [engine.rollMod("IncreasedLife1", seededRandom(1), { fractured })];
        const snapshot = structuredClone(base);
        const selected = method(["EquipmentNode9", "EquipmentNode2"]);
        expect(engine.genesisModifiers(base, selected.nodes)).toEqual(
            engine.genesisModifiers(item(), selected.nodes),
        );
        for (let seed = 0; seed < 8; seed++) {
            const result = engine.apply(base, selected, seededRandom(seed));
            expect(result.item.mods).toHaveLength(4);
            expect(result.item.mods.every((entry) => !entry.fractured && !entry.crafted)).toBe(
                true,
            );
            expect(result.item.quality ?? 0).toBe(0);
            expect(result.item.memoryStrands ?? 0).toBe(0);
            expect(result.item.influences ?? []).toEqual([]);
            expect(result.item.corrupted).toBe(false);
            expect(result.cost).toEqual([
                { id: "generated:genesis", name: "Genesis equipment item", amount: 1 },
            ]);
            expect(engine.validateItem(result.item)).toEqual(result.item);
        }
        expect(base).toEqual(snapshot);
    });

    it("preserves native implicits and respects each equipment class and special affix limits", () => {
        const bases = catalog.crafting.genesis!.itemClasses.map(
            (itemClass) =>
                Object.entries(catalog.bases).find(
                    ([, base]) =>
                        base.item_class === itemClass &&
                        base.rarities.includes("rare") &&
                        !base.corrupted,
                )![0],
        );
        bases.push("Metadata/Items/Amulets/AmuletE2");
        for (const base of bases) {
            const starting = engine.createItem(base);
            const result = engine.apply(starting, method(), seededRandom(42)).item;
            const limits = engine.limits(result);
            const counts = engine.counts(result);
            expect(result.mods).toHaveLength(Math.min(4, limits.max));
            expect(counts.prefixes).toBeLessThanOrEqual(limits.prefixes);
            expect(counts.suffixes).toBeLessThanOrEqual(limits.suffixes);
            expect(result.implicits.map((entry) => entry.id)).toEqual(
                catalog.bases[base]!.implicits,
            );
            expect(engine.validateItem(result)).toEqual(result);
        }
    });

    it("rejects unsupported effects, duplicate nodes, weapons and the other game before randomness", () => {
        const wand = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "Wand",
        )![0];
        expect(genesisSupported(catalog, { baseId: wand })).toBe(false);
        for (const [base, selected] of [
            [item(), method(["missing"])],
            [item(), method(["EquipmentNode9", "EquipmentNode9"])],
            [item(), method(["EquipmentNode18"])],
            [engine.createItem(wand), method()],
        ] as const) {
            const random = seededRandom(1);
            const pick = vi.spyOn(random, "pick");
            const integer = vi.spyOn(random, "integer");
            expect(() => engine.apply(base, selected, random)).toThrow();
            expect(pick).not.toHaveBeenCalled();
            expect(integer).not.toHaveBeenCalled();
        }
        const other = new CraftingEngine(
            craftingCatalogSchema.parse(
                JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
            ),
        );
        expect(() => other.validateMethod(method())).toThrow("unavailable");
    });

    it("shares exact odds, saved methods, conditional processes, sampled outcomes and generation costs", () => {
        const ids = [
            "IncreasedLife1",
            "IncreasedLife2",
            "LocalIncreasedPhysicalDamageReductionRating1",
            "LocalIncreasedPhysicalDamageReductionRatingPercent1",
            "ColdResist1",
            "FireResist1",
            "LightningResist1",
        ];
        const reduced = {
            ...catalog,
            mods: Object.fromEntries(ids.map((id) => [id, catalog.mods[id]!])),
        };
        const crafting = new CraftingEngine(reduced);
        const target = crafting.validateTarget({
            groups: [{ mods: ["IncreasedLife1", "IncreasedLife2"] }],
        });
        const selected = method(["EquipmentNode9", "EquipmentNode2"]);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: item(),
            method: selected,
            target,
            steps: [{ id: "grow", method: selected, condition: target }],
            prices: { "generated:genesis": 7 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
        const exact = calculateExact(crafting, item(), selected, target);
        expect(exact.probability).toBeGreaterThan(0);
        expect(exact.probability).toBeLessThan(1);
        const process = calculateProcessExact(crafting, project);
        expect(process.probability).toBeCloseTo(exact.probability, 12);
        expect(process.meanCost).toBeCloseTo(7);
        const simulation = new CraftingSimulation(reduced, project, true);
        for (let trial = 0; trial < project.iterations; trial++) simulation.runTrial();
        expect(simulation.result().probability).toBeCloseTo(exact.probability, 1);
        expect(simulation.result()).toMatchObject({
            errors: {},
            meanCost: 7,
            spending: { "generated:genesis": 1000 },
        });
    });
});

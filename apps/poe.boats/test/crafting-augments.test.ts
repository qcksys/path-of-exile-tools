import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { craftingDataSchema } from "../../../packages/poe-game-data/src/crafting-data-model";
import { availableAnointments } from "../app/lib/crafting-anointing";
import { augment, augmentRule, augmentText, availableAugments } from "../app/lib/crafting-augments";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
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
import { engine as poe1, baseId as poe1Base } from "./crafting-fixtures";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(
        readFileSync(new URL("../public/game-data/crafting-poe2.json", import.meta.url), "utf8"),
    ),
);
const engine = new CraftingEngine(catalog);
const id = (suffix: string) => `Metadata/Items/SoulCores/${suffix}`;
const method = { kind: "augment" as const, id: id("RuneFire") };
const blank = (itemClass = "Body Armour"): CraftingItem => ({
    ...engine.createItem(
        Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === itemClass && !base.implicits.length,
        )![0],
        1,
    ),
    sockets: 1,
});

describe("PoE 2 socketed augments", () => {
    it("preserves augment translation references and scalable stats in the filtered browser catalog", () => {
        const source = craftingDataSchema.parse(
            JSON.parse(readFileSync("../../packages/poe-2-data/crafting-data.json", "utf8")),
        );
        for (const entry of catalog.crafting.augments) {
            const original = source.augments.find((value) => value.id === entry.id)!;
            for (const [index, rule] of entry.rules.entries()) {
                for (const key of ["statDescriptions", "bondedDescriptions"] as const)
                    expect(rule[key].map((ref) => catalog.crafting.statDescriptions[ref])).toEqual(
                        original.rules[index]![key].map((ref) => source.statDescriptions[ref]),
                    );
                for (const stat of [...rule.stats, ...rule.bondedStats])
                    expect(catalog.crafting.scalableStats.includes(stat.id)).toBe(
                        source.scalableStats.includes(stat.id),
                    );
            }
        }
    });

    it("unlocks each Warping pool only on its extracted class and respects level, groups and bound sockets", () => {
        for (const [suffix, itemClass] of [
            ["Time", "Boots"],
            ["Soul", "Body Armour"],
            ["Berserker", "Helmet"],
            ["Marksman", "Gloves"],
            ["Decay", "Gloves"],
            ["Destruction", "Wand"],
        ]) {
            const method = { kind: "augment" as const, id: id(`RuneWarping${suffix}Influence`) };
            const input = { ...blank(itemClass), level: 86, rarity: "rare" as const };
            const entry = augment(catalog, method.id);
            const stat = entry.rules[0]!.stats[0]!.id;
            const tag = catalog.crafting.augmentTags[stat]!;
            const hasTag = (id: string) =>
                engine.mod(id).spawn_weights.some((rule) => rule.tag === tag);
            expect(engine.pool(input).some((mod) => hasTag(mod.id))).toBe(false);
            const socketed = engine.apply(input, method, seededRandom(1)).item;
            const pool = engine.pool(socketed).filter((mod) => hasTag(mod.id));
            expect(pool.length).toBeGreaterThan(0);
            expect(pool.every((entry) => entry.weight === 1)).toBe(true);
            expect(engine.pool({ ...socketed, level: 1 }).some((mod) => hasTag(mod.id))).toBe(
                false,
            );
            const withMod = engine.addStartingMod(socketed, pool[0]!.id, seededRandom(1));
            expect(
                engine
                    .pool(withMod)
                    .every(
                        (entry) =>
                            !entry.mod.groups.some((group) => pool[0]!.mod.groups.includes(group)),
                    ),
            ).toBe(true);
            expect(engine.validateItem(withMod)).toEqual(withMod);
            expect(() => engine.validateItem({ ...withMod, augments: [] })).toThrow();
            expect(() =>
                engine.apply(
                    socketed,
                    { kind: "augment", id: id("RuneFire"), replace: 0 },
                    seededRandom(1),
                ),
            ).toThrow("socket-bound");
            expect(
                importCraftingItemText(engine, exportCraftingItemText(engine, withMod)).map(
                    (match) => match.item,
                ),
            ).toContainEqual(withMod);
        }
    });

    it("uses Destruction modifiers to scale matching explicit stats and text while preserving raw rolls", () => {
        let item = engine.apply(
            { ...blank("Wand"), rarity: "rare", level: 86 },
            { kind: "augment", id: id("RuneWarpingDestructionInfluence") },
            seededRandom(1),
        ).item;
        const damage = engine
            .pool(item)
            .find(
                (entry) =>
                    entry.mod.stats.length === 1 &&
                    entry.mod.stats[0]!.id === "non_skill_base_all_damage_%_to_gain_as_fire" &&
                    entry.mod.stats[0]!.min <= 30 &&
                    entry.mod.stats[0]!.max >= 30,
            )!;
        item = engine.addStartingMod(item, damage.id, seededRandom(1));
        item.mods[0]!.values = [30];
        item = engine.addStartingMod(
            item,
            "DestructionInfluenceFireModifierEffect",
            seededRandom(1),
        );
        item.mods[1]!.values = [20];
        expect(engine.statTotals(item).get("non_skill_base_all_damage_%_to_gain_as_fire")).toBe(36);
        expect(rolledModText(catalog, item.mods[0]!, item)).toBe(
            "[Gain] 36% of Damage as Extra [Fire] Damage",
        );
        expect(item.mods[0]!.values).toEqual([30]);
        const imported = importCraftingItemText(engine, exportCraftingItemText(engine, item))[0]!
            .item;
        expect({ ...imported, mods: item.mods }).toEqual(item);
        expect(imported.mods).toHaveLength(item.mods.length);
        expect(imported.mods).toEqual(expect.arrayContaining(item.mods));
    });

    it("lets Serle's Triumph fill a fourth suffix and seventh affix without opening a fourth prefix", () => {
        let item = engine.apply(
            { ...blank(), rarity: "rare", level: 86 },
            { kind: "augment", id: id("RuneWarpingAdditionalSuffix") },
            seededRandom(1),
        ).item;
        expect(engine.limits(item)).toMatchObject({ max: 7, prefixes: 3, suffixes: 4 });
        expect(engine.matches(item, engine.validateTarget({ groups: [], openAffixes: 7 }))).toBe(
            true,
        );
        expect(engine.limits({ ...item, rarity: "magic" })).toMatchObject({
            max: 3,
            prefixes: 1,
            suffixes: 2,
        });
        expect(engine.limits({ ...item, rarity: "normal", mods: [] }).max).toBe(0);
        for (const side of ["prefix", "prefix", "prefix", "suffix", "suffix", "suffix"])
            item = engine.addStartingMod(item, engine.pool(item, { side })[0]!.id, seededRandom(1));
        expect(engine.pool(item).every((entry) => entry.mod.generation_type === "suffix")).toBe(
            true,
        );
        const exalt = catalog.crafting.currencies.find(
            (entry) => entry.action === "add_mod_to_rare",
        )!;
        const method = { kind: "currency" as const, id: exalt.id };
        const target = engine.validateTarget({ groups: [], affixCount: { min: 7, max: 7 } });
        expect(calculateExact(engine, item, method, target).probability).toBe(1);
        const result = engine.apply(item, method, seededRandom(1));
        expect(engine.counts(result.item)).toEqual({ prefixes: 3, suffixes: 4 });
        expect(engine.pool(result.item)).toEqual([]);
        expect(engine.validateItem(result.item)).toEqual(result.item);
        expect(() => engine.validateItem({ ...result.item, augments: [] })).toThrow("affix limits");
        const socket = { kind: "augment" as const, id: id("RuneWarpingAdditionalSuffix") };
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item: { ...item, augments: [] },
            method,
            target,
            steps: [
                {
                    id: "socket",
                    method: socket,
                    condition: { groups: [] },
                    onSuccess: "exalt",
                    onFailure: "exalt",
                },
                { id: "exalt", method, condition: target },
            ],
            prices: { [socket.id]: 8, [method.id]: 2 },
            seed: 42,
            iterations: 1000,
            maxActions: 2,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBe(1);
        expect(exact.meanCost).toBeCloseTo(10);
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let index = 0; index < 30; index++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            successes: 30,
            meanCost: 10,
            totalActions: 60,
            errors: {},
        });
    });

    it("applies socketed-item magnitude modifiers to augment values and translated text", () => {
        let item = engine.apply({ ...blank("Gloves"), level: 86 }, method, seededRandom(1)).item;
        item = engine.addStartingMod(
            item,
            "EssenceLocalRuneAndSoulCoreEffect1",
            seededRandom(1),
            "essence",
        );
        expect(engine.statTotals(item).get("base_fire_damage_resistance_%")).toBe(22);
        expect(augmentText(catalog, item, method.id)).toBe("+22% to [Resistances|Fire Resistance]");
        expect(
            engine.statTotals(item, "explicit").get("base_fire_damage_resistance_%"),
        ).toBeUndefined();
        const target = engine.validateTarget({
            groups: [],
            stats: [{ id: "base_fire_damage_resistance_%", scope: "all", min: 22 }],
        });
        expect(calculateExact(engine, { ...item, augments: [] }, method, target).probability).toBe(
            1,
        );
    });

    it("adds a second essence craft with Astrid's Creativity and retains both after replacing the rune", () => {
        const astrid = { kind: "augment" as const, id: id("RuneWarpingAdditionalCraftedMod") };
        let item = engine.apply(
            { ...blank(), rarity: "magic", level: 86 },
            astrid,
            seededRandom(1),
        ).item;
        const first = catalog.crafting.poe2Essences.find(
            (entry) => entry.name === "Greater Essence of the Body",
        )!;
        const second = catalog.crafting.poe2Essences.find(
            (entry) => entry.name === "Perfect Essence of Ruin",
        )!;
        const firstMethod = { kind: "essence" as const, id: first.id };
        const secondMethod = {
            kind: "essence" as const,
            id: second.id,
            omens: ["Metadata/Items/Currency/OmenOnPerfectEssenceSuffix"],
        };
        item = engine.addStartingMod(
            item,
            engine.pool(item, { side: "suffix" })[0]!.id,
            seededRandom(1),
        );
        item = engine.apply(item, firstMethod, seededRandom(1)).item;
        const guaranteed = second.rules.find((rule) => rule.itemClasses.includes("Body Armour"))!
            .mod!;
        const target = engine.validateTarget({ groups: [{ mods: [guaranteed], minimum: 1 }] });
        expect(calculateExact(engine, item, secondMethod, target).probability).toBe(1);
        const result = engine.apply(item, secondMethod, seededRandom(1));
        expect(result.item.mods.filter((entry) => entry.crafted)).toHaveLength(2);
        const replaced = engine.apply(
            result.item,
            { kind: "augment", id: id("RuneFire"), replace: 0 },
            seededRandom(1),
        ).item;
        expect(replaced.mods).toEqual(result.item.mods);
        expect(engine.craftedLimit(replaced)).toBe(1);
        expect(engine.validateItem(replaced)).toEqual(replaced);
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, replaced)).map(
                (match) => match.item,
            ),
        ).toContainEqual(replaced);
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        for (const input of [result.item, replaced])
            expect(() => engine.apply(input, secondMethod, random)).toThrow("existing crafted");
        expect(pick).not.toHaveBeenCalled();
        expect(() => engine.validateItem({ ...replaced, sockets: 0, augments: [] })).toThrow(
            "too many crafted",
        );
    });
    it("uses extracted class effects at any item level, without occupying an affix", () => {
        for (const [itemClass, stat, amount] of [
            ["Body Armour", "base_fire_damage_resistance_%", 14],
            ["One Hand Mace", "local_minimum_added_fire_damage", 7],
            ["Wand", "non_skill_base_all_damage_%_to_gain_as_fire", 8],
        ] as const) {
            const input = blank(itemClass);
            const result = engine.apply(input, method, seededRandom(1));
            expect(result.item.augments).toEqual([method.id]);
            expect(result.item.mods).toEqual([]);
            expect(result.item.implicits).toEqual(input.implicits);
            expect(input.augments).toBeUndefined();
            expect(engine.statTotals(result.item).get(stat)).toBe(amount);
            expect(engine.statTotals(result.item, "explicit").get(stat)).toBeUndefined();
            expect(engine.statTotals(result.item, "implicit").get(stat)).toBeUndefined();
            expect(engine.statTotals(result.item).get("num_socketed_runes")).toBe(1);
            expect(result.cost).toEqual([{ id: method.id, name: "Desert Rune", amount: 1 }]);
            expect(augmentText(catalog, result.item, method.id)).toBeTruthy();
        }
    });

    it("falls back to all-equipment stats when a class has only a bonded effect", () => {
        for (const itemClass of ["Body Armour", "One Hand Mace", "Wand"]) {
            const result = engine.apply(
                blank(itemClass),
                { kind: "augment", id: id("RuneStrength") },
                seededRandom(1),
            ).item;
            expect(engine.statTotals(result).get("additional_strength")).toBe(9);
            expect(engine.statTotals(result).get("base_maximum_life")).toBeUndefined();
            expect(augmentRule(catalog, result, augment(catalog, id("RuneStrength")))!.scope).toBe(
                "all",
            );
        }
    });

    it("replaces an occupied socket without refunding or mutating the original", () => {
        const input = engine.apply(blank(), method, seededRandom(1)).item;
        expect(() => engine.apply(input, method, seededRandom(1))).toThrow("empty augment socket");
        const result = engine.apply(
            input,
            { kind: "augment", id: id("RuneCold"), replace: 0 },
            seededRandom(1),
        );
        expect(result.item.augments).toEqual([id("RuneCold")]);
        expect(input.augments).toEqual([method.id]);
        expect(engine.statTotals(result.item).get("base_fire_damage_resistance_%")).toBeUndefined();
        expect(engine.statTotals(result.item).get("base_cold_damage_resistance_%")).toBe(14);
        expect(result.cost[0]!.amount).toBe(1);
        expect(() => engine.apply(input, { ...method, replace: 1 }, seededRandom(1))).toThrow(
            "occupied",
        );
    });

    it("enforces exact-augment limits and shared Ancient Augment limits, allowing replacement", () => {
        const helmet = { ...blank("Helmet"), corrupted: true, sockets: 2 };
        const soul = { kind: "augment" as const, id: id("SoulCoreSpecial1") };
        const withSoul = engine.apply(helmet, soul, seededRandom(1)).item;
        expect(() => engine.apply(withSoul, soul, seededRandom(1))).toThrow("limit of 1");
        expect(engine.apply(withSoul, { ...soul, replace: 0 }, seededRandom(1)).item).toEqual(
            withSoul,
        );
        const ancient = engine.apply(
            helmet,
            { kind: "augment", id: id("AmanamusGaze") },
            seededRandom(1),
        ).item;
        expect(() =>
            engine.apply(ancient, { kind: "augment", id: id("KurgalsGaze") }, seededRandom(1)),
        ).toThrow("limit of 1");
        expect(
            engine.apply(
                ancient,
                { kind: "augment", id: id("KurgalsGaze"), replace: 0 },
                seededRandom(1),
            ).item.augments,
        ).toEqual([id("KurgalsGaze")]);
    });

    it("allows eligible corrupted, mirrored and Sanctified items while retaining existing augments", () => {
        for (const state of [
            { corrupted: true },
            { mirrored: true },
            { rarity: "rare" as const, sanctified: true as const },
        ]) {
            const result = engine.apply({ ...blank(), ...state }, method, seededRandom(1)).item;
            expect(result.augments).toEqual([method.id]);
            expect(result).toMatchObject(state);
        }
        const changed = structuredClone(catalog);
        augment(changed, method.id).corruptedSanctified = false;
        const restricted = new CraftingEngine(changed);
        expect(() =>
            restricted.apply({ ...blank(), corrupted: true }, method, seededRandom(1)),
        ).toThrow("corrupted or Sanctified");
        expect(
            restricted.validateItem({ ...blank(), corrupted: true, augments: [method.id] })
                .augments,
        ).toEqual([method.id]);
    });

    it("preserves augments during ordinary crafting and item/project text round trips", () => {
        const input = engine.apply(blank(), method, seededRandom(1)).item;
        const currency = catalog.crafting.currencies.find(
            (entry) => entry.action === "transmute_to_rare",
        )!;
        const result = engine.apply(
            input,
            { kind: "currency", id: currency.id },
            seededRandom(4),
        ).item;
        expect(result.augments).toEqual([method.id]);
        const text = exportCraftingItemText(engine, input);
        expect(text).toContain("Augment: Desert Rune");
        expect(importCraftingItemText(engine, text).map((entry) => entry.item)).toContainEqual(
            input,
        );
        expect(() =>
            importCraftingItemText(
                engine,
                text.replace("Augment: Desert Rune", "Augment: Unknown"),
            ),
        ).toThrow("Unknown or ambiguous");
    });

    it("keeps Raven-Touched Shard bound and grants helmet instilling", () => {
        const input = blank("Helmet");
        expect(availableAnointments(catalog, input)).toHaveLength(0);
        const item = engine.apply(
            input,
            { kind: "augment", id: id("AugmentAnoint") },
            seededRandom(1),
        ).item;
        const recipes = availableAnointments(catalog, item);
        expect(recipes.length).toBeGreaterThan(0);
        const instilled = engine.apply(
            item,
            { kind: "anoint", id: recipes[0]!.id },
            seededRandom(1),
        ).item;
        expect(instilled.anointments).toEqual([recipes[0]!.id]);
        expect(instilled.augments).toEqual([id("AugmentAnoint")]);
        expect(() => engine.apply(instilled, { ...method, replace: 0 }, seededRandom(1))).toThrow(
            "socket-bound",
        );
    });

    it("calculates exact stat outcomes and simulates a socketing sequence with extracted costs", () => {
        const target = engine.validateTarget({
            groups: [],
            stats: [{ id: "base_fire_damage_resistance_%", scope: "all", min: 28 }],
        });
        const input = { ...blank(), sockets: 2 };
        expect(calculateExact(engine, input, method, target).probability).toBe(0);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item: input,
            method,
            target,
            steps: [
                {
                    id: "socket",
                    method,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "socket",
                },
            ],
            useProcess: true,
            prices: { [method.id]: 3 },
            seed: 42,
            iterations: 1000,
            maxActions: 2,
        });
        expect(calculateProcessExact(engine, project)).toMatchObject({
            probability: 1,
            meanCost: 6,
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let index = 0; index < 20; index++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            successes: 20,
            meanCost: 6,
            totalActions: 40,
            errors: {},
            spending: { [method.id]: 40 },
        });
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });

    it("rejects invalid sockets, unavailable effects and the other game before consuming randomness", () => {
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        for (const input of [
            { ...blank(), sockets: 0 },
            { ...blank(), augments: ["missing"] },
        ])
            expect(() => engine.apply(input, method, random)).toThrow();
        expect(() =>
            engine.validateItem({ ...blank(), sockets: 0, augments: [method.id] }),
        ).toThrow("socket count");
        expect(() =>
            engine.apply(
                blank("Gloves"),
                { kind: "augment", id: id("RuneWarpingOlrothsLegacy") },
                random,
            ),
        ).toThrow("not supported yet");
        expect(() =>
            engine.apply(blank(), { kind: "augment", id: id("AugmentAnoint") }, random),
        ).toThrow("no effect");
        expect(() => poe1.apply(poe1.createItem(poe1Base), method, random)).toThrow(
            "Unknown socketable",
        );
        expect(
            availableAugments(catalog, {
                ...blank(),
                baseId: "Metadata/Items/Amulets/FourAmuletB2",
            }),
        ).toContainEqual(expect.objectContaining({ id: method.id }));
        expect(pick).not.toHaveBeenCalled();
    });
});

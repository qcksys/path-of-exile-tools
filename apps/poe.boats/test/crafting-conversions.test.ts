import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { availableAugments } from "../app/lib/crafting-augments";
import { convertedModifier } from "../app/lib/crafting-conversions";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import {
    type CraftingItem,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const rune = (element: string) => ({
    kind: "augment" as const,
    id: `Metadata/Items/SoulCores/RuneConvert${element}`,
});
const weapon = (mods: string[], itemClass = "Wand"): CraftingItem => {
    const baseId = Object.entries(catalog.bases).find(
        ([, base]) =>
            base.item_class === itemClass &&
            !base.implicits.length &&
            !base.tags.includes("no_fire_spell_mods"),
    )![0];
    return engine.validateItem({
        ...engine.createItem(baseId),
        rarity: "rare",
        sockets: itemClass === "Staff" ? 2 : 1,
        mods: mods.map((id) => engine.rollMod(id, seededRandom(1))),
    });
};
const input = () => weapon(["SpellDamageGainedAsFire6", "SpellDamageGainedAsCold6"]);
const currency = (action: string) => ({
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
});

describe("PoE 2 Aldur conversions", () => {
    it.each([
        "Fire",
        "Cold",
        "Lightning",
        "Chaos",
    ])("uses extracted %s conversion families, retaining fractures, resistances and implicits", (element) => {
        const item = weapon([
            "SpellDamageGainedAsFire6",
            "SpellDamageGainedAsCold6",
            "SpellDamageGainedAsLightning6",
        ]);
        item.mods[1]!.fractured = true;
        expect(availableAugments(catalog, item).map((entry) => entry.id)).toContain(
            rune(element).id,
        );
        const result = engine.apply(item, rune(element), seededRandom(3));
        const target =
            element === "Chaos"
                ? "ConvertedSpellDamageGainedAsChaos6"
                : `SpellDamageGainedAs${element}6`;
        expect(result.item.mods.map((entry) => entry.id)).toEqual([
            target,
            "SpellDamageGainedAsCold6",
            target,
        ]);
        expect(result.item.mods[1]).toEqual(item.mods[1]);
        expect(convertedModifier(catalog, "FireResist1", "chaos")).toBe("FireResist1");
        expect(result.item.implicits).toEqual(item.implicits);
        expect(result.cost).toEqual([
            {
                id: rune(element).id,
                name: catalog.crafting.augments.find((entry) => entry.id === rune(element).id)!
                    .name,
                amount: 1,
            },
        ]);
        expect(engine.validateItem(result.item)).toEqual(result.item);
        expect(item.augments).toBeUndefined();
        expect(item.mods[0]!.id).toBe("SpellDamageGainedAsFire6");
    });

    it("rerolls converted values independently and calculates and simulates the same outcome distribution", () => {
        const item = input();
        const method = rune("Chaos");
        item.mods.forEach((mod) => {
            mod.values = [28];
        });
        const random = seededRandom(1);
        const integer = vi.spyOn(random, "integer").mockImplementation((_min, max) => max);
        const result = engine.apply(item, method, random).item;
        expect(integer.mock.calls).toEqual([
            [28, 30],
            [28, 30],
        ]);
        expect(result.mods.map((entry) => entry.values)).toEqual([[30], [30]]);
        const target = engine.validateTarget({
            groups: [],
            stats: [{ id: "non_skill_base_all_damage_%_to_gain_as_chaos", min: 60 }],
        });
        expect(calculateExact(engine, item, method, target).probability).toBeCloseTo(1 / 9);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item,
            method,
            target,
            steps: [
                {
                    id: "convert",
                    method,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
            useProcess: true,
            prices: { [method.id]: 10 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.meanCost).toBeCloseTo(10);
        expect(exact.probability).toBeCloseTo(1 / 9);
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let index = 0; index < 1000; index++) simulation.runTrial();
        const sampled = simulation.result();
        expect(sampled.errors).toEqual({});
        expect(sampled.probability).toBeGreaterThan(0.08);
        expect(sampled.probability).toBeLessThan(0.14);
        expect(sampled.spending).toEqual({ [method.id]: 1000 });
    });

    it("preserves duplicate modifier instances and their histories through text, JSON, Divine and Annulment", () => {
        const result = engine.apply(input(), rune("Chaos"), seededRandom(3)).item;
        expect(result.mods[0]!.id).toBe(result.mods[1]!.id);
        const text = exportCraftingItemText(engine, result);
        expect(importCraftingItemText(engine, text).map((match) => match.item)).toContainEqual(
            result,
        );
        expect(engine.validateItem(JSON.parse(JSON.stringify(result)))).toEqual(result);
        const divined = engine.apply(result, currency("reroll_mod_values"), seededRandom(2)).item;
        expect(divined.mods.map((entry) => entry.conversion)).toEqual(
            result.mods.map((entry) => entry.conversion),
        );
        const annulled = engine.apply(divined, currency("remove_random_mod"), seededRandom(1)).item;
        expect(annulled.mods).toHaveLength(1);
        expect(annulled.mods[0]!.conversion).toBeDefined();
        expect(() =>
            engine.apply(result, { ...rune("Fire"), replace: 0 }, seededRandom(1)),
        ).toThrow("socket-bound");
        expect(
            engine.pool(result).some((entry) => entry.id === "ConvertedSpellDamageGainedAsChaos6"),
        ).toBe(false);
    });

    it("chains conversions when a later rune replaces an earlier socket", () => {
        let item = engine.apply(
            weapon(["SpellDamageGainedAsFireTwoHand6", "SpellDamageGainedAsColdTwoHand6"], "Staff"),
            { kind: "augment", id: "Metadata/Items/SoulCores/RuneFire" },
            seededRandom(1),
        ).item;
        item = engine.apply(item, rune("Cold"), seededRandom(1)).item;
        item = engine.apply(item, { ...rune("Chaos"), replace: 0 }, seededRandom(1)).item;
        expect(item.mods[0]!.conversion).toEqual({
            source: "SpellDamageGainedAsFireTwoHand6",
            steps: [
                { socket: 1, order: 0 },
                { socket: 0, order: 1 },
            ],
        });
        expect(item.mods[1]!.conversion).toEqual({
            source: "SpellDamageGainedAsColdTwoHand6",
            steps: [{ socket: 0, order: 1 }],
        });
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, item)).map(
                (match) => match.item,
            ),
        ).toContainEqual(item);
    });

    it("converts only at socketing and supports another conversion after adding a new elemental modifier", () => {
        let item = engine.apply(
            weapon(["SpellDamageGainedAsColdTwoHand6"], "Staff"),
            rune("Fire"),
            seededRandom(1),
        ).item;
        item = engine.addStartingMod(item, "SpellDamageGainedAsColdTwoHand6", seededRandom(1));
        expect(item.mods.map((entry) => entry.id)).toEqual([
            "SpellDamageGainedAsFireTwoHand6",
            "SpellDamageGainedAsColdTwoHand6",
        ]);
        item = engine.apply(item, rune("Fire"), seededRandom(1)).item;
        expect(item.mods.map((entry) => entry.id)).toEqual([
            "SpellDamageGainedAsFireTwoHand6",
            "SpellDamageGainedAsFireTwoHand6",
        ]);
        expect(item.mods.map((entry) => entry.conversion?.steps)).toEqual([
            [{ socket: 0, order: 0 }],
            [{ socket: 1, order: 1 }],
        ]);
        const fractured = {
            ...item,
            mods: item.mods.map((entry, index) => ({ ...entry, fractured: index === 0 })),
        };
        expect(engine.validateItem(fractured)).toEqual(fractured);
    });

    it("preserves crafted flags and leaves families without a target unchanged", () => {
        const item = weapon([], "One Hand Mace");
        item.mods = [
            engine.rollMod("EssenceDamageasExtraFire1", seededRandom(1), { crafted: true }),
        ];
        const result = engine.apply(item, rune("Chaos"), seededRandom(1)).item;
        expect(result.mods[0]).toMatchObject({
            id: "ConvertedEssenceDamageasExtraChaos1",
            crafted: true,
            conversion: { source: "EssenceDamageasExtraFire1" },
        });
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result)).map(
                (match) => match.item,
            ),
        ).toContainEqual(result);
        const ailment = weapon(["IgniteChanceIncrease1"]);
        expect(engine.apply(ailment, rune("Chaos"), seededRandom(1)).item.mods).toEqual(
            ailment.mods,
        );
    });

    it("converts multi-stat weapon damage and desecrated modifiers using their original eligibility", () => {
        for (const [source, target] of [
            ["LocalAddedFireDamage10_", "ConvertedLocalAddedChaosDamage10"],
            ["AbyssModGenWeaponAmanamuPrefixFirePenetration", "ConvertedAbyssChaosPenetration"],
        ]) {
            const item = weapon([source!], "One Hand Mace");
            const result = engine.apply(item, rune("Chaos"), seededRandom(1)).item;
            expect(result.mods[0]!.id).toBe(target);
            expect(result.mods[0]!.values).toHaveLength(engine.mod(target!).stats.length);
            expect(engine.isDesecrated(result.mods[0]!)).toBe(engine.isDesecrated(item.mods[0]!));
            expect(
                importCraftingItemText(engine, exportCraftingItemText(engine, result)).map(
                    (match) => match.item,
                ),
            ).toContainEqual(result);
        }
    });

    it("preserves a previously converted modifier fractured before the next conversion", () => {
        const item = engine.apply(
            weapon(
                ["SpellDamageGainedAsFireTwoHand6", "SpellDamageGainedAsLightningTwoHand6"],
                "Staff",
            ),
            rune("Cold"),
            seededRandom(1),
        ).item;
        item.mods[0]!.fractured = true;
        const result = engine.apply(item, rune("Fire"), seededRandom(1)).item;
        expect(result.mods[0]).toEqual(item.mods[0]);
        expect(result.mods[1]!.id).toBe("SpellDamageGainedAsFireTwoHand6");
        expect(engine.validateItem(result)).toEqual(result);
    });

    it("rejects forged histories and ordinary duplicate groups", () => {
        const item = engine.apply(input(), rune("Chaos"), seededRandom(1)).item;
        for (const change of [
            "source",
            "socket",
            "order",
            "target",
            "duplicate",
            "removed-rune",
            "implicit",
        ]) {
            const changed = structuredClone(item);
            if (change === "source") changed.mods[0]!.conversion!.source = "FireResist1";
            if (change === "socket") changed.mods[0]!.conversion!.steps[0]!.socket = 1;
            if (change === "order") changed.mods[0]!.conversion!.steps[0]!.order = 1;
            if (change === "target") changed.mods[0]!.id = "SpellDamageGainedAsFire6";
            if (change === "duplicate") changed.mods[1] = structuredClone(changed.mods[0]!);
            if (change === "removed-rune") changed.augments = [];
            if (change === "implicit") changed.implicits = [changed.mods.pop()!];
            expect(() => engine.validateItem(changed), change).toThrow();
        }
        const ordinary = input();
        ordinary.mods[1] = structuredClone(ordinary.mods[0]!);
        expect(() => engine.validateItem(ordinary)).toThrow("same group");
    });

    it("rejects ineligible states before rolling values", () => {
        const random = seededRandom(1);
        const integer = vi.spyOn(random, "integer");
        for (const state of [{ sockets: 0 }, { corrupted: true }, { sanctified: true as const }])
            expect(() => engine.apply({ ...input(), ...state }, rune("Chaos"), random)).toThrow();
        expect(() => engine.apply(weapon([], "Body Armour"), rune("Fire"), random)).toThrow(
            "no effect",
        );
        expect(integer).not.toHaveBeenCalled();
        const mirrored = engine.apply(
            { ...input(), mirrored: true },
            rune("Chaos"),
            seededRandom(1),
        ).item;
        expect(mirrored.mirrored).toBe(true);
        expect(
            mirrored.mods.every((entry) => entry.id === "ConvertedSpellDamageGainedAsChaos6"),
        ).toBe(true);
    });
});

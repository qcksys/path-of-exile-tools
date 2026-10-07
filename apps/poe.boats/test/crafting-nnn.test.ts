import { describe, expect, it } from "vite-plus/test";
import { seededRandom } from "../app/lib/crafting-engine";
import { graspingMailBase } from "../app/lib/crafting-grasping";
import { nonNativeEssenceSources, recombinationOutcomes } from "../app/lib/crafting-recombination";
import { catalog, engine } from "./crafting-fixtures";
import {
    nnnBase as base,
    nnnDonor as donor,
    rage,
    strength,
    suppressionDonor as suppress,
} from "./crafting-nnn-fixtures";

describe("non-native natural essence recombination", () => {
    it("transfers the requested Grasping Mail crit modifier when the NNN receiver base survives", () => {
        const id = "BreachBodyCriticalChanceIncreasedByUncappedLightningResistance1";
        const left = engine.addStartingMod(
            engine.createItem(graspingMailBase),
            id,
            seededRandom(42),
        );
        const receiver = base("Necrotic Armour");
        const source = nonNativeEssenceSources(engine, receiver, left).find(
            (entry) => entry.side === engine.mod(id).generation_type && entry.nativeOnOther,
        )!;
        expect(source).toBeDefined();
        const right = engine.addStartingMod(receiver, source.modId, seededRandom(42), "essence");
        const outcomes = recombinationOutcomes(engine, left, right);
        expect(
            outcomes
                .filter(
                    ({ value }) =>
                        value.baseId === receiver.baseId && value.mods.some((mod) => mod.id === id),
                )
                .reduce((sum, outcome) => sum + outcome.weight, 0),
        ).toBeCloseTo(0.5);
        for (const { value } of outcomes) {
            expect(engine.validateItem(value)).toEqual(value);
            if (value.baseId === receiver.baseId) expect(value.mods).toEqual([left.mods[0]]);
        }
        expect(
            outcomes.some(
                ({ value }) =>
                    value.baseId === left.baseId && !value.mods.some((mod) => mod.id === id),
            ),
        ).toBe(true);
    });
    it.each([
        ["Zodiac Leather", 1],
        ["Triumphant Lamellar", 0.8325],
    ] as const)("preserves suppression from %s with base-dependent Strength eligibility", (name, expected) => {
        const left = suppress(name);
        const right = donor();
        const outcomes = recombinationOutcomes(engine, left, right);
        const suppression = left.mods[0]!.id;
        expect(outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBeCloseTo(1);
        expect(
            outcomes
                .filter(({ value }) => value.mods.some((mod) => mod.id === suppression))
                .reduce((sum, outcome) => sum + outcome.weight, 0),
        ).toBeCloseTo(expected);
        expect(
            outcomes
                .filter(
                    ({ value }) =>
                        value.baseId === right.baseId &&
                        value.mods.some((mod) => mod.id === suppression),
                )
                .reduce((sum, outcome) => sum + outcome.weight, 0),
        ).toBeCloseTo(0.5);
        for (const { value } of outcomes) {
            expect(engine.validateItem(value)).toEqual(value);
            if (value.baseId === right.baseId)
                expect(value.mods.some((mod) => mod.id === strength)).toBe(false);
        }
    });
    it("lists NNN essence recipes and identifies those that are natural on the other base", () => {
        expect(
            nonNativeEssenceSources(engine, base("Necrotic Armour"), base("Zodiac Leather")),
        ).toContainEqual(
            expect.objectContaining({
                id: rage.id,
                modId: strength,
                side: "suffix",
                nativeOnOther: false,
                rerollsRare: true,
            }),
        );
        expect(
            nonNativeEssenceSources(engine, base("Necrotic Armour"), base("Triumphant Lamellar")),
        ).toContainEqual(expect.objectContaining({ id: rage.id, nativeOnOther: true }));
        expect(
            nonNativeEssenceSources(engine, base("Necrotic Armour")).some(
                (entry) => entry.name === "Deafening Essence of Rage",
            ),
        ).toBe(false);
        expect(() =>
            nonNativeEssenceSources(engine, base("Necrotic Armour"), base("Iron Ring")),
        ).toThrow("same item class");
    });
    it("retains a true essence-exclusive modifier instead of treating it as an NNN filler", () => {
        const essence = catalog.crafting.essences.find(
            (entry) => entry.name === "Deafening Essence of Rage",
        )!;
        const id = essence.mods["Body Armour"]!;
        expect(engine.mod(id).is_essence_only).toBe(true);
        const left = engine.addStartingMod(
            base("Necrotic Armour"),
            id,
            seededRandom(42),
            "essence",
        );
        const right = base("Zodiac Leather", 1);
        const outcomes = recombinationOutcomes(engine, left, right);
        expect(outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBeCloseTo(1);
        const transferred = outcomes.filter(
            ({ value }) => value.baseId === right.baseId && value.mods.some((mod) => mod.id === id),
        );
        expect(transferred.reduce((sum, outcome) => sum + outcome.weight, 0)).toBeCloseTo(0.295);
        for (const { value } of transferred) {
            expect(value.mods[0]).toMatchObject({
                id,
                essence: true,
                origin: { kind: "recombine", level: 86 },
            });
            expect(engine.validateItem(value)).toEqual(value);
        }
    });
});

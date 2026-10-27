import { describe, expect, it } from "vite-plus/test";
import {
    marketSignatureLabel,
    type WatchersEyeObservation,
    watchersEyeMods,
    watchersEyeModValues,
} from "~/lib/watchers-eye";

const HASTE = "Haste: #% increased Movement Speed";
const PRECISION = "Precision: #% increased Critical Strike Chance";
const DISCIPLINE = "Discipline: #% faster start of Energy Shield Recharge";
const GRACE = "Grace: #% chance to Blind Enemies which Hit you";

function observation(
    mods: string[],
    overrides: Partial<WatchersEyeObservation> = {},
): WatchersEyeObservation {
    return {
        signatureValue: mods.join(" / "),
        mods,
        listings: 1,
        ask: null,
        sales: 0,
        salePrice: null,
        ...overrides,
    };
}

describe("watchersEyeMods", () => {
    it("masks rolls and sorts mods so older unmasked signatures group with new ones", () => {
        expect(
            watchersEyeMods({
                kind: "watchers-eye",
                mods: [
                    { aura: "Precision", stat: "40% increased Critical Strike Chance" },
                    { aura: "Haste", stat: "12.5% increased Movement Speed" },
                ],
            }),
        ).toEqual([HASTE, PRECISION]);
    });

    it("labels Watcher's Eye markets by their mods and other markets by their value", () => {
        const signatureData = {
            kind: "watchers-eye",
            mods: [{ aura: "Haste", stat: "#% increased Movement Speed" }],
        };
        expect(
            marketSignatureLabel({
                signatureKind: "watchers-eye",
                signatureValue: "1de1a559",
                signatureData,
            }),
        ).toBe(HASTE);
        expect(
            marketSignatureLabel({
                signatureKind: "watchers-eye",
                signatureValue: "1de1a559",
                signatureData: null,
            }),
        ).toBe("1de1a559");
        expect(
            marketSignatureLabel({
                signatureKind: "foulborn",
                signatureValue: "Mutated mod",
                signatureData,
            }),
        ).toBe("Mutated mod");
    });
});

describe("watchersEyeModValues", () => {
    const observations = [
        observation([HASTE, PRECISION], { listings: 2, ask: 30 }),
        // An older, unmasked signature of the same combination counts as the same item.
        observation([HASTE, PRECISION], { signatureValue: "old-hash", ask: 20 }),
        observation([DISCIPLINE, HASTE], { ask: 50, sales: 2, salePrice: 55 }),
        observation([DISCIPLINE, HASTE], { listings: 0, sales: 1, salePrice: 70 }),
        observation([DISCIPLINE, GRACE, PRECISION], { ask: 5 }),
        observation([GRACE, PRECISION], { listings: 0, sales: 3, salePrice: 8 }),
    ];

    it("values each mod by the cheapest item with it and its likely sales", () => {
        const result = watchersEyeModValues(observations, { require: [], anyOf: [] });
        expect(result.cheapest).toBe(5);
        expect(result.matchCount).toBe(3);
        expect(result.mods.find((row) => row.mod === HASTE)).toEqual({
            mod: HASTE,
            combinations: 2,
            listings: 4,
            cheapest: 20,
            cheapestValue: "old-hash",
            sales: 3,
            saleMedian: 55,
        });
        expect(result.mods.find((row) => row.mod === PRECISION)).toMatchObject({
            combinations: 3,
            cheapest: 5,
            sales: 3,
            saleMedian: 8,
        });
    });

    it("prices each other mod alongside a required mod", () => {
        const result = watchersEyeModValues(observations, { require: [HASTE], anyOf: [] });
        expect(result.mods.map((row) => [row.mod, row.cheapest])).toEqual([
            [DISCIPLINE, 50],
            [HASTE, 20],
            [PRECISION, 20],
        ]);
        expect(result.matches.map((match) => match.mods)).toEqual([
            [HASTE, PRECISION],
            [DISCIPLINE, HASTE],
        ]);
    });

    it("finds the cheapest item with a required mod and any of several others", () => {
        const result = watchersEyeModValues(observations, {
            require: [PRECISION],
            anyOf: [DISCIPLINE, GRACE],
        });
        expect(result.cheapest).toBe(5);
        expect(result.matches).toEqual([
            expect.objectContaining({ mods: [DISCIPLINE, GRACE, PRECISION], cheapest: 5 }),
        ]);
        // Grace + Precision only sold, so it values the mods but is not a listed match.
        expect(result.mods.find((row) => row.mod === GRACE)).toMatchObject({
            combinations: 2,
            sales: 3,
            cheapest: 5,
        });
    });

    it("reports no cheapest item when nothing matching is listed", () => {
        const result = watchersEyeModValues(observations, { require: [GRACE, HASTE], anyOf: [] });
        expect(result).toMatchObject({ cheapest: null, matchCount: 0, matches: [], mods: [] });
    });
});

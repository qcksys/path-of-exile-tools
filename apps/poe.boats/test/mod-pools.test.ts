import { describe, expect, it } from "vite-plus/test";
import {
    MOD_POOL_KINDS,
    type ModPoolObservation,
    marketSignatureLabel,
    modPoolMods,
    modPoolValues,
} from "~/lib/mod-pools";
import { MOD_POOLS } from "../../../packages/poe-stash-ingest/src/shared/mod-extractors/mod-pools";

const HASTE = "Haste: #% increased Movement Speed";
const PRECISION = "Precision: #% increased Critical Strike Chance";
const DISCIPLINE = "Discipline: #% faster start of Energy Shield Recharge";
const GRACE = "Grace: #% chance to Blind Enemies which Hit you";

function observation(
    mods: string[],
    overrides: Partial<ModPoolObservation> = {},
): ModPoolObservation {
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

describe("modPoolMods", () => {
    it("lists the kinds ingest records for mod pool uniques", () => {
        expect([...MOD_POOL_KINDS].sort()).toEqual(
            Object.values(MOD_POOLS)
                .map((pool) => pool.kind)
                .sort(),
        );
    });

    it("reads current signatures and masks older unmasked Watcher's Eye ones to the same mods", () => {
        expect(modPoolMods({ kind: "watchers-eye", mods: [PRECISION, HASTE] })).toEqual([
            HASTE,
            PRECISION,
        ]);
        expect(
            modPoolMods({
                kind: "watchers-eye",
                mods: [
                    { aura: "Precision", stat: "40% increased Critical Strike Chance" },
                    { aura: "Haste", stat: "12.5% increased Movement Speed" },
                ],
            }),
        ).toEqual([HASTE, PRECISION]);
        expect(modPoolMods({ kind: "foulborn", mods: ["Mutated mod"] })).toBeNull();
    });

    it("labels pool combinations by their mods, the merged market by nothing and others by their value", () => {
        const signatureData = { kind: "loreweave", mods: ["+#% to Chaos Resistance"] };
        const label = (signatureKind: string, signatureValue: string, data: unknown) =>
            marketSignatureLabel({ signatureKind, signatureValue, signatureData: data });
        expect(label("loreweave", "1de1a559", signatureData)).toBe("+#% to Chaos Resistance");
        expect(label("loreweave", "1de1a559", null)).toBe("1de1a559");
        expect(label("loreweave", "", null)).toBe("");
        expect(label("foulborn", "Mutated mod", signatureData)).toBe("Mutated mod");
    });
});

describe("modPoolValues", () => {
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
        const result = modPoolValues(observations, { require: [], anyOf: [] });
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
        const result = modPoolValues(observations, { require: [HASTE], anyOf: [] });
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
        const result = modPoolValues(observations, {
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
        const result = modPoolValues(observations, { require: [GRACE, HASTE], anyOf: [] });
        expect(result).toMatchObject({ cheapest: null, matchCount: 0, matches: [], mods: [] });
    });
});

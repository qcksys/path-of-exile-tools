import { describe, expect, it } from "vite-plus/test";
import {
    MOD_POOL_KINDS,
    type ModPoolObservation,
    modPoolMod,
    modPoolValues,
} from "~/lib/mod-pools";
import { MOD_POOLS } from "../../../packages/poe-stash-ingest/src/shared/mod-extractors/mod-pools";

const HASTE = "Haste: #% increased Movement Speed";
const PRECISION = "Precision: #% increased Critical Strike Chance";

function observation(
    mod: string,
    modCount: number,
    overrides: Partial<ModPoolObservation> = {},
): ModPoolObservation {
    return {
        signatureValue: `${modCount} mods: ${mod}`,
        mod,
        modCount,
        listings: 0,
        ask: null,
        medianAsk: null,
        sales: 0,
        salePrice: null,
        ...overrides,
    };
}

describe("modPoolMod", () => {
    it("lists the kinds ingest records for mod pool uniques", () => {
        expect([...MOD_POOL_KINDS].sort()).toEqual(
            Object.values(MOD_POOLS)
                .map((pool) => pool.kind)
                .sort(),
        );
    });

    it("reads a per-mod market's mod and count, and nothing from other markets", () => {
        expect(modPoolMod({ kind: "watchers-eye", mod: HASTE, modCount: 3 })).toEqual({
            mod: HASTE,
            modCount: 3,
        });
        expect(modPoolMod({ kind: "watchers-eye" })).toBeNull();
        expect(modPoolMod({ kind: "foulborn", mod: HASTE, modCount: 3 })).toBeNull();
        expect(modPoolMod(null)).toBeNull();
    });
});

describe("modPoolValues", () => {
    it("values a mod separately for each mod count", () => {
        const values = modPoolValues([
            observation(HASTE, 2, { listings: 4, ask: 10, medianAsk: 15 }),
            observation(HASTE, 3, { listings: 1, ask: 90, medianAsk: 90 }),
        ]);
        expect(values.map((row) => [row.modCount, row.listings, row.cheapest])).toEqual([
            [3, 1, 90],
            [2, 4, 10],
        ]);
    });

    it("combines a market's latest asks with the sales of every hour", () => {
        const [value] = modPoolValues([
            observation(HASTE, 2, { listings: 3, ask: 20, medianAsk: 30 }),
            observation(HASTE, 2, { sales: 2, salePrice: 55 }),
            observation(HASTE, 2, { sales: 1, salePrice: 70 }),
        ]);
        expect(value).toMatchObject({
            listings: 3,
            cheapest: 20,
            medianAsk: 30,
            sales: 3,
            saleMedian: 55,
        });
    });

    it("sorts by sale price, then median ask", () => {
        const values = modPoolValues([
            observation(HASTE, 2, { listings: 1, medianAsk: 5 }),
            observation(PRECISION, 2, { sales: 1, salePrice: 2 }),
            observation(PRECISION, 3, { listings: 1, medianAsk: 9 }),
        ]);
        expect(values.map((row) => row.signatureValue)).toEqual([
            `2 mods: ${PRECISION}`,
            `3 mods: ${PRECISION}`,
            `2 mods: ${HASTE}`,
        ]);
    });
});

import { readFileSync } from "node:fs";
import data from "@poe-tools/market/market-bases-poe1.json";
import { describe, expect, it } from "vite-plus/test";
import {
    type MarketBaseRow,
    marketBasesSchema,
    marketBaseVariant,
    rankMarketBases,
} from "~/lib/market-bases";
import { marketFiltersSchema } from "~/schemas/market";

const chaosRates = { chaos: 1, divine: 150 };

function base(id: string, overrides: Partial<MarketBaseRow> = {}): MarketBaseRow {
    return {
        id,
        baseType: "Titan Plate",
        category: "armour-bases",
        ilvl: { min: 86, max: 100 },
        links: "1-5",
        quality: null,
        hour: 3600,
        listingCount: 1,
        uniqueSellers: 1,
        unknownCount: 0,
        prices: { chaos: { count: 1, min: 1, median: 1, max: 1 } },
        ...overrides,
    };
}

const rows = [
    base("cheap", { listingCount: 30, prices: { chaos: { count: 3, min: 5, median: 5, max: 5 } } }),
    base("dear", {
        links: "6",
        listingCount: 2,
        prices: { divine: { count: 2, min: 1, median: 2, max: 3 } },
    }),
    base("unpriced", { baseType: "Astral Plate", listingCount: 10, prices: {} }),
    base("quality", {
        links: null,
        quality: 30,
        listingCount: 5,
        prices: { chaos: { count: 5, min: 80, median: 90, max: 99 } },
    }),
];
const rank = (input: Record<string, unknown>, pageSize = 50) =>
    rankMarketBases(
        rows,
        marketFiltersSchema.parse({ category: "armour-bases", ...input }),
        chaosRates,
        pageSize,
    );
const ids = (input: Record<string, unknown>, pageSize?: number) =>
    rank(input, pageSize).rows.map((row) => row.id);

describe("crafting base market rows", () => {
    it("orders by chaos value across currencies with unpriced bases last", () => {
        expect(ids({ order: "price-desc" })).toEqual(["dear", "quality", "cheap", "unpriced"]);
        expect(ids({ order: "price-asc" })).toEqual(["cheap", "quality", "dear", "unpriced"]);
    });

    it("falls back to listings for the likely-sales orders, which bases do not have", () => {
        expect(ids({})).toEqual(["cheap", "unpriced", "quality", "dear"]);
        expect(ids({ salesMin: 1 })).toEqual([]);
    });

    it("searches the base and variant and filters prices in the display currency", () => {
        expect(ids({ q: "astral" })).toEqual(["unpriced"]);
        expect(ids({ q: "30%+ quality" })).toEqual(["quality"]);
        expect(ids({ q: "6 links" })).toEqual(["dear"]);
        expect(ids({ currency: "divine", priceMin: 1 })).toEqual(["dear"]);
        expect(ids({ currency: "chaos", priceMax: 100, order: "name-asc" })).toEqual([
            "quality",
            "cheap",
        ]);
        expect(ids({ listingsMin: 5, sellersMax: 1 })).toEqual(["cheap", "unpriced", "quality"]);
    });

    it("pages after ordering and has no corrupted bases", () => {
        expect(rank({ page: 2 }, 3)).toEqual({ rows: [rows[1]], hasMore: false });
        expect(rank({}, 3).hasMore).toBe(true);
        expect(rank({ corruption: "true" })).toEqual({ rows: [], hasMore: false });
    });

    it("describes each variant by item level, links and quality", () => {
        expect(marketBaseVariant(rows[0]!)).toBe("ilvl 86–100 · 1–5 links");
        expect(marketBaseVariant(rows[3]!)).toBe("ilvl 86–100 · 30%+ quality");
    });
});

describe("generated crafting base list", () => {
    const { revision, bases } = marketBasesSchema.parse(data);
    const manifest: { revision: string; cohorts: Array<{ id: string }> } = JSON.parse(
        readFileSync("../../packages/poe-market/data/cohorts-poe1.json", "utf8"),
    );
    const cohorts = new Set(manifest.cohorts.map((cohort) => cohort.id));

    it("lists existing cohorts of the current manifest from item level 74", () => {
        expect(revision).toBe(manifest.revision);
        for (const entry of bases) {
            expect(cohorts.has(entry.id), entry.id).toBe(true);
            expect(entry.ilvl.max).toBeGreaterThanOrEqual(74);
        }
    });

    it("splits six-socket bases by links and adds ilvl 86 quality tiers to armour", () => {
        expect(
            bases
                .filter((entry) => entry.baseType === "Titan Plate" && entry.ilvl.min === 86)
                .map((entry) => entry.id),
        ).toEqual([
            "base:titan-plate:86-100:6-link",
            "base:titan-plate:86-100:1-5-link",
            "base:titan-plate:86-100:any-links:q25",
            "base:titan-plate:86-100:any-links:q30",
        ]);
        expect(
            bases
                .filter((entry) => entry.baseType === "Onyx Amulet")
                .every((entry) => entry.links === null && entry.quality === null),
        ).toBe(true);
        expect(new Set(bases.map((entry) => entry.category))).toEqual(
            new Set(["armour-bases", "weapon-bases", "accessory-bases"]),
        );
    });
});

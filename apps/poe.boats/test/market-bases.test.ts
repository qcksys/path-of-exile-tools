import { readFileSync } from "node:fs";
import data from "@poe-tools/market/market-bases-poe1.json";
import { describe, expect, it } from "vite-plus/test";
import {
    MARKET_BASE_ATTRIBUTE_SETS,
    MARKET_BASE_CLASSES,
    MARKET_BASE_LINK_CLASSES,
    type MarketBaseRow,
    marketBaseClass,
    marketBaseDescription,
    marketBaseDetails,
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
        itemClass: "Body Armour",
        attributes: ["str"],
        level: 68,
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

    it("ranks a base by its most listed currency, as the price column shows it", () => {
        const mixed = base("mixed", {
            prices: {
                chaos: { count: 1, min: 1, median: 1, max: 1 },
                divine: { count: 9, min: 2, median: 2, max: 2 },
            },
        });
        const steady = base("steady", {
            prices: { chaos: { count: 5, min: 100, median: 100, max: 100 } },
        });
        const filters = marketFiltersSchema.parse({
            category: "armour-bases",
            order: "price-desc",
        });
        expect(
            rankMarketBases([steady, mixed], filters, chaosRates, 50).rows.map((row) => row.id),
        ).toEqual(["mixed", "steady"]);
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

    it("filters by type, attributes, item level band, links and quality", () => {
        const mixed = [
            base("titan", { ilvl: { min: 84, max: 85 } }),
            base("regalia", {
                baseType: "Vaal Regalia",
                attributes: ["int"],
                ilvl: { min: 78, max: 83 },
            }),
            base("hubris", {
                baseType: "Hubris Circlet",
                itemClass: "Helmet",
                attributes: ["int"],
                links: null,
            }),
            base("necrotic", { baseType: "Necrotic Armour", attributes: ["dex", "int"] }),
            base("q25", { links: null, quality: 25 }),
            base("garb", {
                baseType: "Sacrificial Garb",
                attributes: ["str", "dex", "int"],
                links: null,
            }),
        ];
        const matching = (input: Record<string, unknown>) =>
            rankMarketBases(
                mixed,
                marketFiltersSchema.parse({
                    category: "armour-bases",
                    order: "name-asc",
                    ...input,
                }),
                chaosRates,
                50,
            ).rows.map((row) => row.id);
        expect(matching({ baseClass: "Helmet" })).toEqual(["hubris"]);
        expect(matching({ attributes: "int" })).toEqual(["hubris", "regalia"]);
        expect(matching({ attributes: "dex-int" })).toEqual(["necrotic"]);
        expect(matching({ attributes: "str-dex-int" })).toEqual(["garb"]);
        expect(matching({ ilvl: "84" })).toEqual(["titan"]);
        expect(matching({ ilvl: "80" })).toEqual(["regalia"]);
        expect(matching({ baseLinks: "1-5", baseClass: "Body Armour" })).toEqual([
            "necrotic",
            "titan",
            "regalia",
        ]);
        expect(matching({ quality: "25" })).toEqual(["q25"]);
        expect(marketFiltersSchema.safeParse({ baseClass: "Sword" }).success).toBe(false);
        expect(marketFiltersSchema.safeParse({ ilvl: "73" }).success).toBe(false);
    });

    it("describes each variant by item level, links and quality", () => {
        expect(marketBaseVariant(rows[0]!)).toBe("ilvl 86–100 · 1–5 links");
        expect(marketBaseVariant(rows[3]!)).toBe("ilvl 86–100 · 30%+ quality");
        expect(marketBaseDescription(rows[0]!)).toBe("Body Armour · Str · Level 68");
        expect(marketBaseDescription({ itemClass: "Ring", attributes: [] })).toBe("Ring");
        expect(marketBaseDescription({ itemClass: "Helmet", attributes: ["dex", "int"] })).toBe(
            "Helmet · Dex/Int",
        );
        expect(
            marketBaseDescription({ itemClass: "Two Hand Axe", attributes: ["str"], level: 64 }),
        ).toBe("Two Hand Axe · Str · Level 64");
    });
});

describe("generated crafting base list", () => {
    const { revision, bases } = marketBasesSchema.parse(data);
    const manifest: { revision: string; cohorts: Array<{ id: string }> } = JSON.parse(
        readFileSync("../../packages/poe-market/data/cohorts-poe1.json", "utf8"),
    );
    const cohorts = new Set(manifest.cohorts.map((cohort) => cohort.id));

    it("lists existing cohorts of the current manifest, equipment from item level 74", () => {
        expect(revision).toBe(manifest.revision);
        for (const entry of bases) {
            expect(cohorts.has(entry.id), entry.id).toBe(true);
            if (!entry.cluster) expect(entry.ilvl.max).toBeGreaterThanOrEqual(74);
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
        // Other equipment cannot reach six sockets, so its links are not split.
        expect(
            new Set(bases.filter((entry) => entry.links).map((entry) => entry.itemClass)),
        ).toEqual(new Set(MARKET_BASE_LINK_CLASSES));
        expect(new Set(bases.map((entry) => entry.category))).toEqual(
            new Set([
                "armour-bases",
                "weapon-bases",
                "accessory-bases",
                "flask-bases",
                "cluster-jewel-bases",
            ]),
        );
    });

    it("lists utility flasks by their key modifier levels and other flasks from ilvl 83", () => {
        const flasks = bases.filter((entry) => entry.category === "flask-bases");
        const names = (itemClass: string) =>
            new Set(flasks.filter((entry) => entry.itemClass === itemClass).map((e) => e.baseType));
        expect(names("Utility Flask").size).toBe(18);
        expect(names("Life Flask")).toEqual(
            new Set(["Eternal Life Flask", "Divine Life Flask", "Sanctified Life Flask"]),
        );
        expect(names("Mana Flask").has("Eternal Mana Flask")).toBe(true);
        expect(names("Hybrid Flask").has("Hallowed Hybrid Flask")).toBe(true);
        expect(
            flasks
                .filter((entry) => entry.baseType === "Quicksilver Flask")
                .map((entry) => `${entry.ilvl.min}-${entry.ilvl.max}`),
        ).toEqual(["74-79", "80-83", "84-84", "85-100"]);
        for (const entry of flasks.filter((entry) => entry.itemClass !== "Utility Flask"))
            expect(entry.ilvl, entry.id).toEqual({ min: 83, max: 100 });
        expect(flasks.every((entry) => entry.links === null && entry.quality === null)).toBe(true);
        expect(marketBaseDetails(flasks.find((e) => e.baseType === "Quicksilver Flask")!)).toBe(
            "ilvl 74–79 · Utility Flask",
        );
    });

    it("names the game data's flask classes as the market does", () => {
        expect(marketBaseClass("LifeFlask")).toBe("Life Flask");
        expect(marketBaseClass("UtilityFlask")).toBe("Utility Flask");
        expect(marketBaseClass("Body Armour")).toBe("Body Armour");
    });

    it("lists each base under a type of its category, with its attribute requirements", () => {
        for (const entry of bases)
            expect(
                (
                    MARKET_BASE_CLASSES[
                        entry.category as keyof typeof MARKET_BASE_CLASSES
                    ] as readonly string[]
                ).includes(entry.itemClass),
                entry.id,
            ).toBe(true);
        const find = (name: string) => bases.find((entry) => entry.baseType === name)!;
        expect(find("Titan Plate").attributes).toEqual(["str"]);
        expect(find("Necrotic Armour").attributes).toEqual(["dex", "int"]);
        expect(find("Focused Amulet").attributes).toEqual([]);
        for (const name of [
            "Cryonic Ring",
            "Enthalpic Ring",
            "Synaptic Ring",
            "Organic Ring",
            "Fugitive Ring",
            "Formless Ring",
        ])
            expect(find(name)?.category, name).toBe("accessory-bases");
        expect(find("Runic Helm").attributes).toEqual(["str", "dex", "int"]);
        expect(find("Titan Plate").level).toBe(73);
        expect(find("Large Cluster Jewel").level).toBeNull();
    });

    it("offers an attributes filter option for every attribute set the catalog lists", () => {
        for (const entry of bases.filter((entry) => entry.attributes.length))
            expect(Object.keys(MARKET_BASE_ATTRIBUTE_SETS), entry.id).toContain(
                entry.attributes.join("-"),
            );
    });

    it("groups lower item levels into at most three equipment bands per base", () => {
        const bands = (name: string) =>
            bases
                .filter((entry) => entry.baseType === name && !entry.quality && entry.links !== "6")
                .map((entry) => `${entry.ilvl.min}-${entry.ilvl.max}`);
        expect(bands("Focused Amulet")).toEqual(["74-83", "84-84", "85-100"]);
        expect(bands("Stygian Vise")).toEqual(["74-84", "85-85", "86-100"]);
        expect(bands("Imperial Staff")).toEqual(["74-81", "82-82", "83-100"]);
        // Flasks have fixed bands; see the flask test.
        for (const name of new Set(
            bases
                .filter((entry) => !entry.cluster && entry.category !== "flask-bases")
                .map((entry) => entry.baseType),
        ))
            expect(bands(name).length, name).toBeLessThanOrEqual(3);
    });

    it("splits Cluster Jewels by size, skill, passive count and poe.ninja's item level bands", () => {
        const large = bases.filter(
            (entry) =>
                entry.baseType === "Large Cluster Jewel" &&
                entry.cluster?.skill === "12% increased Chaos Damage",
        );
        expect(new Set(large.map((entry) => entry.cluster?.passives))).toEqual(
            new Set([8, 9, 10, 11, 12]),
        );
        expect(
            large
                .filter((entry) => entry.cluster?.passives === 8)
                .map((entry) => `${entry.ilvl.min}-${entry.ilvl.max}`),
        ).toEqual(["1-49", "50-67", "68-74", "75-83", "84-100"]);
        const small = bases.filter((entry) => entry.baseType === "Small Cluster Jewel");
        expect(new Set(small.map((entry) => entry.cluster?.passives))).toEqual(new Set([2, 3]));
        expect(
            bases.every(
                (entry) =>
                    (entry.category === "cluster-jewel-bases") === (entry.cluster !== undefined),
            ),
        ).toBe(true);
        expect(marketBaseVariant(large[0]!)).toBe(
            "12% increased Chaos Damage · 8 passives · ilvl 1–49",
        );
        expect(marketBaseDetails(large[0]!)).toBe(
            "12% increased Chaos Damage · 8 passives · ilvl 1–49",
        );
    });
});

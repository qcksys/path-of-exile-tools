// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve upstream field names.
import { normalizeApiItem } from "@poe-tools/item-query";
import {
    marketBaseEntry,
    marketBaseFromCohortId,
    marketBaseItemValue,
    marketBaseListSchema,
    marketBaseMarketCategory,
    marketBaseVariantValues,
} from "@poe-tools/market";
import data from "@poe-tools/market/market-bases-poe1.json";
import { describe, expect, it } from "vite-plus/test";
import {
    MARKET_BASE_ATTRIBUTE_SETS,
    MARKET_BASE_CLASSES,
    MARKET_BASE_LINK_CLASSES,
    marketBaseClass,
    marketBaseDescription,
} from "~/lib/market-bases";

const { bases, clusters } = marketBaseListSchema.parse(data);
const names = (itemClass: string) =>
    bases.filter((entry) => entry.itemClass === itemClass).map((entry) => entry.baseType);

describe("crafting base descriptions", () => {
    it("describes a base by its class, attributes and level", () => {
        expect(
            marketBaseDescription({ itemClass: "Body Armour", attributes: ["str"], level: 68 }),
        ).toBe("Body Armour · Str · Level 68");
        expect(marketBaseDescription({ itemClass: "Ring", attributes: [] })).toBe("Ring");
        expect(marketBaseDescription({ itemClass: "Helmet", attributes: ["dex", "int"] })).toBe(
            "Helmet · Dex/Int",
        );
    });

    it("names the game data's flask classes as the market does", () => {
        expect(marketBaseClass("LifeFlask")).toBe("Life Flask");
        expect(marketBaseClass("UtilityFlask")).toBe("Utility Flask");
        expect(marketBaseClass("Body Armour")).toBe("Body Armour");
    });
});

describe("generated crafting base list", () => {
    it("keeps the two newest armour bases of each defence type and implicit", () => {
        const body = names("Body Armour");
        expect(body).toContain("Twilight Regalia");
        expect(body).toContain("Nightweave Robe");
        for (const third of ["Arcane Vestment", "Vaal Regalia"]) expect(body).not.toContain(third);
        // An implicit is its own group, so it does not push out a plain base.
        const boots = names("Boots");
        for (const name of ["Velour Boots", "Harpyskin Boots", "Stormrider Boots"])
            expect(boots).toContain(name);
    });

    it("keeps each weapon that wins on a stat or an implicit", () => {
        expect(names("Two Hand Axe").sort()).toEqual([
            "Apex Cleaver",
            "Despot Axe",
            "Ezomyte Axe",
            "Fleshripper",
            "Sundering Axe",
            "Vaal Axe",
            "Void Axe",
        ]);
        // Its implicit's largest roll, though newer rune daggers share the effect.
        expect(names("Rune Dagger")).toContain("Platinum Kris");
        expect(names("Rune Dagger")).not.toContain("Ezomyte Dagger");
        expect(names("Wand")).not.toContain("Opal Wand");
    });

    it("keeps accessories and flasks on their own lists", () => {
        for (const name of ["Onyx Amulet", "Stygian Vise", "Two-Stone Ring", "Cryonic Ring"])
            expect(marketBaseEntry(name)?.category, name).toBe("accessory-bases");
        expect(names("Utility Flask")).toHaveLength(18);
        expect(new Set(names("Life Flask"))).toEqual(
            new Set(["Eternal Life Flask", "Divine Life Flask", "Sanctified Life Flask"]),
        );
        expect(marketBaseEntry("Quicksilver Flask")?.bands).toEqual([
            { min: 74, max: 79 },
            { min: 80, max: 83 },
            { min: 84, max: 84 },
            { min: 85, max: 100 },
        ]);
        expect(marketBaseEntry("Eternal Life Flask")?.bands).toEqual([{ min: 83, max: 100 }]);
    });

    it("lists each base under a type of its category, with a filterable attribute set", () => {
        for (const entry of bases) {
            expect(
                (
                    MARKET_BASE_CLASSES[
                        entry.category as keyof typeof MARKET_BASE_CLASSES
                    ] as readonly string[]
                ).includes(entry.itemClass),
                entry.baseType,
            ).toBe(true);
            if (entry.attributes.length)
                expect(Object.keys(MARKET_BASE_ATTRIBUTE_SETS)).toContain(
                    entry.attributes.join("-"),
                );
        }
        expect(marketBaseEntry("Twilight Regalia")?.attributes).toEqual(["int"]);
        expect(marketBaseEntry("Twilight Regalia")?.level).toBe(84);
    });

    it("splits only six-socket classes by links, and only armour by quality", () => {
        expect(
            new Set(bases.filter((entry) => entry.links).map((entry) => entry.itemClass)),
        ).toEqual(new Set(MARKET_BASE_LINK_CLASSES));
        expect(
            new Set(bases.filter((entry) => entry.quality).map((entry) => entry.itemClass)),
        ).toEqual(new Set(MARKET_BASE_CLASSES["armour-bases"]));
    });

    it("lists at most three item level bands from level 74 per equipment base", () => {
        for (const entry of bases.filter((base) => base.category !== "flask-bases")) {
            expect(entry.bands.length, entry.baseType).toBeLessThanOrEqual(3);
            expect(entry.bands.length, entry.baseType).toBeGreaterThan(0);
            expect(entry.bands[0]!.max, entry.baseType).toBeGreaterThanOrEqual(74);
        }
    });

    it("fits every market value in the signature column", () => {
        for (const filter of ["armour-bases", "weapon-bases", "cluster-jewel-bases"])
            for (const value of marketBaseVariantValues({
                category: filter,
                ilvl: filter === "cluster-jewel-bases" ? "84" : "86",
                baseLinks: "",
                quality: "",
            }) ?? [])
                expect(value.length, value).toBeLessThanOrEqual(255);
    });

    it("lists Cluster Jewels by size with their skills and passive counts", () => {
        expect(clusters.map((entry) => entry.baseType).sort()).toEqual([
            "Large Cluster Jewel",
            "Medium Cluster Jewel",
            "Small Cluster Jewel",
        ]);
        expect(marketBaseMarketCategory("Large Cluster Jewel")).toBe("cluster-jewel-bases");
        const large = clusters.find((entry) => entry.baseType === "Large Cluster Jewel")!;
        expect([large.minPassives, large.maxPassives]).toEqual([8, 12]);
    });
});

function item(fields: Record<string, unknown>) {
    return normalizeApiItem("poe1", "stash", {
        id: "x",
        icon: "",
        w: 2,
        h: 3,
        identified: true,
        name: "",
        typeLine: "Twilight Regalia",
        baseType: "Twilight Regalia",
        rarity: "Normal",
        frameType: 0,
        ilvl: 86,
        ...fields,
    });
}

const linked = (count: number) =>
    Array.from({ length: count }, () => ({ group: 0, attr: "I", sColour: "B" }));
const quality = (percent: number) => ({
    properties: [{ name: "Quality", values: [[`+${percent}%`, 1]], displayMode: 0 }],
});

describe("crafting base markets of an item", () => {
    it("reads item level, links and quality into exactly one market", () => {
        expect(marketBaseItemValue(item({ ilvl: 80 }))).toBe("ilvl 74–83 · 1–5 links");
        expect(marketBaseItemValue(item({ ilvl: 85 }))).toBe("ilvl 84–85 · 1–5 links");
        expect(marketBaseItemValue(item({ sockets: linked(6) }))).toBe("ilvl 86+ · 6 links");
        expect(marketBaseItemValue(item(quality(24)))).toBe("ilvl 86+ · 1–5 links");
        expect(marketBaseItemValue(item(quality(25)))).toBe(
            "ilvl 86+ · 1–5 links · Quality 25–29%",
        );
        expect(marketBaseItemValue(item({ ...quality(30), sockets: linked(6) }))).toBe(
            "ilvl 86+ · 6 links · Quality 30%+",
        );
        // Quality splits only item level 86 and up.
        expect(marketBaseItemValue(item({ ...quality(30), ilvl: 85 }))).toBe(
            "ilvl 84–85 · 1–5 links",
        );
    });

    it("leaves out items that are not clean, below the bands or not listed", () => {
        for (const fields of [
            { rarity: "Unique", frameType: 3 },
            { corrupted: true },
            { duplicated: true },
            { fractured: true },
            { synthesised: true },
            { influences: { shaper: true } },
            { identified: false, corrupted: true },
            { ilvl: 73 },
            { baseType: "Vaal Regalia", typeLine: "Vaal Regalia" },
        ])
            expect(marketBaseItemValue(item(fields)), JSON.stringify(fields)).toBeNull();
        expect(marketBaseItemValue(item({ rarity: "Rare", frameType: 2 }))).toBe(
            "ilvl 86+ · 1–5 links",
        );
    });

    it("reads an unidentified rare into the same market as an identified one", () => {
        const rare = { rarity: "Rare", frameType: 2, identified: false, ...quality(30) };
        expect(marketBaseItemValue(item({ ...rare, sockets: linked(6) }))).toBe(
            "ilvl 86+ · 6 links · Quality 30%+",
        );
    });

    it("reads a Cluster Jewel's skill, passive count and band from its enchantments", () => {
        const large = clusters.find((entry) => entry.baseType === "Large Cluster Jewel")!;
        const skill = large.skills[0]!;
        const jewel = {
            baseType: "Large Cluster Jewel",
            typeLine: "Large Cluster Jewel",
            ilvl: 84,
            enchantMods: [
                "Adds 8 Passive Skills",
                "2 Added Passive Skills are Jewel Sockets",
                `Added Small Passive Skills grant: ${skill.line}`,
            ],
        };
        expect(marketBaseItemValue(item(jewel))).toBe(`${skill.label} · 8 passives · ilvl 84+`);
        expect(
            marketBaseItemValue(
                item({ ...jewel, rarity: "Rare", frameType: 2, identified: false }),
            ),
        ).toBe(`${skill.label} · 8 passives · ilvl 84+`);
        expect(marketBaseItemValue(item({ ...jewel, enchantMods: [] }))).toBeNull();
    });
});

describe("crafting base market filters", () => {
    const values = (filters: Partial<Parameters<typeof marketBaseVariantValues>[0]>) =>
        marketBaseVariantValues({
            category: "armour-bases",
            ilvl: "",
            baseLinks: "",
            quality: "",
            ...filters,
        });

    it("filters nothing until one is set", () => {
        expect(values({})).toBeUndefined();
    });

    it("matches the band including a level, and its quality bands from 86", () => {
        const at86 = values({ ilvl: "86" })!;
        expect(at86).toContain("ilvl 86+ · 6 links");
        expect(at86).toContain("ilvl 86+ · 6 links · Quality 30%+");
        expect(at86).not.toContain("ilvl 74–83 · 1–5 links");
        expect(values({ ilvl: "84" })).not.toContain("ilvl 86+ · 6 links · Quality 30%+");
    });

    it("keeps links and treats quality as that band and better", () => {
        const six = values({ baseLinks: "6" })!;
        expect(six.every((value) => value.includes("6 links"))).toBe(true);
        const q25 = values({ quality: "25" })!;
        expect(q25).toContain("ilvl 86+ · 1–5 links · Quality 25–29%");
        expect(q25).toContain("ilvl 86+ · 1–5 links · Quality 30%+");
        const q30 = values({ quality: "30" })!;
        expect(q30).not.toContain("ilvl 86+ · 1–5 links · Quality 25–29%");
    });

    it("gives Cluster Jewels no link or quality markets", () => {
        expect(values({ category: "cluster-jewel-bases", baseLinks: "6" })).toEqual([]);
        expect(values({ category: "cluster-jewel-bases", ilvl: "84" })!.length).toBeGreaterThan(0);
    });
});

describe("old crafting base page IDs", () => {
    it("finds the market an old cohort ID now lists under", () => {
        expect(marketBaseFromCohortId("base:twilight-regalia:86-100:1-5-link")).toEqual({
            baseType: "Twilight Regalia",
            category: "armour-bases",
            value: "ilvl 86+ · 1–5 links",
        });
        expect(marketBaseFromCohortId("base:vaal-regalia:86-100:1-5-link")).toBeUndefined();
        const large = clusters.find((entry) => entry.baseType === "Large Cluster Jewel")!;
        const skill = large.skills[0]!;
        expect(
            marketBaseFromCohortId(`base:large-cluster-jewel:${skill.id}:8-passives:84-100`),
        ).toEqual({
            baseType: "Large Cluster Jewel",
            category: "cluster-jewel-bases",
            value: `${skill.label} · 8 passives · ilvl 84+`,
        });
    });
});

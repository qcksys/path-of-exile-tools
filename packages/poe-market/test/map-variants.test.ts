import { describe, expect, it } from "vite-plus/test";
import {
    isBlightedMap,
    isMapMarketBase,
    mapDeliriumBand,
    mapHasQuantityBands,
    mapInfluence,
    mapModBand,
    mapModCount,
    mapQuantityBand,
    mapVariantValue,
    mapVariantValues,
    parseMapVariantValue,
} from "../src/map-variants.ts";
import samples from "./fixtures/map-mod-counts.json" with { type: "json" };

describe("map variants", () => {
    it.each([
        ["Map (Tier 1)", true],
        ["Map (Tier 16)", true],
        ["Nightmare Map", true],
        ["Strand Map", false],
        ["Maven's Invitation: The Feared", false],
    ])("treats %s as a map market base: %s", (baseType, expected) => {
        expect(isMapMarketBase(baseType)).toBe(expected);
    });

    it.each([
        ["Blighted Map (Tier 14)", true],
        ["Blight-ravaged Map (Tier 16)", true],
        ["Fecund Blighted Map of Endurance (Tier 14)", true],
        ["Fecund Map of Endurance (Tier 14)", false],
        ["Map (Tier 16)", false],
    ])("treats %s as blighted: %s", (typeLine, expected) => {
        expect(isBlightedMap(typeLine)).toBe(expected);
    });

    it.each([
        ["Map (Tier 16)", true],
        ["Nightmare Map", true],
        ["Map (Tier 15)", false],
        ["Map (Tier 1)", false],
    ])("splits %s by quantity: %s", (baseType, expected) => {
        expect(mapHasQuantityBands(baseType)).toBe(expected);
    });

    it.each([
        [0, "1-6"],
        [6, "1-6"],
        [7, "8"],
        [8, "8"],
    ] as const)("bands %i mods as %s", (mods, band) => {
        expect(mapModBand(mods)).toBe(band);
    });

    it.each([
        [0, "0-59"],
        [59, "0-59"],
        [60, "60-79"],
        [99, "80-99"],
        [100, "100-119"],
        [199, "180-199"],
        [200, "200"],
        [260, "200"],
    ] as const)("bands quantity %i%% as %s", (quantity, band) => {
        expect(mapQuantityBand(quantity)).toBe(band);
    });

    it.each([
        [0, "0"],
        [20, "20"],
        [100, "100"],
        [120, "100"],
    ] as const)("bands %i%% delirious as %s", (delirious, band) => {
        expect(mapDeliriumBand(delirious)).toBe(band);
    });

    it("counts a mod that shows two lines once", () => {
        expect(
            mapModCount([
                "Monsters have +1 to Maximum Power Charges",
                "Monsters gain a Power Charge on Hit",
                "Unique Boss deals 25% increased Damage",
                "Unique Boss has 30% increased Attack and Cast Speed",
                "Monsters' Action Speed cannot be modified to below Base Value\nMonsters' Movement Speed cannot be modified to below Base Value",
                "Monsters cannot be Taunted",
            ]),
        ).toBe(3);
    });

    it("bands every traded sample map by its real mod count", () => {
        for (const { explicitMods, mods } of samples.maps)
            expect(mapModBand(mapModCount(explicitMods)), explicitMods.join(" / ")).toBe(
                mapModBand(mods),
            );
    });

    it("names a variant by its bands", () => {
        expect(
            mapVariantValue({ identified: true, mods: "8", quantity: "100-119", delirium: "40" }),
        ).toBe("8 mods · Quantity 100–119% · Delirium 40%");
        expect(mapVariantValue({ identified: true, mods: "1-6", delirium: "0" })).toBe(
            "1–6 mods · Delirium 0%",
        );
        expect(mapVariantValue({ identified: false, delirium: "20" })).toBe(
            "Unidentified · Delirium 20%",
        );
        expect(mapVariantValue({ identified: false, delirium: "0", influence: "memory" })).toBe(
            "Unidentified · Delirium 0% · Memory",
        );
    });

    it.each([
        [["Area is influenced by The Shaper"], "shaper"],
        [["Area is influenced by The Elder"], "elder"],
        [["Area is influenced by The Elder", "Map is occupied by The Enslaver"], "elder-guardian"],
        [["Map is occupied by The Purifier", "Area is influenced by The Elder"], "elder-guardian"],
        [["Area is Influenced by the Originator's Memories"], "memory"],
        [[], undefined],
    ] as const)("reads the influence of a map with implicits %j as %s", (implicits, influence) => {
        expect(mapInfluence(implicits)).toBe(influence);
    });

    it.each([
        "Unidentified · Delirium 0%",
        "Unidentified · Delirium 40% · Elder Guardian",
        "1–6 mods · Delirium 100%",
        "8 mods · Quantity 200%+ · Delirium 20% · Memory",
    ])("parses %s back into its fields", (value) => {
        const fields = parseMapVariantValue(value);
        expect(fields).toBeDefined();
        expect(mapVariantValue(fields!)).toBe(value);
    });

    it("reads each field of a map variant value", () => {
        expect(parseMapVariantValue("8 mods · Quantity 100–119% · Delirium 40% · Shaper")).toEqual({
            identified: true,
            mods: "8",
            quantity: "100-119",
            delirium: "40",
            influence: "shaper",
        });
    });

    it.each([
        "",
        "Delirium 0%",
        "8 mods",
        "7 mods · Delirium 0%",
        "8 mods · Delirium 0% · Conqueror",
    ])("does not parse %j", (value) => {
        expect(parseMapVariantValue(value)).toBeUndefined();
    });

    const noFilters = { mapMods: "", mapQuantity: "", mapDelirium: "", mapInfluence: "" };

    it("lists no values without filters", () => {
        expect(mapVariantValues(noFilters)).toBeUndefined();
    });

    it("lists the values passing band filters", () => {
        const values = mapVariantValues({ ...noFilters, mapMods: "8", mapDelirium: "-0" });
        expect(values).toContain("8 mods · Delirium 20%");
        expect(values).toContain("8 mods · Delirium 20% · Memory");
        expect(values).toContain("8 mods · Delirium 20% · Shaper");
        expect(values).toContain("8 mods · Delirium 20% · Elder");
        expect(values).toContain("8 mods · Delirium 20% · Elder Guardian");
        expect(values).toContain("8 mods · Quantity 200%+ · Delirium 100%");
        expect(values).not.toContain("8 mods · Delirium 0%");
        expect(values).not.toContain("1–6 mods · Delirium 20%");
        expect(values?.some((value) => value.startsWith("Unidentified"))).toBe(false);
    });

    it("keeps unidentified maps and lower tiers unless a filter rules them out", () => {
        const values = mapVariantValues({ ...noFilters, mapDelirium: "20" });
        expect(values).toEqual(
            expect.arrayContaining([
                "Unidentified · Delirium 20%",
                "1–6 mods · Delirium 20%",
                "1–6 mods · Quantity 0–59% · Delirium 20%",
            ]),
        );
        const quantity = mapVariantValues({ ...noFilters, mapQuantity: "100-119" });
        expect(quantity).toContain("8 mods · Quantity 100–119% · Delirium 0%");
        expect(quantity).not.toContain("8 mods · Delirium 0%");
        expect(quantity).not.toContain("Unidentified · Delirium 0%");
    });

    it("lists the values passing an influence filter", () => {
        const values = mapVariantValues({ ...noFilters, mapInfluence: "elder-guardian,memory" });
        expect(values).toContain("Unidentified · Delirium 0% · Elder Guardian");
        expect(values).toContain("8 mods · Delirium 40% · Memory");
        expect(values).not.toContain("8 mods · Delirium 40% · Elder");
        expect(values).not.toContain("8 mods · Delirium 40%");
        const uninfluenced = mapVariantValues({ ...noFilters, mapInfluence: "none" });
        expect(uninfluenced).toContain("8 mods · Delirium 40%");
        expect(uninfluenced?.some((value) => value.endsWith("Shaper"))).toBe(false);
        const notShaper = mapVariantValues({ ...noFilters, mapInfluence: "-shaper" });
        expect(notShaper).toContain("8 mods · Delirium 40%");
        expect(notShaper).toContain("8 mods · Delirium 40% · Elder");
        expect(notShaper?.some((value) => value.endsWith("Shaper"))).toBe(false);
    });

    it("lists nothing for an unknown band", () => {
        expect(mapVariantValues({ ...noFilters, mapMods: "7" })).toEqual([]);
        expect(mapVariantValues({ ...noFilters, mapInfluence: "conqueror" })).toEqual([]);
    });
});

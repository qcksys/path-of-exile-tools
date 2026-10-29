import { describe, expect, it } from "vite-plus/test";
import {
    isBlightedMap,
    isMapMarketBase,
    mapDeliriumBand,
    mapHasQuantityBands,
    mapModBand,
    mapModCount,
    mapQuantityBand,
    mapVariantValue,
    mapVariantValues,
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
    });

    it("lists no values without filters", () => {
        expect(mapVariantValues({ mapMods: "", mapQuantity: "", mapDelirium: "" })).toBeUndefined();
    });

    it("lists the values passing band filters", () => {
        const values = mapVariantValues({ mapMods: "8", mapQuantity: "", mapDelirium: "-0" });
        expect(values).toContain("8 mods · Delirium 20%");
        expect(values).toContain("8 mods · Quantity 200%+ · Delirium 100%");
        expect(values).not.toContain("8 mods · Delirium 0%");
        expect(values).not.toContain("1–6 mods · Delirium 20%");
        expect(values?.some((value) => value.startsWith("Unidentified"))).toBe(false);
    });

    it("keeps unidentified maps and lower tiers unless a filter rules them out", () => {
        const values = mapVariantValues({ mapMods: "", mapQuantity: "", mapDelirium: "20" });
        expect(values).toEqual(
            expect.arrayContaining([
                "Unidentified · Delirium 20%",
                "1–6 mods · Delirium 20%",
                "1–6 mods · Quantity 0–59% · Delirium 20%",
            ]),
        );
        const quantity = mapVariantValues({ mapMods: "", mapQuantity: "100-119", mapDelirium: "" });
        expect(quantity).toContain("8 mods · Quantity 100–119% · Delirium 0%");
        expect(quantity).not.toContain("8 mods · Delirium 0%");
        expect(quantity).not.toContain("Unidentified · Delirium 0%");
    });

    it("lists nothing for an unknown band", () => {
        expect(mapVariantValues({ mapMods: "7", mapQuantity: "", mapDelirium: "" })).toEqual([]);
    });
});

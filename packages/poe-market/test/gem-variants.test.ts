import { describe, expect, it } from "vite-plus/test";
import {
    formatGemBandFilter,
    gemLevelBand,
    gemQualityBand,
    gemTier,
    gemVariantValue,
    gemVariantValues,
    parseGemBandFilter,
} from "../src/gem-variants.ts";

describe("gem variants", () => {
    it.each([
        ["Fireball", "normal"],
        ["Kinetic Bolt of Fragmentation", "normal"],
        ["Empower Support", "exceptional"],
        ["Enlighten Support", "exceptional"],
        ["Enhance Support", "exceptional"],
        ["Awakened Empower Support", "awakened"],
        ["Awakened Added Fire Damage Support", "awakened"],
    ] as const)("puts %s in the %s tier", (name, tier) => {
        expect(gemTier(name)).toBe(tier);
    });

    it.each([
        ["normal", 1, "1-19"],
        ["normal", 19, "1-19"],
        ["normal", 20, "20"],
        ["normal", 21, "21"],
        ["exceptional", 2, "1-19"],
        ["exceptional", 3, "20"],
        ["exceptional", 4, "21"],
        ["awakened", 4, "1-19"],
        ["awakened", 5, "20"],
        ["awakened", 6, "21"],
    ] as const)("bands a %s gem at level %i as %s", (tier, level, band) => {
        expect(gemLevelBand(level, tier)).toBe(band);
    });

    it.each([
        [0, "0-19"],
        [19, "0-19"],
        [20, "20"],
        [21, "21-23"],
        [23, "21-23"],
    ] as const)("bands quality %i as %s", (quality, band) => {
        expect(gemQualityBand(quality)).toBe(band);
    });

    it("names each tier's level bands in the market value", () => {
        expect(gemVariantValue("normal", "1-19", "0-19")).toBe("Level 1–19 · Quality 0–19%");
        expect(gemVariantValue("exceptional", "20", "20")).toBe("Level 3 · Quality 20%");
        expect(gemVariantValue("awakened", "21", "21-23")).toBe("Level 6 · Quality 21–23%");
    });
});

describe("gem band filters", () => {
    it("parses included and excluded bands and refuses unknown ones", () => {
        expect(parseGemBandFilter("20,-21", ["1-19", "20", "21"])).toEqual({
            include: new Set(["20"]),
            exclude: new Set(["21"]),
        });
        expect(parseGemBandFilter("", ["1-19"])).toEqual({
            include: new Set(),
            exclude: new Set(),
        });
        expect(parseGemBandFilter("22", ["1-19", "20", "21"])).toBeNull();
    });

    it("formats toggle states back to the URL form", () => {
        expect(formatGemBandFilter({ "1-19": undefined, 20: "include", 21: "exclude" })).toBe(
            "20,-21",
        );
        expect(formatGemBandFilter({})).toBe("");
    });

    it("allows every value without filters", () => {
        expect(gemVariantValues({ gemLevel: "", gemQuality: "" })).toBeUndefined();
    });

    it("allows the included bands of every tier", () => {
        expect(gemVariantValues({ gemLevel: "20", gemQuality: "20" })).toEqual([
            "Level 20 · Quality 20%",
            "Level 3 · Quality 20%",
            "Level 5 · Quality 20%",
        ]);
    });

    it("allows every band but the excluded ones when nothing is included", () => {
        const values = gemVariantValues({ gemLevel: "-21", gemQuality: "-0-19,-21-23" });
        expect(values).toEqual([
            "Level 1–19 · Quality 20%",
            "Level 20 · Quality 20%",
            "Level 1–2 · Quality 20%",
            "Level 3 · Quality 20%",
            "Level 1–4 · Quality 20%",
            "Level 5 · Quality 20%",
        ]);
    });

    it("allows nothing when every band is excluded", () => {
        expect(gemVariantValues({ gemLevel: "-1-19,-20,-21", gemQuality: "" })).toEqual([]);
    });
});

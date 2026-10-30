import { describe, expect, it } from "vite-plus/test";
import {
    formatGemBandFilter,
    gemLevelBand,
    gemMarketKey,
    gemQualityBand,
    gemTier,
    gemVariantValue,
    gemVariantValues,
    parseGemBandFilter,
    TRANSFIGURED_GEMS,
    VAAL_GEMS,
} from "../src/gem-variants.ts";

describe("gem variants", () => {
    it.each([
        ["Fireball", ["Projectile", "Spell", "AoE", "Fire"], "normal"],
        ["Kinetic Bolt of Fragmentation", ["Projectile", "Spell"], "normal"],
        // Named like an exceptional gem, but without the tag it is not one.
        ["Empower Support", ["Support"], "normal"],
        ["Empower Support", ["Exceptional", "Support"], "exceptional"],
        [
            "Greater Multistrike Support",
            ["Exceptional", "Attack", "Melee", "Support"],
            "exceptional",
        ],
        ["Awakened Empower Support", ["Exceptional", "Support"], "awakened-exceptional"],
        ["Awakened Added Fire Damage Support", ["Fire", "Support"], "awakened"],
    ] as const)("puts %s tagged %j in the %s tier", (name, tags, tier) => {
        expect(gemTier({ name, tags })).toBe(tier);
    });

    it.each([
        ["normal", 1, "1-19"],
        ["normal", 19, "1-19"],
        ["normal", 20, "20"],
        ["normal", 21, "21"],
        ["exceptional", 2, "1-19"],
        ["exceptional", 3, "20"],
        ["exceptional", 4, "21"],
        ["awakened-exceptional", 3, "1-19"],
        ["awakened-exceptional", 4, "20"],
        ["awakened-exceptional", 5, "21"],
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
        expect(gemVariantValue("exceptional", "20", "20")).toBe("Level 3 (max) · Quality 20%");
        expect(gemVariantValue("awakened-exceptional", "1-19", "20")).toBe(
            "Level 1–3 · Quality 20%",
        );
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
            "Level 20 (max) · Quality 20%",
            "Level 3 (max) · Quality 20%",
            "Level 4 (max) · Quality 20%",
            "Level 5 (max) · Quality 20%",
        ]);
    });

    it("maps the under and over max bands to each tier's own levels", () => {
        expect(gemVariantValues({ gemLevel: "1-19", gemQuality: "20" })).toEqual([
            "Level 1–19 · Quality 20%",
            "Level 1–2 · Quality 20%",
            "Level 1–3 · Quality 20%",
            "Level 1–4 · Quality 20%",
        ]);
        expect(gemVariantValues({ gemLevel: "21", gemQuality: "20" })).toEqual([
            "Level 21 · Quality 20%",
            "Level 4 · Quality 20%",
            "Level 5 · Quality 20%",
            "Level 6 · Quality 20%",
        ]);
    });

    it("allows every band but the excluded ones when nothing is included", () => {
        const values = gemVariantValues({ gemLevel: "-21", gemQuality: "-0-19,-21-23" });
        expect(values).toEqual([
            "Level 1–19 · Quality 20%",
            "Level 20 (max) · Quality 20%",
            "Level 1–2 · Quality 20%",
            "Level 3 (max) · Quality 20%",
            "Level 1–3 · Quality 20%",
            "Level 4 (max) · Quality 20%",
            "Level 1–4 · Quality 20%",
            "Level 5 (max) · Quality 20%",
        ]);
    });

    it("gives every tier's bands distinct values", () => {
        const values = gemVariantValues({ gemLevel: "", gemQuality: "-0-19" })!;
        expect(values).toHaveLength(4 * 3 * 2);
        expect(new Set(values).size).toBe(values.length);
    });

    it("allows nothing when every band is excluded", () => {
        expect(gemVariantValues({ gemLevel: "-1-19,-20,-21", gemQuality: "" })).toEqual([]);
    });
});

describe("transfigured gems", () => {
    it("lists transfigured gems and Vaal gems with a transfigured skill", () => {
        expect(TRANSFIGURED_GEMS).toContain("Kinetic Bolt of Fragmentation");
        expect(TRANSFIGURED_GEMS).toContain("Vaal Arc (Arc of Surging)");
        expect(TRANSFIGURED_GEMS).not.toContain("Kinetic Bolt");
        expect(TRANSFIGURED_GEMS).not.toContain("Vaal Arc");
    });

    it("lists Vaal gems by their game data tag, with their transfigured forms", () => {
        expect(VAAL_GEMS).toContain("Vaal Arc");
        expect(VAAL_GEMS).toContain("Vaal Arc (Arc of Surging)");
        expect(VAAL_GEMS).not.toContain("Arc");
        // Named Vaal, but not Vaal gems.
        expect(VAAL_GEMS).not.toContain("Vaal Sacrifice Support");
        expect(VAAL_GEMS).not.toContain("Vaal Temptation Support");
    });

    it("keys a gem by its type line, and a transfigured Vaal gem by its skill too", () => {
        expect(gemMarketKey({ typeLine: "Kinetic Bolt of Fragmentation" })).toBe(
            "Kinetic Bolt of Fragmentation",
        );
        expect(gemMarketKey({ typeLine: "Vaal Arc", hybridName: "Arc of Surging" })).toBe(
            "Vaal Arc (Arc of Surging)",
        );
        expect(gemMarketKey({ typeLine: "Vaal Arc", hybridName: "Arc" })).toBe("Vaal Arc");
        expect(
            gemMarketKey({ typeLine: "Vaal Impurity of Fire", hybridName: "Purity of Fire" }),
        ).toBe("Vaal Impurity of Fire");
    });
});

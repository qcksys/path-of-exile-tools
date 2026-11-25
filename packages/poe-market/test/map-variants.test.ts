import { describe, expect, it } from "vite-plus/test";
import {
    isBlightedMap,
    isHiddenMapModLine,
    isMapMarketBase,
    type MapFilters,
    mapAtlasDropsBand,
    mapContents,
    mapDeliriumBand,
    mapHasAtlasDropsBands,
    mapInfluences,
    mapModBand,
    mapModCount,
    mapValueMeets,
    mapVariantConditions,
    mapVariantValue,
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
    ])("splits %s by Atlas Drops: %s", (baseType, expected) => {
        expect(mapHasAtlasDropsBands(baseType)).toBe(expected);
    });

    it.each([
        [0, "1-6"],
        [6, "1-6"],
        [7, "8"],
        [8, "8"],
        [9, "8"],
    ] as const)("bands %i mods as %s", (mods, band) => {
        expect(mapModBand(mods)).toBe(band);
    });

    it.each([
        [0, "0-39"],
        [39, "0-39"],
        [40, "40-59"],
        [59, "40-59"],
        [60, "60-79"],
        [99, "80-99"],
        [100, "100-119"],
        [119, "100-119"],
        [120, "120"],
        [131, "120"],
    ] as const)("bands %i%% Atlas Drops as %s", (atlasDrops, band) => {
        expect(mapAtlasDropsBand(atlasDrops)).toBe(band);
    });

    it.each([
        [0, "0"],
        [7, "0"],
        [12, "20"],
        [20, "20"],
        [37, "40"],
        [100, "100"],
        [120, "100"],
    ] as const)("bands %i%% delirious as %s", (delirious, band) => {
        expect(mapDeliriumBand(delirious)).toBe(band);
    });

    it.each([
        "16% increased [AtlasDropScaling|Atlas Drops] in this Area",
        "36% more [Thread|Threads] found in Area",
        "35% more Maps found in Area",
        "8% increased Rarity of Items found in this Area",
        "5% increased Pack size",
    ])("hides the property line %j from the mod list", (line) => {
        expect(isHiddenMapModLine(line)).toBe(true);
    });

    it("reads the league content of a map's suffixes, in a fixed order", () => {
        expect(
            mapContents([
                "Area contains an [EvocatorKTash|Evocator of K'Tash]",
                "Monsters cannot be Stunned",
                "Area contains a [Mirage]",
                "Area contains a buried Pandemonium Sentinel",
            ]),
        ).toEqual(["mirage", "pandemonium-sentinel", "evocator-ktash"]);
        expect(
            mapContents([
                "Area contains a Mirror of Delirium",
                "Area contains the Viridian Wildwood",
                "Area contains a buried Apex Sentinel",
                "Area contains a buried Stalker Sentinel",
                "Area contains an [EvocatorBeidat|Evocator of Beidat]",
                "Area contains an [EvocatorGhorr|Evocator of Ghorr]",
            ]),
        ).toEqual([
            "delirium-mirror",
            "wildwood",
            "apex-sentinel",
            "stalker-sentinel",
            "evocator-beidat",
            "evocator-ghorr",
        ]);
        expect(
            mapContents(["Area contains many Totems", "Players in Area are 22% Delirious"]),
        ).toEqual([]);
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
            mapVariantValue({ identified: true, mods: "8", atlasDrops: "100-119", delirium: "40" }),
        ).toBe("8 mods · Atlas Drops 100–119% · Delirium 40%");
        expect(
            mapVariantValue({
                identified: true,
                mods: "1-6",
                atlasDrops: "60-79",
                delirium: "0",
                contents: ["evocator-ghorr", "mirage"],
                influences: ["citadel", "memory"],
            }),
        ).toBe(
            "1–6 mods · Atlas Drops 60–79% · Delirium 0% · Mirage · Evocator of Ghorr · Memory · Citadel",
        );
        expect(mapVariantValue({ identified: true, mods: "1-6", delirium: "0" })).toBe(
            "1–6 mods · Delirium 0%",
        );
        expect(mapVariantValue({ identified: false, delirium: "20" })).toBe(
            "Unidentified · Delirium 20%",
        );
        expect(mapVariantValue({ identified: false, delirium: "0", influences: ["memory"] })).toBe(
            "Unidentified · Delirium 0% · Memory",
        );
    });

    it.each([
        [["Area is influenced by The Shaper"], ["shaper"]],
        [["Area is influenced by The Elder"], ["elder"]],
        [
            ["Area is influenced by The Elder", "Map is occupied by The Enslaver"],
            ["elder-guardian"],
        ],
        [
            ["Map is occupied by The Purifier", "Area is influenced by The Elder"],
            ["elder-guardian"],
        ],
        [["Area is Influenced by the Originator's Memories"], ["memory"]],
        [["Map contains Baran's Citadel"], ["citadel"]],
        [["Map contains Al-Hezmin's Citadel", "+7% Pack Size"], ["citadel"]],
        [
            ["Map contains Drox's Citadel", "Area is Influenced by the Originator's Memories"],
            ["memory", "citadel"],
        ],
        [
            ["Area is Influenced by the Originator's Memories", "Map contains Veritania's Citadel"],
            ["memory", "citadel"],
        ],
        [[], []],
    ] as const)(
        "reads the influences of a map with implicits %j as %j",
        (implicits, influences) => {
            expect(mapInfluences(implicits)).toEqual(influences);
        },
    );

    it.each([
        "Unidentified · Delirium 0%",
        "Unidentified · Delirium 40% · Elder Guardian",
        "1–6 mods · Delirium 100%",
        "8 mods · Atlas Drops 120%+ · Delirium 20% · Memory",
        "1–6 mods · Atlas Drops 0–39% · Delirium 0% · Mirror of Delirium · Viridian Wildwood",
        "8 mods · Delirium 0% · Stalker Sentinel · Evocator of K'Tash · Citadel",
        "Unidentified · Delirium 0% · Memory · Citadel",
    ])("parses %s back into its fields", (value) => {
        const fields = parseMapVariantValue(value);
        expect(fields).toBeDefined();
        expect(mapVariantValue(fields!)).toBe(value);
    });

    it("reads each field of a map variant value", () => {
        expect(
            parseMapVariantValue(
                "8 mods · Atlas Drops 100–119% · Delirium 40% · Mirage · Apex Sentinel · Shaper",
            ),
        ).toEqual({
            identified: true,
            mods: "8",
            atlasDrops: "100-119",
            delirium: "40",
            contents: ["mirage", "apex-sentinel"],
            influences: ["shaper"],
        });
    });

    it.each([
        "",
        "Delirium 0%",
        "8 mods",
        "7 mods · Delirium 0%",
        "8 mods · Delirium 0% · Conqueror",
        "8 mods · Quantity 100–119% · Delirium 0%",
        "8 mods · Delirium 0% · Apex Sentinel · Mirage",
        "8 mods · Delirium 0% · Citadel · Memory",
    ])("does not parse %j", (value) => {
        expect(parseMapVariantValue(value)).toBeUndefined();
    });

    const noFilters: MapFilters = {
        mapMods: "",
        mapAtlasDrops: "",
        mapDelirium: "",
        mapContent: "",
        mapInfluence: "",
    };
    /** The values among `values` that pass `filters`. */
    const passing = (filters: Partial<MapFilters>, values: readonly string[]) => {
        const conditions = mapVariantConditions({ ...noFilters, ...filters });
        return values.filter((value) => !conditions || mapValueMeets(value, conditions));
    };

    it("sets no conditions without map filters, whatever other filters are set", () => {
        expect(mapVariantConditions(noFilters)).toBeUndefined();
        expect(
            mapVariantConditions({
                ...noFilters,
                league: "Covens",
                category: "maps",
            } as MapFilters),
        ).toBeUndefined();
    });

    it("keeps the values passing band filters", () => {
        expect(
            passing({ mapMods: "8", mapDelirium: "-0" }, [
                "8 mods · Delirium 20%",
                "8 mods · Delirium 20% · Memory",
                "8 mods · Delirium 20% · Elder Guardian",
                "8 mods · Atlas Drops 120%+ · Delirium 100% · Mirage",
                "8 mods · Delirium 0%",
                "1–6 mods · Delirium 20%",
                "Unidentified · Delirium 20%",
            ]),
        ).toEqual([
            "8 mods · Delirium 20%",
            "8 mods · Delirium 20% · Memory",
            "8 mods · Delirium 20% · Elder Guardian",
            "8 mods · Atlas Drops 120%+ · Delirium 100% · Mirage",
        ]);
    });

    it("keeps unidentified maps and lower tiers unless a filter rules them out", () => {
        const values = [
            "Unidentified · Delirium 20%",
            "1–6 mods · Delirium 20%",
            "1–6 mods · Atlas Drops 0–39% · Delirium 20%",
            "8 mods · Atlas Drops 100–119% · Delirium 0%",
            "8 mods · Delirium 0%",
            "Unidentified · Delirium 0%",
        ];
        expect(passing({ mapDelirium: "20" }, values)).toEqual(values.slice(0, 3));
        expect(passing({ mapAtlasDrops: "100-119" }, values)).toEqual([
            "8 mods · Atlas Drops 100–119% · Delirium 0%",
        ]);
    });

    it("tests whole parts, so an influence filter tells Elder from Elder Guardian", () => {
        const values = [
            "Unidentified · Delirium 0% · Elder Guardian",
            "8 mods · Delirium 40% · Memory",
            "8 mods · Delirium 40% · Elder",
            "8 mods · Delirium 40% · Citadel",
            "8 mods · Delirium 40% · Shaper",
            "8 mods · Delirium 40%",
        ];
        expect(passing({ mapInfluence: "elder-guardian,memory" }, values)).toEqual(
            values.slice(0, 2),
        );
        expect(passing({ mapInfluence: "elder" }, values)).toEqual([
            "8 mods · Delirium 40% · Elder",
        ]);
        expect(passing({ mapInfluence: "none,citadel" }, values)).toEqual([
            "8 mods · Delirium 40% · Citadel",
            "8 mods · Delirium 40%",
        ]);
        expect(passing({ mapInfluence: "-shaper" }, values)).toEqual(
            values.filter((value) => !value.endsWith("Shaper")),
        );
    });

    it("lists Memory, Citadel and Memory with Citadel apart, and each filter finds both of its", () => {
        const values = [
            "1–6 mods · Delirium 0% · Memory",
            "1–6 mods · Delirium 0% · Citadel",
            "1–6 mods · Delirium 0% · Memory · Citadel",
            "1–6 mods · Delirium 0%",
        ];
        expect(passing({ mapInfluence: "memory" }, values)).toEqual([values[0], values[2]]);
        expect(passing({ mapInfluence: "citadel" }, values)).toEqual([values[1], values[2]]);
        expect(passing({ mapInfluence: "memory,-citadel" }, values)).toEqual([values[0]]);
        expect(passing({ mapInfluence: "citadel,-memory" }, values)).toEqual([values[1]]);
        expect(passing({ mapInfluence: "-none" }, values)).toEqual(values.slice(0, 3));
    });

    it("keeps maps with any included content and none excluded, whatever else they carry", () => {
        const values = [
            "1–6 mods · Delirium 0%",
            "1–6 mods · Delirium 0% · Mirage",
            "1–6 mods · Delirium 0% · Mirage · Apex Sentinel",
            "1–6 mods · Delirium 0% · Mirror of Delirium · Viridian Wildwood",
            "1–6 mods · Delirium 0% · Apex Sentinel · Memory",
        ];
        expect(passing({ mapContent: "mirage" }, values)).toEqual(values.slice(1, 3));
        expect(passing({ mapContent: "mirage,wildwood" }, values)).toEqual(values.slice(1, 4));
        expect(passing({ mapContent: "none" }, values)).toEqual([values[0]]);
        expect(passing({ mapContent: "none,mirage" }, values)).toEqual(values.slice(0, 3));
        expect(passing({ mapContent: "-none" }, values)).toEqual(values.slice(1));
        expect(passing({ mapContent: "-apex-sentinel" }, values)).toEqual([
            values[0],
            values[1],
            values[3],
        ]);
        expect(passing({ mapContent: "mirage,-apex-sentinel" }, values)).toEqual([values[1]]);
        expect(passing({ mapContent: "apex-sentinel", mapInfluence: "none" }, values)).toEqual([
            values[2],
        ]);
    });

    it("keeps nothing for an unknown band", () => {
        const values = ["8 mods · Delirium 0%", "1–6 mods · Delirium 0% · Mirage"];
        expect(passing({ mapMods: "7" }, values)).toEqual([]);
        expect(passing({ mapInfluence: "conqueror" }, values)).toEqual([]);
        expect(passing({ mapContent: "abyss" }, values)).toEqual([]);
    });
});

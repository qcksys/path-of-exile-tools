import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import {
    resolveAspectModifier,
    resolveHarvestAffinity,
    resolveHarvestEnchantment,
    resolveHarvestInfluenceClasses,
} from "../src/crafting-data.ts";
import { validateCraftingData } from "../src/crafting-data-model.ts";
import {
    resolveBaseQuality,
    resolveBeastAugmentation,
    resolveBeastMapCorruption,
    resolveBeastMetamods,
    resolveBeastSockets,
    resolveBlightedMaps,
    resolveCatalystMaximumQuality,
    resolveMemoryMaps,
    resolveQualityInfusers,
    resolveSanctification,
    resolveTaintedCatalysts,
    resolveTalismanCraft,
} from "../src/crafting-keywords.ts";
import { digest } from "../src/io.ts";
import { dataPackageManifestSchema, modsSchema } from "../src/model.ts";

describe.each(["poe1", "poe2"] as const)("%s crafting extraction", (game) => {
    const read = (path: string) =>
        readFileSync(new URL(`../../poe-${game === "poe1" ? 1 : 2}-data/${path}`, import.meta.url));
    const json = (path: string) => JSON.parse(read(path).toString("utf8"));
    const manifest = dataPackageManifestSchema.parse(json("manifest.json"));
    const data = {
        base_items: json("data/base_items.json"),
        mods: json("data/mods.json"),
        item_classes: json("data/item_classes.json"),
        tags: json("data/tags.json"),
    };
    const expected = {
        game,
        patch: manifest.client_build,
        basesSha256: digest(read("data/base_items.json")),
        modsSha256: digest(read("data/mods.json")),
        schemaSha256: manifest.dat_schema_sha256,
    };
    const input = json("crafting-data.json");

    it("exports Cluster Jewel base ranges and all passive tags directly from client tables", () => {
        const result = validateCraftingData(input, expected, data);
        if (game === "poe2") {
            expect(result.clusterJewels).toBeNull();
            return;
        }
        const clusters = result.clusterJewels!;
        expect(Object.keys(clusters.bases)).toHaveLength(3);
        expect(Object.keys(clusters.skills)).toHaveLength(55);
        expect(clusters.bases["Metadata/Items/Jewels/JewelPassiveTreeExpansionLarge"]).toEqual({
            size: "Large",
            minNodes: 8,
            maxNodes: 12,
            socketIndices: [4, 8, 6],
        });
        expect(clusters.skills.affliction_attack_damage_).toMatchObject({
            name: "Attack Damage",
            size: "Large",
            tag: "affliction_attack_damage_",
            text: "10% increased Attack Damage",
            stats: [{ id: "attack_damage_+%", min: 10, max: 10 }],
        });
        for (const table of [
            "PassiveTreeExpansionJewels",
            "PassiveTreeExpansionJewelSizes",
            "PassiveTreeExpansionSkills",
            "PassiveSkills",
            "Stats",
            "Tags",
        ])
            expect(result.source.tables[`Data/${table}.datc64`]).toMatch(/^[a-f0-9]{64}$/);
    });

    it.each([
        "missing",
        "base",
        "size",
        "tag",
        "range",
        "duplicate-socket",
        "variable-stat",
        "notable",
        "text",
        "source",
    ])("rejects incomplete Cluster Jewel extraction: %s", (mutation) => {
        if (game === "poe2") return;
        const changed = structuredClone(input);
        const cluster = changed.clusterJewels;
        const baseId = "Metadata/Items/Jewels/JewelPassiveTreeExpansionLarge";
        if (mutation === "missing") changed.clusterJewels = null;
        if (mutation === "base") delete cluster.bases[baseId];
        if (mutation === "size") cluster.skills.affliction_attack_damage_.size = "Unknown";
        if (mutation === "tag") cluster.skills.affliction_attack_damage_.tag = "unknown-tag";
        if (mutation === "range") cluster.bases[baseId].minNodes = 13;
        if (mutation === "duplicate-socket") cluster.bases[baseId].socketIndices.push(4);
        if (mutation === "variable-stat")
            cluster.skills.affliction_attack_damage_.stats[0].max = 11;
        if (mutation === "notable") cluster.skills.affliction_attack_damage_.notable = true;
        if (mutation === "text") cluster.skills.affliction_attack_damage_.text = null;
        if (mutation === "source")
            delete changed.source.tables["Data/PassiveTreeExpansionSkills.datc64"];
        expect(() => validateCraftingData(changed, expected, data)).toThrow();
    });

    it("exports consistent influence names from client strings with tag provenance", () => {
        const result = validateCraftingData(input, expected, data);
        if (game === "poe2") {
            expect(result.influences).toEqual([]);
            return;
        }
        const names = [
            ...new Map(result.influences.map((entry) => [entry.influence, entry.name])),
        ].sort(([a], [b]) => a - b);
        expect(names).toEqual([
            [0, "Shaper"],
            [1, "Elder"],
            [2, "Crusader"],
            [3, "Redeemer"],
            [4, "Hunter"],
            [5, "Warlord"],
        ]);
        for (const asset of ["Data/InfluenceTags.datc64", "Data/ClientStrings.datc64"])
            expect(result.source.tables[asset]).toMatch(/^[a-f0-9]{64}$/);
    });

    it("links Cluster Jewel modifier stats to complete translated passive effects", () => {
        if (game === "poe2") return;
        const passives = validateCraftingData(input, expected, data).clusterJewels!.passives;
        expect(Object.keys(passives)).toHaveLength(309);
        expect(Object.values(passives).filter((passive) => passive.notable)).toHaveLength(301);
        expect(passives.local_affliction_notable_calamitous).toEqual({
            id: "affliction_notable_calamitous",
            name: "Calamitous",
            hash: 41594,
            notable: true,
            stats: [
                { id: "elemental_damage_with_attack_skills_+%", min: 30, max: 30 },
                { id: "chance_to_freeze_shock_ignite_%", min: 10, max: 10 },
                { id: "non_damaging_ailment_effect_+%", min: 15, max: 15 },
            ],
            text: "30% increased Elemental Damage with Attack Skills\n10% chance to Freeze, Shock and Ignite\n15% increased Effect of Non-Damaging Ailments",
        });
        expect(passives.local_jewel_expansion_keystone_hollow_palm_technique).toMatchObject({
            notable: false,
            name: "Hollow Palm Technique",
        });
        expect(input.source.tables["Data/PassiveTreeExpansionSpecialSkills.datc64"]).toBe(
            "32282e5a65e7699407bab4b2a54de51611b81d8fe845a9ad586f6e684a76462f",
        );
    });

    it.each([
        "missing",
        "binding",
        "duplicate-id",
        "duplicate-hash",
        "variable",
        "text",
        "notable",
        "source",
    ])("rejects unresolved granted Cluster passives: %s", (mutation) => {
        if (game === "poe2") return;
        const changed = structuredClone(input);
        const passives = changed.clusterJewels.passives;
        const passive = passives.local_affliction_notable_calamitous;
        if (mutation === "missing") changed.clusterJewels.passives = {};
        if (mutation === "binding") {
            passives.unknown = passive;
            delete passives.local_affliction_notable_calamitous;
        }
        if (mutation === "duplicate-id")
            passive.id = passives.local_affliction_notable_devastator.id;
        if (mutation === "duplicate-hash")
            passive.hash = passives.local_affliction_notable_devastator.hash;
        if (mutation === "variable") passive.stats[0].max = 31;
        if (mutation === "text") passive.text = null;
        if (mutation === "notable") passive.notable = false;
        if (mutation === "source")
            delete changed.source.tables["Data/PassiveTreeExpansionSpecialSkills.datc64"];
        expect(() => validateCraftingData(changed, expected, data)).toThrow();
    });

    it("rejects missing influence names, inconsistent class labels and source provenance", () => {
        if (game === "poe2") return;
        for (const mutation of [
            "missing",
            "name",
            "duplicate",
            "tag-source",
            "name-source",
        ] as const) {
            const changed = structuredClone(input);
            if (mutation === "missing") delete changed.influences[0].name;
            if (mutation === "name") changed.influences[0].name = "Unresolved";
            if (mutation === "duplicate") changed.influences.push(changed.influences[0]);
            if (mutation === "tag-source")
                delete changed.source.tables["Data/InfluenceTags.datc64"];
            if (mutation === "name-source")
                delete changed.source.tables["Data/ClientStrings.datc64"];
            expect(() => validateCraftingData(changed, expected, data), mutation).toThrow();
        }
    });

    it("exports Genesis modifier effects and item classes from the active equipment graph", () => {
        const result = validateCraftingData(input, expected, data);
        if (game === "poe2") {
            expect(result.genesis).toBeNull();
            return;
        }
        const tree = result.genesis!;
        expect(tree.name).toBe("The Genesis Tree");
        expect(tree.fruit).toBe("Metadata/Items/Chayula/EquipmentFruit");
        expect(tree.itemClasses).toEqual([
            "Amulet",
            "Belt",
            "Body Armour",
            "Boots",
            "Gloves",
            "Helmet",
            "Jewel",
            "Ring",
            "Shield",
        ]);
        expect(tree.passives.EquipmentNode4?.stats).toEqual([
            { id: "brequel_equipment_fruit_physical_modifier_chance_+%", min: 300, max: 300 },
        ]);
        expect(tree.passives.EquipmentNode4neg?.text).toContain("60% reduced chance");
        expect(tree.passives.EquipmentNode23).toBeUndefined();
        expect(tree.passives.EquipmentNode29_).toBeUndefined();
        const rating = Object.values(tree.passives)
            .flatMap((node) => node.stats)
            .filter((stat) => stat.id === "brequel_equipment_fruit_mod_tier_rating_+");
        expect(rating).toHaveLength(3);
        expect(rating.every((stat) => stat.min === 20)).toBe(true);
        expect(tree.passives.EquipmentNode2?.text).toBe(
            "Birthed Equipment has +20 to Modifier Tier Rating",
        );
        expect(result.source.tables[tree.asset]).toMatch(/^[a-f0-9]{64}$/);
    });

    it("rejects missing Genesis graph provenance and altered classes, nodes and effects", () => {
        if (game === "poe2") return;
        for (const mutation of [
            "asset",
            "classes",
            "duplicate",
            "range",
            "text",
            "missing",
            "game",
        ] as const) {
            const changed = structuredClone(input);
            if (mutation === "asset") delete changed.source.tables[changed.genesis.asset];
            if (mutation === "classes") changed.genesis.itemClasses.push("Wand");
            if (mutation === "duplicate")
                changed.genesis.passives.EquipmentNode4.hash =
                    changed.genesis.passives.EquipmentNode5.hash;
            if (mutation === "range") changed.genesis.passives.EquipmentNode4.stats[0].max = 301;
            if (mutation === "text") changed.genesis.passives.EquipmentNode4.text = null;
            if (mutation === "missing") changed.genesis = null;
            if (mutation === "game") changed.game = "poe2";
            expect(
                () =>
                    validateCraftingData(
                        changed,
                        mutation === "game" ? { ...expected, game: "poe2" } : expected,
                        data,
                    ),
                mutation,
            ).toThrow();
        }
    });

    it("links every extracted Tangled outcome to the random fossil with complete distinct tag pairs", () => {
        const result = validateCraftingData(input, expected, data);
        if (game === "poe2") {
            expect(result.fossils).toEqual([]);
            return;
        }
        const tangled = result.fossils.find((entry) => entry.name === "Tangled Fossil")!;
        const outcomes = result.fossils.filter((entry) =>
            tangled.randomOutcomes.includes(entry.id),
        );
        expect(outcomes).toHaveLength(420);
        expect(
            result.fossils
                .filter((entry) => entry !== tangled)
                .every((entry) => entry.randomOutcomes.length === 0),
        ).toBe(true);
        const positive = new Set(outcomes.map((entry) => entry.positive[0]!.tag));
        const negative = new Set(outcomes.map((entry) => entry.negative[0]!.tag));
        expect(positive.size).toBe(21);
        expect(positive).toEqual(negative);
        expect(
            new Set(outcomes.map((entry) => `${entry.positive[0]!.tag}:${entry.negative[0]!.tag}`))
                .size,
        ).toBe(positive.size * (positive.size - 1));
        for (const outcome of outcomes) {
            expect(outcome.positive).toEqual([{ tag: expect.any(String), weight: 3000 }]);
            expect(outcome.negative).toEqual([{ tag: expect.any(String), weight: 0 }]);
            expect(outcome.positive[0]!.tag).not.toBe(outcome.negative[0]!.tag);
            expect(outcome.added).toEqual([]);
            expect(outcome.corruptedEssenceChance).toBe(0);
        }
    });

    it("rejects incomplete Tangled links, invalid effect pairs and missing provenance", () => {
        if (game === "poe2") return;
        for (const mutation of [
            "link",
            "same-tag",
            "boost",
            "block",
            "legacy",
            "provenance",
        ] as const) {
            const changed = structuredClone(input);
            const tangled = changed.fossils.find(
                (entry: { name: string }) => entry.name === "Tangled Fossil",
            );
            const outcome = changed.fossils.find(
                (entry: { id: string }) => entry.id === tangled.randomOutcomes[0],
            );
            if (mutation === "link") tangled.randomOutcomes.pop();
            if (mutation === "same-tag") outcome.negative[0].tag = outcome.positive[0].tag;
            if (mutation === "boost") outcome.positive[0].weight = 100;
            if (mutation === "block") outcome.negative[0].weight = 100;
            if (mutation === "legacy") outcome.corruptedEssenceChance = 10;
            if (mutation === "provenance")
                delete changed.source.tables["Data/DelveCraftingModifiers.datc64"];
            expect(() => validateCraftingData(changed, expected, data), mutation).toThrow(
                /fossil/i,
            );
        }
    });

    it("extracts Allflame brackets, percentages, restrictions and actual item-level keys", () => {
        const result = validateCraftingData(input, expected, data);
        if (game === "poe2") {
            expect(result.allflame).toBeNull();
            const poe1 = JSON.parse(
                readFileSync(
                    new URL("../../poe-1-data/crafting-data.json", import.meta.url),
                    "utf8",
                ),
            );
            expect(() =>
                validateCraftingData({ ...result, allflame: poe1.allflame }, expected, data),
            ).toThrow("PoE 1");
            return;
        }
        const allflame = result.allflame!;
        expect(allflame.sulphur).toBe("Metadata/Items/Currency/CurrencyDeepwater");
        expect(allflame.classes).toHaveLength(45);
        expect(allflame.currencies).toHaveLength(293);
        expect(allflame.levels).toHaveLength(100);
        expect(allflame.classes.find((entry) => entry.itemClass === "Jewel")).toEqual({
            itemClass: "Jewel",
            costPercent: 150,
            levelScaling: false,
        });
        expect(
            allflame.classes.find((entry) => entry.itemClass === "FishingRod")?.costPercent,
        ).toBe(200);
        expect(
            [1, 67, 68, 85, 100].map(
                (level) =>
                    allflame.levels.find((entry) => entry.level === level)?.costIncreasePercent,
            ),
        ).toEqual([-66, 0, 8, 144, 144]);
        const exalt = allflame.currencies.filter((entry) =>
            entry.currency.endsWith("/CurrencyAddModToRare"),
        );
        expect(
            exalt.map((entry) => [
                entry.tier,
                entry.outcomes,
                entry.sulphurCost,
                entry.intangibility,
            ]),
        ).toEqual([
            [0, { min: 2, max: 2 }, 1500, { min: 8, max: 12 }],
            [1, { min: 3, max: 3 }, 1875, { min: 8, max: 12 }],
            [2, { min: 4, max: 4 }, 2250, { min: 8, max: 12 }],
        ]);
        expect(
            allflame.currencies.every((entry) => entry.outcomes.min === entry.outcomes.max),
        ).toBe(true);
        expect(allflame.description).toContain("cannot be performed on corrupted items");
        expect(allflame.ghostlyCopyDescription).toContain(
            "cannot be returned to a previous state via Imprinting",
        );
        expect(allflame.intangibilityDescription).toContain("equal to the Intangibility");
        expect(() => validateCraftingData({ ...result, allflame: null }, expected, data)).toThrow(
            "PoE 1",
        );
    });

    it("rejects invalid Allflame references, bounds, duplicates and absent provenance", () => {
        if (game === "poe2") return;
        const result = validateCraftingData(input, expected, data);
        const mutations = [
            "currency",
            "sulphur",
            "class",
            "duplicate-class",
            "duplicate-bracket",
            "duplicate-tier",
            "missing-level",
            "duplicate-level",
            "outcomes",
            "intangibility",
            "cost",
            "percentage",
            "provenance",
        ];
        for (const mutation of mutations) {
            const changed = structuredClone(result);
            const allflame = changed.allflame!;
            const bracket = allflame.currencies[0]!;
            if (mutation === "currency") bracket.currency = "missing";
            if (mutation === "sulphur") allflame.sulphur = "missing";
            if (mutation === "class") allflame.classes[0]!.itemClass = "missing";
            if (mutation === "duplicate-class") allflame.classes.push(allflame.classes[0]!);
            if (mutation === "duplicate-bracket") allflame.currencies.push(bracket);
            if (mutation === "duplicate-tier")
                allflame.currencies.push({ ...bracket, id: "different" });
            if (mutation === "missing-level") allflame.levels.pop();
            if (mutation === "duplicate-level")
                allflame.levels[1]!.level = allflame.levels[0]!.level;
            if (mutation === "outcomes") bracket.outcomes.min = bracket.outcomes.max + 1;
            if (mutation === "intangibility")
                bracket.intangibility.min = bracket.intangibility.max + 1;
            if (mutation === "cost") bracket.sulphurCost = -1;
            if (mutation === "percentage") allflame.levels[0]!.costIncreasePercent = -100;
            if (mutation === "provenance")
                delete changed.source.tables["Data/DeepwaterCraftingCurrencies.datc64"];
            expect(() => validateCraftingData(changed, expected, data), mutation).toThrow();
        }
    });

    it("derives maximum-socket beastcrafts from build text with matching provenance", () => {
        const result = validateCraftingData(input, expected, data);
        expect(
            result.beasts.filter((entry) => entry.maximumSockets).map((entry) => entry.id),
        ).toEqual(game === "poe1" ? ["EinharMasterCraftMorrigan8"] : []);
        expect(resolveBeastSockets("Modify an Item", "to Have Maximum Possible Links")).toBe(false);
        expect(
            resolveBeastSockets("Create an Item", "to Have Maximum Possible Number of Sockets"),
        ).toBe(false);
        if (game === "poe2") return;
        for (const change of ["flag", "description", "provenance"]) {
            const changed = structuredClone(result);
            const recipe = changed.beasts.find((entry) => entry.maximumSockets)!;
            if (change === "flag") recipe.maximumSockets = false;
            if (change === "description") recipe.description = "to Have Maximum Possible Links";
            if (change === "provenance")
                delete changed.source.tables["Data/BestiaryRecipes.datc64"];
            expect(() => validateCraftingData(changed, expected, data)).toThrow();
        }
    });

    it("extracts Strongboxes independently of inventory bases and validates their provenance and references", () => {
        const result = validateCraftingData(input, expected, data);
        expect(result.strongboxes).toHaveLength(game === "poe1" ? 52 : 50);
        expect(result.strongboxes.every((entry) => entry.baseItem === null)).toBe(true);
        const chest = result.strongboxes.find((entry) =>
            entry.id.endsWith(game === "poe1" ? "/StrongboxScarab" : "/ResearchStrongboxHigh"),
        )!;
        expect(chest.name).toBe(
            game === "poe1" ? "Operative's Strongbox" : "Researcher's Strongbox",
        );
        expect(chest.mods.length).toBeGreaterThan(0);
        expect(data.base_items[chest.id]).toBeUndefined();
        if (game === "poe1") expect(chest.spawnWeight).toBe(0);
        for (const change of ["duplicate", "mod", "tag", "base", "range", "provenance"]) {
            const changed = structuredClone(result);
            const first = changed.strongboxes[0]!;
            if (change === "duplicate") changed.strongboxes.push(first);
            if (change === "mod") first.mods = ["missing"];
            if (change === "tag") first.tags = ["missing"];
            if (change === "base") first.baseItem = "missing";
            if (change === "range") first.minimumLevel = first.maximumLevel + 1;
            if (change === "provenance")
                delete changed.source.tables[
                    `Data/${game === "poe2" ? "Balance/" : ""}Chests.datc64`
                ];
            expect(() => validateCraftingData(changed, expected, data)).toThrow();
        }
    });

    it("derives Blighted Map limits from fixed build modifiers and validates recipe provenance", () => {
        const result = validateCraftingData(input, expected, data);
        expect(result.anointing.maps).toEqual(
            game === "poe1"
                ? [
                      { mod: "InfectedMap", maximumAnointments: 3, ravaged: false },
                      { mod: "UberInfectedMap__", maximumAnointments: 9, ravaged: true },
                  ]
                : [],
        );
        if (game !== "poe1") return;
        expect(
            result.anointing.recipes.filter((recipe) => recipe.type === "InfectedMap"),
        ).toHaveLength(13);
        const changed = structuredClone(result);
        changed.anointing.maps[0]!.maximumAnointments = 2;
        expect(() => validateCraftingData(changed, expected, data)).toThrow(
            "Blighted Map rules differ",
        );
        const missing = structuredClone(result);
        delete missing.source.tables["Data/BlightCraftingRecipes.datc64"];
        expect(() => validateCraftingData(missing, expected, data)).toThrow("recipe provenance");
        const raw = structuredClone(data.mods);
        raw.InfectedMap.text = "Unknown";
        expect(() => resolveBlightedMaps(raw)).toThrow("Unresolved Blighted Map");
    });

    it("retains initial socket counts with their base-item provenance and rejects mismatched counts", () => {
        const result = validateCraftingData(input, expected, data);
        const sockets = Object.fromEntries(
            Object.entries(result.baseRules)
                .filter(([, entry]) => entry.initialSockets)
                .map(([id, entry]) => [id, entry.initialSockets]),
        );
        expect(sockets).toEqual(
            game === "poe1"
                ? {}
                : {
                      "Metadata/Items/Amulets/FourAmuletB2": 1,
                      "Metadata/Items/Rings/FourRingB6": 1,
                      "Metadata/Items/Belts/FourBeltB1": 1,
                      "Metadata/Items/Armours/Helmets/FourHelmetStrInt6VerisiumUnique1": 3,
                  },
        );
        const changed = structuredClone(result);
        const id = Object.keys(sockets)[0] ?? Object.keys(changed.baseRules)[0]!;
        changed.baseRules[id]!.initialSockets = 2;
        expect(() => validateCraftingData(changed, expected, data)).toThrow();
        if (game === "poe1") return;
        expect(result.source.tables["Data/Balance/BaseItemTypes.datc64"]).toMatch(/^[a-f0-9]{64}$/);
        const missing = structuredClone(result);
        delete missing.source.tables["Data/Balance/BaseItemTypes.datc64"];
        expect(() => validateCraftingData(missing, expected, data)).toThrow("provenance");
    });

    it("retains link bench recipes and maximum-link beastcrafts with their build provenance", () => {
        const result = validateCraftingData(input, expected, data);
        const recipes = result.bench.filter((entry) => entry.linkCount);
        expect(recipes).toHaveLength(game === "poe1" ? 5 : 0);
        expect(
            result.beasts.filter((entry) => entry.maximumLinks).map((entry) => entry.id),
        ).toEqual(game === "poe1" ? ["EinharMasterCraftMorrigan7"] : []);
        if (game !== "poe1") return;
        expect(recipes.map((entry) => entry.linkCount)).toEqual([2, 3, 4, 5, 6]);
        expect(recipes.map((entry) => entry.cost[0]!.amount)).toEqual([1, 3, 5, 150, 1500]);
        for (const change of [
            "missing",
            "currency",
            "range",
            "overlap",
            "source",
            "beast",
            "beast-source",
        ]) {
            const changed = structuredClone(result);
            const recipe = changed.bench.find((entry) => entry.linkCount)!;
            if (change === "missing") recipe.linkCount = null;
            if (change === "currency") recipe.cost = [];
            if (change === "range") recipe.linkCount = 7;
            if (change === "overlap") recipe.socketCount = 2;
            if (change === "source")
                delete changed.source.tables["Data/CraftingBenchOptions.datc64"];
            if (change === "beast")
                changed.beasts.find((entry) => entry.maximumLinks)!.maximumLinks = false;
            if (change === "beast-source")
                delete changed.source.tables["Data/BestiaryRecipes.datc64"];
            expect(() => validateCraftingData(changed, expected, data)).toThrow();
        }
    });

    it("extracts socket-count bench recipes and validates their currency and class references", () => {
        const result = validateCraftingData(input, expected, data);
        const recipes = result.bench.filter((entry) => entry.socketCount);
        expect(recipes).toHaveLength(game === "poe1" ? 5 : 0);
        if (game !== "poe1") return;
        expect(recipes.map((entry) => entry.socketCount)).toEqual([2, 3, 4, 5, 6]);
        expect(recipes.map((entry) => entry.cost[0]!.amount)).toEqual([1, 3, 10, 70, 350]);
        expect(recipes.every((entry) => entry.itemClasses.includes("Body Armour"))).toBe(true);
        expect(Object.keys(result.source.tables)).toContain("Data/CraftingBenchOptions.datc64");
        for (const change of ["missing", "class", "enchantment", "range", "currency"]) {
            const changed = structuredClone(result);
            const recipe = changed.bench.find((entry) => entry.socketCount)!;
            if (change === "missing") recipe.socketCount = null;
            if (change === "class") recipe.itemClasses = ["missing"];
            if (change === "enchantment")
                recipe.enchantment = { mod: "IncreasedLife1", itemClasses: ["Body Armour"] };
            if (change === "range") recipe.socketCount = 7;
            if (change === "currency") recipe.cost = [];
            expect(() => validateCraftingData(changed, expected, data)).toThrow();
        }
    });

    it("extracts flask enchantment pools and bench outcomes with validated class and modifier references", () => {
        const result = validateCraftingData(input, expected, data);
        expect(result.flaskEnchantments).toHaveLength(game === "poe1" ? 2 : 0);
        expect(result.bench.filter((entry) => entry.enchantment)).toHaveLength(
            game === "poe1" ? 15 : 0,
        );
        if (game !== "poe1") return;
        expect(
            result.flaskEnchantments.map((entry) => entry.mods.length).sort((a, b) => a - b),
        ).toEqual([5, 16]);
        expect(result.flaskEnchantments[0]!.itemClasses).toEqual([
            "UtilityFlask",
            "UtilityFlaskCritical",
        ]);
        expect(result.bench.find((entry) => entry.id === "bench:360")).toMatchObject({
            enchantment: {
                mod: "FlaskEnchantmentInjectorOnFullCharges__",
                itemClasses: ["UtilityFlask"],
            },
            cost: [{ amount: 5 }, { amount: 5 }],
        });
        expect(Object.keys(result.source.tables)).toContain("Data/CraftingBenchOptions.datc64");
        for (const change of [
            "pool",
            "classes",
            "missing-enchantment",
            "wrong-enchantment",
            "wrong-class",
        ]) {
            const changed = structuredClone(result);
            const bench = changed.bench.find((entry) => entry.enchantment)!;
            if (change === "pool") changed.flaskEnchantments[0]!.mods.pop();
            if (change === "classes") changed.flaskEnchantments[0]!.itemClasses.push("LifeFlask");
            if (change === "missing-enchantment") bench.enchantment = null;
            if (change === "wrong-enchantment") bench.enchantment!.mod = "IncreasedLife1";
            if (change === "wrong-class") bench.enchantment!.itemClasses = ["LifeFlask"];
            expect(() => validateCraftingData(changed, expected, data)).toThrow();
        }
    });

    it("extracts elemental conversion families including non-rollable chaos outcomes", () => {
        const result = validateCraftingData(input, expected, data);
        expect(result.elementalConversions).toHaveLength(game === "poe2" ? 93 : 0);
        if (game !== "poe2") return;
        expect(result.elementalConversions.filter((entry) => entry.resistance)).toHaveLength(15);
        expect(result.elementalConversions).toContainEqual({
            id: "DamageAsExtra6",
            resistance: false,
            mods: {
                fire: "SpellDamageGainedAsFire6",
                cold: "SpellDamageGainedAsCold6",
                lightning: "SpellDamageGainedAsLightning6",
                chaos: "ConvertedSpellDamageGainedAsChaos6",
            },
        });
        expect(
            result.elementalConversions.find((entry) => entry.id === "AilmentIncrease1")!.mods
                .chaos,
        ).toBeNull();
        for (const change of [
            "missing-mod",
            "missing-table",
            "duplicate",
            "identical-mods",
            "missing-families",
            "ambiguous-source",
        ]) {
            const changed = structuredClone(result);
            if (change === "missing-mod") changed.elementalConversions[0]!.mods.chaos = "missing";
            if (change === "missing-table")
                delete changed.source.tables[
                    "Data/Balance/Expedition2ElementalModConversions.datc64"
                ];
            if (change === "duplicate")
                changed.elementalConversions.push(changed.elementalConversions[0]!);
            if (change === "identical-mods")
                changed.elementalConversions[0]!.mods.chaos =
                    changed.elementalConversions[0]!.mods.fire;
            if (change === "missing-families") changed.elementalConversions = [];
            if (change === "ambiguous-source")
                changed.elementalConversions.push({
                    ...changed.elementalConversions[0]!,
                    id: "another",
                });
            expect(() => validateCraftingData(changed, expected, data)).toThrow();
        }
    });

    it("extracts Warping rune tags and modifier magnitude rules from client tables", () => {
        const result = validateCraftingData(input, expected, data);
        expect(Object.keys(result.augmentTags)).toHaveLength(game === "poe2" ? 6 : 0);
        if (game === "poe2") {
            expect(result.augmentTags.warping_rune_add_item_tag_6).toBe("destruction");
            for (const change of ["missing-tag", "missing-stat", "missing-source"]) {
                const changed = structuredClone(result);
                if (change === "missing-tag")
                    changed.augmentTags.warping_rune_add_item_tag_6 = "missing";
                if (change === "missing-stat")
                    delete changed.augmentTags.warping_rune_add_item_tag_6;
                if (change === "missing-source")
                    delete changed.source.tables[
                        "Data/Balance/Expedition2WarpingRuneStatToTag.datc64"
                    ];
                expect(() => validateCraftingData(changed, expected, data)).toThrow();
            }
        }
        expect(result.taggedModifierEffects).toContainEqual({
            stat: "heist_enchantment_fire_mod_effect_+%",
            tags: ["fire"],
            explicit: true,
            implicit: false,
            prefix: false,
            suffix: false,
        });
        const changed = structuredClone(result);
        changed.taggedModifierEffects[0]!.stat = "missing";
        expect(() => validateCraftingData(changed, expected, data)).toThrow(
            "matching client stats",
        );
    });

    it("extracts augment effects, bonded stats, limits and socket restrictions with raw-table provenance", () => {
        const result = validateCraftingData(input, expected, data);
        expect(result.augments).toHaveLength(game === "poe2" ? 313 : 0);
        if (game !== "poe2") return;
        const rune = result.augments.find((entry) => entry.name === "Desert Rune")!;
        expect(rune.requiredLevel).toBe(15);
        expect(rune.type.effectStat).toBe("local_rune_effect_+%");
        expect(rune.rules.find((rule) => rule.scope === "armour")).toMatchObject({
            stats: [{ id: "base_fire_damage_resistance_%", min: 14, max: 14 }],
            bondedStats: [
                { id: "base_maximum_life", min: 20, max: 20 },
                { id: "base_maximum_mana", min: 20, max: 20 },
            ],
        });
        expect(rune.rules.every((rule) => rule.statDescriptions.length && rule.text)).toBe(true);
        expect(
            result.augments.find((entry) => entry.name === "Raven-Touched Shard")!.socketBound,
        ).toBe(true);
        expect(
            result.augments.find((entry) => entry.name === "Amanamu's Gaze")!.limit,
        ).toMatchObject({ id: "AncientAugment", amount: 1 });
        for (const table of [
            "SoulCores",
            "SoulCoreStats",
            "SoulCoreLimits",
            "SoulCoreStatCategories",
            "SoulCoreTypes",
            "ClientStrings2",
        ]) {
            const changed = structuredClone(result);
            delete changed.source.tables[`Data/Balance/${table}.datc64`];
            expect(() => validateCraftingData(changed, expected, data)).toThrow("provenance");
        }
        for (const mutate of [
            (entry: typeof rune) => {
                entry.rules[0]!.stats[0]!.max += 1;
            },
            (entry: typeof rune) => {
                entry.higherTier = "missing";
            },
            (entry: typeof rune) => {
                entry.rules[0]!.itemClasses = ["missing"];
            },
            (entry: typeof rune) => {
                entry.rules[0]!.statDescriptions = [result.statDescriptions.length];
            },
        ]) {
            const changed = structuredClone(result);
            mutate(changed.augments.find((entry) => entry.id === rune.id)!);
            expect(() => validateCraftingData(changed, expected, data)).toThrow();
        }
    });

    it("extracts map quality types, stat references, restrictions and caps from the pinned build", () => {
        const result = validateCraftingData(input, expected, data);
        expect(result.mapQuality).toHaveLength(game === "poe1" ? 6 : 0);
        if (game === "poe2") return;
        expect(result.mapQuality.map((entry) => entry.description)).toEqual([
            "Quality (Quantity)",
            "Quality (Rarity)",
            "Quality (Pack Size)",
            "Quality (Divination Cards)",
            "Quality (Scarabs)",
            "Quality (Currency)",
        ]);
        for (const recipe of result.mapQuality) {
            expect(recipe.maximumQuality).toBe(20);
            expect(recipe.itemClasses).toEqual(["Map"]);
            expect(recipe.stats).toHaveLength(1);
            expect(recipe.stats[0]).toMatch(/^map_/);
        }
        expect(result.mapQuality[3]!.stats).toEqual([
            "map_divination_card_drop_chance_+%_final_from_quality",
        ]);
        for (const mutate of [
            (changed: typeof result) => {
                changed.mapQuality.pop();
            },
            (changed: typeof result) => {
                changed.mapQuality[0]!.maximumQuality = 25;
            },
            (changed: typeof result) => {
                changed.mapQuality[0]!.itemClasses = ["Ring"];
            },
            (changed: typeof result) => {
                changed.mapQuality[1] = changed.mapQuality[0]!;
            },
        ]) {
            const changed = structuredClone(result);
            mutate(changed);
            expect(() => validateCraftingData(changed, expected, data)).toThrow();
        }
        for (const table of ["CurrencyItems", "AlternateQualityTypes", "Stats"]) {
            expect(result.source.tables[`Data/${table}.datc64`]).toMatch(/^[a-f0-9]{64}$/);
            const changed = structuredClone(result);
            delete changed.source.tables[`Data/${table}.datc64`];
            expect(() => validateCraftingData(changed, expected, data)).toThrow();
        }
    });

    it("extracts the Tainted Catalyst cap and corrupted target classes with currency provenance", () => {
        const result = validateCraftingData(input, expected, data);
        if (game === "poe2") {
            expect(result.taintedCatalysts).toEqual([]);
            expect(() =>
                validateCraftingData(
                    {
                        ...result,
                        taintedCatalysts: [
                            { id: "fake", itemClasses: ["Ring"], maximumQuality: 20 },
                        ],
                    },
                    expected,
                    data,
                ),
            ).toThrow();
            return;
        }
        expect(result.taintedCatalysts).toEqual([
            {
                id: "Metadata/Items/Currency/CurrencyJewelleryQualityVaal",
                maximumQuality: 20,
                itemClasses: ["Amulet", "Belt", "Ring"],
            },
        ]);
        for (const table of [
            "Data/CurrencyItems.datc64",
            "Data/AlternateQualityTypes.datc64",
            "Data/ModEffectStats.datc64",
        ]) {
            expect(result.source.tables[table]).toMatch(/^[a-f0-9]{64}$/);
            const changed = structuredClone(result);
            delete changed.source.tables[table];
            expect(() => validateCraftingData(changed, expected, data)).toThrow();
        }
        for (const mutate of [
            (changed: typeof result) => {
                changed.taintedCatalysts = [];
            },
            (changed: typeof result) => {
                changed.taintedCatalysts[0]!.maximumQuality = 19;
            },
            (changed: typeof result) => {
                changed.taintedCatalysts[0]!.itemClasses = ["Body Armour"];
            },
            (changed: typeof result) => {
                delete changed.source.tables["Data/CurrencyItems.datc64"];
            },
        ]) {
            const changed = structuredClone(result);
            mutate(changed);
            expect(() => validateCraftingData(changed, expected, data)).toThrow();
        }
        const currency = result.currencies.find(
            (entry) => entry.id === result.taintedCatalysts[0]!.id,
        )!;
        const bases = Object.values(data.base_items) as Parameters<
            typeof resolveTaintedCatalysts
        >[1];
        expect(
            resolveTaintedCatalysts(
                [{ ...currency, directions: currency.directions.replace("20%", "25%") }],
                bases,
            )[0]!.maximumQuality,
        ).toBe(25);
        expect(() =>
            resolveTaintedCatalysts(
                [{ ...currency, directions: currency.directions.replace("Corrupted ", "") }],
                bases,
            ),
        ).toThrow("corruption requirement");
        expect(() =>
            resolveTaintedCatalysts(
                [
                    {
                        ...currency,
                        directions: currency.directions.replace("ring, amulet or belt", "unknown"),
                    },
                ],
                bases,
            ),
        ).toThrow("target");
    });

    it("extracts Memory Influenced Map modifiers and the Orb of Intention limit with provenance", () => {
        const result = validateCraftingData(input, expected, data);
        if (game === "poe2") {
            expect(result.memoryMaps).toBeNull();
            expect(() =>
                validateCraftingData(
                    {
                        ...result,
                        memoryMaps: {
                            currency: "fake",
                            maximumUses: 3,
                            influenceMod: "fake",
                            enchantmentMod: "fake",
                        },
                    },
                    expected,
                    data,
                ),
            ).toThrow();
            return;
        }
        expect(result.memoryMaps).toEqual({
            currency: "Metadata/Items/Currency/CurrencyMoreZanaInfluencedItems",
            maximumUses: 3,
            influenceMod: "MapZanaInfluenced",
            enchantmentMod: "MapMoreZanaInfluenceFewerDropsEnchant",
        });
        for (const table of ["Data/CurrencyItems.datc64", "Data/Mods.datc64"])
            expect(result.source.tables[table]).toMatch(/^[a-f0-9]{64}$/);
        for (const mutate of [
            (changed: typeof result) => {
                changed.memoryMaps = null;
            },
            (changed: typeof result) => {
                changed.memoryMaps!.maximumUses = 4;
            },
            (changed: typeof result) => {
                changed.memoryMaps!.influenceMod = "MapMoreZanaInfluenceFewerDropsEnchant";
            },
            (changed: typeof result) => {
                delete changed.source.tables["Data/Mods.datc64"];
            },
            (changed: typeof result) => {
                delete changed.source.tables["Data/CurrencyItems.datc64"];
            },
        ]) {
            const changed = structuredClone(result);
            mutate(changed);
            expect(() => validateCraftingData(changed, expected, data)).toThrow();
        }
        const currency = result.currencies.find(
            (entry) => entry.id === result.memoryMaps!.currency,
        )!;
        expect(
            resolveMemoryMaps(
                [{ ...currency, directions: currency.directions.replace("up to 3", "up to 5") }],
                data.mods,
            )?.maximumUses,
        ).toBe(5);
        expect(() =>
            resolveMemoryMaps([{ ...currency, directions: "Unknown instructions" }], data.mods),
        ).toThrow("Unrecognized");
        expect(() => resolveMemoryMaps([currency, currency], data.mods)).toThrow("Unrecognized");
        const mods = structuredClone(data.mods);
        mods[result.memoryMaps!.enchantmentMod].stats[0].max++;
        expect(() => resolveMemoryMaps([currency], mods)).toThrow("fixed extracted");
        delete mods[result.memoryMaps!.enchantmentMod];
        expect(() => resolveMemoryMaps([currency], mods)).toThrow("Unresolved");
    });

    it("extracts the Locus room and double-corruption class restrictions", () => {
        const result = validateCraftingData(input, expected, data);
        if (game === "poe2") {
            expect(result.locus).toBeNull();
            expect(Object.values(result.classes).some((entry) => entry.doubleCorrupt)).toBe(false);
            return;
        }
        expect(result.locus).toEqual({
            id: "CorruptionRoomIII",
            name: "Locus of Corruption",
            tier: 3,
            description:
                "Reduces player maximum resistances throughout the Temple.\nContains an Altar of Corruption.",
        });
        for (const id of ["Ring", "Jewel", "AbyssJewel", "Body Armour"])
            expect(result.classes[id]?.doubleCorrupt, id).toBe(true);
        for (const id of ["Map", "LifeFlask", "Currency"])
            expect(result.classes[id]?.doubleCorrupt, id).toBe(false);
        for (const table of ["Data/IncursionRooms.datc64", "Data/ItemClasses.datc64"])
            expect(result.source.tables[table]).toMatch(/^[a-f0-9]{64}$/);
        for (const mutate of [
            (changed: typeof result) => {
                changed.locus = null;
            },
            (changed: typeof result) => {
                changed.locus!.tier = 0;
            },
            (changed: typeof result) => {
                delete changed.source.tables["Data/IncursionRooms.datc64"];
            },
            (changed: typeof result) => {
                delete changed.source.tables["Data/ItemClasses.datc64"];
            },
        ]) {
            const changed = structuredClone(result);
            mutate(changed);
            expect(() => validateCraftingData(changed, expected, data)).toThrow();
        }
    });

    it("extracts every map tier, generation, upgrade and legacy area level with source evidence", () => {
        const result = validateCraftingData(input, expected, data);
        expect(result.maps).toHaveLength(game === "poe1" ? 491 : 0);
        if (game !== "poe1") return;
        const map = (suffix: string) =>
            result.maps.find((entry) => entry.id.endsWith(`/${suffix}`))!;
        expect(map("MapAtlasBeach")).toMatchObject({
            tier: 2,
            generation: 3,
            areaLevel: 69,
            upgrade: "Metadata/Items/Maps/MapAtlasVaalPyramid",
        });
        expect(map("MapAtlasBeachShaped")).toMatchObject({ tier: 7, areaLevel: 74 });
        expect(map("MapTier1_5")).toMatchObject({ tier: 1, areaLevel: 66, generation: 1 });
        expect(map("MapWorldsBeach")).toMatchObject({ tier: 1, areaLevel: 68, generation: 4 });
        expect(map("MapAtlasVaalTemple")).toMatchObject({ tier: 16, areaLevel: 83, upgrade: null });
        expect(map("MapWorldsCitadel")).toMatchObject({ tier: 17, areaLevel: 84 });
        expect(map("MapWorldsTrialmaster")).toMatchObject({ tier: 0, areaLevel: 83 });
        for (const table of ["Data/Maps.datc64", "Data/WorldAreas.datc64"])
            expect(result.source.tables[table]).toMatch(/^[a-f0-9]{64}$/);
        for (const mutate of [
            (changed: typeof result) => {
                changed.maps.pop();
            },
            (changed: typeof result) => {
                changed.maps.push(changed.maps[0]!);
            },
            (changed: typeof result) => {
                changed.maps[0]!.id = "missing";
            },
            (changed: typeof result) => {
                changed.maps[0]!.upgrade = "missing";
            },
            (changed: typeof result) => {
                changed.maps[0]!.areaLevel = 0;
            },
            (changed: typeof result) => {
                delete changed.source.tables["Data/Maps.datc64"];
            },
            (changed: typeof result) => {
                delete changed.source.tables["Data/WorldAreas.datc64"];
            },
        ]) {
            const changed = structuredClone(result);
            mutate(changed);
            expect(() => validateCraftingData(changed, expected, data)).toThrow();
        }
    });

    it("resolves the random beast metamod pool from build stats and validates bench eligibility", () => {
        const result = validateCraftingData(input, expected, data);
        const recipes = result.beasts.filter((entry) => entry.metamods.length);
        expect(recipes).toHaveLength(game === "poe1" ? 1 : 0);
        expect(
            resolveBeastMetamods("Modify Mods on an Item", "Add a Mod to a Shaper Item", data.mods),
        ).toEqual([]);
        if (game !== "poe1") return;
        const recipe = recipes[0]!;
        expect(recipe.id).toBe("EinharMasterCraftMemoryLine1");
        expect(recipe.metamods).toHaveLength(5);
        for (const id of recipe.metamods) {
            expect(data.mods[id].domain).toBe("crafted");
            expect(
                result.bench.some(
                    (entry) => entry.mod === id && entry.itemClasses.includes("Body Armour"),
                ),
            ).toBe(true);
        }
        expect(() => resolveBeastMetamods(recipe.category, recipe.description, {})).toThrow(
            "Unresolved beast metamod",
        );
        for (const mutate of [
            (changed: typeof result) => {
                changed.beasts.find((entry) => entry.id === recipe.id)!.metamods.pop();
            },
            (changed: typeof result) => {
                changed.beasts.find((entry) => entry.id === recipe.id)!.metamods[0] =
                    "IncreasedLife1";
            },
            (changed: typeof result) => {
                changed.bench = changed.bench.filter((entry) => entry.mod !== recipe.metamods[0]);
            },
            (changed: typeof result) => {
                delete changed.source.tables["Data/BestiaryRecipes.datc64"];
            },
            (changed: typeof result) => {
                delete changed.source.tables["Data/CraftingBenchOptions.datc64"];
            },
        ]) {
            const changed = structuredClone(result);
            mutate(changed);
            expect(() => validateCraftingData(changed, expected, data)).toThrow();
        }
    });

    it("derives beast augmentation restrictions from build descriptions and validates influences", () => {
        const result = validateCraftingData(input, expected, data);
        expect(
            result.beasts
                .filter((entry) => entry.augmentation)
                .map((entry) => [entry.id, entry.augmentation]),
        ).toEqual(
            game === "poe1"
                ? [
                      ["EinharMasterCraft42", { influence: 0 }],
                      ["EinharMasterCraft43", { influence: 1 }],
                      ["EinharMasterCraft44", { influence: 3 }],
                      ["EinharMasterCraft45", { influence: 4 }],
                      ["EinharMasterCraft46", { influence: 2 }],
                      ["EinharMasterCraft47", { influence: 5 }],
                      ["EinharMasterCraft49", { itemClass: "Map" }],
                  ]
                : [],
        );
        expect(
            resolveBeastAugmentation(
                "Modify Mods on an Item",
                "Add a Prefix, Remove a Random Suffix",
            ),
        ).toBeNull();
        expect(resolveBeastAugmentation("Create an Item", "Add a Mod to a Shaper Item")).toBeNull();
        expect(() =>
            resolveBeastAugmentation("Modify Mods on an Item", "Add a Mod to an Unknown Item"),
        ).toThrow("Unrecognized");
        if (game !== "poe1") return;
        for (const mutate of [
            (changed: typeof result) => {
                changed.beasts.find((entry) => entry.id === "EinharMasterCraft42")!.augmentation =
                    null;
            },
            (changed: typeof result) => {
                changed.beasts.find((entry) => entry.id === "EinharMasterCraft42")!.augmentation = {
                    influence: 1,
                };
            },
            (changed: typeof result) => {
                changed.beasts.find((entry) => entry.id === "EinharMasterCraft49")!.augmentation = {
                    itemClass: "Amulet",
                };
            },
            (changed: typeof result) => {
                changed.influences = changed.influences.filter((entry) => entry.influence !== 0);
            },
            (changed: typeof result) => {
                delete changed.source.tables["Data/BestiaryRecipeCategories.datc64"];
            },
        ]) {
            const changed = structuredClone(result);
            mutate(changed);
            expect(() => validateCraftingData(changed, expected, data)).toThrow();
        }
    });

    it("derives Talisman imprint and fracture recipes from the extracted descriptions", () => {
        const result = validateCraftingData(input, expected, data);
        expect(
            result.beasts
                .filter((entry) => entry.talismanCraft)
                .map((entry) => [entry.id, entry.talismanCraft]),
        ).toEqual(
            game === "poe1"
                ? [
                      ["EinharMasterCraft29", { fractures: 1, minimumMods: 4 }],
                      ["EinharMasterCraft32", "imprint"],
                      ["EinharMasterCraftMorrigan6", { fractures: 2, minimumMods: 6 }],
                  ]
                : [],
        );
        expect(resolveTalismanCraft("Create an Imprint", "Of a Magic Item", "")).toBeNull();
        expect(resolveTalismanCraft("Split an Item", "On a Rare Talisman", "")).toBeNull();
        expect(() =>
            resolveTalismanCraft("Fracture two Modifers", "On a Rare Talisman", ""),
        ).toThrow("Unrecognized");
        expect(() =>
            resolveTalismanCraft(
                "Fracture two Modifiers",
                "On a Rare Talisman with at least 6 modifiers",
                "unknown",
            ),
        ).toThrow("Unrecognized");
        if (game !== "poe1") return;
        for (const mutate of [
            (changed: typeof result) => {
                changed.beasts.find((entry) => entry.id === "EinharMasterCraft29")!.talismanCraft =
                    { fractures: 2, minimumMods: 4 };
            },
            (changed: typeof result) => {
                changed.beasts.find((entry) => entry.id === "EinharMasterCraft32")!.talismanCraft =
                    null;
            },
            (changed: typeof result) => {
                delete changed.source.tables["Data/BestiaryRecipes.datc64"];
            },
        ]) {
            const changed = structuredClone(result);
            mutate(changed);
            expect(() => validateCraftingData(changed, expected, data)).toThrow();
        }
    });

    it("derives map corruption beast operations from current descriptions and retains every implicit's text", () => {
        const result = validateCraftingData(input, expected, data);
        const recipes = result.beasts.filter((entry) => entry.mapCorruption);
        expect(recipes.map((entry) => [entry.id, entry.mapCorruption])).toEqual(
            game === "poe1"
                ? [
                      ["EinharMasterCraft28", "implicit"],
                      ["EinharMasterCraft48", "twice"],
                  ]
                : [],
        );
        expect(resolveBeastMapCorruption("Corrupt an Item", "To have 30% Quality")).toBeNull();
        expect(() => resolveBeastMapCorruption("Corrupt a Map", "unknown")).toThrow(
            "Unrecognized map corruption",
        );
        if (game !== "poe1") return;
        for (const [id, mod] of Object.entries(modsSchema.parse(data.mods))) {
            if (mod.domain !== "area" || mod.generation_type !== "corrupted") continue;
            expect(result.modDescriptions[id]?.length, id).toBeGreaterThan(0);
        }
        const quantity = result.modDescriptions.MapCorruptionItemQuantity!;
        expect(result.modTexts.MapCorruptionItemQuantity).toBe("+(10-20)% Item Quantity");
        expect(result.modTexts.MapCorruptionItemRarity).toBe("+(8-12)% Item Rarity");
        expect(result.modTexts.MapCorruptionPackSize).toBe("+(5-10)% Pack Size");
        expect(result.modTexts.MapCorruptionModEffect).toBe(
            "(10-20)% increased Explicit Modifier magnitudes",
        );
        expect(result.statDescriptions[quantity[0]!]!.rules[0]!.text).toBe("{0:+d}% Item Quantity");
        expect(result.source.tables["Metadata/StatDescriptions/stat_descriptions.txt"]).toMatch(
            /^[a-f0-9]{64}$/,
        );
        const changed = structuredClone(result);
        changed.beasts.find((entry) => entry.id === "EinharMasterCraft28")!.mapCorruption = null;
        expect(() => validateCraftingData(changed, expected, data)).toThrow(
            "Map corruption differs",
        );
    });

    it("derives quality Infuser classes and extra caps from build currency instructions", () => {
        const result = validateCraftingData(input, expected, data);
        expect(result.qualityInfusers).toHaveLength(game === "poe1" ? 0 : 4);
        if (game === "poe1") return;
        const jewellery = result.qualityInfusers.find((entry) => entry.qualityType === "catalyst")!;
        expect(jewellery.itemClasses).toEqual(["Amulet", "Ring"]);
        expect(result.qualityInfusers.every((entry) => entry.extraMaximumQuality === 10)).toBe(
            true,
        );
        expect(
            result.qualityInfusers.find((entry) =>
                entry.id.endsWith("/CurrencyIncursionCasterWeaponQuality"),
            )!.itemClasses,
        ).toEqual(["Sceptre", "Staff", "Wand"]);
        const currency = result.currencies.find((entry) => entry.id === jewellery.id)!;
        expect(() =>
            resolveQualityInfusers(
                [{ ...currency, description: "unknown" }],
                Object.values(data.base_items),
            ),
        ).toThrow("Unrecognized quality Infuser");
        expect(
            resolveQualityInfusers(
                [{ ...currency, description: currency.description.replace("10%", "12%") }],
                Object.values(data.base_items),
            )[0]!.extraMaximumQuality,
        ).toBe(12);
        for (const mutate of [
            (changed: typeof result) => {
                changed.qualityInfusers.pop();
            },
            (changed: typeof result) => {
                changed.qualityInfusers[0]!.extraMaximumQuality++;
            },
            (changed: typeof result) => {
                changed.qualityInfusers[0]!.itemClasses.push("Ring");
            },
            (changed: typeof result) => {
                changed.qualityInfusers[0]!.qualityType = "catalyst";
            },
        ]) {
            const changed = structuredClone(result);
            mutate(changed);
            expect(() => validateCraftingData(changed, expected, data)).toThrow(
                "Quality Infusers differ",
            );
        }
    });

    it("extracts temple corruption eligibility and twice-corrupted client text with source evidence", () => {
        const result = validateCraftingData(input, expected, data);
        if (game === "poe1") {
            expect(result.templeCorruption).toBeNull();
            return;
        }
        const temple = result.templeCorruption!;
        expect(temple.twiceCorruptedText).toBe("Twice [Corrupted]");
        expect(temple.alreadyTwiceCorruptedText).toBe("Item is already Twice [Corrupted].");
        expect(temple.currencies).toHaveLength(3);
        expect(
            temple.currencies.find((entry) => entry.id.endsWith("/CurrencyIncursionDoubleCorrupt"))!
                .itemClasses,
        ).toEqual(expect.arrayContaining(["Jewel", "Ring", "Body Armour", "Wand"]));
        expect(
            temple.currencies.find((entry) => entry.id.endsWith("/CurrencyIncursionCorruptTablet"))!
                .itemClasses,
        ).toEqual(["TowerAugmentation"]);
        for (const mutate of [
            (changed: typeof result) => {
                changed.templeCorruption = null;
            },
            (changed: typeof result) => {
                changed.templeCorruption!.currencies.pop();
            },
            (changed: typeof result) => {
                changed.templeCorruption!.currencies.push(temple.currencies[0]!);
            },
            (changed: typeof result) => {
                changed.templeCorruption!.currencies[0]!.itemClasses.push("missing");
            },
            (changed: typeof result) => {
                changed.templeCorruption!.currencies[0]!.itemClasses.push(
                    temple.currencies[0]!.itemClasses[0]!,
                );
            },
            (changed: typeof result) => {
                changed.templeCorruption!.currencies[0]!.id = result.currencies[0]!.id;
            },
            (changed: typeof result) => {
                delete changed.source.tables["Data/Balance/Incursion2CorruptionCurrencies.datc64"];
            },
            (changed: typeof result) => {
                delete changed.source.tables["Data/Balance/ClientStrings.datc64"];
            },
        ]) {
            const changed = structuredClone(result);
            mutate(changed);
            expect(() => validateCraftingData(changed, expected, data)).toThrow();
        }
    });

    it("extracts complete Waystone tiers and area levels with both source tables", () => {
        const result = validateCraftingData(input, expected, data);
        if (game === "poe1") {
            expect(result.waystones).toEqual([]);
            expect(() =>
                validateCraftingData(
                    {
                        ...input,
                        waystones: [
                            {
                                id: "example",
                                tier: 1,
                                series: 0,
                                areaLevel: 65,
                            },
                        ],
                    },
                    expected,
                    data,
                ),
            ).toThrow("PoE 2 client table");
            return;
        }
        expect(result.waystones.map((entry) => entry.tier)).toEqual(
            Array.from({ length: 16 }, (_, index) => index + 1),
        );
        expect(result.waystones.map((entry) => entry.areaLevel)).toEqual(
            Array.from({ length: 16 }, (_, index) => index + 65),
        );
        for (const mutate of [
            (changed: typeof result) => {
                changed.waystones.pop();
            },
            (changed: typeof result) => {
                changed.waystones.push(changed.waystones[0]!);
            },
            (changed: typeof result) => {
                changed.waystones[1]!.tier = changed.waystones[0]!.tier;
            },
            (changed: typeof result) => {
                changed.waystones[0]!.areaLevel = 0;
            },
            (changed: typeof result) => {
                changed.waystones[0]!.id = result.currencies[0]!.id;
            },
            (changed: typeof result) => {
                delete changed.source.tables["Data/Balance/Maps.datc64"];
            },
            (changed: typeof result) => {
                delete changed.source.tables["Data/Balance/MapTiers.datc64"];
            },
        ]) {
            const changed = structuredClone(result);
            mutate(changed);
            expect(() => validateCraftingData(changed, expected, data)).toThrow();
        }
    });

    it("derives base-quality limits and eligible classes from currency instructions and base tags", () => {
        const result = validateCraftingData(input, expected, data);
        expect(result.baseQuality.filter((entry) => !entry.corrupted)).toHaveLength(
            game === "poe1" ? 3 : 4,
        );
        const armour = result.baseQuality.find((entry) =>
            entry.id.endsWith("/CurrencyArmourQuality"),
        )!;
        expect(armour.itemClasses).toContain("Body Armour");
        expect(armour.itemClasses).not.toContain("Ring");
        expect(armour.maximumQuality).toBe(20);
        const weapon = result.baseQuality.find((entry) =>
            entry.id.endsWith("/CurrencyWeaponQuality"),
        )!;
        expect(weapon.itemClasses.includes("Wand")).toBe(game === "poe1");
        if (game === "poe2")
            expect(
                result.baseQuality.find((entry) => entry.id.endsWith("/CurrencyMagicQuality"))
                    ?.itemClasses,
            ).toEqual(["Sceptre", "Staff", "Wand"]);
        for (const tainted of result.baseQuality.filter((entry) => entry.corrupted))
            expect(tainted.maximumQuality).toBe(game === "poe1" ? 20 : 29);
        for (const mutate of [
            (changed: typeof result) => {
                changed.baseQuality[0]!.maximumQuality++;
            },
            (changed: typeof result) => {
                changed.baseQuality[0]!.itemClasses.push("Ring");
            },
            (changed: typeof result) => {
                changed.baseQuality[0]!.corrupted = true;
            },
            (changed: typeof result) => {
                changed.baseQuality.pop();
            },
        ]) {
            const changed = structuredClone(result);
            mutate(changed);
            expect(() => validateCraftingData(changed, expected, data)).toThrow(
                "Base quality rules differ",
            );
        }
    });

    it("fails extraction when a quality instruction cannot resolve its target or maximum", () => {
        const currency = {
            id: "test",
            action: "add_armour_quality",
            directions:
                "Right click this item then left click an armour to apply it. The maximum quality is 25%.",
        };
        const bases = [{ item_class: "Body Armour", tags: ["armour"] }];
        expect(resolveBaseQuality([currency], bases)[0]?.maximumQuality).toBe(25);
        expect(resolveCatalystMaximumQuality("The maximum random quality is 29%.")).toBe(29);
        expect(() =>
            resolveBaseQuality(
                [{ ...currency, directions: currency.directions.replace("armour", "unknown") }],
                bases,
            ),
        ).toThrow("Unresolved base quality");
        expect(() =>
            resolveBaseQuality(
                [
                    {
                        ...currency,
                        directions: "Right click this item then left click an armour to apply it.",
                    },
                ],
                bases,
            ),
        ).toThrow("Unrecognized");
    });

    it("extracts action-specific memory strand costs with client-table provenance", () => {
        const result = validateCraftingData(input, expected, data);
        if (game === "poe2") {
            expect(result.memoryStrandCosts).toEqual({});
            const changed = { ...input, memoryStrandCosts: { transmute_to_magic: 4 } };
            expect(() => validateCraftingData(changed, expected, data)).toThrow(
                "PoE 1 client table",
            );
            return;
        }
        expect(Object.keys(result.memoryStrandCosts)).toHaveLength(22);
        expect(result.memoryStrandCosts).toMatchObject({
            transmute_to_magic: 4,
            reroll_magic: 4,
            add_mod_to_magic: 4,
            upgrade_magic_to_rare: 8,
            transmute_to_rare: 25,
            add_mod_to_rare: 8,
            reroll: 25,
            transfer_item_influence: 50,
            use_essence: 40,
            use_high_essence: 40,
            mutated_add_mod_to_magic: 16,
            mutated_upgrade_magic_to_rare: 24,
            mutated_add_mod_to_rare: 14,
        });
        expect(result.source.tables["Data/ZanaInfluenceCostPerCurrency.datc64"]).toMatch(
            /^[a-f0-9]{64}$/,
        );
        const changed = structuredClone(input);
        delete changed.source.tables["Data/ZanaInfluenceCostPerCurrency.datc64"];
        expect(() => validateCraftingData(changed, expected, data)).toThrow("provenance");
        expect(() =>
            validateCraftingData({ ...input, memoryStrandCosts: { unknown: 5 } }, expected, data),
        ).toThrow("Unresolved memory strand");
        for (const cost of [0, -1, 1.5])
            expect(() =>
                validateCraftingData(
                    { ...input, memoryStrandCosts: { reroll: cost } },
                    expected,
                    data,
                ),
            ).toThrow();
    });

    it("extracts catalyst quality limits from client instructions and rejects mismatched values", () => {
        const result = validateCraftingData(input, expected, data);
        expect(result.catalysts.every((entry) => entry.maximumQuality === 20)).toBe(true);
        expect(resolveCatalystMaximumQuality("The maximum quality is 25%.")).toBe(25);
        expect(resolveCatalystMaximumQuality("up to a default maximum of 30%.")).toBe(30);
        for (const description of [
            "",
            "The maximum quality is 0%.",
            "The maximum quality is 20.5%.",
        ])
            expect(() => resolveCatalystMaximumQuality(description)).toThrow("Unrecognized");
        const changed = structuredClone(input);
        changed.catalysts[0].maximumQuality = 30;
        expect(() => validateCraftingData(changed, expected, data)).toThrow(
            "differs from client text",
        );
        delete changed.catalysts[0].maximumQuality;
        expect(() => validateCraftingData(changed, expected, data)).toThrow();
    });

    it("extracts corrupted essence classification from the build's essence types", () => {
        const result = validateCraftingData(input, expected, data);
        if (game === "poe2") {
            expect(result.essences).toEqual([]);
            return;
        }
        expect(
            result.essences.filter((entry) => entry.corrupted).map((entry) => entry.name),
        ).toEqual([
            "Essence of Hysteria",
            "Essence of Insanity",
            "Essence of Horror",
            "Essence of Delirium",
        ]);
        expect(
            Object.keys(result.source.tables).some((path) => path.endsWith("/EssenceType.datc64")),
        ).toBe(true);
        const glyphic = result.fossils.find((entry) => entry.name === "Glyphic Fossil")!;
        expect(glyphic.corruptedEssenceChance).toBe(100);
        expect(glyphic.effects).toContain("CorruptEssence");
        const changed = structuredClone(input);
        delete changed.essences[0].corrupted;
        expect(() => validateCraftingData(changed, expected, data)).toThrow();
        const invalid = structuredClone(input);
        invalid.fossils[0].corruptedEssenceChance = 101;
        expect(() => validateCraftingData(invalid, expected, data)).toThrow();
    });

    it("retains fossil effect identifiers alongside their build descriptions", () => {
        const result = validateCraftingData(input, expected, data);
        if (game === "poe2") {
            expect(result.fossils).toEqual([]);
            return;
        }
        const opulent = result.fossils.find((entry) => entry.name === "Opulent Fossil")!;
        expect(opulent.effects).toEqual(["MoreDrop", "NoTagless"]);
        expect(opulent.positive).toEqual([{ tag: "drop", weight: 1000 }]);
        expect(result.fossils.find((entry) => entry.name === "Fractured Fossil")?.effects).toEqual([
            "Fracture",
        ]);
        const changed = structuredClone(input);
        changed.fossils.find((entry: { id: string }) => entry.id === opulent.id).effects = [];
        expect(() => validateCraftingData(changed, expected, data)).toThrow("effect descriptions");
    });

    it("extracts named tree notables, restrictions, translations and graph provenance", () => {
        const result = validateCraftingData(input, expected, data);
        if (game === "poe1") {
            expect(result.passiveTree).toBeNull();
            return;
        }
        const tree = result.passiveTree!;
        expect(tree.asset).toBe("Metadata/PassiveSkillGraph.psg");
        expect(result.source.tables[tree.asset]).toMatch(/^[a-f0-9]{64}$/);
        expect(Object.keys(tree.notables)).toHaveLength(1297);
        expect(
            Object.values(tree.notables).filter(
                (entry) => !entry.ascendancy && !entry.visibleForAscendancy,
            ),
        ).toHaveLength(942);
        expect(tree.notables.witch_sorceress_notable1).toMatchObject({
            name: "Raw Power",
            hash: 51184,
            notable: true,
            text: "20% increased [Spell] Damage\n+10 to [Intelligence]",
        });
        expect(result.statLookups.passive_hash?.["51184"]).toBe("Raw Power");
        expect(
            result.modDescriptions.EssenceGrantedPassive!.map(
                (index) => result.statDescriptions[index]!.rules[0]!.text,
            ),
        ).toContain("Allocates {0}");
        const changed = structuredClone(input);
        delete changed.source.tables[tree.asset];
        expect(() => validateCraftingData(changed, expected, data)).toThrow("asset provenance");
        changed.source.tables[tree.asset] = result.source.tables[tree.asset];
        changed.passiveTree.notables.witch_sorceress_notable1.hash =
            tree.notables.dexterity102!.hash;
        expect(() => validateCraftingData(changed, expected, data)).toThrow("duplicate passive");
    });

    it("resolves Harvest influence-reroll classes from command parameters", () => {
        const result = validateCraftingData(input, expected, data);
        const recipe = result.harvest.find((entry) => entry.id === "RerollInfluenceType");
        if (game === "poe1") {
            expect(recipe?.influenceRerollClasses).toHaveLength(24);
            expect(recipe?.influenceRerollClasses).toContain("Body Armour");
            expect(recipe?.influenceRerollClasses).toContain("Thrusting One Hand Sword");
            const changed = structuredClone(input);
            changed.harvest.find(
                (entry: { id: string }) => entry.id === recipe!.id,
            ).influenceRerollClasses = ["Ring"];
            expect(() => validateCraftingData(changed, expected, data)).toThrow("do not match");
        } else expect(recipe).toBeUndefined();
        expect(
            resolveHarvestInfluenceClasses("reroll_influence_types", "Body_Armour Ring"),
        ).toEqual(["Body Armour", "Ring"]);
        for (const value of ["", "Ring Ring", "Ring  Amulet", "Ring 2"])
            expect(() => resolveHarvestInfluenceClasses("reroll_influence_types", value)).toThrow();
        expect(resolveHarvestInfluenceClasses("another_command", "anything")).toBeNull();
    });

    it("derives Sanctification bounds from the pinned client's keyword definition", () => {
        const result = validateCraftingData(input, expected, data);
        expect(result.sanctification).toEqual(game === "poe1" ? null : { min: 78, max: 122 });
        if (game === "poe2") {
            expect(result.keywords.Sanctified?.term).toBe("Sanctified Items");
            expect(
                Object.keys(result.source.tables).some((path) =>
                    path.endsWith("/KeywordPopups.datc64"),
                ),
            ).toBe(true);
            expect(result.keywords.MarkofAbyssalLord?.definition).toContain("higher tier");
            expect(() =>
                validateCraftingData(
                    { ...input, sanctification: { min: 80, max: 120 } },
                    expected,
                    data,
                ),
            ).toThrow("keyword definition");
        }
        expect(resolveSanctification(undefined)).toBeNull();
        expect(
            resolveSanctification("random value ranging from 80% to 125% for each modifier."),
        ).toEqual({ min: 80, max: 125 });
        for (const definition of [
            "unknown",
            "random value ranging from 0% to 120% for each modifier.",
            "random value ranging from 130% to 120% for each modifier.",
        ])
            expect(() => resolveSanctification(definition)).toThrow("Unrecognized");
    });

    it("extracts and validates Harvest affinity percentages", () => {
        const result = validateCraftingData(input, expected, data);
        const recipes = result.harvest.filter((recipe) => recipe.affinityMultiplier !== null);
        expect(recipes.map((recipe) => [recipe.id, recipe.affinityMultiplier])).toEqual(
            game === "poe1"
                ? [
                      ["ReforgeMoreLikely", 10],
                      ["ReforgeLessLikely", 0.1],
                  ]
                : [],
        );
        for (const recipe of result.harvest)
            expect(recipe.affinityMultiplier).toBe(
                resolveHarvestAffinity(recipe.command, recipe.parameters),
            );
        const command = "reroll_with_current_tags_affinity_multiplier";
        for (const parameters of [
            "",
            "-100",
            "-200",
            "not-a-number",
            "900%",
            "900.5",
            "9007199254740992",
        ])
            expect(() => resolveHarvestAffinity(command, parameters)).toThrow(
                "Unsupported Harvest",
            );
        expect(resolveHarvestAffinity(command, "150")).toBe(2.5);
        if (game !== "poe1") return;
        const missing = structuredClone(input);
        missing.harvest.find(
            (recipe: { id: string }) => recipe.id === "ReforgeMoreLikely",
        ).affinityMultiplier = null;
        expect(() => validateCraftingData(missing, expected, data)).toThrow(
            "Unresolved Harvest affinity",
        );
    });

    it("resolves Harvest enchantment classes and modifiers from the recipe command", () => {
        const result = validateCraftingData(input, expected, data);
        const recipes = result.harvest.filter((recipe) => recipe.enchantment);
        expect(recipes).toHaveLength(game === "poe1" ? 14 : 0);
        for (const recipe of recipes) {
            expect(recipe.enchantment).toEqual(
                resolveHarvestEnchantment(recipe.command, recipe.parameters),
            );
            expect(data.mods[recipe.enchantment!.mod].text).toContain("Quality does not increase");
        }
        if (game === "poe2") return;
        expect(recipes.find((recipe) => recipe.id === "LifeBodyEnchant")!.enchantment).toEqual({
            mod: "HarvestAlternateArmourQualityIncreasedLife",
            itemClasses: ["Body Armour"],
        });
        const melee = recipes.find((recipe) => recipe.id === "WeaponRangeEnchant")!.enchantment!;
        expect(melee.itemClasses).toContain("Rune Dagger");
        expect(melee.itemClasses).not.toContain("Wand");
        expect(melee.itemClasses).not.toContain("Bow");
        for (const field of ["mod", "itemClasses"] as const) {
            const invalid = structuredClone(input);
            invalid.harvest.find(
                (recipe: { id: string }) => recipe.id === "LifeBodyEnchant",
            ).enchantment[field] = field === "mod" ? "missing" : ["missing"];
            expect(() => validateCraftingData(invalid, expected, data)).toThrow(
                "Unresolved crafting",
            );
        }
        expect(() =>
            resolveHarvestEnchantment("add_enchant_to_class", "Body_Armour ENCHANTS"),
        ).toThrow("Unsupported Harvest");
        expect(resolveHarvestEnchantment("reroll_with_mod", "life ON rare")).toBeNull();
    });

    it("resolves every recipe and restriction against the same extracted build", () => {
        const result = validateCraftingData(input, expected, data);
        expect(digest(read("crafting-data.json"))).toBe(manifest.crafting_data_sha256);
        expect(result.currencies.length).toBeGreaterThan(1000);
        expect(result.recombinableClasses).toHaveLength(game === "poe1" ? 26 : 30);
        expect(result.recombinableClasses).toContain("FishingRod");
        expect(
            result.source.tables[
                `${game === "poe1" ? "Data" : "Data/Balance"}/RecombinableClasses.datc64`
            ],
        ).toMatch(/^[a-f0-9]{64}$/);
        expect(Object.keys(result.source.tables).length).toBeGreaterThan(10);
        expect(result.rarities.Rare!.max).toBe(6);
        expect(result.scalableStats).toContain("base_maximum_life");
        expect(result.catalysts).toHaveLength(game === "poe1" ? 12 : 26);
        for (const table of ["AlternateQualityTypes", "ModEffectStats"])
            expect(
                Object.keys(result.source.tables).some((path) => path.endsWith(`/${table}.datc64`)),
            ).toBe(true);
        const attribute = result.catalysts.find((entry) =>
            entry.id.endsWith("JewelleryQualityAttribute"),
        )!;
        expect(attribute.tags).toEqual(["attribute"]);
        expect(attribute.itemClasses).toEqual(
            game === "poe1" ? ["Ring", "Amulet", "Belt"] : ["Ring", "Amulet"],
        );
        if (game === "poe1") {
            const aspects = result.beasts.filter(
                (entry) => entry.aspectMod && entry.gameMode !== 2,
            );
            expect(aspects).toHaveLength(8);
            expect(aspects.find((entry) => entry.id === "EinharMasterCraft38")?.aspectMod).toBe(
                "GrantsCatAspectCrafted",
            );
            expect(
                aspects.find((entry) => entry.id === "EinharMasterCraftMorrigan3")?.aspectMod,
            ).toBe("GrantsSpiderAspectCrafted30");
            expect(
                aspects.every((entry) => data.mods[entry.aspectMod!].grants_effects.length === 1),
            ).toBe(true);
            expect(() =>
                resolveAspectModifier("Level 99 Aspect of the Cat skill", data.mods),
            ).toThrow("Unresolved or ambiguous");
            expect(() =>
                resolveAspectModifier("Aspect of the Cat skill", {
                    ...data.mods,
                    duplicate: data.mods.GrantsCatAspectCrafted,
                }),
            ).toThrow("Unresolved or ambiguous");
            expect(
                result.catalysts.find((entry) => entry.id.endsWith("QualityPrefix")),
            ).toMatchObject({ prefix: true, suffix: false, implicit: false, tags: [] });
        } else {
            expect(
                result.catalysts.find((entry) => entry.id.endsWith("JewelQualityLife"))
                    ?.itemClasses,
            ).toEqual(["Jewel"]);
        }
        expect(result.scalableStats).not.toContain("local_implicit_mod_cannot_be_changed");
        expect(
            Object.keys(result.source.tables).some((path) => /\/Stats\.datc64$/.test(path)),
        ).toBe(true);
        expect(
            result.modEquivalencies.find((entry) => entry.mods.includes("FireResist1"))?.mods,
        ).toEqual(expect.arrayContaining(["ColdResist1", "LightningResist1"]));
        expect(
            Object.keys(result.source.tables).some((path) => path.includes("ModEquivalencies")),
        ).toBe(true);
        if (game === "poe1") {
            expect(
                result.fossils.some((entry) =>
                    entry.forbidden.some((rule) => rule.itemClass === "HeistContract"),
                ),
            ).toBe(true);
            expect(result.harvest.length).toBeGreaterThan(50);
        } else {
            expect(result.tieredCurrency).toHaveLength(10);
            expect(result.poe2Essences.length).toBeGreaterThan(20);
            expect(result.desecration).toHaveLength(12);
            expect(result.desecration.some((entry) => entry.minimumModLevel === 40)).toBe(true);
            expect(result.source.tables["Data/Balance/AbyssBenchTicketTypes.datc64"]).toBeDefined();
        }
    });

    it("rejects stale build/schema identities and dangling recipe references", () => {
        expect(() => validateCraftingData(input, { ...expected, patch: "other" }, data)).toThrow(
            "does not match",
        );
        expect(() =>
            validateCraftingData(input, { ...expected, schemaSha256: "0".repeat(64) }, data),
        ).toThrow("does not match");
        const changed = structuredClone(input);
        changed.currencies[0].id = "missing";
        expect(() => validateCraftingData(changed, expected, data)).toThrow(
            "Unresolved crafting base",
        );
        const modifier = structuredClone(input);
        modifier.modRules.missing = {
            itemClasses: [],
            influence: null,
            spawnLevel: null,
            gameMode: null,
        };
        expect(() => validateCraftingData(modifier, expected, data)).toThrow(
            "Unresolved crafting modifier",
        );
        expect(() =>
            validateCraftingData({ ...input, scalableStats: ["missing"] }, expected, data),
        ).toThrow("Unresolved crafting stat");
        const catalyst = structuredClone(input);
        catalyst.catalysts[0].tags = ["missing"];
        expect(() => validateCraftingData(catalyst, expected, data)).toThrow(
            "Unresolved crafting tag",
        );
        if (game === "poe1") {
            const beast = structuredClone(input);
            beast.beasts[0].aspectMod = "missing";
            expect(() => validateCraftingData(beast, expected, data)).toThrow(
                "Unresolved crafting modifier",
            );
        }
    });

    it("rejects unresolved and duplicate recombinable classes", () => {
        expect(() =>
            validateCraftingData({ ...input, recombinableClasses: ["missing"] }, expected, data),
        ).toThrow("Unresolved crafting item class");
        expect(() =>
            validateCraftingData(
                { ...input, recombinableClasses: ["Ring", "Ring"] },
                expected,
                data,
            ),
        ).toThrow("Duplicate recombinable item class");
    });

    it("extracts base-specific Liquid Emotion outcomes and validates their references", () => {
        const result = validateCraftingData(input, expected, data);
        expect(result.liquidEmotions).toHaveLength(game === "poe1" ? 0 : 26);
        if (game === "poe1") return;
        expect(result.source.tables["Data/Balance/LiquidEmotionOutcomes.datc64"]).toMatch(
            /^[a-f0-9]{64}$/,
        );
        const ire = result.liquidEmotions.find((entry) => entry.id.endsWith("/DistilledEmotion1"))!;
        expect(ire.rules).toEqual([
            { base: "Metadata/Items/Jewels/JewelStr", mods: ["JewelArmour"] },
            { base: "Metadata/Items/Jewels/JewelDex", mods: ["JewelEvasion"] },
            { base: "Metadata/Items/Jewels/JewelInt", mods: ["JewelEnergyShield"] },
        ]);
        expect(
            result.liquidEmotions.find((entry) => entry.id.endsWith("/DistilledEmotionTimeLost1"))!
                .rules[0],
        ).toEqual({
            base: "Metadata/Items/Jewels/JewelRadiusStr",
            mods: ["JewelRadiusArmour"],
        });
        expect(
            result.liquidEmotions.find((entry) => entry.id.endsWith("/EndgameDistilledEmotion2"))!
                .rules[0]!.mods,
        ).toEqual(["CraftedJewelSuffixEffect", "CraftedJewelPrefixEffect"]);
        const changed = structuredClone(input);
        changed.liquidEmotions[0].rules[0].base = "missing";
        expect(() => validateCraftingData(changed, expected, data)).toThrow(
            "Unresolved crafting base",
        );
        changed.liquidEmotions[0].rules[0] = { base: ire.rules[0]!.base, mods: ["missing"] };
        expect(() => validateCraftingData(changed, expected, data)).toThrow(
            "Unresolved crafting modifier",
        );
        changed.liquidEmotions[0] = { ...ire, rules: [...ire.rules, ire.rules[0]] };
        expect(() => validateCraftingData(changed, expected, data)).toThrow(
            "Duplicate liquid emotion base",
        );
        changed.liquidEmotions = [ire, ire];
        expect(() => validateCraftingData(changed, expected, data)).toThrow(
            "Duplicate liquid emotion currency",
        );
    });

    it("preserves anointing ingredient order, resolved passive effects and unresolved outcomes", () => {
        const result = validateCraftingData(input, expected, data);
        const recipes = result.anointing.recipes;
        expect(recipes).toHaveLength(game === "poe1" ? 576 : 1017);
        expect(result.anointing.items).toHaveLength(game === "poe1" ? 16 : 13);
        expect(recipes.filter((entry) => entry.passive)).toHaveLength(game === "poe1" ? 472 : 875);
        expect(recipes.filter((entry) => entry.mod)).toHaveLength(game === "poe1" ? 104 : 0);
        for (const table of [
            "BlightCraftingRecipes",
            "BlightCraftingResults",
            "BlightCraftingItems",
            "PassiveSkills",
        ])
            expect(
                Object.keys(result.source.tables).some((path) => path.endsWith(`/${table}.datc64`)),
            ).toBe(true);
        const first = recipes[0]!;
        expect(result.anointing.passives[first.passive!]!.text).toContain(
            game === "poe1" ? "Retaliation" : "Armour",
        );
        if (game === "poe2") {
            expect(result.anointing.passives.dexterity102!.text).toBe("+25 to [Dexterity]");
            expect(result.anointing.passives.shield34!.text).toContain("[Daze]");
            expect(recipes.filter((entry) => !entry.mod && !entry.passive)).toHaveLength(142);
            expect(recipes[1]!.items).not.toEqual(recipes[2]!.items);
            expect([...recipes[1]!.items].sort()).toEqual([...recipes[2]!.items].sort());
            expect(recipes[1]!.passive).toBeNull();
            expect(result.anointing.passives[recipes[2]!.passive!]!.name).toBe("Blinding Flash");
        }
        const changed = structuredClone(input);
        changed.anointing.recipes[0].items[0] = "missing";
        expect(() => validateCraftingData(changed, expected, data)).toThrow(
            "Unresolved anointing ingredient",
        );
        changed.anointing.recipes[0] = { ...first, passive: "missing" };
        expect(() => validateCraftingData(changed, expected, data)).toThrow(
            "Unresolved crafting anointed passive",
        );
        changed.anointing.recipes = [first, first];
        expect(() => validateCraftingData(changed, expected, data)).toThrow(
            "Duplicate anointing recipe",
        );
    });
});

/** biome-ignore-all lint/style/useNamingConvention: Test fixtures retain extracted field names. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "~/lib/crafting-item-text";
import { modifierLevelText, modifierTiers } from "~/lib/crafting-modifier-details";
import { recombinationOutcomes } from "~/lib/crafting-recombination";
import { CraftingSimulation, calculateExact } from "~/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "~/schemas/crafting";
import { baseId, catalog, engine } from "./crafting-fixtures";

const catalogs = [
    catalog,
    craftingCatalogSchema.parse(
        JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
    ),
];

describe.each(catalogs)("$game modifier details", (data) => {
    const engine = new CraftingEngine(data);
    const body = Object.entries(data.bases).find(
        ([, base]) => base.item_class === "Body Armour" && base.drop_level === 1,
    )![0];
    const ring = Object.entries(data.bases).find(
        ([, base]) => base.item_class === "Ring" && !base.corrupted,
    )![0];
    const firstLife = data.game === "poe1" ? "IncreasedLife0" : "IncreasedLife1";
    const topLife = data.game === "poe1" ? "IncreasedLife12" : "IncreasedLife13";

    it("numbers all thirteen body-armour life tiers and the eight ring tiers from the build", () => {
        const bodyTiers = modifierTiers(engine, body);
        const ringTiers = modifierTiers(engine, ring);
        expect(bodyTiers.get(firstLife)).toBe(13);
        expect(bodyTiers.get(topLife)).toBe(1);
        expect(ringTiers.get(firstLife)).toBe(8);
        expect(ringTiers.has(topLife)).toBe(false);
        expect(bodyTiers.has("VeiledPrefix")).toBe(false);
        expect([...bodyTiers.keys()].some((id) => id.includes("Royale"))).toBe(false);
    });

    it("records an essence guarantee without marking any ordinary companion rolls", () => {
        const normal = engine.createItem(body);
        const essence =
            data.game === "poe1"
                ? data.crafting.essences.find(
                      (entry) => entry.mods["Body Armour"] === "ColdResist1",
                  )!
                : data.crafting.poe2Essences.find(
                      (entry) => entry.name === "Greater Essence of the Body",
                  )!;
        const starting = data.game === "poe1" ? normal : { ...normal, rarity: "magic" as const };
        const method = { kind: "essence" as const, id: essence.id };
        const result = engine.apply(starting, method, seededRandom(42)).item;
        const guarantees = result.mods.filter((entry) => entry.essence);
        expect(guarantees).toHaveLength(1);
        expect(
            engine.recipePool(starting, "essence").some((entry) => entry.id === guarantees[0]!.id),
        ).toBe(true);
        const target = engine.validateTarget({ groups: [{ mods: [guarantees[0]!.id] }] });
        if (data.game === "poe2")
            expect(calculateExact(engine, starting, method, target).probability).toBe(1);
        const simulation = new CraftingSimulation(
            data,
            craftingProjectSchema.parse({
                format: 1,
                game: data.game,
                patch: data.patch,
                item: starting,
                method,
                target,
                steps: [],
                prices: {},
                seed: 42,
                iterations: 10,
                maxActions: 1,
            }),
        );
        for (let index = 0; index < 10; index++) simulation.runTrial();
        expect(simulation.result().probability).toBe(1);
        expect(
            simulation
                .result()
                .samples.every(({ item }) =>
                    item.mods.some((mod) => mod.id === guarantees[0]!.id && mod.essence),
                ),
        ).toBe(true);
        expect(engine.validateItem(JSON.parse(JSON.stringify(result)))).toEqual(result);
        const text = exportCraftingItemText(engine, result);
        expect(text).toContain("{essence}");
        expect(
            importCraftingItemText(engine, text).some(
                (entry) => JSON.stringify(entry.item) === JSON.stringify(result),
            ),
        ).toBe(true);
        const divine = data.crafting.currencies.find(
            (entry) => entry.action === "reroll_mod_values",
        )!;
        const rerolled = engine.apply(
            result,
            { kind: "currency", id: divine.id },
            seededRandom(7),
        ).item;
        expect(rerolled.mods.filter((entry) => entry.essence).map((entry) => entry.id)).toEqual(
            guarantees.map((entry) => entry.id),
        );
    });

    it("distinguishes manual essence setup from the same ordinary modifier and accepts old saves", () => {
        const original = engine.createItem(body);
        const id = data.game === "poe1" ? "ColdResist1" : "IncreasedLife8";
        const ordinary = engine.addStartingMod(original, id, seededRandom(1));
        const guarantee = engine.addStartingMod(original, id, seededRandom(1), "essence");
        expect(ordinary.mods[0]!.essence).toBeUndefined();
        expect(guarantee.mods[0]!.essence).toBe(true);
        const oldSave = structuredClone(guarantee);
        delete oldSave.mods[0]!.essence;
        expect(engine.validateItem(oldSave).mods[0]!.essence).toBeUndefined();
        const implicitBase = Object.entries(data.bases).find(
            ([, base]) => base.implicits.length && !base.corrupted,
        )![0];
        const implicit = engine.createItem(implicitBase);
        implicit.implicits[0]!.essence = true;
        expect(() => engine.validateItem(implicit)).toThrow("only to explicit modifiers");
    });
});

it("distinguishes extracted spawn-level overrides from modifier levels", () => {
    const poe2 = new CraftingEngine(catalogs[1]!);
    const base = "Metadata/Items/Armours/BodyArmours/FourBodyStr1";
    const id = "ArmourAppliesToElementalDamage1";
    expect(modifierLevelText(engine, "IncreasedLife0")).toBe("ilvl 1");
    expect(modifierLevelText(poe2, "IncreasedLife1")).toBe("ilvl 1");
    expect(modifierLevelText(poe2, id)).toBe("ilvl 30 · modifier level 1");
    expect(
        modifierLevelText(poe2, "AbyssModArmourJewelleryUlamanSuffixLightningChaosResistance"),
    ).toBe("ilvl 1 · modifier level 65");
    const item = { ...poe2.createItem(base, 30), rarity: "rare" as const };
    expect(poe2.pool({ ...item, level: 29 }).some((entry) => entry.id === id)).toBe(false);
    expect(poe2.pool(item).some((entry) => entry.id === id)).toBe(true);
});

it("keeps essence, crafted and ordinary tier families separate", () => {
    const ordinary = modifierTiers(engine, baseId);
    const essence = modifierTiers(engine, baseId, "essence");
    expect(ordinary.get("ColdResist1")).toBe(8);
    expect(essence.get("ColdResist1")).toBe(7);
    expect(ordinary.get("HelenaMasterIncreasedLife1")).toBe(5);
    expect(ordinary.get("EinharMasterIncreasedLife5_")).toBe(1);
    expect(essence.has("HelenaMasterIncreasedLife1")).toBe(false);
});

it("uses range magnitudes for equal-level tiers, shares exact ties and excludes restricted records", () => {
    const changed = structuredClone(catalog);
    for (const [id, min, max] of [
        ["testLower", -4, -2],
        ["testHigher", -8, -5],
        ["testDuplicate", -8, -5],
        ["testRestricted", -99, -90],
        ["testRoyale", -99, -90],
    ] as const) {
        changed.mods[id] = {
            ...changed.mods.IncreasedLife0!,
            type: "TestPower",
            groups: ["TestPower"],
            required_level: 1,
            maximum_level: 2,
            stats: [{ id: "base_maximum_life", min, max }],
        };
        changed.crafting.modRules[id] = {
            itemClasses: id === "testRestricted" ? ["Wand"] : [],
            influence: null,
            gameMode: null,
            spawnLevel: null,
        };
    }
    const tiers = modifierTiers(new CraftingEngine(changed), baseId);
    expect(tiers.get("testLower")).toBe(2);
    expect(tiers.get("testHigher")).toBe(1);
    expect(tiers.get("testDuplicate")).toBe(1);
    expect(tiers.has("testRestricted")).toBe(false);
    expect(tiers.has("testRoyale")).toBe(false);
});

it("keeps influence families separate and honors their extracted tags without requiring influence on the starting item", () => {
    const tiers = modifierTiers(engine, baseId);
    const native = engine.pool({ ...engine.createItem(baseId), rarity: "rare", influences: [0] });
    const influenced = native.filter(
        (entry) => catalog.crafting.modRules[entry.id]?.influence === 0,
    );
    expect(influenced.length).toBeGreaterThan(0);
    expect(influenced.every((entry) => tiers.has(entry.id))).toBe(true);
    expect(tiers.get("IncreasedLife0")).toBe(13);
});

it("rejects essence source claims with no extracted recipe", () => {
    const changed = structuredClone(catalog);
    changed.crafting.essences = [];
    const engine = new CraftingEngine(changed);
    const item = engine.addStartingMod(
        engine.createItem(baseId),
        "IncreasedLife0",
        seededRandom(1),
    );
    item.mods[0]!.essence = true;
    expect(() => engine.validateItem(item)).toThrow("no extracted essence recipe");
});

it("preserves essence provenance through attribute conversion and retained recombination rolls", () => {
    const normal = engine.createItem(baseId);
    const guarantee = engine
        .recipePool(normal, "essence")
        .find(({ mod }) => mod.stats.length === 1 && mod.stats[0]!.id === "additional_strength")!;
    const starting = engine.addStartingMod(normal, guarantee.id, seededRandom(1), "essence");
    const convertedId = engine.attributeChoices(starting)[0]!.ids[0]!;
    const converted = engine.addStartingMod(starting, convertedId, seededRandom(1), "attribute");
    expect(converted.mods[0]).toMatchObject({ essence: true, attributeSource: guarantee.id });
    expect(
        importCraftingItemText(engine, exportCraftingItemText(engine, converted))[0]!.item,
    ).toEqual(converted);
    const shared = engine.addStartingMod(normal, "ColdResist1", seededRandom(1), "essence");
    const outcomes = recombinationOutcomes(engine, shared, normal);
    const retained = outcomes.filter(({ value }) =>
        value.mods.some((mod) => mod.id === "ColdResist1"),
    );
    expect(retained.length).toBeGreaterThan(0);
    for (const { value } of retained) {
        expect(value.mods.find((mod) => mod.id === "ColdResist1")?.essence).toBe(true);
        expect(engine.validateItem(value)).toEqual(value);
    }
});

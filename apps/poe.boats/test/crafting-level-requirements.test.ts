import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { baseItemsSchema, itemMetadataSchema } from "../../../packages/poe-game-data/src/model";
import { augmentCreatesJewelSocket } from "../app/lib/crafting-augments";
import { CraftingEngine, type CraftingRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { itemProperties } from "../app/lib/crafting-properties";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { targetNeedsValues } from "../app/lib/crafting-targets";
import {
    craftingBaseSchema,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";

const first: CraftingRandom = { pick: (choices) => choices[0]!.value, integer: (min) => min };
const load = (game: string) =>
    craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );

describe.each(["poe1", "poe2"] as const)("%s required character level", (game) => {
    const catalog = load(game);
    const engine = new CraftingEngine(catalog);
    const create = (name: string) =>
        engine.createItem(Object.entries(catalog.bases).find(([, base]) => base.name === name)![0]);
    const level = (item: ReturnType<typeof engine.createItem>) =>
        itemProperties(engine, item).requiredLevel;
    const annul = {
        kind: "currency" as const,
        id: catalog.crafting.currencies.find((entry) => entry.action === "remove_random_mod")!.id,
    };
    const prepared = () =>
        engine.addStartingMod(
            engine.addStartingMod(create("Iron Ring"), "Strength7", first),
            "IncreasedLife1",
            first,
        );

    it("projects level flags directly from every packaged inherited metadata record", () => {
        const directory = `../../packages/poe-${game === "poe1" ? 1 : 2}-data/data`;
        const bases = baseItemsSchema.parse(
            JSON.parse(readFileSync(`${directory}/base_items.json`, "utf8")),
        );
        const metadata = new Map<string, ReturnType<typeof itemMetadataSchema.parse>>();
        for (const [id, base] of Object.entries(catalog.bases)) {
            const path = bases[id]?.inherits_from;
            if (path && !metadata.has(path))
                metadata.set(
                    path,
                    itemMetadataSchema.parse(
                        JSON.parse(readFileSync(`${directory}/${path}.json`, "utf8")),
                    ),
                );
            expect(base.levelRules).toEqual(
                craftingBaseSchema.shape.levelRules.parse(
                    path ? metadata.get(path)!.Mods : undefined,
                ),
            );
        }
        expect(() =>
            craftingBaseSchema.shape.levelRules.parse({
                // biome-ignore lint/style/useNamingConvention: Retains the extracted metadata field.
                no_level_requirement: "unknown",
            }),
        ).toThrow();
    });

    it("distinguishes character requirements from drop and item levels", () => {
        expect(level(create("Crude Bow"))).toBe(0);
        expect(level(create("Iron Ring"))).toBe(0);
        expect(level(create("Gold Ring"))).toBe(game === "poe1" ? 20 : 40);
        expect(level(create("Amber Amulet"))).toBe(game === "poe1" ? 5 : 8);
        expect(level(create("Greater Life Flask"))).toBe(game === "poe1" ? 12 : 10);
        expect(level(create(game === "poe1" ? "Crimson Jewel" : "Ruby"))).toBe(0);
        const ring = create("Gold Ring");
        expect(level({ ...ring, level: 100, quality: 20, implicits: [] })).toBe(
            game === "poe1" ? 20 : 40,
        );
        const chest = Object.keys(catalog.bases).find((id) => catalog.bases[id]!.strongbox)!;
        expect(level(engine.createItem(chest))).toBeUndefined();
        const map = Object.keys(catalog.bases).find(
            (id) => catalog.bases[id]!.item_class === "Map",
        )!;
        expect(level(engine.createItem(map))).toBeUndefined();
    });

    it("uses the highest affix level and preserves it through text and project round trips", () => {
        const item = prepared();
        expect(level(item)).toBe(52);
        expect(level({ ...item, quality: 20 })).toBe(52);
        const imported = importCraftingItemText(engine, exportCraftingItemText(engine, item))[0]!
            .item;
        expect(level(imported)).toBe(52);
        expect(level(engine.validateItem(JSON.parse(JSON.stringify(item))))).toBe(52);
        expect(level({ ...item, destroyed: true })).toBeUndefined();
        const target = engine.validateTarget({
            groups: [],
            properties: { requiredLevel: { max: 10 } },
        });
        expect(calculateExact(engine, item, annul, target).probability).toBe(0.5);
        expect(level(engine.apply(item, annul, first).item)).toBe(game === "poe1" ? 4 : 0);
        item.mods[0]!.fractured = true;
        expect(calculateExact(engine, item, annul, target).probability).toBe(0);
        for (const range of [{ min: -1 }, { min: 10, max: 9 }, { max: Infinity }])
            expect(() =>
                engine.validateTarget({ groups: [], properties: { requiredLevel: range } }),
            ).toThrow();
    });

    it("avoids irrelevant value enumeration for level-only targets, including nested conditions", () => {
        const target = engine.validateTarget({
            groups: [],
            expression: {
                operator: "and",
                operands: [{ groups: [], properties: { requiredLevel: { min: 52, max: 52 } } }],
            },
        });
        expect(targetNeedsValues(target)).toBe(false);
        const divine = {
            kind: "currency" as const,
            id: catalog.crafting.currencies.find((entry) => entry.action === "reroll_mod_values")!
                .id,
        };
        expect(calculateExact(engine, prepared(), divine, target, 1)).toMatchObject({
            probability: 1,
            states: 1,
        });
        expect(targetNeedsValues({ ...target, properties: { flatLife: { min: 1 } } })).toBe(true);
        expect(
            targetNeedsValues({
                ...target,
                stats: [{ id: "base_maximum_life", scope: "all", min: 1 }],
            }),
        ).toBe(true);
    });

    it("routes a level-only process consistently in exact calculation and seeded simulation", () => {
        const target = { groups: [], properties: { requiredLevel: { max: 10 } } };
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: catalog.patch,
            item: prepared(),
            method: annul,
            target,
            steps: [
                {
                    id: "annul",
                    method: annul,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "annul",
                },
            ],
            prices: { [annul.id]: 2 },
            seed: 42,
            iterations: 1000,
            maxActions: 2,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBe(1);
        expect(exact.meanCost).toBe(3);
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let trial = 0; trial < 1000; trial++) simulation.runTrial();
        expect(simulation.result().errors).toEqual({});
        expect(simulation.result().probability).toBe(1);
        expect(simulation.result().meanCost).toBeCloseTo(3, 1);
    });
});

describe("PoE 1 level exceptions", () => {
    const engine = new CraftingEngine(load("poe1"));
    it("allows Abyss Jewel affixes to raise the level without using the base drop level", () => {
        const item = engine.createItem("Metadata/Items/Jewels/JewelAbyssMelee");
        expect(itemProperties(engine, item).requiredLevel).toBe(0);
        const crafted = engine.addStartingMod(item, "AbyssJewelAddedLife3", first);
        expect(itemProperties(engine, crafted).requiredLevel).toBe(59);
    });
    it("includes corruption implicit levels and keeps the equipment base minimum", () => {
        const item = engine.createItem("Metadata/Items/Rings/Ring1");
        const mod = engine.mod("V2AddedColdDamageCorrupted3");
        const corrupted = engine.validateItem({
            ...item,
            corrupted: true,
            implicits: [
                {
                    id: "V2AddedColdDamageCorrupted3",
                    values: mod.stats.map((stat) => stat.min),
                    fractured: false,
                    crafted: false,
                },
            ],
        });
        expect(itemProperties(engine, corrupted).requiredLevel).toBe(64);
        const armour = engine.createItem("Metadata/Items/Armours/BodyArmours/BodyStrDex15");
        expect(itemProperties(engine, armour).requiredLevel).toBe(engine.base(armour).drop_level);
    });
});

describe("PoE 2 level exceptions and augments", () => {
    const catalog = load("poe2");
    const engine = new CraftingEngine(catalog);
    it("handles low-level weapons and explicit no-level-requirement metadata", () => {
        expect(
            itemProperties(
                engine,
                engine.createItem(
                    "Metadata/Items/Weapons/OneHandWeapons/OneHandMaces/FourOneHandMace2",
                ),
            ).requiredLevel,
        ).toBe(0);
        expect(
            itemProperties(
                engine,
                engine.createItem(
                    "Metadata/Items/Weapons/OneHandWeapons/OneHandMaces/FourOneHandMace3",
                ),
            ).requiredLevel,
        ).toBe(10);
        const relic = engine.createItem(
            Object.keys(catalog.bases).find((id) => catalog.bases[id]!.item_class === "Relic")!,
        );
        const mod = engine
            .pool({ ...relic, rarity: "magic" })
            .find((entry) => engine.mod(entry.id).required_level > 10)!;
        expect(
            itemProperties(engine, engine.addStartingMod(relic, mod.id, first)).requiredLevel,
        ).toBe(0);
    });
    it("uses the highest augment requirement and recalculates after replacement", () => {
        const item = {
            ...engine.createItem("Metadata/Items/Weapons/TwoHandWeapons/Bows/FourBow1"),
            sockets: 2,
        };
        const socket = (id: string, replace?: number) => ({
            kind: "augment" as const,
            id: `Metadata/Items/SoulCores/${id}`,
            replace,
        });
        let crafted = engine.apply(item, socket("RuneFire"), first).item;
        expect(itemProperties(engine, crafted).requiredLevel).toBe(15);
        crafted = engine.apply(crafted, socket("RuneFireGreater"), first).item;
        const greater = catalog.crafting.augments.find((entry) =>
            entry.id.endsWith("/RuneFireGreater"),
        )!;
        expect(itemProperties(engine, crafted).requiredLevel).toBe(greater.requiredLevel);
        const target = engine.validateTarget({
            groups: [],
            properties: { requiredLevel: { max: 15 } },
        });
        const replace = socket("RuneFireLesser", 1);
        expect(calculateExact(engine, crafted, replace, target).probability).toBe(1);
        expect(
            itemProperties(engine, engine.apply(crafted, replace, first).item).requiredLevel,
        ).toBe(15);
    });
    it("does not use a socketed Jewel's drop level as an equipment requirement", () => {
        const source = catalog.crafting.augments.find(augmentCreatesJewelSocket)!;
        const item = {
            ...engine.createItem("Metadata/Items/Armours/Gloves/FourGlovesStr1"),
            sockets: 1,
        };
        const converted = engine.apply(item, { kind: "augment", id: source.id }, first).item;
        expect(itemProperties(engine, converted).requiredLevel).toBe(source.requiredLevel);
        const jewel = engine.createItem("Metadata/Items/Jewels/JewelStr");
        const socketed = engine.apply(
            converted,
            {
                kind: "socket_jewel",
                id: "socket_jewel",
                jewel: { id: "jewel", name: "Ruby", item: jewel },
            },
            first,
        ).item;
        expect(itemProperties(engine, socketed).requiredLevel).toBe(source.requiredLevel);
    });
});

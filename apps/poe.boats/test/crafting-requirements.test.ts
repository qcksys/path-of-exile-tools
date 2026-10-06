import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { baseItemsSchema } from "../../../packages/poe-game-data/src/model";
import { CraftingEngine, type CraftingRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { itemProperties } from "../app/lib/crafting-properties";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import {
    type CraftingItem,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";

const first: CraftingRandom = { pick: (choices) => choices[0]!.value, integer: (min) => min };
const load = (game: string) =>
    craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );

describe.each(["poe1", "poe2"] as const)("%s local attribute requirements", (game) => {
    const catalog = load(game);
    const engine = new CraftingEngine(catalog);
    const baseId =
        game === "poe1"
            ? "Metadata/Items/Armours/BodyArmours/BodyStrDex15"
            : "Metadata/Items/Armours/BodyArmours/FourBodyStrDex11";
    const base = () => engine.createItem(baseId);
    const reduced = () =>
        engine.addStartingMod(base(), "ReducedLocalAttributeRequirements1", first);
    const expected =
        game === "poe1"
            ? { strengthRequirement: 94, dexterityRequirement: 77, intelligenceRequirement: 0 }
            : { strengthRequirement: 56, dexterityRequirement: 56, intelligenceRequirement: 0 };
    const annul = {
        kind: "currency" as const,
        id: catalog.crafting.currencies.find((entry) => entry.action === "remove_random_mod")!.id,
    };

    it("exports every canonical requirement and keeps Strongboxes without invented attributes", () => {
        const bases = baseItemsSchema.parse(
            JSON.parse(
                readFileSync(
                    `../../packages/poe-${game === "poe1" ? 1 : 2}-data/data/base_items.json`,
                    "utf8",
                ),
            ),
        );
        for (const [id, entry] of Object.entries(catalog.bases))
            expect(entry.requirements).toEqual(entry.strongbox ? null : bases[id]!.requirements);
        const chest = Object.keys(catalog.bases).find((id) => catalog.bases[id]!.strongbox)!;
        expect(
            itemProperties(engine, engine.createItem(chest)).strengthRequirement,
        ).toBeUndefined();
    });

    it("floors local reductions and preserves requirements through quality, text and JSON", () => {
        const item = reduced();
        expect(itemProperties(engine, item)).toMatchObject(expected);
        expect(itemProperties(engine, { ...item, quality: 20 })).toMatchObject(expected);
        const attributes = engine.addStartingMod(item, "Strength1", first);
        expect(itemProperties(engine, attributes)).toMatchObject(expected);
        const restored = importCraftingItemText(engine, exportCraftingItemText(engine, item))[0]!
            .item;
        expect(itemProperties(engine, restored)).toMatchObject(expected);
        expect(engine.validateItem(JSON.parse(JSON.stringify(item)))).toEqual(item);
        expect(itemProperties(engine, { ...item, destroyed: true })).toEqual({});
        for (const range of [{ min: -1 }, { min: 10, max: 9 }, { max: Infinity }])
            expect(() =>
                engine.validateTarget({ groups: [], properties: { strengthRequirement: range } }),
            ).toThrow();
    });

    it("recomputes conditions when a local-requirement modifier is removed or protected", () => {
        const item = engine.addStartingMod(reduced(), "IncreasedLife1", first);
        const target = engine.validateTarget({
            groups: [],
            properties: { strengthRequirement: { max: expected.strengthRequirement } },
        });
        expect(calculateExact(engine, item, annul, target).probability).toBe(0.5);
        const after = engine.apply(item, annul, first).item;
        expect(engine.matches(after, target)).toBe(false);
        item.mods[0]!.fractured = true;
        expect(calculateExact(engine, item, annul, target).probability).toBe(1);
    });

    it("uses attribute-only conditions in repeated processes with consistent sampled costs", () => {
        const item = engine.addStartingMod(reduced(), "IncreasedLife1", first);
        const target = engine.validateTarget({
            groups: [],
            properties: { strengthRequirement: { max: expected.strengthRequirement } },
        });
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: catalog.patch,
            item,
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
        expect(exact.probability).toBe(0.5);
        expect(exact.meanCost).toBe(3);
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let trial = 0; trial < 1000; trial++) simulation.runTrial();
        expect(simulation.result().errors).toEqual({});
        expect(simulation.result().probability).toBeCloseTo(0.5, 1);
        expect(simulation.result().meanCost).toBeCloseTo(3, 1);
    });
});

describe("PoE 2 requirement socket effects", () => {
    const catalog = load("poe2");
    const engine = new CraftingEngine(catalog);
    const armour = () => ({
        ...engine.createItem("Metadata/Items/Armours/BodyArmours/FourBodyStrDex11"),
        sockets: 3,
        corrupted: true,
    });
    const socket = (attribute: string) => ({
        kind: "augment" as const,
        id: `Metadata/Items/SoulCores/SoulCore${attribute}`,
    });

    it("converts original base requirements simultaneously before local reductions", () => {
        let item = engine.apply(armour(), socket("Intelligence"), first).item;
        expect(itemProperties(engine, item)).toMatchObject({
            strengthRequirement: 40,
            dexterityRequirement: 40,
            intelligenceRequirement: 53,
        });
        item = engine.apply(item, socket("Strength"), first).item;
        expect(itemProperties(engine, item)).toMatchObject({
            strengthRequirement: 67,
            dexterityRequirement: 13,
            intelligenceRequirement: 53,
        });
        item = engine.addStartingMod(item, "ReducedLocalAttributeRequirements1", first);
        expect(itemProperties(engine, item)).toMatchObject({
            strengthRequirement: 56,
            dexterityRequirement: 11,
            intelligenceRequirement: 45,
        });
        const imported = importCraftingItemText(engine, exportCraftingItemText(engine, item))[0]!
            .item;
        expect(itemProperties(engine, imported)).toEqual(itemProperties(engine, item));
        expect(engine.validateItem(JSON.parse(JSON.stringify(item)))).toEqual(item);
    });

    it("caps outgoing conversion at the available base requirement", () => {
        let item: CraftingItem = armour();
        for (let count = 0; count < 3; count++)
            item = engine.apply(item, socket("Intelligence"), first).item;
        expect(itemProperties(engine, item)).toMatchObject({
            strengthRequirement: 0,
            dexterityRequirement: 0,
            intelligenceRequirement: 134,
        });
        const mixed = engine.apply(item, { ...socket("Dexterity"), replace: 2 }, first).item;
        expect(itemProperties(engine, mixed)).toMatchObject({
            strengthRequirement: 0,
            dexterityRequirement: 35,
            intelligenceRequirement: 98,
        });
    });

    it("keeps flat Rune requirements after conversion and applies local reductions to them", () => {
        const start = {
            ...engine.createItem(
                "Metadata/Items/Weapons/OneHandWeapons/OneHandMaces/FourOneHandMace5",
            ),
            sockets: 2,
            corrupted: true,
        };
        let item = engine.apply(
            start,
            { kind: "augment", id: "Metadata/Items/SoulCores/RuneOlrothsLegacyMjölner" },
            first,
        ).item;
        item = engine.apply(item, socket("Dexterity"), first).item;
        item = engine.addStartingMod(item, "ReducedLocalAttributeRequirements1", first);
        expect(itemProperties(engine, item)).toMatchObject({
            strengthRequirement: 20,
            dexterityRequirement: 13,
            intelligenceRequirement: 170,
        });
    });

    it("counts conversion-only targets in exact and sampled augment applications", () => {
        const target = engine.validateTarget({
            groups: [],
            properties: {
                intelligenceRequirement: { min: 53, max: 53 },
                strengthRequirement: { max: 40 },
            },
        });
        const method = socket("Intelligence");
        expect(calculateExact(engine, armour(), method, target).probability).toBe(1);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item: armour(),
            method,
            target,
            steps: [],
            prices: { [method.id]: 3 },
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const simulation = new CraftingSimulation(catalog, project, false);
        for (let trial = 0; trial < 100; trial++) simulation.runTrial();
        expect(simulation.result().probability).toBe(1);
        expect(simulation.result().meanCost).toBe(3);
        expect(simulation.result().errors).toEqual({});
    });

    it("includes flat Rune requirements on bases without an attribute record", () => {
        const base = engine.createItem(
            "Metadata/Items/Weapons/OneHandWeapons/OneHandMaces/FourOneHandMace14",
        );
        expect(engine.base(base).requirements).toBeNull();
        const item = engine.apply(
            base,
            { kind: "augment", id: "Metadata/Items/SoulCores/RuneOlrothsLegacyMjölner" },
            first,
        ).item;
        expect(itemProperties(engine, item)).toMatchObject({
            strengthRequirement: 0,
            dexterityRequirement: 0,
            intelligenceRequirement: 200,
        });
    });

    it("uses Sanctification's scaled reduction rather than the raw modifier value", () => {
        const start = engine.addStartingMod(
            { ...armour(), sockets: 0, corrupted: false },
            "ReducedLocalAttributeRequirements1",
            first,
        );
        const divine = catalog.crafting.currencies.find(
            (entry) => entry.action === "reroll_mod_values",
        )!;
        const item = engine.apply(
            start,
            {
                kind: "currency",
                id: divine.id,
                omens: ["Metadata/Items/Currency/OmenOnDivineSanctify"],
            },
            first,
        ).item;
        expect(item.mods[0]!.sanctification).toBe(78);
        expect(itemProperties(engine, item)).toMatchObject({
            strengthRequirement: 58,
            dexterityRequirement: 58,
            intelligenceRequirement: 0,
        });
    });
});

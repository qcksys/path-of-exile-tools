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
    craftingCatalogSchema,
    craftingFlaskPropertiesSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";

const minimum: CraftingRandom = { pick: (choices) => choices[0]!.value, integer: (min) => min };

describe.each(["poe1", "poe2"] as const)("%s flask properties", (game) => {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const create = (suffix: string) =>
        engine.createItem(`Metadata/Items/Flasks/${game === "poe2" ? "Four" : ""}${suffix}`);
    const life = () => ({ ...create("FlaskLife1"), quality: 20 });
    const recovery = () => engine.addStartingMod(life(), "FlaskIncreasedRecoveryAmount1", minimum);
    const divine = {
        kind: "currency" as const,
        id: catalog.crafting.currencies.find((entry) => entry.action === "reroll_mod_values")!.id,
    };

    it("exports each flask property directly from its verified canonical base", () => {
        const bases = baseItemsSchema.parse(
            JSON.parse(
                readFileSync(
                    `../../packages/poe-${game === "poe1" ? "1" : "2"}-data/data/base_items.json`,
                    "utf8",
                ),
            ),
        );
        for (const [id, base] of Object.entries(catalog.bases))
            expect(base.flask).toEqual(
                craftingFlaskPropertiesSchema.parse(base.strongbox ? {} : bases[id]!.properties),
            );
        expect(itemProperties(engine, create("FlaskLife1"))).toMatchObject({
            lifeRecovery: game === "poe1" ? 70 : 50,
            flaskDuration: 3,
            maximumCharges: game === "poe1" ? 21 : 60,
            chargesPerUse: game === "poe1" ? 7 : 10,
        });
        const mana = itemProperties(engine, create("FlaskMana1"));
        expect(mana.manaRecovery).toBe(50);
        expect(mana.lifeRecovery).toBeUndefined();
        expect(mana.flaskDuration).toBe(game === "poe1" ? 3 : 2);
    });

    it("combines recovery magnitude and quality without increasing recovery duration", () => {
        const item = recovery();
        expect(itemProperties(engine, item)).toMatchObject({
            lifeRecovery: game === "poe1" ? 118 : 85,
            flaskDuration: game === "poe1" ? 4.5 : 3,
        });
        expect(itemProperties(engine, { ...item, quality: 0 }).lifeRecovery).toBe(
            game === "poe1" ? 99 : 71,
        );
        const faster = engine.addStartingMod(life(), "FlaskIncreasedRecoverySpeed1", minimum);
        expect(itemProperties(engine, faster)).toMatchObject({
            lifeRecovery: game === "poe1" ? 84 : 60,
            flaskDuration: 2.1,
        });
        expect(itemProperties(engine, { ...faster, quality: 0 }).flaskDuration).toBe(2.1);
    });

    it("distinguishes flat and percentage maximum charges and floors charge use", () => {
        const maximum = engine.addStartingMod(life(), "FlaskExtraCharges1", minimum);
        expect(itemProperties(engine, maximum).maximumCharges).toBe(game === "poe1" ? 37 : 73);
        const reduced = engine.addStartingMod(life(), "FlaskChargesUsed1", minimum);
        expect(itemProperties(engine, reduced).chargesPerUse).toBe(game === "poe1" ? 5 : 8);
        expect(itemProperties(engine, { ...reduced, quality: 0 }).chargesPerUse).toBe(
            game === "poe1" ? 5 : 8,
        );
    });

    it("reports total instant recovery and leaves conditional recovery inactive", () => {
        const instant = engine.addStartingMod(life(), "FlaskFullInstantRecovery1", minimum);
        expect(itemProperties(engine, instant).lifeRecovery).toBe(game === "poe1" ? 29 : 30);
        const conditional = engine.addStartingMod(
            life(),
            "FlaskIncreasedRecoveryOnLowLife1",
            minimum,
        );
        expect(itemProperties(engine, conditional).lifeRecovery).toBe(game === "poe1" ? 84 : 60);
        expect(itemProperties(engine, conditional).flaskDuration).toBe(3);
    });

    it("preserves calculated values through Divine, text, JSON, and destroyed items", () => {
        const item = recovery();
        const rolled = engine.apply(item, divine, minimum).item;
        expect(itemProperties(engine, rolled)).toEqual(itemProperties(engine, item));
        const imported = importCraftingItemText(engine, exportCraftingItemText(engine, item))[0]!
            .item;
        expect(itemProperties(engine, imported)).toEqual(itemProperties(engine, item));
        expect(
            itemProperties(engine, engine.validateItem(JSON.parse(JSON.stringify(item)))),
        ).toEqual(itemProperties(engine, item));
        expect(itemProperties(engine, { ...item, destroyed: true })).toEqual({});
        const equipment = engine.createItem(
            Object.entries(catalog.bases).find(([, base]) => base.name === "Crude Bow")![0],
        );
        expect(itemProperties(engine, equipment).maximumCharges).toBeUndefined();
        expect(
            engine.matches(
                equipment,
                engine.validateTarget({
                    groups: [],
                    properties: { lifeRecovery: { min: 1 } },
                }),
            ),
        ).toBe(false);
        expect(() =>
            engine.validateTarget({ groups: [], properties: { chargesPerUse: { min: -1 } } }),
        ).toThrow();
    });

    it("enumerates recovery thresholds and retry costs, with matching seeded simulation", () => {
        const item = recovery();
        const target = engine.validateTarget({
            groups: [],
            properties: {
                lifeRecovery: { min: game === "poe1" ? 123 : 87 },
                flaskDuration: { max: game === "poe1" ? 4.5 : 3 },
            },
        });
        const probability = game === "poe1" ? 1 / 6 : 1 / 5;
        expect(calculateExact(engine, item, divine, target).probability).toBeCloseTo(probability);
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: catalog.patch,
            item,
            target,
            method: divine,
            steps: [
                {
                    id: "roll",
                    method: divine,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "roll",
                },
            ],
            prices: { [divine.id]: 3 },
            seed: 42,
            iterations: 1000,
            maxActions: 2,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBeCloseTo(1 - (1 - probability) ** 2);
        expect(exact.meanCost).toBeCloseTo(3 * (2 - probability));
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let trial = 0; trial < 1000; trial++) simulation.runTrial();
        expect(simulation.result().errors).toEqual({});
        expect(simulation.result().successes / 1000).toBeCloseTo(exact.probability, 1);
        expect(simulation.result().meanCost).toBeCloseTo(exact.meanCost!, 0);
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project))).target).toEqual(
            target,
        );
    });

    if (game === "poe1") {
        it("handles hybrid recovery and counts flask enchantments exactly once", () => {
            const hybrid = engine.addStartingMod(
                { ...create("FlaskHybrid1"), quality: 20 },
                "FlaskIncreasedRecoveryAmount1",
                minimum,
            );
            expect(itemProperties(engine, hybrid)).toMatchObject({
                lifeRecovery: 169,
                manaRecovery: 118,
                flaskDuration: 7.5,
            });
            const utility = { ...create("FlaskUtility6"), quality: 20 };
            expect(itemProperties(engine, utility).flaskDuration).toBe(7.2);
            const enchanted = (id: string) =>
                engine.validateItem({
                    ...utility,
                    enchantments: [
                        {
                            id,
                            values: engine.mod(id).stats.map((stat) => stat.min),
                            fractured: false,
                            crafted: false,
                        },
                    ],
                });
            expect(
                itemProperties(engine, enchanted("FlaskEnchantmentSealIncreasedDuration"))
                    .flaskDuration,
            ).toBe(13);
            expect(
                itemProperties(engine, enchanted("FlaskEnchantmentSealReducedChargesUsed"))
                    .chargesPerUse,
            ).toBe(19);
            expect(
                itemProperties(engine, enchanted("FlaskEnchantmentSealMaximumCharges____"))
                    .maximumCharges,
            ).toBe(100);
            expect(
                itemProperties(engine, {
                    ...enchanted("FlaskEnchantmentSealIncreasedDuration"),
                    enchantments: [],
                }).flaskDuration,
            ).toBe(7.2);
        });
    } else {
        it("uses the extracted charm duration and local duration modifiers with quality", () => {
            const charm = engine.addStartingMod(
                { ...create("Charm1"), quality: 20 },
                "CharmIncreasedDuration1",
                minimum,
            );
            expect(itemProperties(engine, charm)).toMatchObject({
                flaskDuration: 4.2,
                maximumCharges: 40,
                chargesPerUse: 40,
            });
            expect(itemProperties(engine, charm).lifeRecovery).toBeUndefined();
            expect(itemProperties(engine, charm).manaRecovery).toBeUndefined();
            const maximum = engine.addStartingMod(charm, "FlaskExtraCharges1", minimum);
            expect(itemProperties(engine, maximum).maximumCharges).toBe(49);
        });
    }
});

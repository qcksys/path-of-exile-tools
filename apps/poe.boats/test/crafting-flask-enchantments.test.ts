import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { availableEnchantments, flaskEnchantmentPool } from "../app/lib/crafting-enchantments";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
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
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const flaskBase = Object.entries(catalog.bases).find(
    ([, base]) => base.name === "Quicksilver Flask" && !base.corrupted,
)![0];
const flask = () => ({ ...engine.createItem(flaskBase), quality: 20 });
const instilling = {
    kind: "currency" as const,
    id: catalog.crafting.flaskEnchantments.find((entry) =>
        entry.id.endsWith("/CurrencyInstillingOrb"),
    )!.id,
};
const enkindling = {
    kind: "currency" as const,
    id: catalog.crafting.flaskEnchantments.find((entry) =>
        entry.id.endsWith("/CurrencyEnkindlingOrb"),
    )!.id,
};
const full = "FlaskEnchantmentInjectorOnFullCharges__";
const effect = "FlaskEnchantmentSealIncreasedEffect_";
const bench = catalog.crafting.bench.find((entry) => entry.enchantment?.mod === full)!;
const remove = {
    kind: "bench" as const,
    id: catalog.crafting.bench.find((entry) => entry.action === 1)!.id,
};

describe("PoE 1 flask enchantments", () => {
    it("uses both extracted pools and ordered weights, excluding zero-weight records and non-utility flasks", () => {
        const item = flask();
        expect(flaskEnchantmentPool(catalog, item, instilling.id!)).toHaveLength(15);
        const pool = flaskEnchantmentPool(catalog, item, enkindling.id!);
        expect(pool).toHaveLength(5);
        expect(pool.find((entry) => entry.id === effect)!.weight).toBe(250);
        expect(pool.reduce((sum, entry) => sum + entry.weight, 0)).toBe(650);
        for (const [id, base] of Object.entries(catalog.bases).filter(
            ([, base]) => base.domain === "flask" && !base.corrupted,
        ))
            expect(
                flaskEnchantmentPool(catalog, engine.createItem(id), instilling.id!).length > 0,
            ).toBe(["UtilityFlask", "UtilityFlaskCritical"].includes(base.item_class));
        expect(availableEnchantments(catalog, item)).toHaveLength(20);
        const changed = structuredClone(catalog);
        changed.mods[effect]!.spawn_weights.unshift({
            tag: catalog.bases[flaskBase]!.tags[0]!,
            weight: 40,
        });
        changed.mods[effect]!.generation_weights = [
            { tag: catalog.bases[flaskBase]!.tags[0]!, weight: 50 },
        ];
        expect(
            flaskEnchantmentPool(changed, item, enkindling.id!).find(
                (entry) => entry.id === effect,
            )!.weight,
        ).toBe(20);
    });

    it("charges the extracted removal recipe when replacing an Instilling bench enchantment", () => {
        const recipe = catalog.crafting.bench.find((entry) => entry.enchantment)!;
        const method = { kind: "bench" as const, id: recipe.id };
        const removal = catalog.crafting.bench.find((entry) => entry.action === 1)!;
        for (const previous of [instilling, enkindling]) {
            const item = engine.apply(flask(), previous, seededRandom(1)).item;
            const before = structuredClone(item);
            const result = engine.apply(item, method, seededRandom(1));
            expect(result.item.enchantments?.map((entry) => entry.id)).toEqual([
                recipe.enchantment!.mod,
            ]);
            expect(result.cost).toEqual(
                previous === instilling ? [...removal.cost, ...recipe.cost] : recipe.cost,
            );
            expect(engine.costs(method, item)).toEqual(result.cost);
            expect(item).toEqual(before);
        }
    });

    it("applies every bench enchantment to normal and magic utility flasks without changing affixes or quality", () => {
        for (const recipe of catalog.crafting.bench.filter((entry) => entry.enchantment)) {
            for (const rarity of ["normal", "magic"] as const) {
                let item: CraftingItem = { ...flask(), rarity };
                if (rarity === "magic") {
                    for (const side of ["prefix", "suffix"])
                        item = engine.addStartingMod(
                            item,
                            engine.pool(item, { side })[0]!.id,
                            seededRandom(1),
                        );
                }
                const before = structuredClone(item);
                const method = { kind: "bench" as const, id: recipe.id };
                const result = engine.apply(item, method, seededRandom(42));
                expect(result.item.mods).toEqual(item.mods);
                expect(result.item.quality).toBe(20);
                expect(result.item.rarity).toBe(rarity);
                expect(result.item.enchantments?.map((entry) => entry.id)).toEqual([
                    recipe.enchantment!.mod,
                ]);
                expect(result.cost).toEqual(recipe.cost);
                expect(engine.methodName(method)).not.toBe("");
                expect(
                    calculateExact(
                        engine,
                        item,
                        method,
                        engine.validateTarget({
                            groups: [],
                            enchantments: [recipe.enchantment!.mod],
                        }),
                    ).probability,
                ).toBe(1);
                expect(item).toEqual(before);
            }
        }
    });

    it("replaces either enchantment type and charges removal without changing ordinary modifiers", () => {
        const first = engine.apply(flask(), { kind: "bench", id: bench.id }, seededRandom(1)).item;
        const sealed = engine.apply(first, enkindling, seededRandom(2)).item;
        expect(sealed.enchantments).toHaveLength(1);
        expect(engine.mod(sealed.enchantments![0]!.id).generation_type).toBe(
            "flask_enchantment_enkindling",
        );
        const injected = engine.apply(sealed, instilling, seededRandom(3)).item;
        expect(injected.enchantments).toHaveLength(1);
        expect(engine.mod(injected.enchantments![0]!.id).generation_type).toBe(
            "flask_enchantment_instilling",
        );
        const removed = engine.apply(injected, remove, seededRandom(4));
        expect(removed.item).toEqual(flask());
        expect(removed.cost).toMatchObject([{ amount: 3, name: "Orb of Scouring" }]);
        expect(() => engine.apply(removed.item, remove, seededRandom(1))).toThrow(
            "no enchantments",
        );
    });

    it("removes supported armour enchantments and anointments through the same extracted bench action", () => {
        const armour = engine.apply(
            { ...engine.createItem(baseId), quality: 20 },
            { kind: "harvest", id: "LifeBodyEnchant" },
            seededRandom(1),
        ).item;
        const removedArmour = engine.apply(armour, remove, seededRandom(1)).item;
        expect(removedArmour.quality).toBe(20);
        expect(removedArmour.enchantments).toBeUndefined();
        const amuletBase = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "Amulet" && !base.corrupted,
        )![0];
        const recipe = catalog.crafting.anointing.recipes.find(
            (entry) => entry.passive && entry.type === "UniqueOrAmulet",
        )!;
        const amulet = engine.apply(
            engine.createItem(amuletBase),
            { kind: "anoint", id: recipe.id },
            seededRandom(1),
        ).item;
        const removedAmulet = engine.apply(amulet, remove, seededRandom(1)).item;
        expect(removedAmulet.anointments).toBeUndefined();
        expect(removedAmulet.implicits).toEqual(amulet.implicits);
        expect(removedAmulet.mods).toEqual(amulet.mods);
    });

    it("calculates weighted outcome and numeric range probabilities with repeated-process costs", () => {
        const item = flask();
        const fullTarget = engine.validateTarget({ groups: [], enchantments: [full] });
        expect(calculateExact(engine, item, instilling, fullTarget).probability).toBeCloseTo(
            1 / 15,
        );
        const target = engine.validateTarget({
            groups: [],
            enchantments: [effect],
            stats: [{ id: "local_flask_effect_+%", min: 70 }],
        });
        expect(calculateExact(engine, item, enkindling, target).probability).toBeCloseTo(
            250 / 650 / 11,
        );
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: instilling,
            target: fullTarget,
            steps: [
                {
                    id: "enchant",
                    method: instilling,
                    condition: fullTarget,
                    onSuccess: "success",
                    onFailure: "enchant",
                },
            ],
            prices: { [instilling.id!]: 3 },
            maxActions: 2,
            seed: 42,
            iterations: 1000,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBeCloseTo(1 - (14 / 15) ** 2);
        expect(exact.meanCost).toBeCloseTo(3 * (1 + 14 / 15));
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let trial = 0; trial < 1000; trial++) simulation.runTrial();
        expect(simulation.result().errors).toEqual({});
        expect(simulation.result().probability).toBeCloseTo(exact.probability, 1);
        expect(simulation.result().meanCost).toBeCloseTo(exact.meanCost!, 1);
    });

    it("retains enchantments through Divine, Scouring, imprint, JSON and annotated or game item text", () => {
        let item = engine.apply(flask(), currency("transmute_to_magic"), seededRandom(1)).item;
        item = engine.apply(item, enkindling, seededRandom(3)).item;
        const expected = item.enchantments;
        const imprinted = engine.apply(item, currency("inital_imprint"), seededRandom(1)).item;
        const changed = engine.apply(
            imprinted,
            { kind: "bench", id: bench.id },
            seededRandom(1),
        ).item;
        expect(
            engine.apply(changed, currency("restore_imprint"), seededRandom(1)).item.enchantments,
        ).toEqual(expected);
        expect(
            engine.apply(item, currency("reroll_mod_values"), seededRandom(1)).item.enchantments,
        ).toEqual(expected);
        expect(
            engine.apply(item, currency("convert_to_normal"), seededRandom(1)).item.enchantments,
        ).toEqual(expected);
        for (const entry of availableEnchantments(catalog, flask())) {
            const enchanted = {
                ...flask(),
                enchantments: [engine.rollMod(entry.mod, seededRandom(1))],
            };
            const text = exportCraftingItemText(engine, enchanted);
            expect(importCraftingItemText(engine, text).map((entry) => entry.item)).toContainEqual(
                enchanted,
            );
            expect(
                importCraftingItemText(engine, text.replace(/\{modGroup:[^}]+\}/g, "")).map(
                    (entry) => entry.item,
                ),
            ).toContainEqual(enchanted);
            expect(engine.validateItem(JSON.parse(JSON.stringify(enchanted)))).toEqual(enchanted);
            expect(engine.statTotals(enchanted, "explicit")).toEqual(new Map());
        }
    });

    it("rejects incompatible bases, locked items, invalid enchantments and PoE 2 before randomness", () => {
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        const integer = vi.spyOn(random, "integer");
        for (const method of [instilling, enkindling, { kind: "bench" as const, id: bench.id }]) {
            expect(() => engine.apply(engine.createItem(baseId), method, random)).toThrow();
            for (const flags of [{ corrupted: true }, { mirrored: true }])
                expect(() => engine.apply({ ...flask(), ...flags }, method, random)).toThrow();
        }
        const poe2 = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const other = new CraftingEngine(poe2);
        expect(() =>
            other.apply(other.createItem(Object.keys(poe2.bases)[0]!), instilling, random),
        ).toThrow();
        expect(pick).not.toHaveBeenCalled();
        expect(integer).not.toHaveBeenCalled();
        const mod = engine.rollMod(full, seededRandom(1));
        for (const entry of [
            { ...mod, crafted: true },
            { ...mod, fractured: true },
            { ...mod, values: [99] },
            { ...mod, id: "FlaskEnchantmentInjectorOnGuardSkillExpired" },
        ])
            expect(() => engine.validateItem({ ...flask(), enchantments: [entry] })).toThrow();
    });
});

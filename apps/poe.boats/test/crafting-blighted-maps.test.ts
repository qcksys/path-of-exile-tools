import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { anointingOils, availableAnointments } from "../app/lib/crafting-anointing";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import {
    type CraftingMethod,
    craftingCatalogSchema,
    craftingProjectSchema,
    craftingTargetSchema,
} from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const map = catalog.crafting.maps.find((entry) => catalog.bases[entry.id]?.name === "Beach Map")!;
const normal = catalog.crafting.anointing.maps.find((entry) => !entry.ravaged)!;
const ravaged = catalog.crafting.anointing.maps.find((entry) => entry.ravaged)!;
const starting = (blight = normal.mod) => ({ ...engine.createItem(map.id), blight });
const recipes = availableAnointments(catalog, starting());
const method = (ids = [recipes[0]!.id]): Extract<CraftingMethod, { kind: "anoint" }> => ({
    kind: "anoint",
    id: ids[0]!,
    additional: ids.slice(1),
});
const nine = recipes.slice(0, 3).flatMap((entry) => [entry.id, entry.id, entry.id]);

describe("Blighted Map anointments", () => {
    it("uses all extracted oil effects on both map types and all supported rarities without randomness", () => {
        expect(recipes).toHaveLength(13);
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        const integer = vi.spyOn(random, "integer");
        for (const blight of [normal.mod, ravaged.mod])
            for (const rarity of ["normal", "magic", "rare"] as const)
                for (const recipe of recipes) {
                    const item = { ...starting(blight), rarity, quality: 20 };
                    const result = engine.apply(item, method([recipe.id]), random);
                    expect(result.item).toEqual({ ...item, anointments: [recipe.id] });
                    expect(result.cost).toEqual([
                        { id: recipe.items[0], name: engine.costName(recipe.items[0]!), amount: 1 },
                    ]);
                    for (const stat of catalog.mods[recipe.mod!]!.stats)
                        expect(engine.statTotals(result.item).get(stat.id)).toBe(
                            (engine.statTotals(item).get(stat.id) ?? 0) + stat.min,
                        );
                    expect(engine.statTotals(result.item, "explicit")).toEqual(new Map());
                    expect(engine.statTotals(result.item, "implicit")).toEqual(new Map());
                }
        expect(pick).not.toHaveBeenCalled();
        expect(integer).not.toHaveBeenCalled();
    });

    it("stacks repeated oils within extracted capacity, replaces the entire recipe and preserves other crafts", () => {
        const item = engine.apply(starting(ravaged.mod), method(nine), seededRandom(1)).item;
        expect(item.anointments).toEqual(nine);
        for (const action of ["transmute_to_rare", "reroll_mod_values", "convert_to_normal"]) {
            const rare = engine.apply(item, currency("transmute_to_rare"), seededRandom(42)).item;
            const input = action === "transmute_to_rare" ? item : rare;
            const result = engine.apply(input, currency(action), seededRandom(42)).item;
            expect(result.anointments).toEqual(nine);
            expect(result.blight).toBe(ravaged.mod);
        }
        const replaced = engine.apply(item, method([recipes[3]!.id]), seededRandom(1)).item;
        expect(replaced.anointments).toEqual([recipes[3]!.id]);
        expect(replaced.mods).toEqual(item.mods);
        expect(replaced.implicits).toEqual(item.implicits);
        expect(replaced.blight).toBe(ravaged.mod);
    });

    it("rejects incompatible bases, recipe families, counts and missing oils before random draws", () => {
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        expect(() => engine.apply(engine.createItem(map.id), method(), random)).toThrow(
            "not available",
        );
        expect(() =>
            engine.validateItem({ ...engine.createItem(baseId), blight: normal.mod }),
        ).toThrow("Blight requires");
        expect(() => engine.validateItem({ ...starting(), blight: "unknown" })).toThrow(
            "Blight requires",
        );
        expect(() => engine.apply(starting(), method(nine.slice(0, 4)), random)).toThrow(
            "count exceeds",
        );
        expect(() =>
            engine.apply(starting(ravaged.mod), method(Array(4).fill(recipes[0]!.id)), random),
        ).toThrow("same oil");
        const ring = catalog.crafting.anointing.recipes.find((entry) => entry.type === "Ring")!;
        expect(() => engine.apply(starting(), method([ring.id]), random)).toThrow("not available");
        expect(() => engine.apply(starting(), method([recipes[0]!.id, ring.id]), random)).toThrow(
            "Blighted Map recipes",
        );
        expect(() => engine.apply({ ...starting(), corrupted: true }, method(), random)).toThrow(
            "matching Tainted",
        );
        expect(pick).not.toHaveBeenCalled();
    });

    it("charges each repeated oil and one permission oil per state in deterministic and simulated processes", () => {
        const item = { ...starting(ravaged.mod), corrupted: true, mirrored: true };
        const craft = { ...method(nine), oils: anointingOils(catalog, item) };
        const crafted = engine.apply(item, craft, seededRandom(42));
        expect(crafted.cost.map((entry) => entry.amount)).toEqual([3, 3, 3, 1, 1]);
        const pack = catalog.mods[recipes[0]!.mod!]!.stats.find((stat) =>
            stat.id.includes("pack_size"),
        )!;
        const target = craftingTargetSchema.parse({
            groups: [],
            anointments: recipes.slice(0, 3).map((entry) => entry.id),
            stats: [{ id: pack.id, scope: "all", min: pack.min * 9 }],
        });
        expect(calculateExact(engine, item, craft, target).probability).toBe(1);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: craft,
            target,
            steps: [{ id: "oils", method: craft, condition: target }],
            useProcess: true,
            prices: Object.fromEntries(crafted.cost.map((entry) => [entry.id, 2])),
            seed: 42,
            iterations: 20,
            maxActions: 1,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBe(1);
        expect(exact.meanCost).toBe(22);
        expect(exact.totalActions).toBe(1);
        const simulation = new CraftingSimulation(catalog, project);
        for (let trial = 0; trial < 20; trial++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({ successes: 20, meanCost: 22, errors: {} });
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
        expect(engine.validateItem(JSON.parse(JSON.stringify(crafted.item)))).toEqual(crafted.item);
    });

    it("round trips full map properties, repeated oil effects and name prefixes in item text", () => {
        for (const blight of [normal.mod, ravaged.mod]) {
            const ids = blight === normal.mod ? nine.slice(0, 3) : nine;
            const item = engine.apply(starting(blight), method(ids), seededRandom(1)).item;
            const text = exportCraftingItemText(engine, item);
            expect(text).toContain(
                blight === normal.mod ? "Blighted Beach Map" : "Blight-ravaged Beach Map",
            );
            for (const input of [text, text.replace(/\{modGroup:[^}]+\}/g, "")])
                expect(
                    importCraftingItemText(engine, input).some(
                        (entry) =>
                            entry.item.blight === blight &&
                            entry.item.anointments?.join() === ids.join(),
                    ),
                ).toBe(true);
            expect(() =>
                importCraftingItemText(
                    engine,
                    text.replace(
                        /Can be Anointed up to \d+ times/,
                        "Can be Anointed up to 8 times",
                    ),
                ),
            ).toThrow("complete extracted properties");
        }
    });

    it("rejects unresolved Vaal and double-corruption transformations before randomness", () => {
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        const twice = catalog.crafting.beasts.find((entry) => entry.mapCorruption === "twice")!;
        for (const craft of [currency("corrupt_item"), { kind: "beast" as const, id: twice.id }])
            expect(() => engine.apply(starting(), craft, random)).toThrow(
                "Corruption transformations of Blighted Maps",
            );
        expect(pick).not.toHaveBeenCalled();
    });

    it("keeps PoE 2 Waystones isolated from Blight map state", () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const current = new CraftingEngine(data);
        expect(data.crafting.anointing.maps).toEqual([]);
        const item = current.createItem(data.crafting.waystones[0]!.id);
        expect(availableAnointments(data, item)).toEqual([]);
        expect(() => current.validateItem({ ...item, blight: normal.mod })).toThrow(
            "Blight requires",
        );
    });
});

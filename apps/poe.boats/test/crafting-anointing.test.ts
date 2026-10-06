import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { anointingOils, anointmentText, availableAnointments } from "../app/lib/crafting-anointing";
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

describe.each(["poe1", "poe2"] as const)("%s anointing", (game) => {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const base = Object.entries(catalog.bases).find(
        ([, base]) => base.item_class === "Amulet" && !base.corrupted,
    )![0];
    const empty = () => engine.createItem(base);
    const recipes = availableAnointments(catalog, empty());
    const method = (id = recipes[0]!.id): CraftingMethod => ({ kind: "anoint", id });

    it("uses every resolved passive recipe without rolling or consuming an affix slot", () => {
        expect(recipes).toHaveLength(game === "poe1" ? 472 : 875);
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        const integer = vi.spyOn(random, "integer");
        for (const recipe of recipes) {
            const item = empty();
            const result = engine.apply(item, method(recipe.id), random);
            expect(result.item).toEqual({ ...item, anointments: [recipe.id] });
            expect(result.cost.reduce((sum, entry) => sum + entry.amount, 0)).toBe(3);
            expect(result.cost.every((entry) => recipe.items.includes(entry.id))).toBe(true);
            expect(
                engine.matches(
                    result.item,
                    craftingTargetSchema.parse({ groups: [], anointments: [recipe.id] }),
                ),
            ).toBe(true);
        }
        expect(pick).not.toHaveBeenCalled();
        expect(integer).not.toHaveBeenCalled();
    });

    it("replaces anointments while preserving rolled modifiers, quality and later crafts", () => {
        const item = engine.addStartingMod(
            empty(),
            engine
                .pool({ ...empty(), rarity: "rare" })
                .find((entry) => entry.mod.generation_type === "prefix")!.id,
            seededRandom(42),
        );
        item.quality = 10;
        const first = engine.apply(item, method(), seededRandom(1)).item;
        const second = engine.apply(first, method(recipes[2]!.id), seededRandom(1)).item;
        expect(second.mods).toEqual(item.mods);
        expect(second.implicits).toEqual(item.implicits);
        expect(second.quality).toBe(10);
        expect(second.anointments).toEqual([recipes[2]!.id]);
        const divine = catalog.crafting.currencies.find(
            (entry) => entry.action === "reroll_mod_values",
        )!;
        expect(
            engine.apply(second, { kind: "currency", id: divine.id }, seededRandom(1)).item
                .anointments,
        ).toEqual(second.anointments);
        expect(engine.statTotals(second)).toEqual(engine.statTotals(item));
    });

    it("validates eligibility and round trips enchantment text and JSON", () => {
        const item = engine.apply(empty(), method(), seededRandom(1)).item;
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, item)).some(
                (match) =>
                    match.item.baseId === item.baseId &&
                    match.item.anointments?.[0] === item.anointments?.[0],
            ),
        ).toBe(true);
        expect(engine.validateItem(JSON.parse(JSON.stringify(item)))).toEqual(item);
        const text = exportCraftingItemText(engine, item);
        expect(
            importCraftingItemText(engine, text.replace(/\{modGroup:anoint:[^}]+\}/g, "")).some(
                (match) => match.item.anointments?.[0] === item.anointments?.[0],
            ),
        ).toBe(true);
        expect(() =>
            importCraftingItemText(
                engine,
                text.replace(anointmentText(catalog, recipes[0]!.id), "Allocates Unknown Passive"),
            ),
        ).toThrow("Could not resolve");
        const wrong = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "Body Armour",
        )![0];
        expect(() => engine.apply(engine.createItem(wrong), method(), seededRandom(1))).toThrow(
            "not available",
        );
        expect(() => engine.validateItem({ ...item, anointments: ["missing"] })).toThrow(
            "not available",
        );
        expect(() =>
            engine.validateTarget({ groups: [], anointments: [recipes[0]!.id, recipes[0]!.id] }),
        ).toThrow("only once");
        expect(() => engine.apply(empty(), method("missing"), seededRandom(1))).toThrow(
            "no resolved outcome",
        );
    });

    it("includes ingredient quantities and prices in exact and simulated processes", () => {
        const recipe = recipes[0]!;
        const target = craftingTargetSchema.parse({ groups: [], anointments: [recipe.id] });
        expect(calculateExact(engine, empty(), method(), target).probability).toBe(1);
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: catalog.patch,
            item: empty(),
            method: method(),
            target,
            steps: [{ id: "anoint", method: method(), condition: target }],
            useProcess: true,
            prices: Object.fromEntries(recipe.items.map((id) => [id, 2])),
            seed: 42,
            iterations: 10,
            maxActions: 1,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBe(1);
        expect(exact.meanCost).toBe(6);
        expect(exact.totalActions).toBe(1);
        const simulation = new CraftingSimulation(catalog, project);
        for (let trial = 0; trial < 10; trial++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({ successes: 10, meanCost: 6, errors: {} });
    });

    it("uses extracted extra oils for PoE 1 corrupted and mirrored items", () => {
        const item = { ...empty(), corrupted: true, mirrored: true };
        const oils = anointingOils(catalog, item);
        if (game === "poe2") {
            expect(oils).toEqual([]);
            expect(() => engine.apply(item, method(), seededRandom(1))).toThrow("uncorrupted");
        } else {
            expect(oils).toHaveLength(2);
            expect(() => engine.apply(item, method(), seededRandom(1))).toThrow(
                "matching Tainted or Reflective",
            );
            const result = engine.apply(
                item,
                { kind: "anoint", id: recipes[0]!.id, oils },
                seededRandom(1),
            );
            expect(result.item).toMatchObject({
                corrupted: true,
                mirrored: true,
                anointments: [recipes[0]!.id],
            });
            expect(result.cost.reduce((sum, entry) => sum + entry.amount, 0)).toBe(5);
            expect(() =>
                engine.apply(
                    empty(),
                    { kind: "anoint", id: recipes[0]!.id, oils },
                    seededRandom(1),
                ),
            ).toThrow("matching Tainted or Reflective");
        }
    });

    if (game === "poe1")
        it("anoints rings and extracted eligible belts with the correct recipe families", () => {
            const ring = engine.createItem(
                Object.entries(catalog.bases).find(([, base]) => base.item_class === "Ring")![0],
            );
            const ringRecipes = availableAnointments(catalog, ring);
            expect(ringRecipes).toHaveLength(91);
            for (const recipe of ringRecipes) {
                const result = engine.apply(ring, method(recipe.id), seededRandom(1));
                expect(result.cost.reduce((sum, entry) => sum + entry.amount, 0)).toBe(2);
                expect(anointmentText(catalog, recipe.id).length).toBeGreaterThan(5);
                expect(
                    importCraftingItemText(
                        engine,
                        exportCraftingItemText(engine, result.item),
                    ).some((entry) => entry.item.anointments?.[0] === recipe.id),
                ).toBe(true);
            }
            const belt = engine.createItem("Metadata/Items/Belts/BeltFaridun");
            expect(availableAnointments(catalog, belt)).toHaveLength(472);
            expect(engine.apply(belt, method(), seededRandom(1)).item.anointments).toEqual([
                recipes[0]!.id,
            ]);
            expect(() => engine.apply(belt, method(ringRecipes[0]!.id), seededRandom(1))).toThrow(
                "not available",
            );
        });
});

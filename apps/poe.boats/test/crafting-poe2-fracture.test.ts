import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, type CraftingRandom, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const currency = (action: string) => ({
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
});
const fracture = currency("fracture_random_mod");
const first: CraftingRandom = { pick: (choices) => choices[0]!.value, integer: (min) => min };
const breach = catalog.crafting.poe2Essences.find(
    (entry) => entry.name === "Essence of the Breach",
)!;

function prepared(itemClass = "Ring", source: "essence" | "emotion" = "essence") {
    const base = Object.entries(catalog.bases).find(
        ([, entry]) =>
            entry.item_class === itemClass &&
            !entry.corrupted &&
            (itemClass !== "Ring" || entry.name === "Ruby Ring") &&
            (itemClass !== "Jewel" || entry.name === "Ruby"),
    )![0];
    const blank = engine.validateItem({ ...engine.createItem(base), rarity: "rare" });
    const id =
        itemClass === "Ring" ? breach.rules[0]!.mod! : engine.recipePool(blank, source)[0]!.id;
    let item = engine.addStartingMod(blank, id, seededRandom(1), source);
    while (item.mods.length < 4)
        item = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(2));
    return item;
}

describe("PoE 2 crafted fractures", () => {
    it.each([
        ["Ring", "essence"],
        ["Body Armour", "essence"],
        ["Jewel", "emotion"],
    ] as const)("fractures a %s %s modifier without changing its values or crafted status", (itemClass, source) => {
        const item = prepared(itemClass, source);
        const original = structuredClone(item);
        const result = engine.apply(item, fracture, first);
        expect(item).toEqual(original);
        expect(result.item).toEqual({
            ...item,
            mods: [{ ...item.mods[0], fractured: true }, ...item.mods.slice(1)],
        });
        expect(result.item.mods[0]!.crafted).toBe(true);
        expect(result.cost).toEqual([{ id: fracture.id, name: "Fracturing Orb", amount: 1 }]);
        expect(engine.validateItem(result.item)).toEqual(result.item);
        for (const mod of item.mods)
            expect(
                calculateExact(
                    engine,
                    item,
                    fracture,
                    engine.validateTarget({
                        groups: [{ mods: [mod.id], fractured: true }],
                    }),
                ).probability,
            ).toBe(0.25);
    });

    it("preserves fractured crafts during annulment, Chaos and Divine and keeps the crafted slot occupied", () => {
        const item = engine.apply(prepared(), fracture, first).item;
        const crafted = item.mods[0]!;
        for (const action of ["remove_random_mod", "reroll", "reroll_mod_values"])
            expect(engine.apply(item, currency(action), seededRandom(42)).item.mods).toContainEqual(
                crafted,
            );
        let reduced = item;
        while (reduced.mods.length > 1)
            reduced = engine.apply(reduced, currency("remove_random_mod"), seededRandom(1)).item;
        expect(reduced.mods).toEqual([crafted]);
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        expect(() => engine.apply(reduced, { kind: "essence", id: breach.id }, random)).toThrow(
            "existing crafted modifier",
        );
        expect(pick).not.toHaveBeenCalled();
    });

    it("retains crafted fractures in text, JSON and manual starting-item validation", () => {
        const item = engine.apply(prepared(), fracture, first).item;
        const text = exportCraftingItemText(engine, item);
        expect(text).toContain("{crafted}{fractured}");
        const imported = importCraftingItemText(engine, text);
        expect(imported[0]!.item).toEqual(item);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item,
            method: fracture,
            target: { groups: [] },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        expect(
            engine.validateItem(
                craftingProjectSchema.parse(JSON.parse(JSON.stringify(project))).item,
            ),
        ).toEqual(item);
    });

    it("calculates and simulates fracture targets with matching costs and conditional routing", () => {
        const item = prepared();
        const target = engine.validateTarget({
            groups: [{ mods: [item.mods[0]!.id], fractured: true }],
        });
        const annul = currency("remove_random_mod");
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item,
            method: fracture,
            target,
            steps: [
                {
                    id: "fracture",
                    method: fracture,
                    condition: target,
                    onSuccess: "annul",
                    onFailure: "failure",
                },
                { id: "annul", method: annul, condition: target },
            ],
            prices: { [fracture.id]: 8, [annul.id]: 2 },
            seed: 42,
            iterations: 1000,
            maxActions: 2,
        });
        expect(calculateProcessExact(engine, project)).toMatchObject({
            probability: 0.25,
            meanCost: 8.5,
            totalActions: 1.25,
            errors: {},
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let trial = 0; trial < project.iterations; trial++) simulation.runTrial();
        const result = simulation.result();
        expect(result.errors).toEqual({});
        expect(result.probability).toBeGreaterThan(0.21);
        expect(result.probability).toBeLessThan(0.29);
        expect(result.spending[fracture.id]).toBe(1000);
        expect(result.spending[annul.id]).toBe(result.successes);
        expect(result.meanCost).toBe((8000 + result.successes * 2) / 1000);
    });

    it("excludes desecrated modifiers while keeping the crafted modifier in the fracture pool", () => {
        const item = prepared();
        item.mods[1]!.desecrated = true;
        const target = engine.validateTarget({
            groups: [{ mods: [item.mods[0]!.id], fractured: true }],
        });
        expect(calculateExact(engine, item, fracture, target).probability).toBeCloseTo(1 / 3);
        expect(engine.apply(item, fracture, first).item.mods[1]).toEqual(item.mods[1]);
        item.mods[1]!.fractured = true;
        expect(() => engine.validateItem(item)).toThrow("cannot be fractured");
    });

    it("rejects invalid fracture inputs before randomness", () => {
        const item = prepared();
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        for (const invalid of [
            { ...item, mods: item.mods.slice(0, 3) },
            { ...item, corrupted: true },
            { ...item, mirrored: true },
            engine.apply(item, fracture, first).item,
        ])
            expect(() => engine.apply(invalid, fracture, random)).toThrow();
        expect(pick).not.toHaveBeenCalled();
    });
});

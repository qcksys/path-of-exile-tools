import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
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

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const ring = "Metadata/Items/Rings/RingDemigods1";
const breach = catalog.crafting.poe2Essences.find(
    (entry) => entry.name === "Essence of the Breach",
)!;
const method = { kind: "essence" as const, id: breach.id };
const suffixOmen = "Metadata/Items/Currency/OmenOnPerfectEssenceSuffix";

function filled(current = engine, baseId = ring, excluded: string[] = []) {
    let item: CraftingItem = { ...current.createItem(baseId), rarity: "rare" };
    const groups = excluded.flatMap((id) => current.mod(id).groups);
    for (const side of ["prefix", "prefix", "prefix", "suffix", "suffix", "suffix"])
        item = current.addStartingMod(
            item,
            current
                .pool(item, { side })
                .find((entry) => !entry.mod.groups.some((group) => groups.includes(group)))!.id,
            seededRandom(1),
        );
    return item;
}

function mixedRecipe() {
    const changed = structuredClone(catalog);
    const essence = changed.crafting.poe2Essences.find(
        (entry) => entry.name === "Perfect Essence of the Body",
    )!;
    const rule = essence.rules.find((entry) => entry.itemClasses.includes("Body Armour"))!;
    const prefix = rule.mod!;
    const suffix = "Strength6";
    rule.mod = null;
    rule.outcomes = [
        { mod: prefix, weight: 3 },
        { mod: suffix, weight: 1 },
    ];
    const current = new CraftingEngine(changed);
    const base = Object.entries(changed.bases).find(
        ([, entry]) => entry.item_class === "Body Armour" && entry.tags.includes("str_armour"),
    )![0];
    return {
        current,
        prefix,
        suffix,
        item: filled(current, base, [prefix, suffix]),
        method: { kind: "essence" as const, id: essence.id },
    };
}

describe("PoE 2 guaranteed modifier replacement", () => {
    it("retains fractures and the opposite affix side while calculating exact removal odds and process costs", () => {
        const item = filled();
        item.mods[0]!.fractured = true;
        const before = structuredClone(item);
        const target = engine.validateTarget({
            groups: [{ mods: [item.mods[1]!.id], minimum: 1 }],
        });
        expect(calculateExact(engine, item, method, target).probability).toBe(0.5);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item,
            method,
            target,
            steps: [{ id: "replace", method, condition: target }],
            prices: { [method.id]: 12 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBe(0.5);
        expect(exact.meanCost).toBe(12);
        const simulation = new CraftingSimulation(catalog, project);
        for (let trial = 0; trial < 1000; trial++) simulation.runTrial();
        expect(simulation.result().probability).toBeCloseTo(0.5, 1);
        expect(simulation.result().spending[method.id]).toBe(1000);
        expect(simulation.result().meanCost).toBe(12);
        expect(simulation.result().errors).toEqual({});
        const result = engine.apply(item, method, seededRandom(42));
        expect(item).toEqual(before);
        expect(engine.counts(result.item)).toEqual({ prefixes: 3, suffixes: 3 });
        for (const entry of [item.mods[0]!, ...item.mods.slice(3)])
            expect(result.item.mods).toContainEqual(entry);
        expect(result.item.mods.find((entry) => entry.id === breach.rules[0]!.mod)?.crafted).toBe(
            true,
        );
        expect(engine.validateItem(JSON.parse(JSON.stringify(result.item)))).toEqual(result.item);
    });

    it("rejects incompatible directional removal and a fully protected required side before randomness", () => {
        const item = filled();
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        expect(() => engine.apply(item, { ...method, omens: [suffixOmen] }, random)).toThrow(
            "No open affix",
        );
        item.mods = item.mods.map((entry) => ({
            ...entry,
            fractured: engine.mod(entry.id).generation_type === "prefix",
        }));
        expect(() => engine.apply(item, method, random)).toThrow("No eligible modifier to remove");
        expect(pick).not.toHaveBeenCalled();
    });

    it("uses extracted outcome weights before automatically choosing the removal side", () => {
        const { current, item, method, prefix, suffix } = mixedRecipe();
        const prefixTarget = current.validateTarget({ groups: [{ mods: [prefix], minimum: 1 }] });
        const suffixTarget = current.validateTarget({ groups: [{ mods: [suffix], minimum: 1 }] });
        expect(calculateExact(current, item, method, prefixTarget).probability).toBe(0.75);
        expect(calculateExact(current, item, method, suffixTarget).probability).toBe(0.25);
        for (let seed = 0; seed < 20; seed++) {
            const result = current.apply(item, method, seededRandom(seed)).item;
            const added = result.mods.find((entry) => entry.crafted)!;
            const side = current.mod(added.id).generation_type;
            for (const entry of item.mods.filter(
                (entry) => current.mod(entry.id).generation_type !== side,
            ))
                expect(result.mods).toContainEqual(entry);
            expect(current.counts(result)).toEqual({ prefixes: 3, suffixes: 3 });
        }
    });

    it("falls back to a compatible guaranteed outcome after directional removal", () => {
        const { current, item, method, suffix } = mixedRecipe();
        const directional = { ...method, omens: [suffixOmen] };
        expect(
            calculateExact(
                current,
                item,
                directional,
                current.validateTarget({ groups: [{ mods: [suffix], minimum: 1 }] }),
            ).probability,
        ).toBe(1);
        const result = current.apply(item, directional, seededRandom(42));
        expect(result.item.mods.find((entry) => entry.crafted)?.id).toBe(suffix);
        for (const entry of item.mods.slice(0, 3)) expect(result.item.mods).toContainEqual(entry);
        expect(result.cost.map((entry) => entry.id)).toEqual([method.id, suffixOmen]);
    });
});

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { availableOmens } from "../app/lib/crafting-omens";
import { catalysingMultiplier, catalystEffect } from "../app/lib/crafting-quality";
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
const omen = (id: string) =>
    catalog.crafting.currencies.find((entry) => entry.id.endsWith(`/${id}`))!.id;
const catalysing = omen("OmenOnExaltConsumeQuality");
const exalt = catalog.crafting.currencies.find((entry) => entry.action === "add_mod_to_rare")!;
const method = { kind: "currency" as const, id: exalt.id, omens: [catalysing] };
const base = (itemClass: string) =>
    Object.entries(catalog.bases).find(
        ([, entry]) => entry.item_class === itemClass && !entry.corrupted,
    )![0];
const ring: CraftingItem = { ...engine.createItem(base("Ring")), rarity: "rare" };
const life = catalog.crafting.catalysts.find(
    (entry) => entry.tags.includes("life") && entry.itemClasses.includes("Ring"),
)!;
const quality = (amount: number): CraftingItem => ({
    ...ring,
    catalyst: { id: life.id, quality: amount },
});

describe("PoE 2 Catalysing Exaltation", () => {
    it("uses extracted tags for all ordinary and refined catalysts without changing the natural pool", () => {
        let matches = 0;
        for (const catalyst of catalog.crafting.catalysts) {
            const input = {
                ...engine.createItem(base(catalyst.itemClasses[0]!)),
                rarity: "rare" as const,
                catalyst: { id: catalyst.id, quality: 20 },
            };
            const natural = engine.pool(input);
            const weighted = engine.pool(input, { catalysing: true });
            expect(weighted.map((entry) => entry.id)).toEqual(natural.map((entry) => entry.id));
            for (const [index, entry] of weighted.entries()) {
                const matching = catalystEffect(catalog, input, entry.id) > 0;
                expect(entry.weight).toBe(natural[index]!.weight * (matching ? 5 : 1));
                if (matching) matches++;
            }
            expect(engine.pool(input)).toEqual(natural);
            const result = engine.apply(input, method, seededRandom(42));
            expect(result.item.catalyst).toBeUndefined();
            expect(result.item.mods).toHaveLength(1);
            expect(result.cost.map((entry) => entry.id)).toEqual([exalt.id, catalysing]);
            expect(input.catalyst.quality).toBe(20);
        }
        expect(catalog.crafting.catalysts).toHaveLength(26);
        expect(matches).toBeGreaterThan(100);
    });

    it("uses the default-quality breakpoint on over-cap bases and isolates cached quality and tag weights", () => {
        const breach = Object.entries(catalog.bases).find(
            ([, entry]) => entry.name === "Refined Breach Ring",
        )![0];
        for (const [amount, expected] of [
            [0, 1],
            [1, 1.2],
            [19, 4.8],
            [20, 5],
            [21, 5.12],
            [40, 7.4],
            [45, 8],
            [65, 10.4],
        ]) {
            const input = engine.validateItem({
                ...quality(amount!),
                baseId: breach,
                implicits: engine.createItem(breach).implicits,
            });
            expect(catalysingMultiplier(catalog, input)).toBeCloseTo(expected!);
            const result = engine.apply(input, method, seededRandom(42));
            expect(result.item.catalyst).toEqual(amount ? undefined : input.catalyst);
        }
        const first = engine.pool(quality(20), { catalysing: true });
        const before = structuredClone(first);
        const changed = engine.pool(quality(10), { catalysing: true });
        const cold = catalog.crafting.catalysts.find(
            (entry) => entry.tags.includes("cold") && entry.itemClasses.includes("Ring"),
        )!;
        engine.pool({ ...ring, catalyst: { id: cold.id, quality: 20 } }, { catalysing: true });
        expect(first).toEqual(before);
        expect(engine.pool(quality(20), { catalysing: true })).toEqual(before);
        const index = first.findIndex((entry) => entry.mod.implicit_tags.includes("life"));
        expect(first[index]!.weight / changed[index]!.weight).toBeCloseTo(5 / 3);
    });

    it("consumes quality even on a nonmatching roll and restores raw displayed magnitude", () => {
        let input = engine.addStartingMod(quality(20), "IncreasedLife1", seededRandom(42));
        input.mods[0]!.fractured = true;
        const original = structuredClone(input);
        const random = seededRandom(42);
        vi.spyOn(random, "pick").mockImplementation(
            (choices) =>
                choices.find(
                    (choice) =>
                        typeof choice.value === "string" &&
                        !engine.mod(choice.value).implicit_tags.includes("life"),
                )!.value,
        );
        const result = engine.apply(input, method, random);
        expect(result.item.mods[0]).toEqual(input.mods[0]);
        expect(result.item.catalyst).toBeUndefined();
        expect(input).toEqual(original);
        expect(engine.statTotals(result.item).get("base_maximum_life")).toBeLessThan(
            engine.statTotals(input).get("base_maximum_life")!,
        );
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result.item))[0]!.item,
        ).toEqual(result.item);
        input = result.item;
        const second = engine.apply(input, method, seededRandom(17));
        expect(second.cost.map((entry) => entry.id)).toEqual([exalt.id]);
    });

    it("leaves an inactive omen unspent and preserves ordinary quality", () => {
        const armour = {
            ...engine.createItem(base("Body Armour")),
            rarity: "rare" as const,
            quality: 20,
        };
        for (const input of [ring, quality(0), armour]) {
            const result = engine.apply(input, method, seededRandom(42));
            expect(result.cost).toEqual(engine.costs({ ...method, omens: [] }));
            expect(engine.costs(method, input)).toEqual(result.cost);
            expect(result.item.quality).toBe(input.quality);
            expect(result.item.catalyst).toEqual(input.catalyst);
        }
        expect(
            availableOmens(catalog, method, "Body Armour").map((entry) => entry.id),
        ).not.toContain(catalysing);
        expect(availableOmens(catalog, method, "Jewel").map((entry) => entry.id)).toContain(
            catalysing,
        );
    });

    it("keeps the starting boost for both Greater rolls alongside directional and tiered currency rules", () => {
        const perfect = catalog.crafting.tieredCurrency.find((entry) =>
            entry.id.endsWith("CurrencyAddModToRare3"),
        )!;
        const combined = {
            ...method,
            id: perfect.id,
            omens: [catalysing, omen("OmenOnExaltAddTwoMods"), omen("OmenOnExaltAddPrefixes")],
        };
        const input = quality(20);
        const seen: CraftingItem[] = [];
        const random = seededRandom(42);
        const state = structuredClone(input);
        vi.spyOn(random, "pick").mockImplementation((choices) => {
            const expected = engine.pool(state, {
                side: "prefix",
                minimumLevel: perfect.minimumModLevel,
                catalysing: true,
            });
            expect(choices).toEqual(
                expected.map((entry) => ({ value: entry.id, weight: entry.weight })),
            );
            const chosen = choices[0]!;
            if (typeof chosen.value !== "string") throw new Error("Expected a modifier choice");
            state.mods.push(engine.rollMod(chosen.value, seededRandom(1)));
            seen.push(structuredClone(state));
            return chosen.value;
        });
        const result = engine.apply(input, combined, random);
        expect(seen).toHaveLength(2);
        expect(seen.every((entry) => entry.catalyst?.quality === 20)).toBe(true);
        expect(engine.counts(result.item)).toEqual({ prefixes: 2, suffixes: 0 });
        expect(result.item.catalyst).toBeUndefined();
        expect(result.cost.map((entry) => entry.id)).toEqual([perfect.id, ...combined.omens]);
        const remaining = engine.addStartingMod(
            input,
            engine.pool(input, { side: "prefix" })[0]!.id,
            seededRandom(1),
        );
        const tags = [
            ...new Set(remaining.mods.flatMap((entry) => engine.mod(entry.id).implicit_tags)),
        ];
        const homogenising = {
            ...method,
            omens: [catalysing, omen("OmenOnExaltAddExistingModType")],
        };
        const hom = engine.apply(remaining, homogenising, seededRandom(42));
        expect(
            engine.mod(hom.item.mods.at(-1)!.id).implicit_tags.some((tag) => tags.includes(tag)),
        ).toBe(true);
    });

    it("rejects invalid crafts before random selection without consuming quality", () => {
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        let full = quality(20);
        while (full.mods.length < 6)
            full = engine.addStartingMod(full, engine.pool(full)[0]!.id, seededRandom(1));
        expect(() => engine.apply(full, method, random)).toThrow("No eligible");
        expect(full.catalyst?.quality).toBe(20);
        pick.mockClear();
        for (const item of [
            { ...quality(20), rarity: "magic" },
            { ...quality(20), corrupted: true },
            { ...quality(20), mirrored: true },
        ]) {
            expect(() => engine.apply(engine.validateItem(item), method, random)).toThrow();
            expect(item.catalyst?.quality).toBe(20);
        }
        expect(pick).not.toHaveBeenCalled();
    });

    it("calculates boosted odds and retains only one omen charge across repeated Exalts", () => {
        const input = quality(20);
        const pool = engine.pool(input);
        const matching = pool.filter((entry) => entry.mod.implicit_tags.includes("life"));
        const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
        const weight = matching.reduce((sum, entry) => sum + entry.weight, 0);
        const target = engine.validateTarget({
            groups: [{ mods: matching.map((entry) => entry.id) }],
            catalyst: { min: 0, max: 0 },
        });
        const probability = (5 * weight) / (total + 4 * weight);
        expect(calculateExact(engine, input, method, target).probability).toBeCloseTo(probability);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item: input,
            method,
            target,
            steps: [],
            prices: { [exalt.id]: 2, [catalysing]: 7 },
            seed: 42,
            iterations: 1000,
            maxActions: 2,
        });
        const simulation = new CraftingSimulation(catalog, project);
        for (let i = 0; i < project.iterations; i++) simulation.runTrial();
        expect(simulation.result().probability).toBeCloseTo(probability, 1);
        expect(simulation.result().meanCost).toBe(9);
        const any = engine.validateTarget({ groups: [] });
        project.target = any;
        project.useProcess = true;
        project.steps = [
            { id: "first", method, condition: any, onSuccess: "second", onFailure: "second" },
            { id: "second", method, condition: any, onSuccess: "success", onFailure: "failure" },
        ];
        const process = new CraftingSimulation(catalog, project, true);
        process.runTrial();
        expect(process.result().spending).toEqual({ [exalt.id]: 2, [catalysing]: 1 });
        expect(process.result().meanCost).toBe(11);
        const drained = {
            ...project,
            item: ring,
            steps: [
                { id: "exalt", method, condition: any, onSuccess: "success", onFailure: "failure" },
            ],
            prices: { [exalt.id]: 2 },
        };
        expect(calculateProcessExact(engine, drained).meanCost).toBeCloseTo(2);
        expect(calculateProcessExact(engine, drained).unpriced).toEqual([]);
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });
});

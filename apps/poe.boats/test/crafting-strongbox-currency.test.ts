import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { availableOmens } from "../app/lib/crafting-omens";
import {
    CraftingProcess,
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    validateProject,
} from "../app/lib/crafting-simulation";
import { strongboxMethod } from "../app/lib/crafting-strongboxes";
import { scaledModValues } from "../app/lib/crafting-text";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const baseId = "Metadata/Chests/StrongBoxes/BasicStrongboxHigh";
const normal = engine.createItem(baseId);
const rare = { ...normal, rarity: "rare" as const };
const currency = (action: string) => ({
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
});
const omen = (suffix: string) =>
    catalog.crafting.currencies.find((entry) => entry.id.endsWith(`/${suffix}`))!.id;
const prefix = engine
    .pool(rare)
    .find(
        (entry) =>
            entry.mod.generation_type === "prefix" &&
            entry.mod.stats.some((stat) => stat.min !== stat.max),
    )!;
const suffix = engine.pool(rare).find((entry) => entry.id === "StrongboxChestItemQuantity1")!;
const prepared = () =>
    engine.addStartingMod(
        engine.addStartingMod(rare, prefix.id, seededRandom(1)),
        suffix.id,
        seededRandom(2),
    );

describe("PoE 2 Strongbox tiered currencies and omens", () => {
    it.each(
        catalog.crafting.tieredCurrency,
    )("applies extracted tier $tier and its highest-family fallback for $id", (tier) => {
        const action = catalog.crafting.currencies.find((entry) => entry.id === tier.id)!.action;
        const method = { kind: "currency" as const, id: tier.id };
        expect(strongboxMethod(catalog, method)).toBe(true);
        for (const base of [baseId, "Metadata/Chests/StrongBoxes/BasicStrongboxLow"]) {
            const normal = engine.createItem(base);
            const starting =
                action === "transmute_to_magic"
                    ? normal
                    : action === "add_mod_to_magic" || action === "upgrade_magic_to_rare"
                      ? engine.apply(normal, currency("transmute_to_magic"), seededRandom(1)).item
                      : engine.apply(normal, currency("transmute_to_rare"), seededRandom(1)).item;
            const before = structuredClone(starting);
            for (let seed = 0; seed < 8; seed++) {
                const random = seededRandom(seed);
                const picks = vi.spyOn(random, "pick");
                const result = engine.apply(starting, method, random);
                const added = picks.mock.results
                    .filter((entry) => entry.type === "return" && typeof entry.value === "string")
                    .map((entry) => result.item.mods.find((mod) => mod.id === entry.value)!);
                expect(added.length).toBeGreaterThan(0);
                for (const entry of added) {
                    expect(entry).toBeDefined();
                    const others = result.item.mods.filter((mod) => mod !== entry);
                    const eligible = engine.pool(
                        { ...result.item, mods: others },
                        { minimumLevel: tier.minimumModLevel },
                    );
                    expect(eligible.some((mod) => mod.id === entry.id)).toBe(true);
                    const mod = engine.mod(entry.id);
                    if (mod.required_level < tier.minimumModLevel) {
                        expect(
                            engine
                                .pool({ ...result.item, mods: others })
                                .some(
                                    (other) =>
                                        other.mod.type === mod.type &&
                                        other.mod.groups.join("|") === mod.groups.join("|") &&
                                        other.mod.generation_type === mod.generation_type &&
                                        other.mod.required_level > mod.required_level,
                                ),
                        ).toBe(false);
                    }
                }
                expect(result.cost.map((entry) => [entry.id, entry.amount])).toEqual([
                    [tier.id, 1],
                ]);
                expect(engine.validateItem(result.item)).toEqual(result.item);
            }
            expect(starting).toEqual(before);
        }
    });

    it("combines directional and two-modifier omens with tiered Exalted Orbs without touching encounter properties", () => {
        const tier = catalog.crafting.tieredCurrency.find((entry) =>
            entry.id.endsWith("/CurrencyAddModToRare3"),
        )!;
        const method = {
            kind: "currency" as const,
            id: tier.id,
            omens: [omen("OmenOnExaltAddTwoMods"), omen("OmenOnExaltAddSuffixes")],
        };
        const input = engine.addStartingMod(rare, prefix.id, seededRandom(1));
        const before = structuredClone(catalog.crafting.strongboxes);
        for (let seed = 0; seed < 20; seed++) {
            const result = engine.apply(input, method, seededRandom(seed));
            expect(engine.counts(result.item)).toEqual({ prefixes: 1, suffixes: 2 });
            expect(result.item.mods[0]).toEqual(input.mods[0]);
            expect(result.item.implicits).toEqual([]);
            expect(result.cost.map((entry) => entry.id)).toEqual([method.id, ...method.omens]);
        }
        expect(catalog.crafting.strongboxes).toEqual(before);
        const fullSuffixes = engine.apply(input, method, seededRandom(42)).item;
        const oneOpen = engine.apply(fullSuffixes, method, seededRandom(42));
        expect(engine.counts(oneOpen.item)).toEqual({ prefixes: 1, suffixes: 3 });
        expect(oneOpen.cost).toHaveLength(3);
        expect(() => engine.apply(oneOpen.item, method, seededRandom(1))).toThrow("No eligible");
    });

    it("calculates, simulates and emulates directional Annulment with all consumed costs", () => {
        const input = prepared();
        const method = {
            ...currency("remove_random_mod"),
            omens: [omen("OmenOnAnnulRemovePrefixes")],
        };
        const target = engine.validateTarget({
            groups: [{ mods: [suffix.id] }],
            prefixCount: { min: 0, max: 0 },
        });
        const project = craftingProjectSchema.parse({
            format: 1,
            game: catalog.game,
            patch: catalog.patch,
            item: input,
            target,
            method,
            useProcess: true,
            steps: [{ id: "annul", method, condition: target }],
            prices: { [method.id]: 2, [method.omens[0]!]: 3 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        expect(calculateExact(engine, input, method, target).probability).toBe(1);
        expect(calculateProcessExact(engine, project)).toMatchObject({
            probability: 1,
            meanCost: 5,
            spending: { [method.id]: 1, [method.omens[0]!]: 1 },
        });
        const simulation = new CraftingSimulation(catalog, project);
        for (let index = 0; index < 1000; index++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({ successes: 1000, meanCost: 5, errors: {} });
        const process = new CraftingProcess(engine, project, seededRandom(42));
        process.advance();
        expect(process.result()).toMatchObject({
            success: true,
            spending: { [method.id]: 1, [method.omens[0]!]: 1 },
        });
        expect(validateProject(catalog, JSON.parse(JSON.stringify(project)))).toEqual(project);
    });

    it("supports two-modifier Annulment and maximum-prefix Alchemy, preserving the three-per-side limits", () => {
        const double = {
            ...currency("remove_random_mod"),
            omens: [omen("OmenOnAnnulRemoveTwoMods")],
        };
        expect(engine.apply(prepared(), double, seededRandom(1)).item.mods).toEqual([]);
        const alchemy = {
            ...currency("transmute_to_rare"),
            omens: [omen("OmenOnAlchemyMaximumPrefixes")],
        };
        for (let seed = 0; seed < 10; seed++)
            expect(engine.counts(engine.apply(normal, alchemy, seededRandom(seed)).item)).toEqual({
                prefixes: 3,
                suffixes: 1,
            });
    });

    it("caps Greater Annulment at the remaining eligible modifiers, including directional limits", () => {
        const input = prepared();
        const double = {
            ...currency("remove_random_mod"),
            omens: [omen("OmenOnAnnulRemoveTwoMods")],
        };
        const single = { ...input, mods: [input.mods[0]!] };
        expect(engine.apply(single, double, seededRandom(1)).item.mods).toEqual([]);
        const method = { ...double, omens: [...double.omens, omen("OmenOnAnnulRemovePrefixes")] };
        const target = engine.validateTarget({
            groups: [{ mods: [suffix.id] }],
            prefixCount: { min: 0, max: 0 },
        });
        const result = engine.apply(input, method, seededRandom(1));
        expect(result.item.mods).toEqual([input.mods[1]]);
        expect(result.cost.map((entry) => entry.id)).toEqual([method.id, ...method.omens]);
        expect(calculateExact(engine, input, method, target).probability).toBe(1);
        expect(() => engine.apply(result.item, method, seededRandom(1))).toThrow("No eligible");
        expect(input.mods).toHaveLength(2);
    });

    it("sanctifies rare Strongbox affixes using extracted bounds and retains the state in text, JSON and conditions", () => {
        const input = prepared();
        const method = { ...currency("reroll_mod_values"), omens: [omen("OmenOnDivineSanctify")] };
        const random = seededRandom(1);
        vi.spyOn(random, "integer").mockImplementation((_min, max) => max);
        const result = engine.apply(input, method, random);
        expect(result.item.sanctified).toBe(true);
        for (const rolled of result.item.mods) {
            expect(rolled.sanctification).toBe(catalog.crafting.sanctification!.max);
            expect(rolled.values).toEqual(engine.mod(rolled.id).stats.map((stat) => stat.max));
        }
        expect(scaledModValues(catalog, result.item.mods[1]!, result.item)).toEqual([61]);
        const text = exportCraftingItemText(engine, result.item);
        const imported = importCraftingItemText(engine, text)[0]!;
        expect(imported.item.sanctified).toBe(true);
        expect(imported.warnings.length).toBeGreaterThan(0);
        expect(exportCraftingItemText(engine, imported.item)).toBe(text);
        expect(engine.validateItem(JSON.parse(JSON.stringify(result.item)))).toEqual(result.item);
        const quantity = engine.mod(suffix.id).stats[0]!;
        const target = engine.validateTarget({
            groups: [],
            stats: [{ id: quantity.id, min: 61 }],
        });
        expect(
            calculateExact(engine, { ...rare, mods: [input.mods[1]!] }, method, target, 10000)
                .probability,
        ).toBeGreaterThan(0);
        expect(() =>
            engine.apply(result.item, currency("add_mod_to_rare"), seededRandom(2)),
        ).toThrow("Sanctified");
        expect(result.cost.map((entry) => entry.id)).toEqual([method.id, ...method.omens]);
        expect(input.sanctified).toBeUndefined();
    });

    it("retains the corruption bypass with Omen of Corruption and charges the omen", () => {
        const method = {
            ...currency("corrupt_item"),
            omens: [omen("OmenOnVaalRemoveDoNothingOutcome")],
        };
        const input = prepared();
        const result = engine.apply(input, method, seededRandom(1));
        expect(result.item).toEqual({ ...input, corrupted: true });
        expect(result.cost.map((entry) => entry.id)).toEqual([method.id, ...method.omens]);
        expect(
            calculateExact(
                engine,
                input,
                method,
                engine.validateTarget({ groups: [], corrupted: true }),
            ).probability,
        ).toBe(1);
    });

    it("rejects incompatible class omens, absent implicit/desecrated targets, conflicting directions and empty Homogenising pools", () => {
        const random = seededRandom(1);
        const input = prepared();
        const pick = vi.spyOn(random, "pick");
        const methods = [
            { ...currency("reroll"), omens: [omen("OmenOnChaosMapItemRarity")] },
            { ...currency("add_mod_to_rare"), omens: [omen("OmenOnExaltConsumeQuality")] },
            { ...currency("reroll_mod_values"), omens: [omen("OmenOnDivineRerollImplicits")] },
            { ...currency("remove_random_mod"), omens: [omen("OmenOnAnnulRemoveAbyssMod")] },
            {
                ...currency("remove_random_mod"),
                omens: [omen("OmenOnAnnulRemovePrefixes"), omen("OmenOnAnnulRemoveSuffixes")],
            },
        ];
        for (const method of methods) expect(() => engine.apply(input, method, random)).toThrow();
        expect(pick.mock.calls.every(([choices]) => choices.length === 0)).toBe(true);
        expect(
            availableOmens(catalog, currency("reroll"), "Strongbox").some((entry) =>
                entry.id.includes("OmenOnChaosMap"),
            ),
        ).toBe(false);
        const homogenise = {
            ...currency("add_mod_to_rare"),
            omens: [omen("OmenOnExaltAddExistingModType")],
        };
        expect(() => engine.apply(rare, homogenise, seededRandom(1))).toThrow("No eligible");
        expect(() => engine.validateItem({ ...input, rarity: "magic", sanctified: true })).toThrow(
            "Sanctification requires",
        );
    });
});

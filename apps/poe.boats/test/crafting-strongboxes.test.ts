import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingProcess,
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    validateProject,
} from "../app/lib/crafting-simulation";
import { strongbox, strongboxMethod } from "../app/lib/crafting-strongboxes";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";

describe.each(["poe1", "poe2"] as const)("%s extracted Strongboxes", (game) => {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const id = `Metadata/Chests/StrongBoxes/${game === "poe1" ? "Strongbox" : "BasicStrongboxHigh"}`;
    const currency = (action: string) => ({
        kind: "currency" as const,
        id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
    });
    const alchemy = currency("transmute_to_rare");
    const annul = currency("remove_random_mod");
    const initial = engine.createItem(id);
    const pool = engine.pool({ ...initial, rarity: "rare" });
    const prefix = pool.find((entry) => entry.mod.generation_type === "prefix")!;
    const suffix = pool.find(
        (entry) =>
            entry.mod.generation_type === "suffix" &&
            !entry.mod.groups.some((group) => prefix.mod.groups.includes(group)),
    )!;
    const item = engine.addStartingMod(
        engine.addStartingMod({ ...initial, rarity: "rare" }, prefix.id, seededRandom(1)),
        suffix.id,
        seededRandom(2),
    );
    const target = engine.validateTarget({ groups: [{ mods: [prefix.id] }] });
    const project = () =>
        craftingProjectSchema.parse({
            format: 1,
            game,
            patch: catalog.patch,
            item,
            method: annul,
            target,
            steps: [{ id: "annul", method: annul, condition: target }],
            useProcess: true,
            prices: { [annul.id]: 2 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });

    it("exposes ordinary extracted variants, including zero-spawn boxes, without inventing inventory bases", () => {
        const entries = Object.entries(catalog.bases).filter(([, base]) => base.strongbox);
        expect(entries.length).toBeGreaterThan(15);
        for (const [id, base] of entries) {
            const chest = strongbox(catalog, { baseId: id })!;
            expect(base.name).toBe(chest.name);
            expect(base.domain).toBe(game === "poe1" ? "chest" : "strongbox");
            expect(base.item_class).toBe("Strongbox");
            expect([base.inventory_width, base.inventory_height]).toEqual([0, 0]);
            expect(catalog.crafting.baseRules[id]).toBeUndefined();
            expect(chest.mods.every((id) => catalog.mods[id])).toBe(true);
            const created = engine.createItem(id);
            expect(created.mods).toEqual([]);
            expect(created.implicits).toEqual([]);
            expect(engine.counts(created)).toEqual({ prefixes: 0, suffixes: 0 });
            const crafted = engine.apply(created, alchemy, seededRandom(42)).item;
            expect(crafted.rarity).toBe("rare");
            expect(crafted.mods.length).toBeGreaterThanOrEqual(4);
            expect(engine.validateItem(crafted)).toEqual(crafted);
            expect(crafted.mods.every((entry) => engine.mod(entry.id).domain === base.domain)).toBe(
                true,
            );
        }
        if (game === "poe1") {
            const operative = "Metadata/Chests/StrongBoxes/StrongboxScarab";
            expect(strongbox(catalog, { baseId: operative })?.spawnWeight).toBe(0);
            expect(catalog.bases[operative]).toBeDefined();
            expect(
                catalog.bases["Metadata/Chests/StrongBoxes/ArcanistGrandmaster"],
            ).toBeUndefined();
            expect(pool.some((entry) => entry.id === "ChestSummonNormals")).toBe(false);
        } else expect(catalog.bases["Metadata/Chests/StrongBoxes/GemStrongbox"]).toBeUndefined();
    });

    it("uses extracted modifier weights and ignores encounter selection weights", () => {
        const changed = structuredClone(catalog);
        for (const entry of changed.crafting.strongboxes) entry.spawnWeight = 1_000_000;
        const other = new CraftingEngine(changed);
        expect(other.pool(item)).toEqual(engine.pool(item));
        for (let seed = 0; seed < 12; seed++)
            expect(other.apply(initial, alchemy, seededRandom(seed))).toEqual(
                engine.apply(initial, alchemy, seededRandom(seed)),
            );
        const weighted = game === "poe1" ? "ChestFreeze" : "StrongboxChestItemQuantity1";
        expect(pool.find((entry) => entry.id === weighted)?.weight).toBe(
            game === "poe1" ? 1000 : 1,
        );
    });

    it("calculates, simulates and emulates conditional processes with ordinary currency costs", () => {
        expect(calculateExact(engine, item, annul, target)).toMatchObject({ probability: 0.5 });
        const input = project();
        expect(calculateProcessExact(engine, input)).toMatchObject({
            probability: 0.5,
            meanCost: 2,
            spending: { [annul.id]: 1 },
        });
        const simulation = new CraftingSimulation(catalog, input);
        for (let trial = 0; trial < 1000; trial++) simulation.runTrial();
        const result = simulation.result();
        expect(result.successes).toBeGreaterThan(440);
        expect(result.successes).toBeLessThan(560);
        expect(result.spending).toEqual({ [annul.id]: 1000 });
        const process = new CraftingProcess(engine, input, seededRandom(42));
        process.advance();
        expect(process.result().item.mods).toHaveLength(1);
        expect(process.result().spending).toEqual({ [annul.id]: 1 });
    });

    it("preserves supported states through JSON and item text, selecting variants by their extracted level range", () => {
        const input = project();
        expect(validateProject(catalog, JSON.parse(JSON.stringify(input)))).toEqual(input);
        for (const level of [0, 101, Number.NaN, Infinity, 3.5])
            expect(() => engine.createItem(id, level)).toThrow();
        const text = exportCraftingItemText(engine, item);
        const matches = importCraftingItemText(engine, text);
        expect(matches.map((entry) => entry.item)).toContainEqual(item);
        expect(matches.every((entry) => entry.item.level === item.level)).toBe(true);
        if (game === "poe2") {
            const low = engine.createItem("Metadata/Chests/StrongBoxes/BasicStrongboxLow");
            expect(low.level).toBe(44);
            expect(() => engine.validateItem({ ...low, level: 45 })).toThrow("requires level");
            const lowMatches = importCraftingItemText(engine, exportCraftingItemText(engine, low));
            expect(lowMatches.map((entry) => entry.item.baseId)).toEqual([low.baseId]);
        }
    });

    it("corrupts without changing affixes under the reference model and rejects further crafts", () => {
        const vaal = currency("corrupt_item");
        expect(
            calculateExact(
                engine,
                item,
                vaal,
                engine.validateTarget({ groups: [], corrupted: true }),
            ).probability,
        ).toBe(1);
        const result = engine.apply(item, vaal, seededRandom(1));
        expect(result.item).toEqual({ ...item, corrupted: true });
        expect(result.cost).toEqual([
            {
                id: vaal.id,
                name: catalog.crafting.currencies.find((entry) => entry.id === vaal.id)!.name,
                amount: 1,
            },
        ]);
        expect(() => engine.apply(result.item, annul, seededRandom(1))).toThrow();
    });

    it("rejects equipment-only crafting, imprints and invalid Strongbox state before randomness", () => {
        expect(engine.availableFossils(item)).toEqual([]);
        const unsupported = currency("reroll_implicit_mod");
        expect(strongboxMethod(catalog, unsupported)).toBe(false);
        expect(() =>
            engine.apply(item, unsupported, {
                pick: () => {
                    throw new Error("randomness reached");
                },
                integer: () => {
                    throw new Error("randomness reached");
                },
            }),
        ).toThrow("not supported for Strongboxes");
        expect(() => engine.validateItem({ ...item, mirrored: true })).toThrow(
            "equipment crafting states",
        );
        expect(() =>
            engine.validateItem({
                ...item,
                mods: [{ ...item.mods[0], fractured: true }, item.mods[1]],
            }),
        ).toThrow("equipment crafting states");
        expect(() => engine.validateItem({ ...item, imprint: initial })).toThrow(
            "equipment crafting states",
        );
        if (game === "poe2")
            expect(
                strongboxMethod(catalog, {
                    ...currency("reroll"),
                    omens: ["Metadata/Items/Currency/OmenOnChaosMapItemRarity"],
                }),
            ).toBe(false);
    });
});

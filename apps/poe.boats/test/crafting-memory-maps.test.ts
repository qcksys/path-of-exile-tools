import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { memoryMapModifiers, supportsMemoryMap } from "../app/lib/crafting-memory";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    hasCraftingRequirements,
} from "../app/lib/crafting-simulation";
import {
    type CraftingItem,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const method = currency("enchant_map_zana_influence_drops");
const rule = catalog.crafting.memoryMaps!;
const blank = engine.createItem("Metadata/Items/Maps/MapAtlasBeach", 86);
const memory = { ...blank, memoryMap: { intentions: 0 } };

describe("Memory Influenced Maps and Orb of Intention", () => {
    it("derives availability, modifier values and the use limit from the extracted build", () => {
        expect(engine.currencySupported("enchant_map_zana_influence_drops")).toBe(true);
        expect(rule.maximumUses).toBe(3);
        expect(supportsMemoryMap(catalog, memory)).toBe(true);
        expect(supportsMemoryMap(catalog, { baseId })).toBe(false);
        expect(memoryMapModifiers(catalog, blank)).toEqual([]);
        const changed = structuredClone(catalog);
        changed.crafting.memoryMaps!.maximumUses = 2;
        changed.mods[rule.enchantmentMod]!.stats.find(
            (stat) => stat.id === "map_item_zana_influence_+",
        )!.min = 8;
        const other = new CraftingEngine(changed);
        expect(memoryMapModifiers(changed, { memoryMap: { intentions: 2 } })[1]!.text).toContain(
            "+16 Memory Strands",
        );
        expect(() => other.validateItem({ ...memory, memoryMap: { intentions: 3 } })).toThrow(
            "extracted map limit",
        );
        expect(() => other.validateTarget({ groups: [], intentions: { min: 0, max: 3 } })).toThrow(
            "extracted map limit",
        );
    });

    it.each([
        "normal",
        "magic",
        "rare",
    ] as const)("applies exactly three deterministic enchantment increments to %s maps without changing affixes", (rarity) => {
        let item: CraftingItem = { ...memory, rarity };
        if (rarity !== "normal")
            item = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(1));
        const original = structuredClone(item);
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        for (let uses = 1; uses <= rule.maximumUses; uses++) {
            const result = engine.apply(item, method, random);
            expect(result.item.memoryMap).toEqual({ intentions: uses });
            expect(result.item.mods).toEqual(original.mods);
            expect(result.item.implicits).toEqual(original.implicits);
            expect(result.item.rarity).toBe(rarity);
            expect(result.item.memoryStrands).toBeUndefined();
            expect(result.cost).toEqual([
                { id: rule.currency, name: "Orb of Intention", amount: 1 },
            ]);
            const text = memoryMapModifiers(catalog, result.item)
                .map((entry) => entry.text)
                .join("\n");
            expect(text).toContain("Area is Influenced by the Originator's Memories");
            expect(text).toContain(`${uses * 20}% less Quantity of Items found`);
            expect(text).toContain(`+${uses * 12} Memory Strands`);
            expect(item.memoryMap!.intentions).toBe(uses - 1);
            item = result.item;
        }
        expect(() => engine.apply(item, method, random)).toThrow("Intention limit");
        expect(pick).not.toHaveBeenCalled();
        expect(original.memoryMap!.intentions).toBe(0);
    });

    it("rejects invalid state and unavailable crafts before random selection", () => {
        for (const count of [-1, 0.5, 4])
            expect(() =>
                engine.validateItem({ ...memory, memoryMap: { intentions: count } }),
            ).toThrow();
        expect(() => engine.validateItem({ ...memory, baseId })).toThrow("PoE 1 map");
        expect(() => engine.validateItem({ ...memory, memoryStrands: 1 })).toThrow("equipment");
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        for (const item of [
            blank,
            engine.createItem(baseId),
            { ...memory, corrupted: true },
            { ...memory, mirrored: true },
        ])
            expect(() => engine.apply(item, method, random)).toThrow();
        expect(() => engine.apply(memory, currency("corrupt_item"), random)).toThrow("not modeled");
        expect(pick).not.toHaveBeenCalled();
        const poe2 = new CraftingEngine(
            craftingCatalogSchema.parse(
                JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
            ),
        );
        expect(poe2.currencySupported("enchant_map_zana_influence_drops")).toBe(false);
        expect(() => poe2.validateTarget({ groups: [], intentions: { min: 0, max: 0 } })).toThrow(
            "PoE 1",
        );
        expect(() =>
            poe2.validateItem({
                ...poe2.createItem(Object.keys(poe2.catalog.bases)[0]!),
                memoryMap: { intentions: 0 },
            }),
        ).toThrow("PoE 1 map");
    });

    it.each([
        0, 1, 2, 3,
    ])("round-trips %s uses through item text and rejects incomplete or conflicting values", (intentions) => {
        const item = { ...memory, memoryMap: { intentions } };
        const text = exportCraftingItemText(engine, item);
        expect(importCraftingItemText(engine, text)[0]!.item).toEqual(item);
        const plain = text.replace(/\{[^}]+\}/g, "").replace(/^Implicits:.*\n/m, "");
        expect(importCraftingItemText(engine, plain)[0]!.item).toEqual(item);
        const influence = memoryMapModifiers(catalog, item)[0]!.text;
        expect(() => importCraftingItemText(engine, `${plain}\n${influence}`)).toThrow();
        if (intentions) {
            expect(() => importCraftingItemText(engine, plain.replace(influence, ""))).toThrow();
            expect(() =>
                importCraftingItemText(
                    engine,
                    plain.replace(`${intentions * 12} Memory Strands`, "99 Memory Strands"),
                ),
            ).toThrow();
            expect(() =>
                importCraftingItemText(engine, plain.replace(/^.*less Quantity.*\n/m, "")),
            ).toThrow();
        }
    });

    it("preserves memory map state through ordinary crafts, imprints and project JSON", () => {
        const item = { ...memory, memoryMap: { intentions: 2 } };
        const rare = engine.apply(item, currency("transmute_to_rare"), seededRandom(1)).item;
        const rerolled = engine.apply(rare, currency("reroll"), seededRandom(2)).item;
        const normal = engine.apply(rerolled, currency("convert_to_normal"), seededRandom(3)).item;
        expect(normal.memoryMap).toEqual(item.memoryMap);
        const snapshot = engine.apply(item, currency("inital_imprint"), seededRandom(1)).item;
        const enchanted = engine.apply(snapshot, method, seededRandom(1)).item;
        expect(engine.apply(enchanted, currency("restore_imprint"), seededRandom(1)).item).toEqual(
            item,
        );
        expect(engine.validateItem(JSON.parse(JSON.stringify(enchanted)))).toEqual(enchanted);
    });

    it("uses Intention-only conditions for exact calculation and costed repeated processes", () => {
        const zero = engine.validateTarget({ groups: [], intentions: { min: 0, max: 0 } });
        expect(hasCraftingRequirements(zero)).toBe(true);
        expect(engine.matches(blank, zero)).toBe(false);
        expect(engine.matches(memory, zero)).toBe(true);
        const target = engine.validateTarget({ groups: [], intentions: { min: 3, max: 3 } });
        expect(calculateExact(engine, memory, method, target).probability).toBe(0);
        expect(
            calculateExact(engine, { ...memory, memoryMap: { intentions: 2 } }, method, target)
                .probability,
        ).toBe(1);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: memory,
            method,
            target,
            steps: [
                {
                    id: "intention",
                    method,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "intention",
                },
            ],
            prices: { [rule.currency]: 7 },
            seed: 42,
            iterations: 100,
            maxActions: 3,
            useProcess: true,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBe(1);
        expect(exact.meanCost).toBe(21);
        const simulation = new CraftingSimulation(catalog, project);
        for (let trial = 0; trial < 100; trial++) simulation.runTrial();
        expect(simulation.result().successes).toBe(100);
        expect(simulation.result().meanCost).toBe(21);
        expect(calculateProcessExact(engine, { ...project, maxActions: 2 }).probability).toBe(0);
    });
});

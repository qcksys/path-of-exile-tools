import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { availableCatalysts, catalystLimit } from "../app/lib/crafting-quality";
import { CraftingSimulation, calculateExact } from "../app/lib/crafting-simulation";
import { rolledModText } from "../app/lib/crafting-text";
import {
    craftingCatalogSchema,
    craftingItemSchema,
    craftingProjectSchema,
    craftingTargetSchema,
} from "../app/schemas/crafting";

describe.each(["poe1", "poe2"] as const)("%s catalyst quality", (game) => {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const lifeBase = Object.entries(catalog.bases).find(
        ([, base]) =>
            ["Ring", "Amulet"].includes(base.item_class) &&
            base.implicits.some((id) =>
                catalog.mods[id]!.stats.some((stat) => stat.id === "base_maximum_life"),
            ),
    )![0];
    const lifeCatalyst = catalog.crafting.catalysts.find((entry) =>
        entry.tags.includes(game === "poe1" ? "resource" : "life"),
    )!;
    function prepared() {
        const item = engine.addStartingMod(
            engine.createItem(lifeBase),
            "IncreasedLife1",
            seededRandom(1),
        );
        item.mods[0]!.values = [15];
        item.implicits[0]!.values = [catalog.mods[item.implicits[0]!.id]!.stats[0]!.max];
        return engine.validateItem({ ...item, catalyst: { id: lifeCatalyst.id, quality: 20 } });
    }

    it("scales matching explicit and implicit stats without changing raw rolls or spawn weights", () => {
        const item = prepared();
        expect(rolledModText(catalog, item.mods[0]!, item)).toBe("+18 to maximum Life");
        expect(rolledModText(catalog, item.implicits[0]!, item)).toBe(
            `+${Math.trunc(item.implicits[0]!.values[0]! * 1.2)} to maximum Life`,
        );
        const cold = engine.addStartingMod(item, "ColdResist1", seededRandom(1));
        expect(rolledModText(catalog, cold.mods[1]!, cold)).toBe(
            rolledModText(catalog, cold.mods[1]!),
        );
        expect(item.mods[0]!.values).toEqual([15]);
        expect(engine.pool(item)).toEqual(engine.pool({ ...item, catalyst: undefined }));
    });

    it("preserves quality through rolls, JSON snapshots and PoB text without double scaling", () => {
        const item = prepared();
        const divine = catalog.crafting.currencies.find(
            (entry) => entry.action === "reroll_mod_values",
        )!;
        const changed = engine.apply(
            item,
            { kind: "currency", id: divine.id },
            seededRandom(2),
        ).item;
        expect(changed.catalyst).toEqual(item.catalyst);
        expect(craftingItemSchema.parse(JSON.parse(JSON.stringify(item)))).toEqual(item);
        const text = exportCraftingItemText(engine, item);
        expect(text).toContain("CatalystQuality: 20");
        expect(text).toContain("+18 to maximum Life");
        const [imported] = importCraftingItemText(engine, text);
        expect(imported!.item).toEqual(item);
        expect(exportCraftingItemText(engine, imported!.item)).toBe(text);
    });

    it("keeps quality through exact calculations and simulated process results", () => {
        const item = prepared();
        const method = {
            kind: "currency",
            id: catalog.crafting.currencies.find((entry) => entry.action === "reroll_mod_values")!
                .id,
        } as const;
        const target = craftingTargetSchema.parse({ groups: [{ mods: ["IncreasedLife1"] }] });
        expect(calculateExact(engine, item, method, target).probability).toBe(1);
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: catalog.patch,
            item,
            method,
            target,
            steps: [{ id: "divine", method, condition: target }],
            prices: {},
            seed: 3,
            iterations: 10,
            maxActions: 2,
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let attempt = 0; attempt < 10; attempt++) simulation.runTrial();
        const result = simulation.result();
        expect(result.errors).toEqual({});
        expect(result.successes).toBe(10);
        expect(
            result.samples.every(
                (sample) =>
                    sample.item.catalyst?.id === lifeCatalyst.id &&
                    sample.item.catalyst.quality === 20,
            ),
        ).toBe(true);
    });

    it("imports build-defined quality headings and advanced raw values", () => {
        const item = prepared();
        const exported = exportCraftingItemText(engine, item).replace(
            /^Catalyst: .+\nCatalystQuality: 20$/m,
            `${lifeCatalyst.description}: +20% (augmented)`,
        );
        expect(importCraftingItemText(engine, exported)[0]!.item).toEqual(item);
        const rawItem = { ...item, catalyst: undefined };
        const advanced = exportCraftingItemText(engine, rawItem).replace(
            "Item Level:",
            `Crafted: true\n${lifeCatalyst.description}: +20%\nItem Level:`,
        );
        expect(importCraftingItemText(engine, advanced)[0]!.item).toEqual(item);
    });

    it("rejects unknown catalysts, invalid quality, mismatched classes and conflicting text headers", () => {
        const item = prepared();
        expect(() =>
            engine.validateItem({ ...item, catalyst: { id: "missing", quality: 20 } }),
        ).toThrow("not available");
        expect(() =>
            engine.validateItem({
                ...item,
                catalyst: { id: lifeCatalyst.id, quality: game === "poe1" ? 21 : 51 },
            }),
        ).toThrow("maximum quality");
        expect(() =>
            engine.validateItem({ ...item, catalyst: { id: lifeCatalyst.id, quality: 1.5 } }),
        ).toThrow();
        const armour = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "Body Armour",
        )![0];
        expect(() =>
            engine.validateItem({ ...engine.createItem(armour), catalyst: item.catalyst }),
        ).toThrow("not available");
        const text = exportCraftingItemText(engine, item);
        expect(() =>
            importCraftingItemText(engine, `${text}\n${lifeCatalyst.description}: +20%`),
        ).toThrow("one recognized type");
        expect(() =>
            importCraftingItemText(
                engine,
                text.replace("CatalystQuality: 20", "CatalystQuality: 20.5"),
            ),
        ).toThrow("whole-number");
        expect(() =>
            importCraftingItemText(engine, text.replace(/^Catalyst: .+$/m, "Catalyst: Missing")),
        ).toThrow("unavailable");
        expect(engine.validateMethod({ kind: "currency", id: lifeCatalyst.id })).toEqual({
            kind: "currency",
            id: lifeCatalyst.id,
        });
    });

    if (game === "poe1") {
        it("adds prefix-only quality to implicit magnitude bonuses and preserves the other side", () => {
            const baseId = Object.entries(catalog.bases).find(
                ([, base]) => base.name === "Simplex Amulet",
            )![0];
            let item = engine.addStartingMod(
                engine.createItem(baseId),
                "IncreasedLife1",
                seededRandom(1),
            );
            item = engine.addStartingMod(item, "ColdResist1", seededRandom(1));
            item.mods[0]!.values = [15];
            const catalyst = catalog.crafting.catalysts.find((entry) => entry.prefix)!;
            const prepared = engine.validateItem({
                ...item,
                catalyst: { id: catalyst.id, quality: 20 },
            });
            expect(rolledModText(catalog, prepared.mods[0]!, prepared)).toBe("+33 to maximum Life");
            expect(rolledModText(catalog, prepared.mods[1]!, prepared)).toBe(
                rolledModText(catalog, item.mods[1]!, item),
            );
            for (const implicit of item.implicits)
                expect(rolledModText(catalog, implicit, prepared)).toBe(
                    rolledModText(catalog, implicit, item),
                );
            expect(
                importCraftingItemText(engine, exportCraftingItemText(engine, prepared))[0]!.item,
            ).toEqual(prepared);
        });
    } else {
        it("uses extracted refined catalyst restrictions and increased maximum-quality implicits", () => {
            const jewelId = Object.entries(catalog.bases).find(
                ([, base]) => base.item_class === "Jewel" && !base.corrupted,
            )![0];
            const jewel = engine.createItem(jewelId);
            const available = availableCatalysts(catalog, jewel);
            expect(available).toHaveLength(13);
            expect(
                available.every(
                    (entry) => entry.itemClasses.length === 1 && entry.itemClasses[0] === "Jewel",
                ),
            ).toBe(true);
            const refined = available.find((entry) => entry.tags.includes("life"))!;
            expect(() =>
                engine.validateItem({ ...jewel, catalyst: { id: lifeCatalyst.id, quality: 20 } }),
            ).toThrow("not available");
            const prepared = engine.validateItem({
                ...jewel,
                catalyst: { id: refined.id, quality: 20 },
            });
            expect(
                importCraftingItemText(engine, exportCraftingItemText(engine, prepared))[0]!.item,
            ).toEqual(prepared);
            const breach = engine.createItem("Metadata/Items/Rings/FourRingBreach2");
            expect(catalystLimit(catalog, breach)).toBe(45);
            const high = engine.validateItem({
                ...breach,
                catalyst: { id: lifeCatalyst.id, quality: 45 },
            });
            expect(
                importCraftingItemText(engine, exportCraftingItemText(engine, high))[0]!.item,
            ).toEqual(high);
            expect(() =>
                engine.validateItem({ ...high, catalyst: { ...high.catalyst, quality: 76 } }),
            ).toThrow("maximum quality");
        });
    }
});

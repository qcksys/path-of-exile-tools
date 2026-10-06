import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { type CraftingItem, craftingCatalogSchema } from "../app/schemas/crafting";
import { baseId, catalog, engine } from "./crafting-fixtures";

const item = () => ({ ...engine.createItem(baseId), rarity: "rare" as const });
const modifier = (influence: number) =>
    engine
        .influenceModifiers(item(), influence)
        .find((entry) => catalog.crafting.modRules[entry.id]?.influence === influence)!;

describe("influence modifier previews and starting-item setup", () => {
    it.each([
        0, 1, 2, 3, 4, 5,
    ])("previews influence %s without changing the item or its natural pool", (influence) => {
        const base = item();
        const before = structuredClone(base);
        const natural = engine.pool(base);
        const pool = engine.influenceModifiers(base, influence);
        expect(pool.length).toBeGreaterThan(natural.length);
        expect(
            pool.some((entry) => catalog.crafting.modRules[entry.id]?.influence === influence),
        ).toBe(true);
        expect(
            pool.every(
                (entry) =>
                    catalog.crafting.modRules[entry.id]?.influence == null ||
                    catalog.crafting.modRules[entry.id]?.influence === influence,
            ),
        ).toBe(true);
        expect(pool).toEqual(engine.pool({ ...base, influences: [influence] }));
        expect(engine.pool(base)).toEqual(natural);
        expect(base).toEqual(before);
        const added = engine.addStartingMod(
            base,
            modifier(influence).id,
            seededRandom(2),
            "influence",
        );
        expect(added.influences).toEqual([influence]);
        expect(added.mods.map((entry) => entry.id)).toEqual([modifier(influence).id]);
        expect(engine.validateItem(added)).toEqual(added);
        const imported = importCraftingItemText(engine, exportCraftingItemText(engine, added))[0]!;
        expect(imported.item.influences).toEqual([influence]);
        expect(imported.item.mods.map((entry) => entry.id)).toEqual(
            added.mods.map((entry) => entry.id),
        );
    });

    it("uses all active influences for an active preview and ordinary plus one influence for an inactive preview", () => {
        const base = { ...item(), influences: [0, 1] };
        expect(engine.influenceModifiers(base, 0)).toEqual(engine.pool(base));
        const inactive = engine.influenceModifiers(base, 2);
        expect(inactive).toEqual(engine.pool({ ...item(), influences: [2] }));
        expect(
            inactive.some((entry) =>
                [0, 1].includes(catalog.crafting.modRules[entry.id]?.influence ?? -1),
            ),
        ).toBe(false);
        const added = engine.addStartingMod(
            { ...item(), influences: [0] },
            modifier(1).id,
            seededRandom(1),
            "influence",
        );
        expect(added.influences).toEqual([0, 1]);
    });

    it("uses extracted level gates and selected fossil weights independently of occupied slots", () => {
        const pristine = catalog.crafting.fossils.find(
            (entry) => entry.name === "Pristine Fossil",
        )!;
        const options = { fossils: [pristine.id] };
        const base = engine.addStartingMod(item(), "IncreasedLife1", seededRandom(1));
        expect(engine.influenceModifiers(base, 0, options)).toEqual(
            engine.pool({ ...item(), influences: [0] }, options),
        );
        expect(
            engine
                .influenceModifiers({ ...base, level: 1 }, 0)
                .every((entry) => entry.mod.required_level <= 1),
        ).toBe(true);
        expect(engine.influenceModifiers(base, 0, options)).not.toEqual(
            engine.influenceModifiers(base, 0),
        );
        expect(engine.influenceModifiers(base, 9)).toEqual([]);
    });

    it("keeps innate influences and native implicits when manually adding an influence modifier", () => {
        const base = engine.createItem("Metadata/Items/Amulets/AmuletE1");
        const pool = engine.influenceModifiers(base, 0);
        expect(
            new Set(pool.flatMap((entry) => catalog.crafting.modRules[entry.id]?.influence ?? [])),
        ).toEqual(new Set([0, 1, 2, 3, 4, 5]));
        const id = pool.find((entry) => catalog.crafting.modRules[entry.id]?.influence === 0)!.id;
        const added = engine.addStartingMod(base, id, seededRandom(2), "influence");
        expect(added.influences).toEqual([]);
        expect(added.implicits).toEqual(base.implicits);
        expect(added.rarity).toBe("rare");
        expect(engine.effectiveInfluences(added)).toHaveLength(6);
    });

    it("rejects invalid influence additions atomically before rolling values", () => {
        const id = modifier(0).id;
        const fractured = {
            ...item(),
            mods: [engine.rollMod("IncreasedLife1", seededRandom(1), { fractured: true })],
        };
        const eldritch = {
            ...item(),
            implicits: [
                engine.rollMod(
                    engine.eldritchModifiers(item()).find((entry) => entry.weight > 0)!.id,
                    seededRandom(1),
                ),
            ],
        };
        const cases: [CraftingItem, string][] = [
            [item(), "IncreasedLife1"],
            [{ ...item(), influences: [1, 2] }, id],
            [fractured, id],
            [eldritch, id],
            [{ ...item(), level: 1 }, id],
            [engine.addStartingMod(item(), id, seededRandom(1), "influence"), id],
        ];
        for (const [base, target] of cases) {
            const before = structuredClone(base);
            const random = seededRandom(1);
            const roll = vi.spyOn(random, "integer");
            expect(() => engine.addStartingMod(base, target, random, "influence")).toThrow();
            expect(roll).not.toHaveBeenCalled();
            expect(base).toEqual(before);
        }
    });

    it("does not invent influence pools in PoE 2 or unsupported PoE 1 classes", () => {
        const other = new CraftingEngine(
            craftingCatalogSchema.parse(
                JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
            ),
        );
        expect(
            other.influenceModifiers(other.createItem(Object.keys(other.catalog.bases)[0]!), 0),
        ).toEqual([]);
        const flask = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "LifeFlask",
        )![0];
        expect(engine.influenceModifiers(engine.createItem(flask), 0)).toEqual([]);
        expect(() =>
            engine.addStartingMod(
                engine.createItem(flask),
                modifier(0).id,
                seededRandom(1),
                "influence",
            ),
        ).toThrow();
    });
});

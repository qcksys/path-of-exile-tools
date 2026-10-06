import { describe, expect, it, vi } from "vite-plus/test";
import { seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import type { CraftingItem, CraftingMethod } from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

function influenced(influence: number): CraftingItem {
    const item = { ...engine.createItem(baseId), rarity: "rare" as const, influences: [influence] };
    const mod = engine.pool(item, { influence })[0]!;
    return engine.addStartingMod(item, mod.id, seededRandom(1));
}
const donor = { id: "donor-one", name: "Elder donor", item: influenced(1) };
const method: Extract<CraftingMethod, { kind: "currency" }> = {
    kind: "currency",
    id: catalog.crafting.currencies.find((entry) => entry.action === "transfer_item_influence")!.id,
    donor,
};

describe("Awakener donor crafting", () => {
    it("filters additional rolls using the target's strands and consumes them after preserving guarantees", () => {
        const item = { ...influenced(0), memoryStrands: 82 };
        const random = seededRandom(1);
        vi.spyOn(random, "pick").mockImplementation(
            (choices) =>
                choices.find(
                    (entry) =>
                        typeof entry.value === "string" && /^FireResist\d$/.test(entry.value),
                )?.value ?? choices.at(-1)!.value,
        );
        const result = engine.apply(item, method, random);
        expect(result.item.mods.map((entry) => entry.id)).toEqual(
            expect.arrayContaining([item.mods[0]!.id, donor.item.mods[0]!.id, "FireResist7"]),
        );
        expect(result.item.memoryStrands).toBeUndefined();
        expect(item.memoryStrands).toBe(82);
        expect(result.cost).toHaveLength(2);
    });

    it("transfers a donor modifier above the target level without raising later roll eligibility", () => {
        const target = { ...engine.createItem(baseId, 1), influences: [0] };
        const result = engine.apply(target, method, seededRandom(12)).item;
        const transferred = result.mods.find((entry) => entry.id === donor.item.mods[0]!.id)!;
        expect(engine.mod(transferred.id).required_level).toBeGreaterThan(target.level);
        expect(result.level).toBe(1);
        expect(transferred.origin).toEqual({ kind: "awakener", level: donor.item.level });
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result))[0]!.item.mods,
        ).toContainEqual(transferred);
        expect(
            result.mods
                .filter((entry) => entry !== transferred)
                .every((entry) => engine.mod(entry.id).required_level <= 1),
        ).toBe(true);
        expect(engine.validateItem(JSON.parse(JSON.stringify(result)))).toEqual(result);
        const divine = engine.apply(result, currency("reroll_mod_values"), seededRandom(13)).item;
        expect(divine.mods.find((entry) => entry.id === transferred.id)!.origin).toEqual(
            transferred.origin,
        );
        const chaos = engine.apply(result, currency("reroll"), seededRandom(14)).item;
        expect(
            chaos.mods.every((entry) => !entry.origin && engine.mod(entry.id).required_level <= 1),
        ).toBe(true);
    });

    it("transfers one modifier from each influence, keeps the target base and charges the donor", () => {
        const item = influenced(0);
        const original = structuredClone({ item, method });
        const result = engine.apply(item, method, seededRandom(12));
        expect({ item, method }).toEqual(original);
        expect(result.item.baseId).toBe(item.baseId);
        expect(result.item.level).toBe(item.level);
        expect(result.item.implicits).toEqual(item.implicits);
        expect(result.item.influences).toEqual([0, 1]);
        expect(result.item.mods.map((entry) => entry.id)).toEqual(
            expect.arrayContaining([item.mods[0]!.id, donor.item.mods[0]!.id]),
        );
        expect(result.item.mods.length).toBeGreaterThanOrEqual(4);
        expect(result.cost).toEqual([
            { id: method.id, name: "Awakener's Orb", amount: 1 },
            { id: "donor:donor-one", name: "Donor · Elder donor", amount: 1 },
        ]);
    });

    it("ignores target metamods while rerolling and allows influence-only donors", () => {
        const lock = catalog.crafting.bench.find(
            (entry) =>
                entry.mod &&
                engine
                    .mod(entry.mod)
                    .stats.some((stat) => stat.id === "item_generation_cannot_change_suffixes"),
        )!;
        const item = engine.apply(
            influenced(0),
            { kind: "bench", id: lock.id },
            seededRandom(1),
        ).item;
        const result = engine.apply(
            item,
            { ...method, donor: { ...donor, item: { ...donor.item, mods: [] } } },
            seededRandom(12),
        ).item;
        expect(result.mods.some((entry) => entry.id === lock.mod)).toBe(false);
        expect(result.influences).toEqual([0, 1]);
    });

    it("rejects missing, corrupted, same-influence, dual-influence and wrong-class donors", () => {
        const item = influenced(0);
        expect(() => engine.apply(item, { ...method, donor: undefined }, seededRandom(1))).toThrow(
            "Choose a donor",
        );
        expect(() => engine.apply(donor.item, method, seededRandom(1))).toThrow(
            "different influences",
        );
        for (const changed of [
            { ...donor.item, corrupted: true },
            { ...donor.item, influences: [1, 2] },
        ])
            expect(() =>
                engine.apply(
                    item,
                    { ...method, donor: { ...donor, item: changed } },
                    seededRandom(1),
                ),
            ).toThrow("one influence each");
        const ringBase = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "Ring",
        )![0];
        expect(() =>
            engine.apply(
                item,
                {
                    ...method,
                    donor: { ...donor, item: { ...engine.createItem(ringBase), influences: [1] } },
                },
                seededRandom(1),
            ),
        ).toThrow("same item class");
        expect(() => engine.validateMethod({ ...currency("reroll"), donor })).toThrow(
            "does not use a donor",
        );
    });

    it("does not preserve two conflicting influence groups", () => {
        const target = { ...engine.createItem(baseId), rarity: "rare" as const, influences: [0] };
        const source = { ...target, influences: [1] };
        const targetPool = engine.pool(target, { influence: 0 });
        const sourcePool = engine.pool(source, { influence: 1 });
        const first = targetPool.find((entry) =>
            sourcePool.some((other) =>
                other.mod.groups.some((group) => entry.mod.groups.includes(group)),
            ),
        )!;
        const second = sourcePool.find((entry) =>
            entry.mod.groups.some((group) => first.mod.groups.includes(group)),
        )!;
        const item = engine.addStartingMod(target, first.id, seededRandom(1));
        const result = engine.apply(
            item,
            {
                ...method,
                donor: {
                    ...donor,
                    item: engine.addStartingMod(source, second.id, seededRandom(1)),
                },
            },
            seededRandom(12),
        ).item;
        expect(
            result.mods.filter((entry) =>
                engine.mod(entry.id).groups.some((group) => first.mod.groups.includes(group)),
            ),
        ).toHaveLength(1);
        expect(result.influences).toEqual([0, 1]);
    });

    it("preserves the target imprint so the transfer can be restored", () => {
        const item = influenced(0);
        const imprinted = engine.apply(item, currency("inital_imprint"), seededRandom(1)).item;
        const awakened = engine.apply(imprinted, method, seededRandom(12)).item;
        expect(awakened.imprint).toEqual(item);
        expect(engine.apply(awakened, currency("restore_imprint"), seededRandom(1)).item).toEqual(
            item,
        );
    });
});

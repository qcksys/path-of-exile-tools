import { describe, expect, it } from "vite-plus/test";
import { discoverCraftingCosts } from "../app/lib/crafting-cost-inputs";
import { seededRandom } from "../app/lib/crafting-engine";
import { baseId, engine } from "./crafting-fixtures";

describe("crafting price inputs", () => {
    it("includes the removal fee before replacing a bench craft", () => {
        const input = engine.apply(
            { ...engine.createItem(baseId), rarity: "rare" },
            { kind: "bench", id: "bench:77" },
            seededRandom(1),
        ).item;
        const method = { kind: "bench", id: "bench:78" } as const;
        const actual = engine.apply(input, method, seededRandom(1)).cost;
        expect(actual.map(({ name }) => name)).toEqual(["Orb of Scouring", "Orb of Transmutation"]);
        const discovered = discoverCraftingCosts(engine, [method]);
        expect(discovered.map(({ id }) => id)).toEqual(
            expect.arrayContaining(actual.map(({ id }) => id)),
        );
    });

    it("keeps recorded costs editable even after the selected method changes", () => {
        const id = "Metadata/Items/Currency/CurrencyConvertToNormal";
        const costs = discoverCraftingCosts(engine, [], [id, id]);
        expect(costs).toEqual([{ id, name: "Orb of Scouring", amount: 1 }]);
    });

    it("finds flask enchantment removal costs without an input item", () => {
        const recipe = engine.catalog.crafting.bench.find((entry) => entry.enchantment)!;
        const removal = engine.catalog.crafting.bench.find(
            (entry) =>
                entry.action === 1 &&
                !entry.mod &&
                !entry.enchantment &&
                entry.itemClasses.some((itemClass) => recipe.itemClasses.includes(itemClass)),
        )!;
        expect(
            discoverCraftingCosts(engine, [{ kind: "bench", id: recipe.id }]).map(({ id }) => id),
        ).toEqual(expect.arrayContaining(removal.cost.map(({ id }) => id)));
    });
});

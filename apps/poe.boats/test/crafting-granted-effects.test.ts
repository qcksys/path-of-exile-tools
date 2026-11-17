import { describe, expect, it } from "vite-plus/test";
import { combinedExplicitText } from "../app/lib/crafting-combined-text";
import { rolledModText } from "../app/lib/crafting-text";
import { matchRolledMod } from "../app/lib/crafting-text-match";
import type { RolledMod } from "../app/schemas/crafting";
import { baseId, catalog, engine } from "./crafting-fixtures";

// From 3.30 the client writes granted skill and support lines from client strings, after any
// lines the modifier's stats describe.
describe("PoE 1 3.30 granted effect lines", () => {
    const totem: RolledMod = {
        id: "TotemDamageSpellUber1",
        values: [22, 0],
        crafted: false,
        fractured: false,
    };
    const aspect: RolledMod = {
        id: "GrantsCatAspectCrafted",
        values: [0],
        crafted: true,
        fractured: false,
    };
    const totemText =
        "22% increased Totem Damage\nSocketed Gems are Supported by Level 18 Spell Totem Support";

    it("renders rolled values followed by the granted lines", () => {
        expect(catalog.mods[totem.id]!.stats).toHaveLength(totem.values.length);
        expect(rolledModText(catalog, totem)).toBe(totemText);
        expect(rolledModText(catalog, aspect)).toBe("Grants Level 20 Aspect of the Cat");
    });

    it("keeps granted lines beside combined stat lines", () => {
        const item = { ...engine.createItem(baseId, 86), mods: [totem, aspect] };
        expect(combinedExplicitText(catalog, item).map((line) => line.text)).toEqual(
            expect.arrayContaining([
                "22% increased Totem Damage",
                "Socketed Gems are Supported by Level 18 Spell Totem Support",
                "Grants Level 20 Aspect of the Cat",
            ]),
        );
    });

    it("matches trade text that includes the granted lines", () => {
        const item = engine.createItem(baseId, 86);
        expect(matchRolledMod(catalog, totem.id, totemText, item)?.mod.values).toEqual([22, 0]);
        expect(
            matchRolledMod(catalog, totem.id, "22% increased Totem Damage", item),
        ).toBeUndefined();
        expect(
            matchRolledMod(catalog, aspect.id, "Grants Level 20 Aspect of the Cat", item),
        ).toMatchObject({ mod: { id: aspect.id, values: [0] }, ambiguous: false });
        expect(
            matchRolledMod(catalog, aspect.id, "Grants Level 30 Aspect of the Cat", item),
        ).toBeUndefined();
    });
});

describe("PoE 1 3.30 bench crafts", () => {
    it("uses the suffix lock modifier the bench offers on each item class", () => {
        const lock = (itemClass: string) =>
            engine.benchRecipeFor("DexMasterItemGenerationCannotChangeSuffixes", itemClass)?.mod;
        expect(lock("Two Hand Sword")).toBe("DexMasterItemGenerationCannotChangeSuffixes");
        expect(lock("Boots")).toBe("DexMasterItemGenerationCannotChangeSuffixesB");
        expect(lock("Ring")).toBe("DexMasterItemGenerationCannotChangeSuffixesC");
        expect(
            engine.benchRecipeFor("DexMasterItemGenerationCannotChangeSuffixes", "Fishing Rod"),
        ).toBeUndefined();
    });

    it("refuses the counted prefix and suffix locks until their protection is modelled", () => {
        for (const mod of [
            "StrMasterItemGenerationCannotChangeOnePrefixesB",
            "DexMasterItemGenerationCannotChangeTwoSuffixesB",
        ]) {
            const recipe = catalog.crafting.bench.find((entry) => entry.mod === mod)!;
            expect(() => engine.validateMethod({ kind: "bench", id: recipe.id })).toThrow(
                "This bench craft is not supported yet.",
            );
        }
    });

    it("charges every lifeforce type a Harvest craft costs", () => {
        expect(engine.costs({ kind: "harvest", id: "ChangeColdToFireDamage" })).toEqual([
            {
                id: "Metadata/Items/Currency/HarvestSeedBlue",
                name: "Primal Crystallised Lifeforce",
                amount: 300,
            },
            {
                id: "Metadata/Items/Currency/HarvestSeedRed",
                name: "Wild Crystallised Lifeforce",
                amount: 300,
            },
            {
                id: "Metadata/Items/Currency/HarvestSeedFaridun",
                name: "Crystallised Rancour",
                amount: 1,
            },
        ]);
    });
});

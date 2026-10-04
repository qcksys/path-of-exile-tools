import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { craftingRecipesSchema } from "../src/crafting-recipes.ts";
import { digest } from "../src/io.ts";

const read = (path: string) => readFileSync(new URL(`../../poe-1-data/${path}`, import.meta.url));

describe("generated PoE 1 crafting recipes", () => {
    const data = craftingRecipesSchema.parse(JSON.parse(read("crafting.json").toString()));
    const manifest = JSON.parse(read("manifest.json").toString());

    it("matches the packaged client build and resolves every modifier and item class", () => {
        expect(data.patch).toBe(manifest.client_build);
        expect(data.source.modsSha256).toBe(digest(read("data/mods.json")));
        expect(data.source.basesSha256).toBe(digest(read("data/base_items.json")));
        const mods = JSON.parse(read("data/mods.json").toString());
        const classes = JSON.parse(read("data/item_classes.json").toString());
        expect(new Set(data.recipes.map((recipe) => recipe.id)).size).toBe(data.recipes.length);
        for (const recipe of data.recipes) {
            expect(Object.hasOwn(mods, recipe.mod)).toBe(true);
            for (const itemClass of recipe.itemClasses)
                expect(Object.hasOwn(classes, itemClass)).toBe(true);
        }
    });

    it("exports natural essence tiers and bench eligibility through current class categories", () => {
        const doubt = data.recipes.find(
            (recipe) =>
                recipe.name === "Wailing Essence of Doubt" && recipe.itemClasses.includes("Shield"),
        );
        expect(doubt?.mod).toBe("LocalIncreasedEvasionRating7_");
        const doubleDamage = data.recipes.find(
            (recipe) => recipe.mod === "JunMaster2DoubleDamageChance1h1",
        );
        expect(doubleDamage?.kind).toBe("bench");
        expect(doubleDamage?.itemClasses).toContain("Shield");
        expect(doubleDamage?.cost).toEqual([{ name: "Chaos Orb", amount: 2 }]);
        expect(data.source.tables["Data/CraftingItemClassCategories.datc64"]).toMatch(
            /^[a-f0-9]{64}$/,
        );
    });
});

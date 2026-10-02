import { describe, expect, it } from "vite-plus/test";
import { MANUAL_VENDOR_RECIPES } from "~/data/manual-vendor-recipes";
import { VENDOR_RECIPES } from "~/data/vendor-recipes";
import evidence from "./fixtures/vendor-recipes-wiki.json";

const recipes = [...VENDOR_RECIPES, ...MANUAL_VENDOR_RECIPES];

describe("wiki-verified recipe coverage", () => {
    it("has exactly one recorded wiki row for every supported recipe", () => {
        expect(evidence.recipes.map((entry) => entry.id).sort()).toEqual(
            recipes.map((recipe) => recipe.id).sort(),
        );
    });

    it.each(recipes)("matches the verified inputs and output for $id", (recipe) => {
        const entry = evidence.recipes.find((row) => row.id === recipe.id);
        expect(entry).toMatchObject({
            input: recipe.input.name,
            output: recipe.output.name,
            quantity: recipe.input.quantity,
        });
        expect(entry?.outputQuantity ?? 1).toBe(recipe.output.quantity);
        expect(entry?.revision).toBeGreaterThan(0);
        expect(new URL(entry!.source).hostname).toBe(new URL(recipe.source).hostname);
    });
});

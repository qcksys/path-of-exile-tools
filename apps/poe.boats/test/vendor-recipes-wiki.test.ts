import { describe, expect, it } from "vite-plus/test";
import { VENDOR_RECIPES } from "~/data/vendor-recipes";
import evidence from "./fixtures/vendor-recipes-wiki.json";

describe("wiki-verified recipe coverage", () => {
    it("has exactly one recorded wiki recipe row for every supported conversion", () => {
        expect(evidence.recipes.map((entry) => entry.id).sort()).toEqual(
            VENDOR_RECIPES.map((recipe) => recipe.id).sort(),
        );
    });

    it.each(VENDOR_RECIPES)("matches the verified inputs and output for $id", (recipe) => {
        const entry = evidence.recipes.find((row) => row.id === recipe.id);
        expect(entry).toMatchObject({
            input: recipe.input.name,
            output: recipe.output.name,
            quantity: recipe.input.quantity,
        });
        expect(recipe.output.quantity).toBe(1);
        expect(entry?.revision).toBeGreaterThan(0);
        expect(new URL(entry!.source).hostname).toBe(new URL(recipe.source).hostname);
    });
});

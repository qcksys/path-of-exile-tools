import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vite-plus/test";
import { calculateRecombinatorPlan } from "~/lib/recombinator";
import { availableCatalogMods, catalogModAffix } from "~/lib/recombinator-catalog";
import { parseRecombinatorDraft, type RecombinatorDraft } from "~/lib/recombinator-plan";
import { layoutRecombinatorTree, toggleDraftAffixFlag } from "~/lib/recombinator-tree";
import {
    recombinatorAffixSchema,
    recombinatorItemSchema,
    sharesAffixGroup,
} from "~/schemas/recombinator";
import { recombinatorCatalogSchema } from "~/schemas/recombinator-catalog";
import { armourMod, catalogFixture, lifeMod, lifeTier2 } from "./fixtures/recombinator-catalog";

function draft(): RecombinatorDraft {
    return {
        items: [lifeMod, lifeTier2].map((mod, index) => ({
            id: String(index),
            name: `Item ${index}`,
            prefixes: "",
            suffixes: "",
            catalog: {
                base: catalogFixture.bases[0],
                level: 86,
                prefixes: [catalogModAffix(mod)],
                suffixes: [],
            },
        })),
        steps: [{ id: "combine", name: "Combine", left: "0", right: "1" }],
    };
}

describe("recombinator catalog", () => {
    it("uses ordered weights, including blocking zeroes, and inclusive level limits", () => {
        expect(availableCatalogMods([lifeMod], catalogFixture.bases[1], 86)).toEqual([]);
        expect(availableCatalogMods([lifeTier2], catalogFixture.bases[0], 79)).toEqual([]);
        expect(availableCatalogMods([lifeTier2], catalogFixture.bases[0], 80)).toEqual([lifeTier2]);
        expect(
            availableCatalogMods([{ ...lifeMod, maxLevel: 50 }], catalogFixture.bases[0], 51),
        ).toEqual([]);
        expect(
            availableCatalogMods([{ ...lifeMod, maxLevel: 0 }], catalogFixture.bases[0], 100),
        ).toHaveLength(1);
        expect(availableCatalogMods([lifeMod], catalogFixture.bases[0], 0)).toEqual([]);
    });

    it("applies generation rules, added tags, and all group conflicts", () => {
        const conditional = {
            ...armourMod,
            generation: [
                ["enabled", 100],
                ["default", 0],
            ] as [string, number][],
        };
        expect(availableCatalogMods([conditional], catalogFixture.bases[0], 86)).toEqual([]);
        expect(
            availableCatalogMods([conditional], catalogFixture.bases[0], 86, [
                { ...lifeMod, addsTags: ["enabled"] },
            ]),
        ).toHaveLength(1);
        const hybrid = { ...armourMod, groups: ["Armour", "Life"] };
        expect(availableCatalogMods([hybrid], catalogFixture.bases[0], 86, [lifeMod])).toEqual([]);
        expect(sharesAffixGroup(catalogModAffix(hybrid), catalogModAffix(lifeMod))).toBe(true);
        expect(
            recombinatorItemSchema.safeParse({
                prefixes: [catalogModAffix(hybrid), catalogModAffix(lifeMod)],
                suffixes: [],
            }).success,
        ).toBe(false);
    });

    it("keeps tier IDs separate while sharing groups and carrying labels through the tree and results", () => {
        const input = draft();
        const plan = parseRecombinatorDraft(input, catalogFixture);
        expect(plan.items.map(({ item }) => item.prefixes[0].id)).toEqual([
            "poe1:Life1",
            "poe1:Life2",
        ]);
        const outcomes = calculateRecombinatorPlan(plan)[0].outcomes;
        expect(outcomes).toHaveLength(2);
        expect(outcomes.map(({ probability }) => probability)).toEqual([0.5, 0.5]);
        expect(outcomes.every(({ item }) => item.prefixes[0].label?.includes("maximum Life"))).toBe(
            true,
        );
        expect(layoutRecombinatorTree(input).nodes[0].affixes[0].affix.id).toBe("poe1:Life1");
        expect(layoutRecombinatorTree(input).nodes[0].name).toContain("Vaal Regalia");
    });

    it("enforces overlapping secondary groups during recombination", () => {
        const input = draft();
        const hybrid = { ...armourMod, groups: ["Armour", "Life"] };
        input.items[1].catalog!.prefixes = [catalogModAffix(hybrid)];
        const result = calculateRecombinatorPlan(
            parseRecombinatorDraft(input, {
                ...catalogFixture,
                mods: [...catalogFixture.mods.filter((mod) => mod.id !== hybrid.id), hybrid],
            }),
        )[0];
        expect(result.outcomes.every(({ item }) => item.prefixes.length === 1)).toBe(true);
        expect(result.outcomes.reduce((sum, row) => sum + row.probability, 0)).toBeCloseTo(1);
    });

    it("rejects cross-side group collisions that the independent-side model cannot simulate", () => {
        const plan = parseRecombinatorDraft(draft(), catalogFixture);
        plan.items[1].item.suffixes = [{ ...plan.items[1].item.prefixes[0], id: "suffix-life" }];
        plan.items[1].item.prefixes = [];
        expect(() => calculateRecombinatorPlan(plan)).toThrow("both prefixes and suffixes");
    });

    it("validates stale selections, missing catalogs, side, and the combined custom/catalog limit", () => {
        const input = draft();
        expect(() => parseRecombinatorDraft(input)).toThrow("Load the item catalog");
        input.items[1].catalog!.level = 20;
        expect(() => parseRecombinatorDraft(input, catalogFixture)).toThrow("not eligible");
        input.items[1].catalog!.level = 0;
        expect(() => parseRecombinatorDraft(input, catalogFixture)).toThrow("whole number");
        input.items[1].catalog!.level = 86;
        input.items[0].prefixes = "a\nb\nc";
        expect(() => parseRecombinatorDraft(input, catalogFixture)).toThrow("Item 1 prefixes");
        input.items[0].prefixes = "";
        input.items[0].catalog!.suffixes = input.items[0].catalog!.prefixes;
        input.items[0].catalog!.prefixes = [];
        expect(() => parseRecombinatorDraft(input, catalogFixture)).toThrow("not eligible");
    });

    it("updates flags across catalog copies and preserves manual input", () => {
        const input = draft();
        input.items[1].catalog!.prefixes = [catalogModAffix(lifeMod)];
        const changed = toggleDraftAffixFlag(input, "poe1:Life1", "nonNative", true);
        expect(changed.items.every((item) => item.catalog?.prefixes[0].nonNative)).toBe(true);
        expect(
            parseRecombinatorDraft(changed, catalogFixture).items[0].item.prefixes[0].nonNative,
        ).toBe(true);
    });

    it("ships a validated catalog with real equipment and translated, rollable modifiers", async () => {
        const catalog = recombinatorCatalogSchema.parse(
            JSON.parse(await readFile("public/game-data/recombinator-poe1.json", "utf8")),
        );
        const base = catalog.bases.find((item) => item.name === "Vaal Regalia")!;
        expect(base).toBeDefined();
        expect(
            availableCatalogMods(catalog.mods, base, 86).some((mod) => mod.id === "IncreasedLife9"),
        ).toBe(true);
        expect(new Set(catalog.bases.map((item) => item.id)).size).toBe(catalog.bases.length);
        expect(new Set(catalog.mods.map((mod) => mod.id)).size).toBe(catalog.mods.length);
        for (const mod of catalog.mods)
            expect(recombinatorAffixSchema.safeParse(catalogModAffix(mod)).success).toBe(true);
    });
});

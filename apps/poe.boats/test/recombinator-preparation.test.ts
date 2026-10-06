import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import {
    calculateRecombinatorPlan,
    matchesTarget,
    nativeWeight,
    prepareRecombinatorItem,
} from "~/lib/recombinator";
import {
    availableCatalogMods,
    catalogBaseOptions,
    catalogModAffix,
} from "~/lib/recombinator-catalog";
import {
    availablePreparationRecipes,
    emptyRecombinatorDraft,
    parseRecombinatorDraft,
} from "~/lib/recombinator-plan";
import { parseAffixes, type RecombinatorItem, type RecombinatorPlan } from "~/schemas/recombinator";
import { recombinatorCatalogSchema } from "~/schemas/recombinator-catalog";

const intBase = {
    id: "int",
    name: "INT shield",
    itemClass: "Shield",
    tags: ["int_armour", "default"],
};
const strBase = {
    id: "str",
    name: "STR shield",
    itemClass: "Shield",
    tags: ["str_armour", "default"],
};
const item = (prefixes = "", suffixes = "", base = intBase): RecombinatorItem => ({
    base,
    prefixes: parseAffixes(prefixes),
    suffixes: parseAffixes(suffixes),
});
const armour = {
    ...parseAffixes("Armour")[0],
    spawn: [
        ["str_armour", 1000],
        ["default", 0],
    ] as [string, number][],
};
function plan(left: RecombinatorItem, right: RecombinatorItem): RecombinatorPlan {
    return {
        items: [
            { id: "a", name: "A", item: left },
            { id: "b", name: "B", item: right },
        ],
        steps: [{ id: "first", name: "First", left: "a", right: "b" }],
    };
}
const chance = (result: ReturnType<typeof calculateRecombinatorPlan>[number], required: string[]) =>
    result.outcomes
        .filter(({ item }) => matchesTarget(item, required))
        .reduce((sum, row) => sum + row.probability, 0);

describe("stage preparation and base transfer", () => {
    it("applies NNN exclusion after the special count roll for isolated opposite affixes", () => {
        const donor = { ...item(), prefixes: [armour] };
        const result = calculateRecombinatorPlan(plan(donor, item("", "Fire")))[0];
        expect(chance(result, ["Fire"])).toBeCloseTo(2 / 3);
        expect(chance(result, ["Armour"])).toBe(0);
        expect(
            result.outcomes.find(({ item }) => !item.prefixes.length && !item.suffixes.length)
                ?.probability,
        ).toBeCloseTo(1 / 3);
    });

    it("keeps the desired mod with certainty when its same-side essence donor is NNN on both bases", () => {
        const recipe = plan(item("Life"), item("Old mod"));
        recipe.steps[0].rightPreparation = {
            kind: "essence",
            side: "prefixes",
            affix: armour,
            itemClasses: ["Shield"],
        };
        const result = calculateRecombinatorPlan(recipe)[0];
        expect(chance(result, ["Life"])).toBeCloseTo(1);
        expect(result.outcomes).toHaveLength(1);
        expect(result.outcomes[0].item.prefixes.map((affix) => affix.id)).toEqual(["Life"]);
    });

    it("retains base identity and only excludes a natural donor mod on the incompatible base", () => {
        const donor = { ...item("", "", strBase), prefixes: [armour] };
        const result = calculateRecombinatorPlan(plan(item("Life"), donor))[0];
        const intOutcomes = result.outcomes.filter(({ item }) => item.base?.id === "int");
        expect(intOutcomes).toHaveLength(1);
        expect(intOutcomes[0].probability).toBeCloseTo(0.5);
        expect(intOutcomes[0].item.prefixes[0].id).toBe("Life");
        expect(
            result.outcomes.some(
                ({ item }) =>
                    item.base?.id === "str" && item.prefixes.some((affix) => affix.id === "Armour"),
            ),
        ).toBe(true);
        expect(chance(result, ["Life"])).toBeCloseTo(0.8325);
        expect(result.outcomes.reduce((sum, row) => sum + row.probability, 0)).toBeCloseTo(1);
    });

    it("applies essence preparation to earlier outcomes by replacing all their mods", () => {
        const recipe = plan(item("Life", "Fire"), item("Mana", "Cold"));
        recipe.steps.push({
            id: "finish",
            name: "Finish",
            left: "first",
            right: "a",
            leftPreparation: {
                kind: "essence",
                side: "prefixes",
                affix: armour,
                itemClasses: ["Shield"],
            },
        });
        const result = calculateRecombinatorPlan(recipe)[1];
        expect(chance(result, ["Life"])).toBeCloseTo(1);
        expect(chance(result, ["Mana"])).toBe(0);
        expect(chance(result, ["Cold"])).toBe(0);
    });

    it("estimates opposite-side exclusive crafts and removes the crafts before later steps", () => {
        const recipe = plan(item("Life"), item("", "Fire"));
        const prefix = { ...parseAffixes("*Craft prefix")[0], crafted: true };
        const suffix = { ...parseAffixes("*Craft suffix")[0], crafted: true };
        Object.assign(recipe.steps[0], {
            leftPreparation: {
                kind: "bench",
                side: "suffixes",
                affix: suffix,
                itemClasses: ["Shield"],
            },
            rightPreparation: {
                kind: "bench",
                side: "prefixes",
                affix: prefix,
                itemClasses: ["Shield"],
            },
            removeCrafted: true,
        });
        recipe.steps.push({ id: "finish", name: "Finish", left: "first", right: "a" });
        const result = calculateRecombinatorPlan(recipe);
        expect(chance(result[0], ["Life", "Fire"])).toBeCloseTo(0.552775);
        expect(
            result
                .flatMap((step) => step.outcomes)
                .every(({ item }) =>
                    [...item.prefixes, ...item.suffixes].every((affix) => !affix.crafted),
                ),
        ).toBe(true);
        expect(result[1].outcomes.reduce((sum, row) => sum + row.probability, 0)).toBeCloseTo(1);
        recipe.steps[0].removeCrafted = false;
        expect(
            calculateRecombinatorPlan({
                ...recipe,
                steps: recipe.steps.slice(0, 1),
            })[0].outcomes.some(({ item }) =>
                [...item.prefixes, ...item.suffixes].some((affix) => affix.crafted),
            ),
        ).toBe(true);
    });

    it("rejects occupied slots, conflicting groups, a second bench craft and incompatible classes", () => {
        const preparation: NonNullable<RecombinatorPlan["steps"][number]["leftPreparation"]> = {
            kind: "bench",
            side: "prefixes",
            affix: { ...parseAffixes("*Craft | Life")[0], crafted: true },
            itemClasses: ["Shield"],
        };
        for (const input of [
            item("Life"),
            item("A\nB\nC"),
            { ...item("", "X"), suffixes: [{ ...parseAffixes("X")[0], crafted: true }] },
        ]) {
            expect(() => prepareRecombinatorItem(input, preparation)).toThrow();
        }
        expect(() =>
            prepareRecombinatorItem(item(), { ...preparation, itemClasses: ["Wand"] }),
        ).toThrow("not valid");
        expect(
            nativeWeight(
                {
                    ...armour,
                    spawn: [
                        ["int_armour", 0],
                        ["default", 1000],
                    ],
                },
                intBase,
            ),
        ).toBe(0);
    });

    it("validates retained essence modifiers without changing the input", () => {
        const preparation = {
            kind: "essence" as const,
            side: "prefixes" as const,
            affix: armour,
            itemClasses: ["Shield"],
            keepInputMods: true,
        };
        const donor = item("Life", "Fire\nCold");
        expect(prepareRecombinatorItem(donor, preparation)).toMatchObject({
            prefixes: [parseAffixes("Life")[0], armour],
            suffixes: parseAffixes("Fire\nCold"),
        });
        expect(donor.prefixes).toHaveLength(1);
        for (const invalid of [item("A\nB\nC"), item("Armour")])
            expect(() => prepareRecombinatorItem(invalid, preparation)).toThrow("open affix slot");
        for (const invalid of [
            item("!NNN"),
            item("*Exclusive"),
            { ...item(), prefixes: [{ ...parseAffixes("Craft")[0], crafted: true }] },
        ])
            expect(() => prepareRecombinatorItem(invalid, preparation)).toThrow(
                "Only natural modifiers",
            );
    });

    it.each([
        "prefixes",
        "suffixes",
    ] as const)("supports two exclusive bench crafts in %s without improving the natural pair odds", (side) => {
        const naturalSide = side === "prefixes" ? "suffixes" : "prefixes";
        for (const duplicate of [false, true]) {
            const recipe = plan(
                { ...item(), [naturalSide]: parseAffixes("A") },
                { ...item(), [naturalSide]: parseAffixes("B") },
            );
            for (const [index, field] of (
                ["leftPreparation", "rightPreparation"] as const
            ).entries())
                recipe.steps[0][field] = {
                    kind: "bench",
                    side,
                    affix: { ...parseAffixes(`*Craft ${duplicate ? 0 : index}`)[0], crafted: true },
                    itemClasses: ["Shield"],
                };
            const result = calculateRecombinatorPlan(recipe)[0];
            expect(chance(result, ["A", "B"])).toBeCloseTo(0.33);
            expect(result.outcomes.reduce((sum, row) => sum + row.probability, 0)).toBeCloseTo(1);
            expect(result.outcomes.every(({ item }) => item[side].length === 1)).toBe(true);
            recipe.steps[0].removeCrafted = true;
            const cleaned = calculateRecombinatorPlan(recipe)[0];
            expect(chance(cleaned, ["A", "B"])).toBeCloseTo(0.33);
            expect(cleaned.outcomes.every(({ item }) => item[side].length === 0)).toBe(true);
        }
    });
});

describe("generated preparation recipes", () => {
    const catalog = recombinatorCatalogSchema.parse(
        JSON.parse(
            readFileSync(
                new URL("../public/game-data/recombinator-poe1.json", import.meta.url),
                "utf8",
            ),
        ),
    );
    const bases = catalogBaseOptions(catalog.bases);
    const shield = bases.find((base) => base.id === "generic:Shield:int")!;

    it.each([
        0, 1, 2,
    ])("keeps Flaring and %i suffixes with a generated Torment donor", (suffixCount) => {
        const base = bases.find((base) => base.name === "Despot Axe")!;
        const pool = availableCatalogMods(catalog.mods, base, 83);
        const affix = (name: string) => catalogModAffix(pool.find((mod) => mod.name === name)!);
        const draft = structuredClone(emptyRecombinatorDraft);
        draft.items[0].catalog = {
            base,
            level: 83,
            prefixes: [affix("Merciless"), affix("Dictator's")],
            suffixes: [],
        };
        draft.items[1].catalog = {
            base,
            level: 83,
            prefixes: [affix("Flaring")],
            suffixes: [affix("of the Brute"), affix("of Skill")].slice(0, suffixCount),
        };
        const required = ["Merciless", "Dictator's", "Flaring"].map((name) => affix(name).id);
        expect(
            chance(calculateRecombinatorPlan(parseRecombinatorDraft(draft, catalog))[0], required),
        ).toBeCloseTo(10 / 101);
        draft.steps[0].rightPreparation = availablePreparationRecipes(
            catalog,
            [base],
            "essence",
        ).find((recipe) => recipe.name === "Screaming Essence of Torment")!.id;
        draft.steps[0].rightKeepInputMods = true;
        const parsed = parseRecombinatorDraft(draft, catalog);
        const result = calculateRecombinatorPlan(parsed)[0];
        expect(chance(result, required)).toBeCloseTo(31 / 101);
        expect(chance(result, [parsed.steps[0].rightPreparation!.affix.id])).toBe(0);
        expect(result.outcomes.every(({ item }) => item.suffixes.length <= suffixCount)).toBe(true);
        draft.steps[0].rightKeepInputMods = false;
        expect(
            chance(calculateRecombinatorPlan(parseRecombinatorDraft(draft, catalog))[0], required),
        ).toBe(0);
    });

    it("offers the extracted wailing Doubt mod as an INT-shield NNN, but not a native evasion recipe", () => {
        const recipes = availablePreparationRecipes(catalog, [shield], "essence");
        const doubt = recipes.find((recipe) => recipe.name === "Wailing Essence of Doubt")!;
        expect(doubt.mod).toBe("LocalIncreasedEvasionRating7_");
        const evasion = bases.find((base) => base.id === "generic:Shield:dex")!;
        expect(
            availablePreparationRecipes(catalog, [evasion], "essence").some(
                (recipe) => recipe.id === doubt.id,
            ),
        ).toBe(false);
        expect(
            nativeWeight(
                catalogModAffix(catalog.mods.find((mod) => mod.id === doubt.mod)!),
                shield,
            ),
        ).toBe(0);
    });

    it("resolves stage recipes from the generated catalog and rejects pending or stale selections", () => {
        const draft = structuredClone(emptyRecombinatorDraft);
        for (const entry of draft.items)
            entry.catalog = { base: shield, level: 86, prefixes: [], suffixes: [] };
        const recipe = availablePreparationRecipes(catalog, [shield], "bench")[0];
        expect(recipe).toBeDefined();
        draft.steps[0].leftPreparation = recipe.id;
        const parsed = parseRecombinatorDraft(draft, catalog);
        expect(parsed.steps[0].leftPreparation?.affix).toMatchObject({
            id: `poe1:${recipe.mod}`,
            exclusive: true,
            crafted: true,
        });
        draft.steps[0].leftPreparation = "pending:essence";
        expect(() => parseRecombinatorDraft(draft, catalog)).toThrow("Choose a preparation recipe");
        draft.steps[0].leftPreparation = "missing";
        expect(() => parseRecombinatorDraft(draft, catalog)).toThrow("unavailable");
    });
});

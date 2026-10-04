import { describe, expect, it } from "vite-plus/test";
import {
    AFFIX_COUNT_WEIGHTS,
    calculateRecombinatorPlan,
    matchesTarget,
    summarizeCounts,
} from "~/lib/recombinator";
import { exampleRecombinatorDraft, parseRecombinatorDraft } from "~/lib/recombinator-plan";
import { parseAffixes, type RecombinatorItem, type RecombinatorPlan } from "~/schemas/recombinator";

const item = (prefixes = "", suffixes = ""): RecombinatorItem => ({
    prefixes: parseAffixes(prefixes),
    suffixes: parseAffixes(suffixes),
});

function plan(left: RecombinatorItem, right: RecombinatorItem): RecombinatorPlan {
    return {
        items: [
            { id: "a", name: "A", item: left },
            { id: "b", name: "B", item: right },
        ],
        steps: [{ id: "combine", name: "Combine", left: "a", right: "b" }],
    };
}

function outcomes(left: RecombinatorItem, right: RecombinatorItem) {
    return calculateRecombinatorPlan(plan(left, right))[0].outcomes;
}

describe("recombinator probabilities", () => {
    it.each([0, 1, 2, 3, 4, 5, 6])("normalizes the published %i-input column", (count) => {
        const mods = Array.from({ length: count }, (_, index) => `P${index}`);
        const result = outcomes(item(mods.slice(0, 3).join("\n")), item(mods.slice(3).join("\n")));
        const weights = AFFIX_COUNT_WEIGHTS[count];
        const total = weights.reduce((sum, value) => sum + value, 0);
        expect(result.reduce((sum, outcome) => sum + outcome.probability, 0)).toBeCloseTo(1, 12);
        for (let kept = 0; kept <= 3; kept++) {
            const probability = result
                .filter(({ item }) => item.prefixes.length === kept)
                .reduce((sum, outcome) => sum + outcome.probability, 0);
            expect(probability).toBeCloseTo(weights[kept] / total, 12);
        }
    });

    it("gives two distinct single prefixes a 33% chance to keep both", () => {
        const result = outcomes(item("A"), item("B"));
        expect(result.find(({ item }) => item.prefixes.length === 2)?.probability).toBeCloseTo(
            0.33,
            12,
        );
        expect(
            result
                .filter(({ item }) => item.prefixes.length === 1)
                .map(({ probability }) => probability),
        ).toEqual([0.335, 0.335]);
    });

    it("handles the isolated 1p + 1s exception without a blank outcome", () => {
        const result = outcomes(item("Life"), item("", "Fire"));
        expect(result).toHaveLength(3);
        for (const outcome of result) expect(outcome.probability).toBeCloseTo(1 / 3, 12);
        expect(result.some(({ item }) => item.prefixes.length + item.suffixes.length === 0)).toBe(
            false,
        );
        expect(outcomes(item("", "Fire"), item("Life"))).toEqual(result);
    });

    it("does not apply the isolated exception to a two-mod item plus a blank item", () => {
        const result = outcomes(item("Life", "Fire"), item());
        expect(
            result.find(({ item }) => !item.prefixes.length && !item.suffixes.length)?.probability,
        ).toBeCloseTo(0.41 ** 2, 12);
    });

    it("reproduces the guide's 2p + 2s four-affix probability", () => {
        const result = outcomes(item("A\nB"), item("", "C\nD"));
        const counts = summarizeCounts(result);
        expect(
            counts.find((count) => count.prefixes === 2 && count.suffixes === 2)?.probability,
        ).toBeCloseTo(0.1089, 12);
        expect(
            counts.find((count) => count.prefixes === 1 && count.suffixes === 1)?.probability,
        ).toBeCloseTo(0.4489, 12);
    });

    it("counts doubled mods as two inputs but keeps only one copy", () => {
        expect(outcomes(item("A"), item("A"))).toEqual([{ item: item("A"), probability: 1 }]);
        const result = outcomes(item("A"), item("A\nB"));
        expect(result.find(({ item }) => item.prefixes.length === 2)?.probability).toBeCloseTo(
            62 / 101,
            12,
        );
        expect(
            result.find(({ item }) => item.prefixes.length === 1 && item.prefixes[0].id === "A")
                ?.probability,
        ).toBeCloseTo(((39 / 101) * 2) / 3, 12);
    });

    it("removes conflicting tiers from selection without losing probability", () => {
        const result = outcomes(item("T1 life | life\nMana"), item("T2 life | life"));
        expect(result.reduce((sum, outcome) => sum + outcome.probability, 0)).toBeCloseTo(1, 12);
        expect(
            result.every(
                ({ item }) => item.prefixes.filter((affix) => affix.group === "life").length <= 1,
            ),
        ).toBe(true);
        expect(
            result
                .filter(({ item }) => item.prefixes.length === 2)
                .reduce((sum, outcome) => sum + outcome.probability, 0),
        ).toBeCloseTo(62 / 101, 12);
    });

    it("propagates the chance of earlier failures through later steps", () => {
        const recipe = plan(item("A"), item("B"));
        recipe.items.push({ id: "c", name: "C", item: item("C") });
        recipe.steps.push({ id: "finish", name: "Finish", left: "combine", right: "c" });
        const result = calculateRecombinatorPlan(recipe)[1].outcomes;
        expect(result.find(({ item }) => item.prefixes.length === 3)?.probability).toBeCloseTo(
            (0.33 * 10) / 101,
            12,
        );
        expect(result.reduce((sum, outcome) => sum + outcome.probability, 0)).toBeCloseTo(1, 12);
    });

    it("combines independent copies of an earlier recipe", () => {
        const recipe = plan(item("A"), item("B"));
        recipe.steps.push({ id: "finish", name: "Finish", left: "combine", right: "combine" });
        const result = calculateRecombinatorPlan(recipe)[1].outcomes;
        const both = (0.33 ** 2 * 90) / 101 + (4 * 0.33 * 0.335 * 62) / 101 + 2 * 0.335 ** 2 * 0.33;
        expect(result.find(({ item }) => item.prefixes.length === 2)?.probability).toBeCloseTo(
            both,
            12,
        );
    });

    it("keeps the example's full distributions normalized and respects the three-mod cap", () => {
        for (const { outcomes } of calculateRecombinatorPlan(
            parseRecombinatorDraft(exampleRecombinatorDraft),
        )) {
            expect(outcomes.reduce((sum, outcome) => sum + outcome.probability, 0)).toBeCloseTo(
                1,
                12,
            );
            for (const { item, probability } of outcomes) {
                expect(item.prefixes.length).toBeLessThanOrEqual(3);
                expect(item.suffixes.length).toBeLessThanOrEqual(3);
                expect(probability).toBeGreaterThan(0);
            }
        }
    });

    it("does not mutate its input plan", () => {
        const recipe = parseRecombinatorDraft(exampleRecombinatorDraft);
        const before = structuredClone(recipe);
        calculateRecombinatorPlan(recipe);
        expect(recipe).toEqual(before);
    });

    it("supports contains and exact target matching, including an empty target", () => {
        const result = item("Life", "Fire");
        expect(matchesTarget(result, ["Life"])).toBe(true);
        expect(matchesTarget(result, ["Life"], true)).toBe(false);
        expect(matchesTarget(result, ["Life", "Fire"], true)).toBe(true);
        expect(matchesTarget(result, ["Cold"])).toBe(false);
        expect(matchesTarget(result, [])).toBe(true);
        expect(matchesTarget(result, [], true)).toBe(false);
        expect(matchesTarget(item(), [], true)).toBe(true);
    });
});

describe("recombinator validation", () => {
    it("stops a large plan explicitly instead of returning truncated probabilities", () => {
        const recipe = plan(item("A\nB\nC", "D\nE\nF"), item("G\nH\nI", "J\nK\nL"));
        recipe.items.push({ id: "c", name: "C", item: item("M\nN\nO", "P\nQ\nR") });
        recipe.steps.push({ id: "finish", name: "Finish", left: "combine", right: "c" });
        expect(() => calculateRecombinatorPlan(recipe)).toThrow(/No outcomes have been discarded/);
    });

    it("parses labels, optional groups and exclusive modifiers", () => {
        expect(parseAffixes(" *Essence reservation | reservation \r\n\nLife ")).toEqual([
            { id: "Essence reservation", group: "reservation", exclusive: true, nonNative: false },
            { id: "Life", group: "Life", exclusive: false, nonNative: false },
        ]);
        expect(() => parseAffixes("A | B | C")).toThrow();
        expect(() => parseAffixes("* ")).toThrow();
        expect(() => parseAffixes("A | ")).toThrow();
    });

    it("counts manually marked NNN mods, then excludes them from selection", () => {
        expect(parseAffixes("!Suppression | suppression")[0]).toEqual({
            id: "Suppression",
            group: "suppression",
            exclusive: false,
            nonNative: true,
        });
        expect(parseAffixes("*!Essence")).toEqual(parseAffixes("!*Essence"));
        const recipe = plan(item("!Life"), item("Armour"));
        recipe.steps.push({ id: "finish", name: "Finish", left: "combine", right: "b" });
        const results = calculateRecombinatorPlan(recipe);
        expect(results[0].outcomes).toEqual([{ item: item("Armour"), probability: 1 }]);
        const life = results[1].outcomes
            .flatMap(({ item }) => item.prefixes)
            .filter((affix) => affix.id === "Life");
        expect(life).toHaveLength(0);
        expect(() => outcomes(item("!Life"), item("Life"))).toThrow(/modifier flags/);
    });

    it("rejects too many affixes and conflicting groups on one item", () => {
        expect(() => outcomes(item("A\nB\nC\nD"), item())).toThrow();
        expect(() => outcomes(item("A | life\nB | life"), item())).toThrow(/same mod group/);
    });

    it("supports one exclusive modifier but rejects multiple copies in a pair", () => {
        expect(outcomes(item("*Essence"), item("A"))).toHaveLength(3);
        expect(() => outcomes(item("*Essence"), item("*Essence"))).toThrow(
            /more than one exclusive/,
        );
        expect(() => outcomes(item("*Essence"), item("", "*Aspect"))).toThrow(
            /[Mm]ore than one exclusive/,
        );
    });

    it("rejects unsupported exclusive combinations reached by a later step", () => {
        const recipe = plan(item("*Essence"), item("A"));
        recipe.steps.push({ id: "finish", name: "Finish", left: "combine", right: "a" });
        expect(() => calculateRecombinatorPlan(recipe)).toThrow(/Finish:.*exclusive/);
    });

    it("rejects inconsistent definitions, forward references and duplicate IDs", () => {
        expect(() => outcomes(item("Life"), item("", "Life"))).toThrow(/same affix type/);
        expect(() => outcomes(item("Life"), item("Life | other"))).toThrow(/same affix type/);
        const recipe = plan(item("A"), item("B"));
        recipe.steps[0].left = "combine";
        expect(() => calculateRecombinatorPlan(recipe)).toThrow(/earlier step/);
        recipe.steps[0].left = "missing";
        expect(() => calculateRecombinatorPlan(recipe)).toThrow(/earlier step/);
        recipe.steps[0].left = "a";
        recipe.steps[0].id = "a";
        expect(() => calculateRecombinatorPlan(recipe)).toThrow(/unique IDs/);
    });
});

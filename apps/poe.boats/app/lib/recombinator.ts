import {
    type RecombinatorAffix,
    type RecombinatorItem,
    type RecombinatorPlan,
    recombinatorItemSchema,
    recombinatorPlanSchema,
    sharesAffixGroup,
} from "~/schemas/recombinator";

export const RECOMBINATOR_GUIDE_URL =
    "https://codeberg.org/poe_notes/poe_notes/src/branch/main/Recombinators-dark-images.md";
export const RECOMBINATOR_TABLE_URL =
    "https://www.reddit.com/r/pathofexile/comments/1exyavx/325_updated_guide_to_recombinators/";
export const RECOMBINATOR_PREPARATION_URL =
    "https://www.reddit.com/r/pathofexile/comments/1ljll69/using_recombination_and_essences_for_guaranteed/";
export const RECOMBINATOR_EXCLUSIVE_URL =
    "https://www.reddit.com/r/pathofexile/comments/1lfyxxd/326_recombinators_analysisguide/";

// The measured table rounds the 3- and 4-input columns to 101%. Normalize each column.
export const AFFIX_COUNT_WEIGHTS: readonly (readonly number[])[] = [
    [100, 0, 0, 0],
    [41, 59, 0, 0],
    [0, 67, 33, 0],
    [0, 39, 52, 10],
    [0, 11, 59, 31],
    [0, 0, 43, 57],
    [0, 0, 28, 72],
];

export type RecombinatorOutcome = { item: RecombinatorItem; probability: number };
export type RecombinatorStepResult = { id: string; outcomes: RecombinatorOutcome[] };
type Selection = { affixes: RecombinatorAffix[]; probability: number };

export function outcomeKey(item: RecombinatorItem): string {
    return JSON.stringify([
        item.prefixes.map((affix) => affix.id).sort(),
        item.suffixes.map((affix) => affix.id).sort(),
        item.base?.id,
    ]);
}

export function nativeWeight(affix: RecombinatorAffix, base?: RecombinatorItem["base"]): number {
    if (affix.nonNative) return 0;
    if (affix.exclusive || !affix.spawn || !base) return 1000;
    return affix.spawn.find(([tag]) => base.tags.includes(tag))?.[1] ?? 0;
}

function selectAffixes(
    pool: RecombinatorAffix[],
    count: number,
    weight: (affix: RecombinatorAffix) => number,
): Selection[] {
    const results = new Map<string, Selection>();
    function draw(
        remaining: RecombinatorAffix[],
        selected: RecombinatorAffix[],
        probability: number,
    ) {
        if (selected.length === count || remaining.length === 0) {
            const affixes = selected.toSorted((a, b) => a.id.localeCompare(b.id));
            const key = JSON.stringify(affixes.map((affix) => affix.id));
            const existing = results.get(key);
            if (existing) existing.probability += probability;
            else results.set(key, { affixes, probability });
            return;
        }
        // Duplicate copies each get a draw, then every member of the selected group is removed.
        const total = remaining.reduce((sum, affix) => sum + weight(affix), 0);
        for (const affix of remaining) {
            draw(
                remaining.filter(
                    (candidate) =>
                        !sharesAffixGroup(candidate, affix) &&
                        !(affix.exclusive && candidate.exclusive),
                ),
                [...selected, affix],
                (probability * weight(affix)) / total,
            );
        }
    }
    draw(pool, [], 1);
    return [...results.values()];
}

function sideOutcomes(
    pool: RecombinatorAffix[],
    base?: RecombinatorItem["base"],
    excludeExclusive = false,
    weighted = false,
): Selection[] {
    const weights = AFFIX_COUNT_WEIGHTS[pool.length];
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    return weights.flatMap((weight, count) =>
        weight === 0
            ? []
            : selectAffixes(
                  pool.filter(
                      (affix) =>
                          nativeWeight(affix, base) > 0 && !(excludeExclusive && affix.exclusive),
                  ),
                  count,
                  (affix) => (weighted ? nativeWeight(affix, base) : 1),
              ).map((selection) => ({
                  ...selection,
                  probability: (selection.probability * weight) / total,
              })),
    );
}

function mergeOutcome(
    results: Map<string, RecombinatorOutcome>,
    item: RecombinatorItem,
    probability: number,
) {
    const key = outcomeKey(item);
    const existing = results.get(key);
    if (existing) existing.probability += probability;
    else results.set(key, { item, probability });
}

export function recombineOnBase(
    left: RecombinatorItem,
    right: RecombinatorItem,
    base?: RecombinatorItem["base"],
): RecombinatorOutcome[] {
    const prefixes = [...left.prefixes, ...right.prefixes];
    const suffixes = [...left.suffixes, ...right.suffixes];
    if (prefixes.some((prefix) => suffixes.some((suffix) => sharesAffixGroup(prefix, suffix)))) {
        throw new Error(
            "A mod group appears in both prefixes and suffixes. This model does not support that combination; use compatible bases and modifier groups.",
        );
    }
    const magicWithCrafts = [left, right].every(
        (item) =>
            item.prefixes.length === 1 &&
            item.suffixes.length === 1 &&
            [...item.prefixes, ...item.suffixes].some((affix) => affix.exclusive && affix.crafted),
    );
    if (
        !magicWithCrafts &&
        [prefixes, suffixes].some((pool) => pool.filter((affix) => affix.exclusive).length > 1)
    ) {
        throw new Error(
            "This step can combine more than one exclusive modifier on the same affix side. Only two one-mod magic items with an exclusive bench craft each support this setup.",
        );
    }
    if (
        [...prefixes, ...suffixes].filter((affix) => affix.exclusive).length === 2 &&
        (prefixes.length !== 2 ||
            suffixes.length !== 2 ||
            [left, right].some((item) => item.prefixes.length !== 1 || item.suffixes.length !== 1))
    ) {
        throw new Error(
            "More than one exclusive modifier is supported only for two one-mod magic items with opposite-side bench crafts.",
        );
    }
    const isolatedOpposites =
        prefixes.length === 1 &&
        suffixes.length === 1 &&
        left.prefixes.length + left.suffixes.length === 1 &&
        right.prefixes.length + right.suffixes.length === 1 &&
        [...prefixes, ...suffixes].every((affix) => !affix.exclusive);
    if (isolatedOpposites) {
        const eligiblePrefixes = prefixes.filter((affix) => nativeWeight(affix, base) > 0);
        const eligibleSuffixes = suffixes.filter((affix) => nativeWeight(affix, base) > 0);
        const results = new Map<string, RecombinatorOutcome>();
        for (const item of [
            { prefixes: eligiblePrefixes, suffixes: eligibleSuffixes },
            { prefixes: eligiblePrefixes, suffixes: [] },
            { prefixes: [], suffixes: eligibleSuffixes },
        ])
            mergeOutcome(results, { ...item, ...(base ? { base } : {}) }, 1 / 3);
        return [...results.values()];
    }
    const results = new Map<string, RecombinatorOutcome>();
    const weighted = [...prefixes, ...suffixes].some((affix) => affix.exclusive);
    // Exclusive crafts on opposite sides use the researched 50/50 side-order estimate.
    const orders: ("prefixes" | "suffixes")[] = weighted ? ["prefixes", "suffixes"] : ["prefixes"];
    for (const first of orders) {
        const second = first === "prefixes" ? "suffixes" : "prefixes";
        const pools = { prefixes, suffixes };
        for (const a of sideOutcomes(pools[first], base, false, weighted)) {
            for (const b of sideOutcomes(
                pools[second],
                base,
                a.affixes.some((affix) => affix.exclusive),
                weighted,
            )) {
                const item: RecombinatorItem = {
                    prefixes: [],
                    suffixes: [],
                    ...(base ? { base } : {}),
                };
                item[first] = a.affixes;
                item[second] = b.affixes;
                mergeOutcome(results, item, (a.probability * b.probability) / orders.length);
            }
        }
    }
    return [...results.values()];
}

function recombine(left: RecombinatorItem, right: RecombinatorItem): RecombinatorOutcome[] {
    if (!left.base && !right.base) return recombineOnBase(left, right);
    if (!left.base || !right.base)
        throw new Error("Choose a base for both inputs to model base transfer.");
    if (left.base.itemClass !== right.base.itemClass)
        throw new Error("Choose inputs from the same item class for base transfer.");
    const results = new Map<string, RecombinatorOutcome>();
    for (const base of [left.base, right.base]) {
        for (const outcome of recombineOnBase(left, right, base))
            mergeOutcome(results, outcome.item, outcome.probability / 2);
    }
    return [...results.values()];
}

type Preparation = RecombinatorPlan["steps"][number]["leftPreparation"];
export function prepareRecombinatorItem(
    item: RecombinatorItem,
    preparation: Preparation,
): RecombinatorItem {
    if (!preparation) return item;
    if (!item.base || !preparation.itemClasses.includes(item.base.itemClass))
        throw new Error("This preparation recipe is not valid for the input base.");
    const { kind, side, affix } = preparation;
    if (kind === "essence" && !preparation.keepInputMods) {
        return { base: item.base, prefixes: [], suffixes: [], [side]: [affix] };
    }
    if (
        kind === "essence" &&
        [...item.prefixes, ...item.suffixes].some(
            (entry) => entry.crafted || entry.exclusive || nativeWeight(entry, item.base) === 0,
        )
    )
        throw new Error(
            "Only natural modifiers eligible on the donor base can be kept with an essence.",
        );
    if ([...item.prefixes, ...item.suffixes].some((entry) => entry.crafted))
        throw new Error("Remove existing crafted modifiers before adding a bench craft.");
    const result = recombinatorItemSchema.safeParse({ ...item, [side]: [...item[side], affix] });
    if (!result.success)
        throw new Error(
            `This ${kind === "essence" ? "essence donor" : "bench craft"} needs an open affix slot and a free mod group on every input outcome.`,
        );
    return result.data;
}

export function calculateRecombinatorPlan(input: RecombinatorPlan): RecombinatorStepResult[] {
    const plan = recombinatorPlanSchema.parse(input);
    const sources = new Map<string, RecombinatorOutcome[]>(
        plan.items.map(({ id, item }) => [id, [{ item, probability: 1 }]]),
    );
    const cache = new Map<string, RecombinatorOutcome[]>();
    let work = 0;
    const results: RecombinatorStepResult[] = [];
    for (const step of plan.steps) {
        const outcomes = new Map<string, RecombinatorOutcome>();
        try {
            for (const left of sources.get(step.left)!) {
                for (const right of sources.get(step.right)!) {
                    const preparedLeft = prepareRecombinatorItem(left.item, step.leftPreparation);
                    const preparedRight = prepareRecombinatorItem(
                        right.item,
                        step.rightPreparation,
                    );
                    const key = JSON.stringify(
                        [outcomeKey(preparedLeft), outcomeKey(preparedRight)].sort(),
                    );
                    let combined = cache.get(key);
                    if (!combined) {
                        combined = recombine(preparedLeft, preparedRight);
                        cache.set(key, combined);
                    }
                    work += combined.length;
                    if (work > 1_000_000 || cache.size > 10_000) {
                        throw new Error(
                            "This plan has too many combinations. Use fewer distinct modifiers or fewer steps. No outcomes have been discarded.",
                        );
                    }
                    for (const outcome of combined) {
                        mergeOutcome(
                            outcomes,
                            step.removeCrafted
                                ? {
                                      ...outcome.item,
                                      prefixes: outcome.item.prefixes.filter(
                                          (affix) => !affix.crafted,
                                      ),
                                      suffixes: outcome.item.suffixes.filter(
                                          (affix) => !affix.crafted,
                                      ),
                                  }
                                : outcome.item,
                            left.probability * right.probability * outcome.probability,
                        );
                    }
                    if (outcomes.size > 5_000) {
                        throw new Error(
                            "This step exceeds 5,000 distinct outcomes. Simplify the plan. No outcomes have been discarded.",
                        );
                    }
                }
            }
        } catch (error) {
            throw new Error(
                `${step.name}: ${error instanceof Error ? error.message : "Calculation failed."}`,
            );
        }
        const distribution = [...outcomes.values()].sort((a, b) => b.probability - a.probability);
        sources.set(step.id, distribution);
        results.push({ id: step.id, outcomes: distribution });
    }
    return results;
}

export function matchesTarget(item: RecombinatorItem, required: string[], exact = false): boolean {
    const ids = [...item.prefixes, ...item.suffixes].map((affix) => affix.id);
    return required.every((id) => ids.includes(id)) && (!exact || ids.length === required.length);
}

export function summarizeCounts(outcomes: RecombinatorOutcome[]) {
    const counts = new Map<string, { prefixes: number; suffixes: number; probability: number }>();
    for (const { item, probability } of outcomes) {
        const prefixes = item.prefixes.length;
        const suffixes = item.suffixes.length;
        const key = `${prefixes}/${suffixes}`;
        const existing = counts.get(key);
        if (existing) existing.probability += probability;
        else counts.set(key, { prefixes, suffixes, probability });
    }
    return [...counts.values()].sort(
        (a, b) => b.prefixes + b.suffixes - a.prefixes - a.suffixes || b.prefixes - a.prefixes,
    );
}

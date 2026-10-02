import {
    type RecombinatorAffix,
    type RecombinatorItem,
    type RecombinatorPlan,
    recombinatorPlanSchema,
} from "~/schemas/recombinator";

export const RECOMBINATOR_GUIDE_URL =
    "https://codeberg.org/poe_notes/poe_notes/src/branch/main/Recombinators-dark-images.md";
export const RECOMBINATOR_TABLE_URL =
    "https://www.reddit.com/r/pathofexile/comments/1exyavx/325_updated_guide_to_recombinators/";

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
    ]);
}

function selectAffixes(pool: RecombinatorAffix[], count: number): Selection[] {
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
        for (const affix of remaining) {
            draw(
                remaining.filter((candidate) => candidate.group !== affix.group),
                [...selected, affix],
                probability / remaining.length,
            );
        }
    }
    draw(pool, [], 1);
    return [...results.values()];
}

function sideOutcomes(pool: RecombinatorAffix[]): Selection[] {
    const weights = AFFIX_COUNT_WEIGHTS[pool.length];
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    return weights.flatMap((weight, count) =>
        weight === 0
            ? []
            : selectAffixes(pool, count).map((selection) => ({
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

function recombine(left: RecombinatorItem, right: RecombinatorItem): RecombinatorOutcome[] {
    const prefixes = [...left.prefixes, ...right.prefixes];
    const suffixes = [...left.suffixes, ...right.suffixes];
    if ([...prefixes, ...suffixes].filter((affix) => affix.exclusive).length > 1) {
        throw new Error(
            "This step can combine more than one exclusive modifier (including duplicate copies). The guide does not model those odds; remove the extra exclusive modifier.",
        );
    }
    const isolatedOpposites =
        prefixes.length === 1 &&
        suffixes.length === 1 &&
        left.prefixes.length + left.suffixes.length === 1 &&
        right.prefixes.length + right.suffixes.length === 1;
    if (isolatedOpposites) {
        return [
            { item: { prefixes, suffixes }, probability: 1 / 3 },
            { item: { prefixes, suffixes: [] }, probability: 1 / 3 },
            { item: { prefixes: [], suffixes }, probability: 1 / 3 },
        ];
    }
    const results = new Map<string, RecombinatorOutcome>();
    const prefixOutcomes = sideOutcomes(prefixes);
    const suffixOutcomes = sideOutcomes(suffixes);
    for (const prefix of prefixOutcomes) {
        for (const suffix of suffixOutcomes) {
            mergeOutcome(
                results,
                { prefixes: prefix.affixes, suffixes: suffix.affixes },
                prefix.probability * suffix.probability,
            );
        }
    }
    return [...results.values()];
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
                    const key = JSON.stringify(
                        [outcomeKey(left.item), outcomeKey(right.item)].sort(),
                    );
                    let combined = cache.get(key);
                    if (!combined) {
                        combined = recombine(left.item, right.item);
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
                            outcome.item,
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

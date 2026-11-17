import { CLUSTER_RECIPE_INPUTS, CLUSTER_RECIPE_SIZES } from "~/data/cluster-jewel-recipe";
import {
    type ClusterRecipeOptions,
    ClusterRecipeOptionsSchema,
    type ClusterRecipeSizeResult,
    type ClusterRecipeSnapshot,
    ClusterRecipeSnapshotSchema,
} from "~/schemas/arbitrage";

function median(values: number[]) {
    const sorted = values.toSorted((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * The expected value of selling five Cluster Jewels of one size for a random one, for each size.
 * Every rollable enchantment and passive count is assumed equally likely, since spawn weights are
 * not published; unpriced outcomes count as worth nothing. Sale values lose the buffer and input
 * costs gain it, as in the other recipes.
 */
export function calculateClusterRecipe(
    snapshot: ClusterRecipeSnapshot,
    options: ClusterRecipeOptions,
): { sizes: ClusterRecipeSizeResult[] } {
    const { quotes } = ClusterRecipeSnapshotSchema.parse(snapshot);
    const { buffer } = ClusterRecipeOptionsSchema.parse(options);
    const sale = 1 - buffer / 100;
    const purchase = 1 + buffer / 100;

    const sizes = CLUSTER_RECIPE_SIZES.map(({ baseType, outcomes }) => {
        const priced = outcomes.map((outcome) => ({
            ...outcome,
            value: quotes[outcome.id]?.value ?? null,
            listingCount: quotes[outcome.id]?.listingCount ?? 0,
        }));
        const count = priced.length;
        const asks = priced.map((outcome) => outcome.value ?? 0);
        const total = asks.reduce((sum, ask) => sum + ask, 0);
        const top = Math.max(...asks);
        const expectedValue = (total / count) * sale;
        const breakEvenInput = expectedValue / (CLUSTER_RECIPE_INPUTS * purchase);

        const offered = asks.filter((ask) => ask > 0);
        const cheapestInput = offered.length ? Math.min(...offered) : null;
        const cost =
            cheapestInput === null ? null : cheapestInput * CLUSTER_RECIPE_INPUTS * purchase;
        const profit = cost === null ? null : expectedValue - cost;

        // Keep outputs asking `below` or more and craft again with the rest, so each craft uses
        // that many fewer fresh inputs. Unpriced outputs always go back in.
        let recycled = { below: 0, breakEvenInput };
        for (const below of new Set(offered)) {
            const kept = asks.filter((ask) => ask >= below);
            const fresh = CLUSTER_RECIPE_INPUTS - (count - kept.length) / count;
            const value = (kept.reduce((sum, ask) => sum + ask, 0) / count) * sale;
            const perInput = value / (fresh * purchase);
            if (perInput > recycled.breakEvenInput) recycled = { below, breakEvenInput: perInput };
        }

        return {
            baseType,
            outcomeCount: count,
            pricedCount: offered.length,
            expectedValue,
            expectedValueWithoutTop: ((total - top) / count) * sale,
            medianValue: median(asks) * sale,
            breakEvenInput,
            cheapestInput,
            cost,
            profit,
            roi: cost === null || profit === null ? null : (profit / cost) * 100,
            chanceAboveCost:
                cost === null ? null : asks.filter((ask) => ask * sale >= cost).length / count,
            recycled,
            outcomes: priced
                .map(({ id, label, passives, value, listingCount }) => ({
                    id,
                    label,
                    passives,
                    value,
                    listingCount,
                    share: total ? (value ?? 0) / total : 0,
                }))
                .sort(
                    (a, b) =>
                        (b.value ?? 0) - (a.value ?? 0) ||
                        a.label.localeCompare(b.label) ||
                        a.passives - b.passives,
                ),
        };
    });
    return { sizes };
}

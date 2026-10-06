import type { CraftingCatalog } from "../schemas/crafting";
import type { PoolEntry, Weighted } from "./crafting-engine";

export function revealCountWeights(game: CraftingCatalog["game"]): Weighted<number>[] {
    return game === "poe2"
        ? [
              { value: 1, weight: 80 },
              { value: 2, weight: 15 },
              { value: 3, weight: 5 },
          ]
        : [{ value: 3, weight: 1 }];
}

export function revealChoiceProbabilities(
    game: CraftingCatalog["game"],
    pools: { exclusive: PoolEntry[]; ordinary: PoolEntry[] },
    tag?: string,
) {
    const buckets = new Map<
        string,
        {
            entries: PoolEntry[];
            groups: string[];
            exclusive: boolean;
            guaranteed: boolean;
            weight: number;
        }
    >();
    for (const source of ["exclusive", "ordinary"] as const) {
        for (const entry of pools[source]) {
            const groups = [...entry.mod.groups].sort();
            const guaranteed = Boolean(tag && entry.mod.implicit_tags.includes(tag));
            const key = JSON.stringify([source, groups.length ? groups : entry.id, guaranteed]);
            const bucket = buckets.get(key) ?? {
                entries: [],
                groups,
                exclusive: source === "exclusive",
                guaranteed,
                weight: 0,
            };
            bucket.entries.push(entry);
            bucket.weight += entry.weight;
            buckets.set(key, bucket);
        }
    }
    // Tiers with identical blocking groups have the same future choices after being picked.
    const entries = [...buckets.values()];
    const conflicts = entries.map(
        (entry, index) =>
            new Set(
                entries.flatMap((other, otherIndex) =>
                    index === otherIndex ||
                    other.groups.some((group) => entry.groups.includes(group))
                        ? [otherIndex]
                        : [],
                ),
            ),
    );
    const probabilities = entries.map(() => 0);
    function visit(
        remaining: number[],
        picked: number,
        exclusiveCount: number,
        probability: number,
    ) {
        let candidates =
            picked < exclusiveCount ? remaining.filter((index) => entries[index]!.exclusive) : [];
        if (!candidates.length)
            candidates = remaining.filter((index) => !entries[index]!.exclusive);
        if (
            !picked &&
            candidates.some((index) => entries[index]!.exclusive && entries[index]!.guaranteed)
        )
            candidates = candidates.filter((index) => entries[index]!.guaranteed);
        const total = candidates.reduce((sum, index) => sum + entries[index]!.weight, 0);
        for (const index of candidates) {
            const chance = (probability * entries[index]!.weight) / total;
            probabilities[index]! += chance;
            if (picked < 2)
                visit(
                    remaining.filter((other) => !conflicts[index]!.has(other)),
                    picked + 1,
                    exclusiveCount,
                    chance,
                );
        }
    }
    const counts = revealCountWeights(game);
    const total = counts.reduce((sum, entry) => sum + entry.weight, 0);
    for (const { value, weight } of counts)
        visit(
            entries.map((_, index) => index),
            0,
            value,
            weight / total,
        );
    return new Map(
        entries.flatMap((bucket, index) =>
            bucket.entries.map(
                (entry) =>
                    [
                        entry.id,
                        Math.min(1, (probabilities[index]! * entry.weight) / bucket.weight),
                    ] as const,
            ),
        ),
    );
}

/**
 * Splits a page's changes so each stash appears at most once per round. Rounds run in order, so a
 * stash changed twice in one page still sees its first change applied before its second.
 */
export function stashRounds<T extends { id: string }>(changes: readonly T[]): T[][] {
    const rounds: T[][] = [];
    const seen = new Map<string, number>();
    for (const change of changes) {
        const round = seen.get(change.id) ?? 0;
        seen.set(change.id, round + 1);
        if (!rounds[round]) rounds[round] = [];
        rounds[round].push(change);
    }
    return rounds;
}

/** `$n` placeholders for an `IN (...)` list; DuckDB binds no array parameter to `IN`. */
export function params(values: readonly unknown[], first = 1) {
    return values.map((_, index) => `$${index + first}`).join(",");
}

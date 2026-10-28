export interface ModifierPoolMember {
    id: string;
    weight: number;
}

export function modifierLevelBands(
    changes: Iterable<number>,
    pool: (level: number) => ModifierPoolMember[],
): Array<{ min: number; max: number }> {
    const levels = [...new Set([1, ...changes])]
        .filter((level) => Number.isInteger(level) && level >= 1 && level <= 100)
        .sort((a, b) => a - b);
    const bands: Array<{ min: number; max: number }> = [];
    let previous: string | undefined;
    for (const [index, level] of levels.entries()) {
        const signature = JSON.stringify(
            pool(level)
                .map(({ id, weight }) => [id, weight])
                .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
        );
        const max = (levels[index + 1] ?? 101) - 1;
        const last = bands.at(-1);
        if (last && signature === previous) last.max = max;
        else bands.push({ min: level, max });
        previous = signature;
    }
    return bands;
}

/**
 * Merges each band starting above `floor` into the band before it unless its first level unlocks
 * at least `share` of the top-tier modifier weight that becomes available above `floor` and is
 * among the highest `splits` such levels, so lower levels group together and at most
 * `splits + 1` bands reach above `floor`. `unlocked(level)` is the weight of the top tiers first
 * available at that level.
 */
export function significantLevelBands(
    bands: Array<{ min: number; max: number }>,
    floor: number,
    unlocked: (level: number) => number,
    share: number,
    splits: number,
): Array<{ min: number; max: number }> {
    const above = bands.filter((band) => band.min > floor);
    const total = above.reduce((sum, band) => sum + unlocked(band.min), 0);
    const kept = new Set(
        above
            .map((band) => band.min)
            .filter((level) => total && unlocked(level) >= share * total)
            .sort((a, b) => b - a)
            .slice(0, splits),
    );
    const merged: Array<{ min: number; max: number }> = [];
    for (const band of bands) {
        const last = merged.at(-1);
        if (last && band.min > floor && !kept.has(band.min)) last.max = band.max;
        else merged.push({ ...band });
    }
    return merged;
}

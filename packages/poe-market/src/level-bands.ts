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

import type { CraftingTarget } from "../schemas/crafting";

export function targetEntries(
    target: CraftingTarget,
    path: number[] = [],
): {
    target: CraftingTarget;
    path: number[];
}[] {
    return [
        { target, path },
        ...(target.expression?.operands ?? []).flatMap((operand, index) =>
            targetEntries(operand, [...path, index]),
        ),
    ];
}

export function replaceTarget(
    target: CraftingTarget,
    path: number[],
    replacement: CraftingTarget,
): CraftingTarget {
    if (!path.length) return replacement;
    if (!target.expression?.operands[path[0]!])
        throw new Error("This requirement no longer exists.");
    return {
        ...target,
        expression: {
            ...target.expression,
            operands: target.expression.operands.map((operand, index) =>
                index === path[0] ? replaceTarget(operand, path.slice(1), replacement) : operand,
            ),
        },
    };
}

export function targetNeedsValues(target: CraftingTarget) {
    return targetEntries(target).some(
        ({ target }) =>
            target.stats?.length ||
            Object.keys(target.baseDefences ?? {}).length ||
            Object.keys(target.properties ?? {}).some((key) => key !== "requiredLevel"),
    );
}

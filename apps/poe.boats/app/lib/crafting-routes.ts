export type CraftingRoute = {
    visits: number;
    passed: number;
    failed: number;
    errors: number;
    spending: Record<string, number>;
    branches?: Record<string, number>;
};
export type CraftingRoutes = Record<string, CraftingRoute>;

export function emptyCraftingRoutes(): CraftingRoutes {
    return Object.create(null);
}

export function craftingRoute(routes: CraftingRoutes | undefined, id: string) {
    return routes && Object.hasOwn(routes, id) ? routes[id] : undefined;
}

export function emptyCraftingRoute(): CraftingRoute {
    return { visits: 0, passed: 0, failed: 0, errors: 0, spending: {} };
}

export function craftingBranchCount(route: CraftingRoute | undefined, id: string) {
    return route?.branches && Object.hasOwn(route.branches, id) ? route.branches[id]! : 0;
}

export function addCraftingRoutes(target: CraftingRoutes, source: CraftingRoutes, weight = 1) {
    for (const [id, route] of Object.entries(source)) {
        target[id] ??= emptyCraftingRoute();
        const current = target[id];
        for (const field of ["visits", "passed", "failed", "errors"] as const)
            current[field] += route[field] * weight;
        if (route.branches) {
            current.branches ??= Object.create(null);
            for (const [branch, count] of Object.entries(route.branches))
                current.branches![branch] = craftingBranchCount(current, branch) + count * weight;
        }
        for (const [currency, amount] of Object.entries(route.spending))
            current.spending[currency] = (current.spending[currency] ?? 0) + amount * weight;
    }
}

export function copyCraftingRoutes(routes: CraftingRoutes): CraftingRoutes {
    return Object.fromEntries(
        Object.entries(routes).map(([id, route]) => [
            id,
            {
                ...route,
                spending: { ...route.spending },
                ...(route.branches ? { branches: { ...route.branches } } : {}),
            },
        ]),
    );
}

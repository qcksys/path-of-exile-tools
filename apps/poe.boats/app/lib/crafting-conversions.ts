import type { CraftingCatalog, CraftingItem, RolledMod } from "../schemas/crafting";
import { augment, augmentRule } from "./crafting-augments";

type Element = keyof CraftingCatalog["crafting"]["elementalConversions"][number]["mods"];
type State = { id: string; order: number };

export function augmentConversion(catalog: CraftingCatalog, item: CraftingItem, id: string) {
    const rule = augmentRule(catalog, item, augment(catalog, id));
    for (const element of ["fire", "cold", "lightning", "chaos"] as const)
        if (
            rule?.stats.some(
                (stat) => stat.id === `dummy_display_stat_rune_${element}_convert` && stat.min > 0,
            )
        )
            return element;
}

export function convertedModifier(catalog: CraftingCatalog, id: string, element: Element) {
    const row = catalog.crafting.elementalConversions.find(
        (entry) =>
            !entry.resistance &&
            (["fire", "cold", "lightning"] as const).some(
                (source) => source !== element && entry.mods[source] === id,
            ),
    );
    return row?.mods[element] ?? id;
}

export function conversionHistory(catalog: CraftingCatalog, item: CraftingItem) {
    const events = new Map<number, number>();
    const sockets = new Map<number, number>();
    const histories = new Map<RolledMod, State[]>();
    for (const mod of item.mods) {
        const conversion = mod.conversion;
        const states: State[] = [{ id: conversion?.source ?? mod.id, order: -1 }];
        histories.set(mod, states);
        if (!conversion) continue;
        if (catalog.game !== "poe2" || mod.origin || !catalog.mods[conversion.source])
            throw new Error("Invalid elemental conversion source.");
        for (const step of conversion.steps) {
            const previous = states.at(-1)!;
            const rune = item.augments?.[step.socket];
            const element = rune && augmentConversion(catalog, item, rune);
            if (
                step.order <= previous.order ||
                !element ||
                !augment(catalog, rune!).socketBound ||
                (events.has(step.order) && events.get(step.order) !== step.socket) ||
                (sockets.has(step.socket) && sockets.get(step.socket) !== step.order)
            )
                throw new Error("Invalid elemental conversion socket history.");
            const next = convertedModifier(catalog, previous.id, element);
            if (
                next === previous.id ||
                !catalog.mods[next] ||
                catalog.mods[next]!.generation_type !== catalog.mods[previous.id]!.generation_type
            )
                throw new Error("The modifier has no matching extracted elemental conversion.");
            events.set(step.order, step.socket);
            sockets.set(step.socket, step.order);
            states.push({ id: next, order: step.order });
        }
        if (states.at(-1)!.id !== mod.id)
            throw new Error("The modifier does not match its elemental conversion history.");
    }
    for (const [mod, states] of histories) {
        if (!mod.conversion || mod.fractured) continue;
        for (const [order, socket] of events) {
            if (order < states[1]!.order) continue;
            const previous = states.findLast((state) => state.order < order)!;
            const next = convertedModifier(
                catalog,
                previous.id,
                augmentConversion(catalog, item, item.augments![socket]!)!,
            );
            const recorded = states.findLast((state) => state.order <= order)!;
            if (recorded.id !== next)
                throw new Error("The modifier is missing an elemental conversion step.");
        }
    }
    return histories;
}

export function conversionSeparates(
    catalog: CraftingCatalog,
    histories: Map<RolledMod, State[]>,
    first: RolledMod,
    second: RolledMod,
) {
    if (!first.conversion && !second.conversion) return false;
    const a = histories.get(first)!;
    const b = histories.get(second)!;
    const orders = new Set([...a, ...b].map((state) => state.order));
    return [...orders].some((order) => {
        const left = a.findLast((state) => state.order <= order)!.id;
        const right = b.findLast((state) => state.order <= order)!.id;
        return (
            left !== right &&
            !catalog.mods[left]!.groups.some((group) => catalog.mods[right]!.groups.includes(group))
        );
    });
}

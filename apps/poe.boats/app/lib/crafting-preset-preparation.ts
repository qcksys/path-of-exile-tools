import { type ItemCondition, type ItemQuery, itemQuerySchema } from "@poe-tools/item-query";
import type { CraftingItem, CraftingMethod } from "../schemas/crafting";
import type { GraphCraftNode } from "../schemas/crafting-graph";
import type { CraftingEngine } from "./crafting-engine";

export type PresetBuilder = {
    engine: CraftingEngine;
    base: (name: string) => CraftingItem;
    buy: (id: string, name: string, item: CraftingItem, output?: ItemQuery) => string;
    craft: (
        id: string,
        name: string,
        sources: string[],
        method: CraftingMethod,
        output?: ItemQuery,
    ) => GraphCraftNode;
    currency: (action: string) => CraftingMethod;
};

export const presetQuery = (...filters: ItemCondition[]) =>
    itemQuerySchema.parse({
        game: "poe1",
        groups: filters.length ? [{ type: "and", filters }] : [],
    });
export const presetMod = (...ids: string[]): ItemCondition => ({
    kind: "mod",
    ids,
    count: { min: 1 },
});
export const presetRange = (
    field: "prefixes" | "suffixes",
    min: number,
    max?: number,
): ItemCondition => ({
    kind: "range",
    field,
    value: { min, ...(max === undefined ? {} : { max }) },
});
export const presetNot = (query: ItemQuery): ItemQuery => {
    const filters = query.groups.flatMap((group) => group.filters);
    return { ...query, groups: [{ type: "count", filters, value: { max: filters.length - 1 } }] };
};
export const presetRecover = (nodeId: string) => ({
    kind: "recover" as const,
    nodeId,
    inputId: "input-0",
});

export function alterationDonor(
    builder: PresetBuilder,
    id: string,
    item: CraftingItem,
    wanted: string,
) {
    const { engine, buy, craft, currency } = builder;
    const target = presetQuery(presetMod(wanted));
    const extra = presetQuery(presetRange("prefixes", 1), presetRange("suffixes", 1));
    const base = buy(`${id}-base`, `Acquire unrolled ${engine.base(item).name}`, item);
    const transmute = craft(
        `${id}-transmute`,
        "Transmute the unrolled base",
        [base],
        currency("transmute_to_magic"),
    );
    const roll = craft(
        `${id}-alteration`,
        `Alterations until ${engine.mod(wanted).name}`,
        [transmute.id],
        currency("reroll_magic"),
    );
    roll.applyWhen = presetNot(target);
    roll.branches = [
        {
            id: "hit",
            name: "Required modifier rolled",
            query: target,
            destination: { kind: "return" },
        },
    ];
    roll.fallback = presetRecover(roll.id);
    const isolate = craft(
        id,
        `Isolate ${engine.mod(wanted).name}`,
        [roll.id],
        currency("remove_random_mod"),
    );
    isolate.applyWhen = extra;
    isolate.branches = [
        {
            id: "keep",
            name: "Isolated modifier: donor ready",
            query: target,
            destination: { kind: "return" },
        },
    ];
    isolate.fallback = presetRecover(roll.id);
    return isolate.id;
}

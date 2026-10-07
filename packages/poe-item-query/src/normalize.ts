import {
    type ApiItem,
    apiItemSchema,
    type ItemFacts,
    type ItemRecord,
    itemFactsSchema,
    type ModifierFact,
} from "./schema.ts";

export function itemRarity(item: ApiItem): ApiItem["rarity"] {
    return (
        item.rarity ??
        (
            {
                0: "Normal",
                1: "Magic",
                2: "Rare",
                3: "Unique",
                4: "Gem",
                5: "Currency",
                9: "Relic",
            } as const
        )[item.frameType as 0 | 1 | 2 | 3 | 4 | 5 | 9]
    );
}

export function normalizeApiItem(
    game: ItemRecord["game"],
    source: ItemRecord["source"],
    input: unknown,
    facts: Partial<ItemFacts> = {},
): ItemRecord {
    const item = apiItemSchema.parse(input);
    const modifiers = new Map<string, ModifierFact>();
    let complete = item.identified === true;
    for (const line of item.explicitMods ?? []) {
        if (typeof line === "string" || !line.mods?.length) {
            complete = false;
            continue;
        }
        for (const mod of line.mods) {
            const tier = /^([PS])(\d+)$/.exec(mod.tier);
            if (!tier) {
                complete = false;
                continue;
            }
            const key = JSON.stringify([mod.name, mod.tier, mod.level]);
            const previous = modifiers.get(key);
            modifiers.set(key, {
                name: mod.name,
                tier: Number(tier[2]),
                side: tier[1] === "P" ? "prefix" : "suffix",
                fractured: previous?.fractured === true || line.flags?.fractured === true,
                crafted: previous?.crafted === true || line.flags?.crafted === true,
            });
        }
    }
    if (item.craftedMods?.length || item.fracturedMods?.length) complete = false;
    const knownModifiers = [...modifiers.values()];
    return {
        game,
        source,
        item,
        facts: itemFactsSchema.parse({
            modifiers: knownModifiers,
            modifiersComplete: complete && !item.implicitMods?.length,
            prefixes:
                item.extended?.prefixes ??
                (complete
                    ? knownModifiers.filter((mod) => mod.side === "prefix").length
                    : undefined),
            suffixes:
                item.extended?.suffixes ??
                (complete
                    ? knownModifiers.filter((mod) => mod.side === "suffix").length
                    : undefined),
            ...facts,
        }),
    };
}

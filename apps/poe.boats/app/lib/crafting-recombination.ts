import type { CraftingItem, RolledMod } from "../schemas/crafting";
import type { RecombinatorItem } from "../schemas/recombinator";
import type { CraftingEngine } from "./crafting-engine";
import { isBreachModifier } from "./crafting-grasping";
import { isIncursionModifier } from "./crafting-incursion";
import { recombineOnBase } from "./recombinator";

export function supportsRecombination(engine: CraftingEngine, item: Pick<CraftingItem, "baseId">) {
    const base = engine.catalog.bases[item.baseId]!;
    return (
        engine.catalog.game === "poe1" &&
        base.domain === "item" &&
        engine.catalog.crafting.recombinableClasses.includes(base.item_class)
    );
}

function recombinationTags(engine: CraftingEngine, item: CraftingItem) {
    const base = engine.base(item);
    const influences = engine.effectiveInfluences(item);
    return [
        ...base.tags,
        ...engine.catalog.crafting.influences
            .filter(
                (rule) => rule.itemClass === base.item_class && influences.includes(rule.influence),
            )
            .map((rule) => rule.tag),
    ];
}

export function isRecombinationEssenceModifier(
    engine: CraftingEngine,
    item: CraftingItem,
    id: string,
) {
    const itemClass = engine.base(item).item_class;
    return (
        engine.catalog.game === "poe1" &&
        engine.catalog.crafting.essences.some((essence) => essence.mods[itemClass] === id)
    );
}

export function nonNativeEssenceSources(
    engine: CraftingEngine,
    item: CraftingItem,
    other?: CraftingItem,
) {
    if (!supportsRecombination(engine, item)) return [];
    engine.validateItem(item);
    if (other) {
        engine.validateItem(other);
        if (engine.base(other).item_class !== engine.base(item).item_class)
            throw new Error("Compare NNN sources on the same item class.");
    }
    const tags = recombinationTags(engine, item);
    const otherTags = other ? recombinationTags(engine, other) : undefined;
    const native = (id: string, tags: string[]) => {
        const mod = engine.mod(id);
        return (
            (mod.spawn_weights.find((entry) => tags.includes(entry.tag))?.weight ?? 0) > 0 &&
            (mod.generation_weights.find((entry) => tags.includes(entry.tag))?.weight ?? 100) > 0
        );
    };
    return engine.catalog.crafting.essences.flatMap((essence) => {
        const id = essence.mods[engine.base(item).item_class];
        if (!id) return [];
        const mod = engine.mod(id);
        if (
            mod.domain !== "item" ||
            mod.is_essence_only ||
            !["prefix", "suffix"].includes(mod.generation_type) ||
            native(id, tags)
        )
            return [];
        return [
            {
                id: essence.id,
                name: essence.name,
                modId: id,
                side: mod.generation_type as "prefix" | "suffix",
                nativeOnOther: otherTags ? native(id, otherTags) : null,
                rerollsRare: essence.level >= 5,
                itemLevelLimit: essence.itemLevelLimit ?? null,
            },
        ];
    });
}

export function recombinationOutcomes(
    engine: CraftingEngine,
    left: CraftingItem,
    right: CraftingItem,
) {
    for (const item of [left, right]) {
        engine.validateItem(item);
        if (!supportsRecombination(engine, item))
            throw new Error("Recombination requires an extracted PoE 1 equipment class.");
        if (item.corrupted || item.mirrored || item.destroyed || item.reveal)
            throw new Error(
                "Corrupted, mirrored, destroyed and unrevealed recombination inputs are not supported.",
            );
        const limits = engine.limits({ ...item, rarity: "rare" });
        if (limits.prefixes !== 3 || limits.suffixes !== 3 || limits.max !== 6)
            throw new Error("Recombination with altered affix limits is not supported yet.");
        if (item.imprint)
            throw new Error("Recombination of imprint checkpoints is not modeled yet.");
        const tags = recombinationTags(engine, item);
        for (const rolled of item.mods) {
            const mod = engine.mod(rolled.id);
            const natural =
                mod.domain === "item" &&
                (mod.spawn_weights.find((entry) => tags.includes(entry.tag))?.weight ?? 0) > 0 &&
                (mod.generation_weights.find((entry) => tags.includes(entry.tag))?.weight ?? 100) >
                    0;
            if (
                !(
                    natural ||
                    isRecombinationEssenceModifier(engine, item, rolled.id) ||
                    isBreachModifier(engine.catalog, item, rolled.id) ||
                    isIncursionModifier(engine.catalog, item, rolled.id) ||
                    (mod.domain === "crafted" && mod.implicit_tags.includes("unveiled_mod"))
                )
            )
                throw new Error(
                    "This recombination model supports natural and extracted essence modifiers, Breach modifiers, the three Incursion glove suffixes and unveiled bench crafts.",
                );
        }
    }
    if (engine.base(left).item_class !== engine.base(right).item_class)
        throw new Error("Recombination inputs must have the same item class.");
    const level = Math.min(
        Math.max(left.level, right.level),
        Math.floor((left.level + right.level) / 2) + 2,
    );
    const outcomes: { value: CraftingItem; weight: number }[] = [];
    for (const [baseIndex, chosen] of [left, right].entries()) {
        const base = engine.base(chosen);
        const tags = recombinationTags(engine, chosen);
        const records = new Map<string, RolledMod>();
        const input = (item: CraftingItem, source: number): RecombinatorItem => {
            const result: RecombinatorItem = { prefixes: [], suffixes: [] };
            for (const [index, rolled] of item.mods.entries()) {
                const mod = engine.mod(rolled.id);
                const key = `${source}:${index}`;
                records.set(key, {
                    ...rolled,
                    ...(rolled.attributeSource ? { attributeSource: undefined } : {}),
                    ...(!rolled.crafted && (rolled.origin || item.level > level)
                        ? {
                              origin: {
                                  kind: "recombine" as const,
                                  level: Math.max(rolled.origin?.level ?? 0, item.level),
                              },
                          }
                        : {}),
                });
                const generation =
                    (mod.generation_weights.find((entry) => tags.includes(entry.tag))?.weight ??
                        100) / 100;
                result[mod.generation_type === "prefix" ? "prefixes" : "suffixes"].push({
                    id: key,
                    group: mod.groups[0]!,
                    groups: mod.groups,
                    exclusive:
                        rolled.crafted ||
                        mod.is_essence_only ||
                        isBreachModifier(engine.catalog, item, rolled.id) ||
                        isIncursionModifier(engine.catalog, item, rolled.id),
                    nonNative: rolled.fractured && source !== baseIndex,
                    crafted: rolled.crafted,
                    spawn: mod.spawn_weights.map((entry): [string, number] => [
                        entry.tag,
                        entry.weight * generation,
                    ]),
                });
            }
            return result;
        };
        const a = input(left, 0);
        const b = input(right, 1);
        for (const outcome of recombineOnBase(a, b, {
            id: chosen.baseId,
            name: base.name,
            itemClass: base.item_class,
            tags,
        })) {
            const item = {
                ...chosen,
                level,
                rarity: "rare" as const,
                mods: [...outcome.item.prefixes, ...outcome.item.suffixes].map(
                    (affix) => records.get(affix.id)!,
                ),
            };
            outcomes.push({ value: engine.validateItem(item), weight: outcome.probability / 2 });
        }
    }
    return outcomes;
}

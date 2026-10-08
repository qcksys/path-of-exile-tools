import {
    type ItemQuery,
    type ItemRecord,
    type ModifierFact,
    matchItem,
} from "@poe-tools/item-query";
import type { CraftingItem, RolledMod } from "../schemas/crafting";
import type { CraftingEngine } from "./crafting-engine";
import { modifierTiers } from "./crafting-modifier-details";
import { mapQualityRecipe } from "./crafting-quality";
import { linkedSocketRange } from "./crafting-sockets";

const influenceNames = ["shaper", "elder", "crusader", "redeemer", "hunter", "warlord"];
const rarities = { normal: "Normal", magic: "Magic", rare: "Rare" } as const;

export function createCraftingItemQuery(engine: CraftingEngine) {
    const tiers = new Map<
        string,
        { ordinary: Map<string, number>; essence: Map<string, number> }
    >();

    function record(item: CraftingItem): ItemRecord {
        const base = engine.base(item);
        const limits = engine.limits(item);
        const counts = engine.counts(item);
        const key = JSON.stringify([item.baseId, item.cluster]);
        let itemTiers = tiers.get(key);
        if (!itemTiers) {
            itemTiers = {
                ordinary: modifierTiers(engine, item.baseId, "ordinary", item.cluster),
                essence: modifierTiers(engine, item.baseId, "essence", item.cluster),
            };
            tiers.set(key, itemTiers);
        }
        const modifier = (rolled: RolledMod, implicit = false): ModifierFact => {
            const mod = engine.mod(rolled.id);
            return {
                id: rolled.id,
                name: mod.name,
                side: implicit
                    ? "implicit"
                    : mod.generation_type === "prefix"
                      ? "prefix"
                      : "suffix",
                tier: implicit
                    ? undefined
                    : itemTiers[rolled.essence ? "essence" : "ordinary"].get(rolled.id),
                fractured: rolled.fractured,
                crafted: rolled.crafted,
            };
        };
        const identified = !item.unidentified;
        return {
            game: engine.catalog.game,
            source: "craft",
            item: {
                baseType: base.name,
                typeLine: base.name,
                ilvl: item.level,
                rarity: rarities[item.rarity],
                identified,
                corrupted: item.corrupted,
                duplicated: item.mirrored,
                fractured: item.mods.some((mod) => mod.fractured),
                synthesised: item.implicits.some((mod) =>
                    engine.mod(mod.id).generation_type.startsWith("synthesis"),
                ),
                split: Boolean(item.split),
                sanctified: Boolean(item.sanctified),
                influences: Object.fromEntries(
                    engine.effectiveInfluences(item).map((id) => [influenceNames[id]!, true]),
                ),
            },
            facts: {
                baseId: item.baseId,
                itemClass: base.item_class,
                quality: item.quality,
                qualityType: mapQualityRecipe(engine.catalog, item)?.id ?? "base",
                catalystId: item.catalyst?.id ?? "none",
                catalystQuality: item.catalyst?.quality ?? 0,
                modifiers: identified
                    ? [
                          ...item.mods.map((rolled) => modifier(rolled)),
                          ...item.implicits.map((rolled) => modifier(rolled, true)),
                      ]
                    : [],
                modifiersComplete: identified && !item.reveal,
                prefixes: counts.prefixes,
                suffixes: counts.suffixes,
                memoryStrands: item.memoryStrands ?? 0,
                memoryStrandsSpent: item.imprint
                    ? Math.max(0, (item.imprint.memoryStrands ?? 0) - (item.memoryStrands ?? 0))
                    : undefined,
                prefixLimit: limits.prefixes,
                suffixLimit: limits.suffixes,
                socketCount: item.sockets ?? 0,
                linkedSockets: engine.catalog.game === "poe1" ? linkedSocketRange(item) : undefined,
                stats: identified
                    ? {
                          explicit: Object.fromEntries(engine.statTotals(item, "explicit")),
                          implicit: Object.fromEntries(engine.statTotals(item, "implicit")),
                          total: Object.fromEntries(engine.statTotals(item, "all")),
                      }
                    : { explicit: {}, implicit: {}, total: {} },
                statsComplete: identified && !item.reveal,
                destroyed: Boolean(item.destroyed),
            },
        };
    }

    return {
        record,
        matches: (item: CraftingItem, query: ItemQuery) => matchItem(record(item), query),
    };
}

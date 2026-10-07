import { itemRarity } from "./normalize.ts";
import type {
    ItemCondition,
    ItemQuery,
    ItemQueryGroup,
    ItemRecord,
    ModifierFact,
    NumericRange,
} from "./schema.ts";

export type ItemMatch = "match" | "no-match" | "unknown";

function all(results: ItemMatch[]): ItemMatch {
    return results.includes("no-match")
        ? "no-match"
        : results.includes("unknown")
          ? "unknown"
          : "match";
}

function inRange(value: number | undefined, range: NumericRange): ItemMatch {
    if (value === undefined) return "unknown";
    return value >= (range.min ?? -Infinity) && value <= (range.max ?? Infinity)
        ? "match"
        : "no-match";
}

function oneOf<T>(value: T | undefined, options: T[]): ItemMatch {
    return value === undefined ? "unknown" : options.includes(value) ? "match" : "no-match";
}

function countMatches(results: ItemMatch[], range: NumericRange, incomplete = false): ItemMatch {
    const minimum = results.filter((result) => result === "match").length;
    const maximum = incomplete
        ? Infinity
        : minimum + results.filter((result) => result === "unknown").length;
    if (maximum < (range.min ?? 0) || minimum > (range.max ?? Infinity)) return "no-match";
    if (minimum >= (range.min ?? 0) && maximum <= (range.max ?? Infinity)) return "match";
    return "unknown";
}

function matchModifier(
    mod: ModifierFact,
    filter: Extract<ItemCondition, { kind: "mod" }>,
): ItemMatch {
    const matches: ItemMatch[] = [];
    if (filter.ids) {
        if (mod.id !== undefined || !mod.possibleIds) matches.push(oneOf(mod.id, filter.ids));
        else {
            const matching = mod.possibleIds.filter((id) => filter.ids!.includes(id)).length;
            matches.push(
                matching === mod.possibleIds.length
                    ? "match"
                    : matching === 0
                      ? "no-match"
                      : "unknown",
            );
        }
    }
    if (filter.names) matches.push(oneOf(mod.name, filter.names));
    if (filter.tier) matches.push(inRange(mod.tier, filter.tier));
    if (filter.side) matches.push(oneOf(mod.side, [filter.side]));
    if (filter.fractured !== undefined) matches.push(oneOf(mod.fractured, [filter.fractured]));
    if (filter.crafted !== undefined) matches.push(oneOf(mod.crafted, [filter.crafted]));
    return all(matches);
}

export function matchItemCondition(record: ItemRecord, filter: ItemCondition): ItemMatch {
    const { item, facts } = record;
    switch (filter.kind) {
        case "base":
            return oneOf(
                filter.field === "baseType" ? item.baseType : facts[filter.field],
                filter.values,
            );
        case "rarity":
            return oneOf(itemRarity(item), filter.values);
        case "influence":
            return filter.values.some((value) => item.influences?.[value] === true)
                ? "match"
                : "no-match";
        case "flag": {
            let value: boolean | undefined;
            if (filter.field === "destroyed") value = facts.destroyed;
            else if (filter.field === "mirrored") value = item.duplicated ?? false;
            else if (filter.field === "influenced")
                value = Object.values(item.influences ?? {}).some(Boolean);
            else if (filter.field === "fractured")
                value =
                    item.fractured === true ||
                    !!item.fracturedMods?.length ||
                    facts.modifiers.some((mod) => mod.fractured) ||
                    (item.explicitMods ?? []).some(
                        (mod) => typeof mod !== "string" && mod.flags?.fractured === true,
                    );
            else value = item[filter.field] ?? (filter.field === "identified" ? undefined : false);
            return oneOf(value, [filter.value]);
        }
        case "range": {
            let value: number | undefined;
            if (filter.field === "ilvl") value = item.ilvl ?? item.itemLevel;
            else if (filter.field === "sockets") value = facts.socketCount ?? item.sockets?.length;
            else if (filter.field === "links") {
                if (record.game === "poe2") return "unknown";
                if (facts.linkedSockets) {
                    const { min, max } = facts.linkedSockets;
                    if (min > (filter.value.max ?? Infinity) || max < (filter.value.min ?? 0))
                        return "no-match";
                    if (min >= (filter.value.min ?? 0) && max <= (filter.value.max ?? Infinity))
                        return "match";
                    return "unknown";
                }
                if (item.sockets) {
                    const groups = new Map<number, number>();
                    for (const socket of item.sockets)
                        groups.set(socket.group, (groups.get(socket.group) ?? 0) + 1);
                    value = Math.max(0, ...groups.values());
                }
            } else if (filter.field === "openPrefixes") {
                if (facts.prefixLimit !== undefined && facts.prefixes !== undefined)
                    value = Math.max(0, facts.prefixLimit - facts.prefixes);
            } else if (filter.field === "openSuffixes") {
                if (facts.suffixLimit !== undefined && facts.suffixes !== undefined)
                    value = Math.max(0, facts.suffixLimit - facts.suffixes);
            } else value = facts[filter.field];
            return inRange(value, filter.value);
        }
        case "mod":
            return countMatches(
                facts.modifiers.map((mod) => matchModifier(mod, filter)),
                filter.count,
                !facts.modifiersComplete,
            );
        case "stat":
            return inRange(
                facts.stats[filter.scope][filter.id] ?? (facts.statsComplete ? 0 : undefined),
                filter.value,
            );
    }
}

export function matchItemGroup(record: ItemRecord, group: ItemQueryGroup): ItemMatch {
    const results = group.filters.map((filter) => matchItemCondition(record, filter));
    if (group.type === "and") return all(results);
    if (group.type === "or") return countMatches(results, { min: 1 });
    if (group.type === "not") return countMatches(results, { max: 0 });
    return countMatches(results, group.value!);
}

export function matchItem(record: ItemRecord, query: ItemQuery): ItemMatch {
    if (record.game !== query.game) return "no-match";
    return all(query.groups.map((group) => matchItemGroup(record, group)));
}

export function queryConditionCount(query: ItemQuery): number {
    return query.groups.reduce((sum, group) => sum + group.filters.length, 0);
}

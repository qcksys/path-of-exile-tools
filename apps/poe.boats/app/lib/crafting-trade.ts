import {
    type ItemCondition,
    type ItemQuery,
    itemQuerySchema,
    type NumericRange,
} from "@poe-tools/item-query";
import type { CraftingCatalog } from "~/schemas/crafting";
import type { CraftingTradePayload, CraftingTradeResult } from "~/schemas/crafting-trade";

type Metadata = {
    game: string;
    fetchedAt: string;
    filters: Record<string, { group: string; options?: { id: string; text: string }[] }>;
    stats: Record<string, string>;
};
type TradeStat = CraftingTradePayload["query"]["stats"][number]["filters"][number];
type Translation =
    | { kind: "stat"; stats: TradeStat[]; warning?: string }
    | { kind: "field"; id: string; value: NumericRange & { option?: string } }
    | { kind: "base"; name: string };

export async function loadCraftingTradeMetadata(game: ItemQuery["game"]): Promise<Metadata> {
    return game === "poe1"
        ? (await import("~/data/crafting-trade-poe1.json")).default
        : (await import("~/data/crafting-trade-poe2.json")).default;
}

const slotStats = {
    prefixes: "pseudo.pseudo_number_of_prefix_mods",
    suffixes: "pseudo.pseudo_number_of_suffix_mods",
    openPrefixes: "pseudo.pseudo_number_of_empty_prefix_mods",
    openSuffixes: "pseudo.pseudo_number_of_empty_suffix_mods",
};

const template = (text: string) =>
    text.replace(/\(-?\d+(?:\.\d+)?--?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?/g, "#").trim();

export type CraftingTradeCatalog = Pick<CraftingCatalog, "game" | "bases" | "mods">;

export function buildCraftingTradeSearch(
    catalog: CraftingTradeCatalog,
    input: ItemQuery,
    league: string,
    metadata: Metadata,
): CraftingTradeResult {
    const query = itemQuerySchema.parse(input);
    if (query.game !== catalog.game || metadata.game !== query.game)
        throw new Error("Trade query and catalog must use the same game.");
    if (!league.trim() || league.length > 100) throw new Error("Choose a trade league.");
    const payload: CraftingTradePayload = {
        query: { status: { option: "available" }, stats: [], filters: {} },
        sort: { price: "asc" },
    };
    const warnings: CraftingTradeResult["warnings"] = [];
    const textIds = new Map<string, string[]>();
    for (const [id, text] of Object.entries(metadata.stats)) {
        const key = `${id.split(".")[0]}:${text}`;
        textIds.set(key, [...(textIds.get(key) ?? []), id]);
    }
    const stat = (id: string, value: NumericRange): Translation | undefined =>
        metadata.stats[id] ? { kind: "stat", stats: [{ id, value }] } : undefined;
    const field = (
        id: string,
        value: NumericRange & { option?: string },
    ): Translation | undefined => {
        const definition = metadata.filters[id];
        if (
            !definition ||
            (value.option !== undefined &&
                !definition.options?.some((entry) => entry.id === value.option))
        )
            return;
        return { kind: "field", id, value };
    };
    const translate = (condition: ItemCondition): Translation | undefined => {
        switch (condition.kind) {
            case "base": {
                if (condition.values.length !== 1) return;
                const value = condition.values[0]!;
                if (condition.field === "itemClass") {
                    const category = metadata.filters.category?.options?.find(
                        (option) => option.text === value,
                    );
                    return category ? field("category", { option: category.id }) : undefined;
                }
                const name = condition.field === "baseId" ? catalog.bases[value]?.name : value;
                return name ? { kind: "base", name } : undefined;
            }
            case "rarity": {
                const values = [...new Set(condition.values)];
                if (
                    values.length === 3 &&
                    (["Normal", "Magic", "Rare"] as const).every((value) => values.includes(value))
                )
                    return field("rarity", { option: "nonunique" });
                return values.length === 1
                    ? field("rarity", { option: values[0]!.toLowerCase() })
                    : undefined;
            }
            case "range":
                if (condition.field in slotStats)
                    return stat(
                        slotStats[condition.field as keyof typeof slotStats],
                        condition.value,
                    );
                if (condition.field === "links" && query.game === "poe2") return;
                return field(
                    condition.field === "sockets" && query.game === "poe2"
                        ? "total_augment_sockets"
                        : condition.field,
                    condition.value,
                );
            case "flag":
                if (condition.field === "influenced")
                    return stat(
                        "pseudo.pseudo_has_influence_count",
                        condition.value ? { min: 1 } : { max: 0 },
                    );
                return field(
                    condition.field === "fractured"
                        ? "fractured_item"
                        : condition.field === "synthesised"
                          ? "synthesised_item"
                          : condition.field,
                    { option: String(condition.value) },
                );
            case "influence":
                return condition.values.length === 1
                    ? stat(`pseudo.pseudo_has_${condition.values[0]}_influence`, { min: 1 })
                    : undefined;
            case "stat":
                if (
                    !(
                        condition.id.startsWith(`${condition.scope}.`) ||
                        (condition.scope === "total" && condition.id.startsWith("pseudo."))
                    )
                )
                    return;
                return stat(condition.id, condition.value);
            case "mod": {
                if (
                    condition.ids?.length !== 1 ||
                    condition.count.min !== 1 ||
                    condition.count.max !== undefined
                )
                    return;
                const mod = catalog.mods[condition.ids[0]!];
                if (!mod?.text) return;
                const scope = condition.fractured
                    ? "fractured"
                    : condition.crafted
                      ? "crafted"
                      : condition.side === "implicit"
                        ? "implicit"
                        : "explicit";
                const lines = mod.text.split("\n");
                const stats: TradeStat[] = [];
                for (const [index, line] of lines.entries()) {
                    const local = (
                        lines.length === mod.stats.length
                            ? mod.stats[index]
                            : mod.stats.length === 1
                              ? mod.stats[0]
                              : undefined
                    )?.id.startsWith("local_");
                    const text = template(line);
                    const localIds = local ? textIds.get(`${scope}:${text} (Local)`) : undefined;
                    const ids = localIds ?? textIds.get(`${scope}:${text}`);
                    if (ids?.length !== 1) return;
                    const values = line.match(/\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\)/);
                    const min =
                        text.match(/#/g)?.length === 1 && values ? Number(values[1]) : undefined;
                    stats.push({ id: ids[0]!, ...(min === undefined ? {} : { value: { min } }) });
                }
                return {
                    kind: "stat",
                    stats,
                    warning:
                        "Modifier identity, tier, side and negative flags are not exact trade filters. Displayed stats use minimum rolls where available; combined or hybrid stats can match different affixes. Check each listing.",
                };
            }
        }
    };
    const addField = (entry: Exclude<Translation, { kind: "stat" }>) => {
        if (entry.kind === "base") {
            if (payload.query.type && payload.query.type !== entry.name)
                throw new Error("The query requires incompatible item bases.");
            payload.query.type = entry.name;
            return;
        }
        const group = metadata.filters[entry.id]!.group;
        payload.query.filters[group] ??= { filters: {} };
        const filters = payload.query.filters[group].filters;
        const prior = filters[entry.id];
        if (!prior) {
            filters[entry.id] = entry.value;
            return;
        }
        if (prior.option !== entry.value.option)
            throw new Error(`The query has conflicting ${entry.id} conditions.`);
        const min = Math.max(prior.min ?? -Infinity, entry.value.min ?? -Infinity);
        const max = Math.min(prior.max ?? Infinity, entry.value.max ?? Infinity);
        if (min > max) throw new Error(`The query has an empty ${entry.id} range.`);
        filters[entry.id] = {
            ...(prior.option === undefined ? {} : { option: prior.option }),
            ...(Number.isFinite(min) ? { min } : {}),
            ...(Number.isFinite(max) ? { max } : {}),
        };
    };
    for (const [groupIndex, group] of query.groups.entries()) {
        const entries = group.filters.map(translate);
        if (group.type !== "and") {
            if (
                entries.some(
                    (entry) =>
                        !entry ||
                        entry.kind !== "stat" ||
                        entry.warning ||
                        entry.stats.length !== 1,
                )
            ) {
                warnings.push({
                    group: groupIndex,
                    message:
                        "This OR, NOT or count group cannot be represented faithfully and was omitted as a whole. Check these conditions on listings.",
                });
                continue;
            }
            payload.query.stats.push({
                type: group.type === "or" ? "count" : group.type,
                filters: entries.flatMap((entry) => (entry?.kind === "stat" ? entry.stats : [])),
                ...(group.type === "or"
                    ? { value: { min: 1 } }
                    : group.type === "count"
                      ? { value: group.value }
                      : {}),
            });
            continue;
        }
        for (const [conditionIndex, entry] of entries.entries()) {
            if (!entry) {
                warnings.push({
                    group: groupIndex,
                    condition: conditionIndex,
                    message: `Condition ${conditionIndex + 1} (${group.filters[conditionIndex]!.kind}) is not supported by this trade translation and was omitted. Check it on listings.`,
                });
                continue;
            }
            if (entry.kind === "stat") {
                payload.query.stats.push({ type: "and", filters: entry.stats });
                if (entry.warning)
                    warnings.push({
                        group: groupIndex,
                        condition: conditionIndex,
                        message: entry.warning,
                    });
            } else addField(entry);
        }
    }
    const path = query.game === "poe1" ? "trade/search" : "trade2/search/poe2";
    return {
        payload,
        url: `https://www.pathofexile.com/${path}/${encodeURIComponent(league.trim())}?q=${encodeURIComponent(JSON.stringify(payload))}`,
        fidelity: warnings.length ? "approximate" : "exact",
        warnings,
        metadataDate: metadata.fetchedAt,
    };
}

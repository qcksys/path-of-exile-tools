import type { CraftingData } from "./crafting-data-model.ts";
import type { Dataset } from "./model.ts";
import type { Row, Tables } from "./tables.ts";

export function extractAugments(
    tables: Tables,
    bases: Dataset["base_items"],
): CraftingData["augments"] {
    if (tables.game !== "poe2") return [];
    const classes = (tag: string) =>
        Object.values(bases)
            .filter((base) => base.tags.includes(tag))
            .map((base) => base.item_class);
    const martial = classes("weapon");
    const armour = classes("armour");
    const equipment = [...martial, ...armour, "Wand", "Staff", "Sceptre", "Ring", "Amulet", "Belt"];
    const fixedStats = (row: Row, ids: string, values: string) => {
        const stats = row.refs(ids);
        const amounts = row.numbers(values);
        if (stats.length !== amounts.length)
            throw new Error(`Augment stat arrays differ: ${row.index}`);
        return stats.map((stat, index) => ({
            id: stat.id(),
            min: amounts[index]!,
            max: amounts[index]!,
        }));
    };
    return tables.rows("SoulCores").map((row) => {
        const base = row.ref("BaseItemType");
        const type = row.ref("Type");
        const limit = row.ref("Limit");
        if (!base || !type) throw new Error(`Unresolved socketable augment: ${row.index}`);
        const socketedStat = type.ref("SocketedStat");
        if (!socketedStat) throw new Error(`Missing augment count stat: ${type.id()}`);
        return {
            id: base.id(),
            name: base.string("Name"),
            requiredLevel: row.number("RequiredLevel"),
            type: {
                id: type.id(),
                name: type.string("Name"),
                effectStat: type.ref("EffectStat")?.id() ?? null,
                socketedStat: socketedStat.id(),
            },
            limit: limit
                ? { id: limit.id(), amount: limit.number("Limit"), text: limit.string("Text") }
                : null,
            higherTier: row.ref("TierHigher")?.ref("BaseItemType")?.id() ?? null,
            socketBound: row.boolean("IsSocketBound"),
            martialArtist: row.boolean("CanSocketInMartialArtistSlots"),
            unique: row.boolean("CanSocketInUniqueItems"),
            jewellery: row.boolean("CanSocketInJewellery"),
            corruptedSanctified: row.boolean("CanSocketInCorruptedSanctified"),
            description: row.ref("Description")?.string("Text") ?? null,
            extraDescription: row.ref("ExtraDescription")?.string("Text") ?? null,
            rules: tables
                .rows("SoulCoreStats")
                .filter((rule) => rule.ref("SoulCore")?.index === row.index)
                .map((rule) => {
                    const category = rule.ref("StatCategory");
                    if (!category)
                        throw new Error(`Unresolved augment stat category: ${rule.index}`);
                    const key = category.id();
                    const scope =
                        key === "All"
                            ? "all"
                            : key.includes("Martial")
                              ? "martial"
                              : key === "Armour"
                                ? "armour"
                                : "classes";
                    const itemClasses = [
                        ...new Set([
                            ...category.refs("TargetItemClasses").map((entry) => entry.id()),
                            ...(scope === "all"
                                ? equipment
                                : scope === "martial"
                                  ? martial
                                  : scope === "armour"
                                    ? armour
                                    : []),
                        ]),
                    ].sort();
                    if (!itemClasses.length)
                        throw new Error(`Unresolved augment target classes: ${key}`);
                    return {
                        category: key,
                        display: category.string("Display"),
                        itemClasses,
                        scope,
                        stats: fixedStats(rule, "Stats", "StatsValues"),
                        bondedStats: fixedStats(rule, "BondedStats", "BondedStatsValues"),
                        text: null,
                        bondedText: null,
                        statDescriptions: [],
                        bondedDescriptions: [],
                    };
                }),
        };
    });
}

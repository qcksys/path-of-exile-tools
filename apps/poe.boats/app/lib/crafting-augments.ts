import { translationStatId } from "../../../../packages/poe-game-data/src/translation-formats";
import type { CraftingCatalog, CraftingItem } from "../schemas/crafting";
import { socketableItemClass, socketLimit } from "./crafting-sockets";
import { renderStatText } from "./crafting-text";

type Augment = CraftingCatalog["crafting"]["augments"][number];

export function augment(catalog: CraftingCatalog, id: string) {
    const entry = catalog.crafting.augments.find((entry) => entry.id === id);
    if (!entry || catalog.game !== "poe2") throw new Error("Unknown socketable augment.");
    return entry;
}

export function augmentSupported(entry: Augment) {
    return (
        entry.rules.some((rule) => rule.stats.length > 0) &&
        !entry.rules.some((rule) =>
            rule.stats.some((stat) =>
                /^dummy_display_stat_rune_(?!(?:(?:fire|cold|lightning|chaos)_convert|create_jewel_socket)$)/.test(
                    stat.id,
                ),
            ),
        )
    );
}

export function augmentRule(catalog: CraftingCatalog, item: CraftingItem, entry: Augment) {
    const base = catalog.bases[item.baseId];
    if (!base || catalog.game !== "poe2") return;
    if (["Ring", "Amulet", "Belt"].includes(base.item_class) && !entry.jewellery) return;
    const itemClass = socketableItemClass(catalog, item);
    const priority = { classes: 0, martial: 1, armour: 2, all: 3 };
    return entry.rules
        .filter((rule) => rule.stats.length && rule.itemClasses.includes(itemClass))
        .sort((a, b) => priority[a.scope] - priority[b.scope])[0];
}

export function availableAugments(catalog: CraftingCatalog, item: CraftingItem) {
    if (!socketLimit(catalog, item)) return [];
    return catalog.crafting.augments.filter(
        (entry) => augmentSupported(entry) && augmentRule(catalog, item, entry)?.stats.length,
    );
}

export function augmentUpgrader(entry: Augment) {
    return entry.rules.some((rule) =>
        rule.stats.some((stat) => stat.id === "dummy_display_stat_rune_upgrade" && stat.min > 0),
    );
}

export function augmentCreatesJewelSocket(entry: Augment) {
    return entry.rules.some((rule) =>
        rule.stats.some(
            (stat) => stat.id === "dummy_display_stat_rune_create_jewel_socket" && stat.min > 0,
        ),
    );
}

export function upgradeSocketedAugment(
    catalog: CraftingCatalog,
    item: CraftingItem,
    id: string,
    socket: number,
) {
    const entry = augment(catalog, id);
    if (!augmentUpgrader(entry) || !augmentRule(catalog, item, entry))
        throw new Error("This augment cannot upgrade Runes on this item.");
    if ((item.corrupted || item.sanctified) && !entry.corruptedSanctified)
        throw new Error("This augment cannot be used on a corrupted or Sanctified item.");
    const existing = item.augments?.[socket];
    if (!existing) throw new Error("Choose an occupied Rune socket to upgrade.");
    const rune = augment(catalog, existing);
    if (rune.type.socketedStat !== "num_socketed_runes" || !rune.higherTier)
        throw new Error("This socketed augment has no higher Rune tier in this build.");
    return socketAugment(catalog, item, rune.higherTier, socket);
}

export function validateAugments(catalog: CraftingCatalog, item: CraftingItem) {
    if (item.jewelSocket) {
        const source = augment(catalog, item.jewelSocket);
        if (!augmentCreatesJewelSocket(source) || !augmentRule(catalog, item, source))
            throw new Error("This item has no valid extracted Jewel socket conversion.");
        if (item.sockets || item.augments?.length)
            throw new Error("A converted Jewel socket cannot coexist with augment sockets.");
    }
    if ((item.augments?.length ?? 0) > (item.sockets ?? 0))
        throw new Error("Socketed augments exceed the item's socket count.");
    for (const id of item.augments ?? []) {
        const entry = augment(catalog, id);
        if (!augmentSupported(entry))
            throw new Error(
                "This augment has a special crafting effect that is not supported yet.",
            );
        if (augmentCreatesJewelSocket(entry))
            throw new Error("This augment creates a Jewel socket and cannot remain socketed.");
        if (!augmentRule(catalog, item, entry)?.stats.length)
            throw new Error("This augment has no effect for this item class.");
        if (entry.limit) {
            const matching = item.augments!.filter((id) =>
                entry.limit!.text
                    ? augment(catalog, id).limit?.id === entry.limit!.id
                    : id === entry.id,
            );
            if (matching.length > entry.limit.amount)
                throw new Error(
                    `${entry.name} exceeds its extracted augment limit of ${entry.limit.amount}.`,
                );
        }
    }
}

export function socketAugment(
    catalog: CraftingCatalog,
    item: CraftingItem,
    id: string,
    replace?: number,
) {
    const entry = augment(catalog, id);
    if ((item.corrupted || item.sanctified) && !entry.corruptedSanctified)
        throw new Error("This augment cannot be socketed into a corrupted or Sanctified item.");
    if (item.jewelSocket)
        throw new Error(
            "A converted Jewel socket cannot receive augments or become augment sockets.",
        );
    if (!augmentRule(catalog, item, entry)?.stats.length)
        throw new Error("This augment has no effect for this item class.");
    if (
        augmentCreatesJewelSocket(entry) &&
        item.augments?.some((id) => augment(catalog, id).socketBound)
    )
        throw new Error("A Jewel socket conversion cannot destroy socket-bound augments.");
    const augments = [...(item.augments ?? [])];
    if (replace !== undefined) {
        const existing = augments[replace];
        if (!existing) throw new Error("Choose an occupied augment socket to replace.");
        if (augment(catalog, existing).socketBound)
            throw new Error("A socket-bound augment cannot be replaced.");
        augments[replace] = id;
    } else {
        if (augments.length >= (item.sockets ?? 0))
            throw new Error("Add an empty augment socket or choose an augment to replace.");
        augments.push(id);
    }
    const result = augmentCreatesJewelSocket(entry)
        ? { ...item, sockets: 0, augments: [], jewelSocket: entry.id }
        : { ...item, augments };
    validateAugments(catalog, result);
    return result;
}

export function augmentBonded(catalog: CraftingCatalog, item: CraftingItem, entry: Augment) {
    return (
        entry.type.socketedStat === "num_socketed_idols" &&
        (item.augments ?? []).some((id) =>
            augmentRule(catalog, item, augment(catalog, id))?.stats.some(
                (stat) => stat.id === "local_idols_gain_additional_socketable_mods" && stat.min > 0,
            ),
        )
    );
}

function scaledAugmentStats(
    catalog: CraftingCatalog,
    item: CraftingItem,
    entry: Augment,
    stats: Augment["rules"][number]["stats"],
) {
    const effect = [...item.mods, ...item.implicits].reduce(
        (sum, rolled) =>
            sum +
            (catalog.mods[rolled.id]?.stats ?? []).reduce(
                (sum, stat, index) =>
                    sum +
                    (stat.id === entry.type.effectStat ||
                    stat.id === "local_socketed_items_effect_+%"
                        ? Math.round(
                              (rolled.values[index]! *
                                  (rolled.sanctification ?? rolled.corruptionScale ?? 100)) /
                                  100,
                          )
                        : 0),
                0,
            ),
        0,
    );
    const socketedEffect = (item.augments ?? []).reduce(
        (sum, id) =>
            sum +
            (augmentRule(catalog, item, augment(catalog, id))?.stats ?? []).reduce(
                (sum, stat) =>
                    sum +
                    (stat.id === entry.type.effectStat ||
                    stat.id === "local_socketed_items_effect_+%"
                        ? stat.min
                        : 0),
                0,
            ),
        0,
    );
    return new Map(
        stats.map((stat) => [
            stat.id,
            catalog.crafting.scalableStats.includes(stat.id)
                ? Math.trunc((stat.min * (100 + effect + socketedEffect)) / 100)
                : stat.min,
        ]),
    );
}

export function augmentStats(catalog: CraftingCatalog, item: CraftingItem, id: string) {
    const entry = augment(catalog, id);
    const rule = augmentRule(catalog, item, entry);
    if (!rule) return new Map<string, number>();
    const stats = scaledAugmentStats(catalog, item, entry, rule.stats);
    if (augmentBonded(catalog, item, entry))
        for (const [id, value] of scaledAugmentStats(catalog, item, entry, rule.bondedStats))
            stats.set(id, (stats.get(id) ?? 0) + value);
    return stats;
}

export function augmentText(catalog: CraftingCatalog, item: CraftingItem, id: string) {
    const entry = augment(catalog, id);
    const rule = augmentRule(catalog, item, entry);
    if (!rule) return null;
    const render = (bonded: boolean) =>
        renderStatText(
            catalog,
            bonded ? rule.bondedDescriptions : rule.statDescriptions,
            new Map(
                [
                    ...scaledAugmentStats(
                        catalog,
                        item,
                        entry,
                        bonded ? rule.bondedStats : rule.stats,
                    ),
                ].map(([id, value]) => [translationStatId(id), value]),
            ),
        ) || (bonded ? rule.bondedText : rule.text);
    const ordinary = render(false);
    const bonded = augmentBonded(catalog, item, entry) ? render(true) : null;
    return [ordinary, ...(bonded ? [`Bonded: ${bonded}`] : [])].filter(Boolean).join("\n") || null;
}

export function socketedStats(catalog: CraftingCatalog, item: CraftingItem) {
    const stats = new Map<string, number>();
    for (const id of item.augments ?? []) {
        for (const [stat, value] of augmentStats(catalog, item, id))
            stats.set(stat, (stats.get(stat) ?? 0) + value);
        const count = augment(catalog, id).type.socketedStat;
        stats.set(count, (stats.get(count) ?? 0) + 1);
    }
    return stats;
}

export function augmentTags(catalog: CraftingCatalog, item: CraftingItem) {
    return [...socketedStats(catalog, item)].flatMap(([stat, value]) =>
        value > 0 && catalog.crafting.augmentTags[stat]
            ? [catalog.crafting.augmentTags[stat]!]
            : [],
    );
}

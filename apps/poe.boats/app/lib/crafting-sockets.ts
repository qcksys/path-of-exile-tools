import type { CraftingCatalog, CraftingItem, CraftingTarget } from "../schemas/crafting";
import { enchantmentStat } from "./crafting-heist";

const socketableClasses = new Map([
    ["local_item_benefit_socketable_as_if_helmet", "Helmet"],
    ["local_item_benefit_socketable_as_if_body_armour", "Body Armour"],
    ["local_item_benefit_socketable_as_if_gloves", "Gloves"],
    ["local_item_benefit_socketable_as_if_boots", "Boots"],
    ["local_item_benefit_socketable_as_if_shield", "Shield"],
]);

export function initialSockets(
    catalog: CraftingCatalog,
    item: Pick<CraftingItem, "baseId" | "jewelSocket">,
) {
    if (catalog.game !== "poe2" || item.jewelSocket) return 0;
    const base = catalog.bases[item.baseId]!;
    return Math.max(
        base.initialSockets,
        ...base.implicits.flatMap((id) =>
            catalog.mods[id]!.stats.filter((stat) => stat.id === "local_has_X_sockets").map(
                (stat) => stat.min,
            ),
        ),
    );
}

export function socketableItemClass(catalog: CraftingCatalog, item: CraftingItem) {
    const base = catalog.bases[item.baseId]!;
    let itemClass = base.item_class;
    const sources = [
        ...(base.initialSockets
            ? base.implicits.map((id) => ({
                  id,
                  values: catalog.mods[id]!.stats.map((stat) => stat.min),
              }))
            : []),
        ...item.implicits,
        ...item.mods,
    ];
    for (const rolled of sources)
        for (const [index, stat] of (catalog.mods[rolled.id]?.stats ?? []).entries())
            if (rolled.values[index] && socketableClasses.has(stat.id))
                itemClass = socketableClasses.get(stat.id)!;
    return itemClass;
}

export function hasAbyssSockets(catalog: CraftingCatalog, item: CraftingItem) {
    return (
        catalog.game === "poe1" &&
        [...item.implicits, ...item.mods].some((entry) =>
            catalog.mods[entry.id]!.stats.some(
                (stat, index) =>
                    stat.id === "local_has_X_abyss_sockets" && entry.values[index]! > 0,
            ),
        )
    );
}

export function socketLimit(
    catalog: CraftingCatalog,
    item: Pick<CraftingItem, "baseId" | "jewelSocket" | "enchantments">,
    level = 100,
) {
    if (item.jewelSocket) return 0;
    const entries = catalog.bases[item.baseId]!.socketInfo.filter((entry) => entry.weight > 0);
    const initial = initialSockets(catalog, item);
    const maximum = Math.max(initial, ...entries.map((entry) => entry.count));
    const levelMaximum = Math.max(
        initial,
        ...entries.filter((entry) => entry.level <= level).map((entry) => entry.count),
    );
    return Math.max(
        0,
        Math.min(levelMaximum, maximum + enchantmentStat(catalog, item, "local_maximum_sockets_+")),
    );
}

export function retainedSocketLimit(
    catalog: CraftingCatalog,
    item: Pick<CraftingItem, "baseId" | "corrupted" | "jewelSocket" | "enchantments">,
) {
    const maximum = socketLimit(catalog, item);
    if (catalog.game !== "poe2") return maximum;
    const base = catalog.bases[item.baseId]!;
    return Math.min(
        base.inventory_width * base.inventory_height,
        maximum + (maximum > 0 && item.corrupted ? 1 : 0),
    );
}

export function socketBenchEligible(
    catalog: CraftingCatalog,
    item: CraftingItem,
    recipe: CraftingCatalog["crafting"]["bench"][number],
) {
    return Boolean(
        catalog.game === "poe1" &&
            !hasAbyssSockets(catalog, item) &&
            (recipe.socketCount || recipe.linkCount) &&
            recipe.itemClasses.includes(catalog.bases[item.baseId]!.item_class) &&
            (recipe.socketCount
                ? recipe.socketCount <= socketLimit(catalog, item)
                : recipe.linkCount! <= (item.sockets ?? 0)),
    );
}

export function validateSocketLinks(catalog: CraftingCatalog, item: CraftingItem) {
    if (
        item.socketLinks &&
        (catalog.game !== "poe1" ||
            hasAbyssSockets(catalog, item) ||
            item.socketLinks.length !== (item.sockets ?? 0) - 1)
    )
        throw new Error(
            "Socket links require one connection per adjacent pair of ordinary PoE 1 gem sockets.",
        );
}

export function linkedSocketRange(item: CraftingItem) {
    const largest = (unknownLinked: boolean) => {
        let current = (item.sockets ?? 0) > 0 ? 1 : 0;
        let maximum = current;
        for (let index = 0; index < (item.sockets ?? 0) - 1; index++) {
            current = (item.socketLinks?.[index] ?? unknownLinked) ? current + 1 : 1;
            maximum = Math.max(maximum, current);
        }
        return maximum;
    };
    return { min: largest(false), max: largest(true) };
}

export function matchesSocketLinks(item: CraftingItem, target: CraftingTarget) {
    if (!target.linkedSockets) return true;
    const range = linkedSocketRange(item);
    const required = target.linkedSockets;
    if (range.min >= required.min && range.max <= required.max) return true;
    if (range.max < required.min || range.min > required.max) return false;
    throw new Error(
        "Socket links are not fully known. Set the starting links or use a craft that guarantees this requirement; remaining-link probabilities are unavailable.",
    );
}

export function setSocketCount(item: CraftingItem, count: number) {
    item.sockets = count;
    delete item.socketLinks;
}

export function setLinkedSockets(item: CraftingItem, count: number) {
    // The bench fixes the first group; the remaining connections have no extracted distribution.
    item.socketLinks = Array.from({ length: item.sockets! - 1 }, (_, index) =>
        index < count - 1 ? true : index === count - 1 ? false : null,
    );
}

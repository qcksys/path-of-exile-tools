import type { CraftingCatalog, CraftingItem, CraftingMod } from "../schemas/crafting";
import { cleanModText } from "./crafting-text";

export function clusterRule(catalog: CraftingCatalog, item: Pick<CraftingItem, "baseId">) {
    return catalog.game === "poe1" ? catalog.crafting.clusterJewels?.bases[item.baseId] : undefined;
}

export function clusterSkills(catalog: CraftingCatalog, item: Pick<CraftingItem, "baseId">) {
    const rule = clusterRule(catalog, item);
    return Object.entries(catalog.crafting.clusterJewels?.skills ?? {})
        .filter(([, skill]) => rule && skill.size === rule.size)
        .map(([id, skill]) => ({ id, ...skill }));
}

export function clusterPassive(catalog: CraftingCatalog, item: Pick<CraftingItem, "cluster">) {
    return item.cluster ? catalog.crafting.clusterJewels?.skills[item.cluster.passive] : undefined;
}

export function clusterTags(catalog: CraftingCatalog, item: Pick<CraftingItem, "cluster">) {
    const passive = clusterPassive(catalog, item);
    return passive ? [passive.tag] : [];
}

export function clusterModPassives(
    catalog: CraftingCatalog,
    mod: Pick<CraftingMod, "stats">,
    values?: number[],
) {
    if (catalog.game !== "poe1") return [];
    const passives = catalog.crafting.clusterJewels?.passives ?? {};
    return mod.stats.flatMap((stat, index) => {
        const passive = passives[stat.id];
        return passive && (values?.[index] ?? stat.max) > 0 ? [passive] : [];
    });
}

export function validateCluster(catalog: CraftingCatalog, item: CraftingItem) {
    const rule = clusterRule(catalog, item);
    if (!rule) {
        if (item.cluster) throw new Error("Cluster passive state requires a PoE 1 Cluster Jewel.");
        return;
    }
    const passive = clusterPassive(catalog, item);
    if (!passive || passive.size !== rule.size)
        throw new Error("Choose an extracted passive type for this Cluster Jewel size.");
    const nodes = item.cluster!.nodes;
    if (nodes !== undefined && (nodes < rule.minNodes || nodes > rule.maxNodes))
        throw new Error(
            `This Cluster Jewel requires ${rule.minNodes}–${rule.maxNodes} passive skills.`,
        );
    if (
        (item.cluster!.jewelSockets ?? 0) >
        Math.min(nodes ?? rule.maxNodes, rule.socketIndices.length)
    )
        throw new Error("The Cluster Jewel socket count exceeds its extracted layout capacity.");
    for (const [index, entry] of item.mods.entries()) {
        const mod = catalog.mods[entry.id];
        const tags = new Set([
            ...catalog.bases[item.baseId]!.tags,
            passive.tag,
            ...item.mods.flatMap((other, otherIndex) =>
                otherIndex === index ? [] : (catalog.mods[other.id]?.adds_tags ?? []),
            ),
        ]);
        if (mod?.generation_weights.find((weight) => tags.has(weight.tag))?.weight === 0)
            throw new Error(
                "Cluster Jewel modifiers conflict with the extracted generation restrictions.",
            );
    }
}

export function clusterText(catalog: CraftingCatalog, item: CraftingItem) {
    const rule = clusterRule(catalog, item);
    const passive = clusterPassive(catalog, item);
    if (!rule || !passive || !item.cluster) return [];
    return [
        `Adds ${item.cluster.nodes ?? `(${rule.minNodes}–${rule.maxNodes})`} Passive Skills`,
        ...(item.cluster.jewelSockets === undefined
            ? []
            : [`${item.cluster.jewelSockets} Added Passive Skills are Jewel Sockets`]),
        ...cleanModText(passive.text!)
            .split("\n")
            .map((line) => `Added Small Passive Skills grant: ${line}`),
    ];
}

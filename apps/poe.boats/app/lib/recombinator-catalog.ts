import type { RecombinatorAffix } from "../schemas/recombinator";
import type { CatalogBase, CatalogMod } from "../schemas/recombinator-catalog";

const armourAttributes = ["str", "dex", "int", "str_int", "str_dex", "dex_int", "str_dex_int"];
const armourClasses = new Set(["Body Armour", "Boots", "Gloves", "Helmet", "Shield"]);

export function catalogBaseOptions(bases: CatalogBase[]): CatalogBase[] {
    const categories: CatalogBase[] = [];
    for (const itemClass of [...new Set(bases.map((base) => base.itemClass))].sort()) {
        const members = bases.filter((base) => base.itemClass === itemClass);
        const attributes = armourClasses.has(itemClass) ? armourAttributes : [null];
        for (const attribute of attributes) {
            const matches = attribute
                ? members.filter((base) => base.tags.includes(`${attribute}_armour`))
                : members;
            if (!matches.length) continue;
            // Shared tags retain the class's mod rules without inheriting a special base's tags.
            const tags = matches[0].tags.filter((tag) =>
                matches.every((base) => base.tags.includes(tag)),
            );
            categories.push({
                id: `generic:${itemClass}:${attribute ?? "all"}`,
                name: attribute
                    ? `Any ${attribute.replaceAll("_", "/").toUpperCase()} ${itemClass}`
                    : `Any ${itemClass}`,
                itemClass,
                tags,
            });
        }
    }
    return [...categories, ...bases];
}

function firstWeight(rules: [string, number][], tags: Set<string>, fallback: number) {
    return rules.find(([tag]) => tags.has(tag))?.[1] ?? fallback;
}

export function availableCatalogMods(
    mods: CatalogMod[],
    base: CatalogBase,
    level: number,
    selected: CatalogMod[] = [],
): CatalogMod[] {
    if (!Number.isInteger(level) || level < 1 || level > 100) return [];
    const tags = new Set([...base.tags, ...selected.flatMap((mod) => mod.addsTags)]);
    const groups = new Set(selected.flatMap((mod) => mod.groups));
    return mods.filter(
        (mod) =>
            mod.level <= level &&
            (mod.maxLevel === 0 || level <= mod.maxLevel) &&
            !mod.groups.some((group) => groups.has(group)) &&
            firstWeight(mod.spawn, tags, 0) > 0 &&
            firstWeight(mod.generation, tags, 100) > 0,
    );
}

export function catalogModLabel(mod: CatalogMod): string {
    return `${mod.text} (${mod.name || mod.id}, ilvl ${mod.level})`;
}

export function catalogModAffix(mod: CatalogMod): RecombinatorAffix {
    return {
        id: `poe1:${mod.id}`,
        label: catalogModLabel(mod),
        group: mod.groups[0],
        groups: mod.groups,
        exclusive: false,
        nonNative: false,
    };
}

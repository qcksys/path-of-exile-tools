import type { Dataset } from "./model.ts";

export function resolveBlightedMaps(mods: Dataset["mods"]) {
    return Object.entries(mods).flatMap(([id, mod]) => {
        if (!mod.stats.some((stat) => stat.id === "is_blighted_map")) return [];
        const maximumAnointments = Number(
            /Can be Anointed up to (\d+) times/.exec(mod.text ?? "")?.[1],
        );
        if (
            mod.domain !== "area" ||
            mod.generation_type !== "unique" ||
            mod.stats.some((stat) => stat.min !== stat.max) ||
            !Number.isSafeInteger(maximumAnointments) ||
            maximumAnointments < 1
        )
            throw new Error(`Unresolved Blighted Map rules: ${id}`);
        return [
            {
                mod: id,
                maximumAnointments,
                ravaged: mod.stats.some(
                    (stat) => stat.id === "is_uber_blighted_map" && stat.min > 0,
                ),
            },
        ];
    });
}

export function resolveFlaskEnchantments(
    currencies: { id: string; action: string; description: string }[],
    mods: Dataset["mods"],
    classes: { id: string; name: string }[],
) {
    const types: Record<string, string> = {
        add_flask_injector: "flask_enchantment_instilling",
        add_flask_seal: "flask_enchantment_enkindling",
    };
    return currencies.flatMap((currency) => {
        const type = types[currency.action];
        if (!type) return [];
        if (!currency.description.includes("enchantment to a utility flask"))
            throw new Error(`Unrecognized flask enchantment instructions: ${currency.id}`);
        const itemClasses = classes
            .filter((entry) => /Utility Flasks$/.test(entry.name))
            .map((entry) => entry.id);
        const modifiers = Object.entries(mods)
            .filter(([, mod]) => mod.generation_type === type)
            .map(([id]) => id);
        if (!itemClasses.length || !modifiers.length)
            throw new Error(`Unresolved flask enchantment pool: ${currency.id}`);
        return [{ id: currency.id, itemClasses, mods: modifiers }];
    });
}

export function resolveMemoryMaps(
    currencies: { id: string; action: string; directions: string }[],
    mods: Dataset["mods"],
) {
    const currency = currencies.filter(
        (entry) => entry.action === "enchant_map_zana_influence_drops",
    );
    if (!currency.length) return null;
    const maximumUses = Number(
        /Can apply up to (\d+) to a single Map item\./.exec(currency[0]!.directions)?.[1],
    );
    if (currency.length !== 1 || !Number.isSafeInteger(maximumUses) || maximumUses < 1)
        throw new Error("Unrecognized Orb of Intention instructions.");
    const modifier = (stats: string[]) => {
        const matches = Object.entries(mods).filter(
            ([, mod]) =>
                mod.domain === "area" &&
                mod.generation_type === "unique" &&
                stats.every((id) => mod.stats.some((stat) => stat.id === id)),
        );
        if (matches.length !== 1 || !matches[0]![1].text)
            throw new Error("Unresolved Memory Influenced Map modifier.");
        return matches[0]![0];
    };
    const enchantmentMod = modifier([
        "map_item_drop_quantity_+%_final_from_zana_influence",
        "map_item_zana_influence_+",
    ]);
    if (
        mods[enchantmentMod]!.stats.length !== 2 ||
        mods[enchantmentMod]!.stats.some((stat) => stat.min !== stat.max)
    )
        throw new Error("Orb of Intention requires fixed extracted enchantment values.");
    return {
        currency: currency[0]!.id,
        maximumUses,
        influenceMod: modifier(["map_zana_influence"]),
        enchantmentMod,
    };
}

export function resolveBeastMapCorruption(category: string, description: string) {
    if (category !== "Corrupt a Map") return null;
    if (description === "To have an Implicit Modifier") return "implicit";
    if (description === "Twice") return "twice";
    throw new Error(`Unrecognized map corruption beast recipe: ${description}`);
}

export function resolveBeastAugmentation(category: string, description: string) {
    if (category !== "Modify Mods on an Item" || !description.startsWith("Add a Mod to "))
        return null;
    if (description === "Add a Mod to a Rare Map") return { itemClass: "Map" };
    const name = /^Add a Mod to an? (\w+) Item$/.exec(description)?.[1];
    const influence = ["Shaper", "Elder", "Crusader", "Redeemer", "Hunter", "Warlord"].indexOf(
        name ?? "",
    );
    if (influence < 0) throw new Error(`Unrecognized augmentation beast recipe: ${description}`);
    return { influence };
}

export function resolveBeastMetamods(category: string, description: string, mods: Dataset["mods"]) {
    if (
        category !== "Modify Mods on an Item" ||
        description !== "Add a crafted Meta-modifier to a non-Unique Item"
    )
        return [];
    return [
        "item_generation_cannot_change_prefixes",
        "item_generation_cannot_change_suffixes",
        "item_generation_cannot_roll_attack_affixes",
        "item_generation_cannot_roll_caster_affixes",
        "item_generation_can_have_multiple_crafted_mods",
    ].map((stat) => {
        const matches = Object.entries(mods).filter(
            ([, mod]) =>
                mod.domain === "crafted" &&
                ["prefix", "suffix"].includes(mod.generation_type) &&
                mod.stats.some((entry) => entry.id === stat && entry.min === 1 && entry.max === 1),
        );
        if (matches.length !== 1) throw new Error(`Unresolved beast metamod: ${stat}`);
        return matches[0]![0];
    });
}

export function resolveTalismanCraft(category: string, description: string, notes: string) {
    if (category === "Create an Imprint" && description === "Of a Rare Talisman")
        return "imprint" as const;
    if (!category.startsWith("Fracture ") || !description.includes("Talisman")) return null;
    const count = /^Fracture (a|two) Modif(?:i)?ers?$/.exec(category)?.[1];
    const minimum = /^On a Rare Talisman with at least (\d+) modifiers$/.exec(description)?.[1];
    if (
        !count ||
        !minimum ||
        notes !== "Does not work on Influenced or Fractured items" ||
        Number(minimum) < (count === "a" ? 1 : 2)
    )
        throw new Error(`Unrecognized Talisman fracture recipe: ${category}: ${description}`);
    return { fractures: count === "a" ? 1 : 2, minimumMods: Number(minimum) };
}

export function resolveBeastSockets(category: string, description: string) {
    return (
        category === "Modify an Item" &&
        description === "to Have Maximum Possible Number of Sockets"
    );
}

export function resolveBeastLinks(category: string, description: string) {
    return category === "Modify an Item" && description === "to Have Maximum Possible Links";
}

export function resolveSanctification(definition: string | undefined) {
    if (definition === undefined) return null;
    const range = /random value ranging from (\d+)% to (\d+)% for each modifier\./.exec(definition);
    const min = Number(range?.[1]);
    const max = Number(range?.[2]);
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min <= 0 || max < min)
        throw new Error("Unrecognized Sanctified modifier range in KeywordPopups.");
    return { min, max };
}

export function resolveCatalystMaximumQuality(text: string) {
    const match = /(?:The maximum (?:random )?quality is |up to a default maximum of )(\d+)%/.exec(
        text,
    );
    const maximum = Number(match?.[1]);
    if (!Number.isSafeInteger(maximum) || maximum <= 0 || maximum > 200)
        throw new Error("Unrecognized catalyst maximum quality in the client description.");
    return maximum;
}

export function resolveBaseQuality(
    currencies: { id: string; action: string; directions: string }[],
    bases: { item_class: string; tags: string[] }[],
    qualityDefinition?: string,
) {
    return currencies.flatMap((currency) => {
        if (!/^add_(armour|weapon|flask|magic_item)_quality(?:_hellscape)?$/.test(currency.action))
            return [];
        return [
            {
                id: currency.id,
                itemClasses: resolveQualityClasses(currency, bases),
                maximumQuality: resolveCatalystMaximumQuality(
                    currency.directions.includes("maximum")
                        ? currency.directions
                        : (qualityDefinition ?? ""),
                ),
                corrupted: currency.action.endsWith("_hellscape"),
            },
        ];
    });
}

export function resolveTaintedCatalysts(
    currencies: { id: string; action: string; directions: string }[],
    bases: { item_class: string; tags: string[] }[],
) {
    return currencies.flatMap((currency) => {
        if (currency.action !== "add_random_jewellery_quality") return [];
        if (!/left click a Corrupted /i.test(currency.directions))
            throw new Error("Unrecognized Tainted Catalyst corruption requirement.");
        return [
            {
                id: currency.id,
                itemClasses: resolveQualityClasses(currency, bases),
                maximumQuality: resolveCatalystMaximumQuality(currency.directions),
            },
        ];
    });
}

export function resolveQualityClasses(
    currency: { id: string; directions: string },
    bases: { item_class: string; tags: string[] }[],
) {
    const target = /left click (?:an? )?(?:corrupted )?(.+?) to apply it\./i
        .exec(currency.directions)?.[1]
        ?.toLowerCase();
    const tags =
        target === "armour"
            ? ["armour"]
            : target === "weapon" || target === "martial weapon"
              ? ["weapon"]
              : target === "flask or tincture"
                ? ["flask", "tincture"]
                : target === "flask"
                  ? ["flask"]
                  : [];
    const classes = target?.split(/, | or /) ?? [];
    const itemClasses = [
        ...new Set(
            bases
                .filter((base) =>
                    tags.length
                        ? base.tags.some((tag) => tags.includes(tag))
                        : classes.includes(base.item_class.toLowerCase()),
                )
                .map((base) => base.item_class),
        ),
    ].sort();
    if (!itemClasses.length)
        throw new Error(`Unresolved base quality target: ${currency.id}/${target}`);
    return itemClasses;
}

export function resolveQualityInfusers(
    currencies: { id: string; action: string; description: string; directions: string }[],
    bases: { item_class: string; tags: string[] }[],
) {
    return currencies.flatMap((currency) => {
        if (
            !/^incursion_(?:armour|martial_weapon|caster_weapon|jewellery)_quality$/.test(
                currency.action,
            )
        )
            return [];
        const extraMaximumQuality = Number(
            /exceeding maximum quality by up to (\d+)%/.exec(currency.description)?.[1],
        );
        if (
            !Number.isSafeInteger(extraMaximumQuality) ||
            extraMaximumQuality <= 0 ||
            extraMaximumQuality > 200 ||
            !currency.directions.includes("at or above maximum quality")
        )
            throw new Error(`Unrecognized quality Infuser instructions: ${currency.id}`);
        return [
            {
                id: currency.id,
                itemClasses: resolveQualityClasses(currency, bases),
                qualityType:
                    currency.action === "incursion_jewellery_quality"
                        ? ("catalyst" as const)
                        : ("base" as const),
                extraMaximumQuality,
            },
        ];
    });
}

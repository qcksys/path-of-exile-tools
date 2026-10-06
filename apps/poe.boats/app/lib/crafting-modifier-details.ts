import type { CraftingItem, CraftingMod } from "../schemas/crafting";
import { clusterTags } from "./crafting-clusters";
import type { CraftingEngine } from "./crafting-engine";
import { modifierFamily } from "./crafting-memory";

export function modifierLevelText(engine: CraftingEngine, id: string) {
    const level = engine.mod(id).required_level;
    const spawnLevel = engine.catalog.crafting.modRules[id]?.spawnLevel ?? level;
    return `ilvl ${spawnLevel}${spawnLevel === level ? "" : ` · modifier level ${level}`}`;
}

export function modifierTiers(
    engine: CraftingEngine,
    baseId: string,
    source: "ordinary" | "essence" = "ordinary",
    cluster?: CraftingItem["cluster"],
) {
    const item = engine.createItem(baseId);
    const base = engine.base(item);
    const catalog = engine.catalog;
    const recipes = new Set(
        (source === "essence"
            ? (["essence"] as const)
            : (["bench", "aspect", "emotion"] as const)
        ).flatMap((kind) => engine.recipePool(item, kind).map((entry) => entry.id)),
    );
    const baseTags = new Set([
        ...base.tags,
        ...clusterTags(catalog, { cluster: cluster ?? item.cluster }),
        ...base.implicits.flatMap((id) => engine.mod(id).adds_tags),
    ]);
    const families = new Map<string, { id: string; mod: CraftingMod; power: number }[]>();
    for (const [id, mod] of Object.entries(catalog.mods)) {
        const rules = catalog.crafting.modRules[id];
        if (
            !["prefix", "suffix"].includes(mod.generation_type) ||
            mod.domain === "veiled" ||
            (source === "essence" && !recipes.has(id)) ||
            rules?.gameMode === 2 ||
            (catalog.game === "poe1" && id.includes("Royale")) ||
            (rules?.itemClasses.length && !rules.itemClasses.includes(base.item_class))
        )
            continue;
        if (!recipes.has(id)) {
            if (
                mod.is_essence_only ||
                ![
                    base.domain,
                    "delve",
                    "unveiled",
                    "desecrated",
                    "mercenary",
                    "ducat_crafted",
                ].includes(mod.domain)
            )
                continue;
            const tags = new Set([
                ...baseTags,
                ...catalog.crafting.influences
                    .filter(
                        (rule) =>
                            rule.itemClass === base.item_class &&
                            rule.influence === rules?.influence,
                    )
                    .map((rule) => rule.tag),
            ]);
            if ((mod.spawn_weights.find((rule) => tags.has(rule.tag))?.weight ?? 0) <= 0) continue;
        }
        const key = JSON.stringify([
            modifierFamily(mod),
            rules?.influence ?? null,
            mod.stats.map((stat) => stat.id),
        ]);
        const family = families.get(key) ?? [];
        // The reference sorts equal-level tiers by power; use extracted range magnitudes.
        const power = mod.stats.reduce(
            (sum, stat) => sum + Math.abs(stat.min) + Math.abs(stat.max),
            0,
        );
        family.push({ id, mod, power });
        families.set(key, family);
    }
    const tiers = new Map<string, number>();
    for (const family of families.values()) {
        family.sort((a, b) => b.mod.required_level - a.mod.required_level || b.power - a.power);
        let tier = 0;
        let previous: (typeof family)[number] | undefined;
        for (const entry of family) {
            if (
                !previous ||
                entry.mod.required_level !== previous.mod.required_level ||
                entry.power !== previous.power
            )
                tier++;
            tiers.set(entry.id, tier);
            previous = entry;
        }
    }
    return tiers;
}

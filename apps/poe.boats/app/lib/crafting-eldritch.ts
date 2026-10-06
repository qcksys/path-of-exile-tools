import type { CraftingMod } from "../schemas/crafting";

export function eldritchTier(mod: CraftingMod) {
    const blocked = mod.spawn_weights
        .map((entry) => /^no_tier_(\d)_eldritch_implicit$/.exec(entry.tag)?.[1])
        .find(Boolean);
    return blocked ? 7 - Number(blocked) : 0;
}

export function eldritchFamilyKey(mod: CraftingMod) {
    return JSON.stringify([
        mod.generation_type,
        mod.type,
        [...mod.groups].sort(),
        mod.stats.map((stat) => stat.id),
        mod.spawn_weights
            .filter((entry) => !entry.tag.startsWith("no_tier_"))
            .map((entry) => entry.tag),
    ]);
}

export function eldritchLabel(mod: CraftingMod) {
    const tier = eldritchTier(mod);
    if (!tier) return;
    const strength = ["Lesser", "Greater", "Grand", "Exceptional", "Exquisite", "Perfect"][
        tier - 1
    ];
    const influence =
        mod.generation_type === "searing_exarch_implicit" ? "Searing Exarch" : "Eater of Worlds";
    return `${influence} · ${strength} (${tier}/6)`;
}

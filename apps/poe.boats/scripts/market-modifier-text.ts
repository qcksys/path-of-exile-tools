import { type ModifierTextModel, modifierTextModelSchema } from "@poe-tools/item-query";
import type { CraftingEngine } from "../app/lib/crafting-engine";
import { incursionGloveModifiers } from "../app/lib/crafting-incursion";
import { modifierTiers } from "../app/lib/crafting-modifier-details";
import { catalystEffect } from "../app/lib/crafting-quality";
import { modifierEffectStats, rolledModText } from "../app/lib/crafting-text";

function displayEquivalentFamilies(engine: CraftingEngine) {
    const signature = (id: string) => {
        const { required_level: _requiredLevel, ...mod } = engine.mod(id);
        return JSON.stringify(mod);
    };
    return incursionGloveModifiers.flatMap((id) => {
        const expected = signature(id);
        const family = Object.keys(engine.catalog.mods)
            .filter(
                (candidate) => !candidate.includes("Royale") && signature(candidate) === expected,
            )
            .sort();
        return family.length > 1 ? [family] : [];
    });
}

export function marketModifierTextModel(
    engine: CraftingEngine,
    baseNames: Set<string>,
): ModifierTextModel {
    const { catalog } = engine;
    const scalable = new Set(catalog.crafting.scalableStats);
    const descriptionIds = new Map<number, number>();
    const translations: NonNullable<ModifierTextModel["translations"]> = {
        statDescriptions: [],
        statLookups: {},
    };
    function descriptions(id: string) {
        const original = catalog.crafting.modDescriptions[id];
        if (!original) return null;
        return original.map((old) => {
            const previous = descriptionIds.get(old);
            if (previous !== undefined) return previous;
            const next = translations.statDescriptions.length;
            const description = catalog.crafting.statDescriptions[old]!;
            translations.statDescriptions.push(description);
            descriptionIds.set(old, next);
            for (const rule of description.rules)
                for (const handler of rule.handlers) {
                    const lookup = catalog.crafting.statLookups[handler];
                    if (lookup) translations.statLookups[handler] = lookup;
                }
            return next;
        });
    }
    const sample = engine.createItem(Object.keys(catalog.bases)[0]!, 100);
    const catalysts = catalog.crafting.catalysts.map((recipe) => ({
        recipe,
        item: { ...sample, catalyst: { id: recipe.id, quality: 1 } },
    }));
    const effectStats = new Set([
        ...modifierEffectStats.prefix,
        ...modifierEffectStats.suffix,
        ...catalog.crafting.taggedModifierEffects
            .filter((rule) => rule.explicit)
            .map((rule) => rule.stat),
    ]);
    const hasEffect = (id: string) =>
        engine
            .mod(id)
            .stats.some((stat) => effectStats.has(stat.id) && (stat.min !== 0 || stat.max !== 0));
    // Keep off-base and non-curated alternatives: spawn eligibility alone cannot prove an item's history.
    const modifiers: ModifierTextModel["modifiers"] = Object.entries(catalog.mods).flatMap(
        ([id, mod]) =>
            ["item", "crafted", "unveiled", "delve", "mercenary", "ducat_crafted"].includes(
                mod.domain,
            ) &&
            (mod.generation_type === "prefix" || mod.generation_type === "suffix") &&
            !id.includes("Royale")
                ? [
                      {
                          id,
                          name: mod.name,
                          side: mod.generation_type,
                          groups: mod.groups,
                          crafted: mod.domain === "crafted",
                          text:
                              mod.text ??
                              (mod.stats.every((stat) => stat.min === 0 && stat.max === 0)
                                  ? ""
                                  : null),
                          ...(hasEffect(id) || !mod.text ? { unsupported: true } : {}),
                          ...(mod.stats.some(
                              (stat) => scalable.has(stat.id) && (stat.min !== 0 || stat.max !== 0),
                          )
                              ? {
                                    scaling: (() => {
                                        const references = descriptions(id);
                                        return references
                                            ? {
                                                  descriptions: references,
                                                  stats: mod.stats.map((stat) => ({
                                                      ...stat,
                                                      scalable: scalable.has(stat.id),
                                                  })),
                                              }
                                            : null;
                                    })(),
                                }
                              : {}),
                          catalysts: catalysts
                              .filter(({ item }) => catalystEffect(catalog, item, id) > 0)
                              .map(({ recipe }) => recipe.description),
                      },
                  ]
                : [],
    );
    const variants = new Map<string, string[]>();
    for (const [id, base] of Object.entries(catalog.bases)) {
        if (!baseNames.has(base.name) || id.includes("Royale")) continue;
        variants.set(base.name, [...(variants.get(base.name) ?? []), id]);
    }
    const bases = [...variants].map(([baseType, ids]) => {
        const maps = ids.map((id) => modifierTiers(engine, id));
        const tiers = Object.fromEntries(
            [...maps[0]!].filter(([id, tier]) => maps.every((map) => map.get(id) === tier)),
        );
        const magnitudes = ids.map((id) => {
            const implicitIds = catalog.bases[id]!.implicits.filter(hasEffect);
            if (!implicitIds.length) return undefined;
            const magnitude = { prefix: 0, suffix: 0, texts: [] as string[] };
            for (const implicit of implicitIds) {
                const mod = engine.mod(implicit);
                if (
                    mod.stats.some(
                        (stat) =>
                            stat.min !== stat.max ||
                            (effectStats.has(stat.id) &&
                                ![
                                    ...modifierEffectStats.prefix,
                                    ...modifierEffectStats.suffix,
                                ].includes(stat.id)),
                    ) ||
                    catalysts.some(({ item }) => catalystEffect(catalog, item, implicit) > 0)
                )
                    return null;
                for (const side of ["prefix", "suffix"] as const)
                    magnitude[side] += mod.stats.reduce(
                        (sum, stat) =>
                            sum + (modifierEffectStats[side].includes(stat.id) ? stat.min : 0),
                        0,
                    );
                const text = rolledModText(catalog, {
                    id: implicit,
                    values: mod.stats.map((stat) => stat.min),
                    crafted: false,
                    fractured: false,
                });
                if (!text) return null;
                magnitude.texts.push(text);
            }
            return magnitude.prefix < 0 || magnitude.suffix < 0 ? null : magnitude;
        });
        const unsupported =
            magnitudes.some((value) => value === null) ||
            new Set(magnitudes.map((value) => JSON.stringify(value))).size > 1;
        const magnitude = unsupported ? undefined : magnitudes[0];
        const catalystProperties = [
            ...new Set(
                ids.flatMap((id) =>
                    catalog.crafting.catalysts
                        .filter((recipe) =>
                            recipe.itemClasses.includes(catalog.bases[id]!.item_class),
                        )
                        .map((recipe) => recipe.description),
                ),
            ),
        ];
        return {
            baseType,
            tiers,
            ...(catalystProperties.length ? { catalystProperties } : {}),
            ...(unsupported ? { unsupported: true } : {}),
            ...(magnitude ? { magnitude } : {}),
        };
    });
    return modifierTextModelSchema.parse({
        format: 1,
        identityFamilies: displayEquivalentFamilies(engine),
        modifiers,
        bases,
        translations,
        catalysts: catalog.crafting.catalysts.map((recipe) => ({
            name: recipe.description,
            maximum: recipe.maximumQuality,
        })),
        unsupportedImplicitTexts: Object.entries(catalog.mods).flatMap(([id, mod]) =>
            hasEffect(id) && mod.text ? [mod.text] : [],
        ),
    });
}

import { ZodError } from "zod";
import {
    availableCatalogMods,
    catalogBaseOptions,
    catalogModAffix,
} from "~/lib/recombinator-catalog";
import {
    parseAffixes,
    type RecombinatorAffix,
    type RecombinatorPlan,
    recombinatorPlanSchema,
} from "~/schemas/recombinator";
import type {
    CatalogBase,
    CatalogRecipe,
    RecombinatorCatalog,
} from "~/schemas/recombinator-catalog";
import { nativeWeight } from "./recombinator";

export type RecombinatorDraftItem = {
    id: string;
    name: string;
    prefixes: string;
    suffixes: string;
    catalog?: {
        base: CatalogBase;
        level: number;
        prefixes: RecombinatorAffix[];
        suffixes: RecombinatorAffix[];
    };
};

export type RecombinatorDraft = {
    items: RecombinatorDraftItem[];
    steps: (Omit<RecombinatorPlan["steps"][number], "leftPreparation" | "rightPreparation"> & {
        leftPreparation?: string;
        rightPreparation?: string;
    })[];
};

export function draftSourceBases(draft: RecombinatorDraft): Map<string, CatalogBase[]> {
    const sources = new Map(
        draft.items.map((item) => [item.id, item.catalog ? [item.catalog.base] : []]),
    );
    for (const step of draft.steps) {
        const bases = [...(sources.get(step.left) ?? []), ...(sources.get(step.right) ?? [])];
        sources.set(step.id, [...new Map(bases.map((base) => [base.id, base])).values()]);
    }
    return sources;
}

export function availablePreparationRecipes(
    catalog: RecombinatorCatalog,
    bases: CatalogBase[],
    kind: CatalogRecipe["kind"],
) {
    const mods = new Map(catalog.mods.map((mod) => [mod.id, mod]));
    return (catalog.recipes ?? []).filter((recipe) => {
        if (
            recipe.kind !== kind ||
            !bases.length ||
            !bases.every((base) => recipe.itemClasses.includes(base.itemClass))
        )
            return false;
        const mod = mods.get(recipe.mod);
        if (!mod) return false;
        return (
            kind === "bench" || bases.some((base) => nativeWeight(catalogModAffix(mod), base) === 0)
        );
    });
}

function resolvePreparation(id: string | undefined, catalog?: RecombinatorCatalog) {
    if (!id) return undefined;
    if (id.startsWith("pending:"))
        throw new Error("Choose a preparation recipe or use the input as is.");
    const recipe = catalog?.recipes?.find((entry) => entry.id === id);
    const mod = catalog?.mods.find((entry) => entry.id === recipe?.mod);
    if (!recipe || !mod) throw new Error("The preparation recipe is unavailable. Select it again.");
    return {
        kind: recipe.kind,
        side: mod.side,
        affix: catalogModAffix(mod),
        itemClasses: recipe.itemClasses,
    };
}

export const emptyRecombinatorDraft: RecombinatorDraft = {
    items: [
        { id: "a", name: "Item 1", prefixes: "", suffixes: "" },
        { id: "b", name: "Item 2", prefixes: "", suffixes: "" },
    ],
    steps: [{ id: "combine", name: "Combine items", left: "a", right: "b" }],
};

export function catalogExampleDraft(catalog: RecombinatorCatalog): RecombinatorDraft {
    const base =
        catalogBaseOptions(catalog.bases).find(
            (candidate) => candidate.id === "generic:Body Armour:str_dex",
        ) ?? catalog.bases[0];
    const pool = availableCatalogMods(catalog.mods, base, 86).toSorted((a, b) => b.level - a.level);
    const chosen: typeof pool = [];
    for (const mod of pool) {
        if (chosen.filter((entry) => entry.side === mod.side).length >= 3) continue;
        if (mod.groups.some((group) => chosen.some((entry) => entry.groups.includes(group))))
            continue;
        chosen.push(mod);
    }
    const prefixes = chosen.filter((mod) => mod.side === "prefixes");
    const suffixes = chosen.filter((mod) => mod.side === "suffixes");
    return {
        items: [0, 1, 0, 2].map((tier, index) => ({
            id: ["a", "b", "c", "d"][index],
            name: `Item ${index + 1}`,
            prefixes: "",
            suffixes: "",
            catalog: {
                base,
                level: 86,
                prefixes: prefixes.length
                    ? [catalogModAffix(prefixes[tier % prefixes.length])]
                    : [],
                suffixes: suffixes.length
                    ? [catalogModAffix(suffixes[index % suffixes.length])]
                    : [],
            },
        })),
        steps: exampleRecombinatorDraft.steps,
    };
}

export const exampleRecombinatorDraft: RecombinatorDraft = {
    items: [
        { id: "a", name: "Life + fire", prefixes: "T1 life", suffixes: "T1 fire resistance" },
        { id: "b", name: "Armour + cold", prefixes: "T1 armour", suffixes: "T1 cold resistance" },
        { id: "c", name: "Life + cold", prefixes: "T1 life", suffixes: "T1 cold resistance" },
        {
            id: "d",
            name: "Evasion + lightning",
            prefixes: "T1 evasion",
            suffixes: "T1 lightning resistance",
        },
    ],
    steps: [
        { id: "first", name: "Build first pair", left: "a", right: "b" },
        { id: "second", name: "Build second pair", left: "c", right: "d" },
        { id: "finish", name: "Combine both results", left: "first", right: "second" },
    ],
};

function resolveCatalogAffixes(
    selection: RecombinatorDraftItem["catalog"],
    catalog?: RecombinatorCatalog,
) {
    if (!selection) return { prefixes: [], suffixes: [] };
    if (!catalog) throw new Error("Load the item catalog before calculating selected mods.");
    if (!Number.isInteger(selection.level) || selection.level < 1 || selection.level > 100) {
        throw new Error("Item level must be a whole number from 1 to 100.");
    }
    const base = catalogBaseOptions(catalog.bases).find(
        (candidate) => candidate.id === selection.base.id,
    );
    if (!base) throw new Error("The selected base is no longer in the catalog. Select it again.");
    const byId = new Map(catalog.mods.map((mod) => [`poe1:${mod.id}`, mod]));
    const selected = [...selection.prefixes, ...selection.suffixes].map((affix) => {
        const mod = byId.get(affix.id);
        if (!mod) throw new Error(`Unknown catalog modifier: ${affix.label ?? affix.id}`);
        return mod;
    });
    function resolveSide(side: "prefixes" | "suffixes") {
        return selection![side].map((affix) => {
            const mod = byId.get(affix.id)!;
            if (
                mod.side !== side ||
                !availableCatalogMods(
                    [mod],
                    base!,
                    selection!.level,
                    selected.filter((candidate) => candidate !== mod),
                ).length
            ) {
                throw new Error(
                    `${mod.name || mod.id} is not eligible for ${base!.name} at item level ${selection!.level}. Remove it and select an eligible mod.`,
                );
            }
            return {
                ...catalogModAffix(mod),
                exclusive: affix.exclusive,
                nonNative: affix.nonNative,
            };
        });
    }
    return { prefixes: resolveSide("prefixes"), suffixes: resolveSide("suffixes"), base };
}

export function parseRecombinatorDraft(
    draft: RecombinatorDraft,
    catalog?: RecombinatorCatalog,
): RecombinatorPlan {
    try {
        return recombinatorPlanSchema.parse({
            items: draft.items.map(
                ({ id, name, prefixes, suffixes, catalog: selection }, index) => {
                    let chosen: ReturnType<typeof resolveCatalogAffixes>;
                    try {
                        chosen = resolveCatalogAffixes(selection, catalog);
                    } catch (error) {
                        throw new Error(
                            `Item ${index + 1} (${name}): ${error instanceof Error ? error.message : "Invalid catalog selection."}`,
                        );
                    }
                    try {
                        return {
                            id,
                            name,
                            item: {
                                ...("base" in chosen ? { base: chosen.base } : {}),
                                prefixes: [...chosen.prefixes, ...parseAffixes(prefixes)],
                                suffixes: [...chosen.suffixes, ...parseAffixes(suffixes)],
                            },
                        };
                    } catch {
                        throw new Error(
                            `Item ${index + 1} (${name}): use a modifier label, optionally followed by | group. Labels and groups must be 1–80 characters.`,
                        );
                    }
                },
            ),
            steps: draft.steps.map((step) => ({
                ...step,
                leftPreparation: resolvePreparation(step.leftPreparation, catalog),
                rightPreparation: resolvePreparation(step.rightPreparation, catalog),
            })),
        });
    } catch (error) {
        if (!(error instanceof ZodError)) throw error;
        throw new Error(
            error.issues
                .map((issue) => {
                    const [collection, index, ...fields] = issue.path;
                    const location =
                        typeof index === "number"
                            ? `${collection === "items" ? "Item" : "Step"} ${index + 1}`
                            : "Plan";
                    const field = fields.filter((value) => value !== "item").join(" ");
                    return `${location}${field ? ` ${field}` : ""}: ${issue.message}`;
                })
                .join("\n"),
        );
    }
}

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { type ItemCondition, modifierIdentitySchema } from "@poe-tools/item-query";
import {
    type MarketCohort,
    marketCohortManifestSchema,
    modifierLevelBands,
} from "@poe-tools/market";
import { CraftingEngine } from "../app/lib/crafting-engine";
import { incursionGloveModifiers } from "../app/lib/crafting-incursion";
import { modifierTiers } from "../app/lib/crafting-modifier-details";
import { craftingCatalogSchema } from "../app/schemas/crafting";
import { marketModifierTextModel } from "./market-modifier-text";

const bytes = await readFile("public/game-data/crafting-poe1.json");
const catalogHash = createHash("sha256").update(bytes).digest("hex");
const catalog = craftingCatalogSchema.parse(JSON.parse(bytes.toString()));
if (catalog.game !== "poe1") throw new Error("Public stash cohorts require PoE 1 data.");
const engine = new CraftingEngine(catalog);
const equipment = new Set([
    "Two Hand Sword",
    "Wand",
    "Dagger",
    "Rune Dagger",
    "Claw",
    "One Hand Axe",
    "One Hand Sword",
    "Thrusting One Hand Sword",
    "One Hand Mace",
    "Sceptre",
    "Bow",
    "Staff",
    "Warstaff",
    "Two Hand Axe",
    "Two Hand Mace",
    "Ring",
    "Amulet",
    "Belt",
    "Shield",
    "Helmet",
    "Body Armour",
    "Boots",
    "Gloves",
    "Quiver",
]);
const includedNames = new Set([
    "Grasping Mail",
    "Amethyst Ring",
    "Two-Stone Ring",
    "Diamond Ring",
    "Steel Ring",
    "Opal Ring",
    "Vermillion Ring",
    "Iolite Ring",
    "Cerulean Ring",
    "Unset Ring",
    "Helical Ring",
    "Manifold Ring",
    "Heavy Belt",
    "Leather Belt",
    "Crystal Belt",
    "Stygian Vise",
    "Onyx Amulet",
    "Agate Amulet",
    "Citrine Amulet",
    "Turquoise Amulet",
    "Simplex Amulet",
    "Focused Amulet",
]);
const grouped = new Map<string, Array<[string, (typeof catalog.bases)[string]]>>();
for (const entry of Object.entries(catalog.bases)) {
    const [id, base] = entry;
    if (
        !equipment.has(base.item_class) ||
        base.corrupted ||
        !base.rarities.includes("rare") ||
        id.includes("Royale")
    )
        continue;
    const defences = Object.entries(base.defences)
        .filter(([, range]) => range && range.max > 0)
        .map(([key]) => key)
        .sort();
    const key = JSON.stringify([base.item_class, defences]);
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
}
const selected = new Map<string, (typeof catalog.bases)[string]>();
for (const entries of grouped.values()) {
    entries.sort((a, b) => b[1].drop_level - a[1].drop_level || a[0].localeCompare(b[0]));
    const unique = entries.filter(
        (entry, index) => entries.findIndex((other) => other[1].name === entry[1].name) === index,
    );
    for (const [id, base] of unique.slice(0, 3)) selected.set(id, base);
}
for (const [id, base] of Object.entries(catalog.bases))
    if (includedNames.has(base.name) && !id.includes("Royale")) selected.set(id, base);
const changes = Object.entries(catalog.mods).flatMap(([id, mod]) => [
    catalog.crafting.modRules[id]?.spawnLevel ?? mod.required_level,
    ...(mod.maximum_level > 0 ? [mod.maximum_level + 1] : []),
]);
const cohorts: MarketCohort[] = [];
const generatedNames = new Set<string>();
for (const [, base] of [...selected].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (generatedNames.has(base.name)) continue;
    generatedNames.add(base.name);
    const variants = [...selected]
        .filter(([, variant]) => variant.name === base.name)
        .map(([id]) => id);
    const bands = modifierLevelBands(changes, (level) =>
        variants.flatMap((id) =>
            engine
                .pool({ ...engine.createItem(id, level), rarity: "rare" })
                .map((mod) => ({ ...mod, id: `${id}:${mod.id}` })),
        ),
    );
    const slug = base.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    for (const band of bands) {
        for (const sixLinked of base.socketInfo.some((socket) => socket.count === 6)
            ? [false, true]
            : [false]) {
            const filters: ItemCondition[] = [
                { kind: "base", field: "baseType", values: [base.name] },
                { kind: "rarity", values: ["Normal", "Magic", "Rare"] },
                { kind: "range", field: "ilvl", value: band },
                ...(
                    ["corrupted", "mirrored", "fractured", "synthesised", "influenced"] as const
                ).map((field) => ({ kind: "flag" as const, field, value: false })),
                ...(sixLinked
                    ? [{ kind: "range" as const, field: "links" as const, value: { min: 6 } }]
                    : []),
            ];
            cohorts.push({
                id: `base:${slug}:${band.min}-${band.max}:${sixLinked ? "6-link" : "any-links"}`,
                name: `${base.name}, ilvl ${band.min}–${band.max}${sixLinked ? ", six-linked" : ""}`,
                purpose: "base",
                query: { format: 1, game: "poe1", groups: [{ type: "and", filters }] },
            });
        }
    }
}
const curatedIds = new Set<string>();
for (const [baseId, base] of selected) {
    const item = { ...engine.createItem(baseId, 100), rarity: "rare" as const };
    const tiers = modifierTiers(engine, baseId);
    for (const { id, mod } of engine.pool(item)) {
        const tier = tiers.get(id);
        if (tier !== 1 && tier !== 2) continue;
        for (const [min, max] of [
            [1, 83],
            [84, 85],
            [86, 100],
        ]) {
            const key = createHash("sha256")
                .update(JSON.stringify([base.name, id, tier, min, max]))
                .digest("hex");
            const cohortId = `fracture:${key}`;
            if (curatedIds.has(cohortId)) continue;
            curatedIds.add(cohortId);
            cohorts.push({
                id: cohortId,
                name: `${base.name}, T${tier} ${mod.name}, fractured, ilvl ${min}–${max}`,
                purpose: "fracture",
                query: {
                    format: 1,
                    game: "poe1",
                    groups: [
                        {
                            type: "and",
                            filters: [
                                { kind: "base", field: "baseType", values: [base.name] },
                                { kind: "rarity", values: ["Magic", "Rare"] },
                                { kind: "range", field: "ilvl", value: { min, max } },
                                ...(
                                    ["corrupted", "mirrored", "synthesised", "influenced"] as const
                                ).map((field) => ({ kind: "flag" as const, field, value: false })),
                                { kind: "flag", field: "fractured", value: true },
                                {
                                    kind: "mod",
                                    ids: [id],
                                    tier: { min: tier, max: tier },
                                    fractured: true,
                                    crafted: false,
                                    count: { min: 1 },
                                },
                            ],
                        },
                    ],
                },
            });
        }
    }
}
const donorMods = [
    ...incursionGloveModifiers.map((id) => ["Gloves", id] as const),
    ["Body Armour", "BreachBodyCriticalChanceIncreasedByUncappedLightningResistance1"],
] as const;
for (const [itemClass, id] of donorMods) {
    const mod = engine.mod(id);
    const names = new Set(
        Object.entries(catalog.bases)
            .filter(
                ([baseId, base]) =>
                    base.item_class === itemClass &&
                    base.rarities.includes("rare") &&
                    !base.corrupted &&
                    !baseId.includes("Royale"),
            )
            .map(([, base]) => base.name),
    );
    for (const name of [...names].sort()) {
        for (const count of [null, 1, 2, 3]) {
            const key = createHash("sha256")
                .update(JSON.stringify([name, id, count]))
                .digest("hex");
            cohorts.push({
                id: `donor:${key}`,
                name: `${name}, ${mod.name}: ${mod.text?.replace(/\n/g, "; ").slice(0, 160) ?? id}${count === null ? ", any affix count" : `, ${count} suffix${count === 1 ? "" : "es"}`}`,
                purpose: count === null ? "transfer-donor" : "isolated-modifier",
                query: {
                    format: 1,
                    game: "poe1",
                    groups: [
                        {
                            type: "and",
                            filters: [
                                { kind: "base", field: "baseType", values: [name] },
                                { kind: "rarity", values: ["Magic", "Rare"] },
                                ...(
                                    [
                                        "corrupted",
                                        "mirrored",
                                        "fractured",
                                        "synthesised",
                                        "influenced",
                                    ] as const
                                ).map((field) => ({ kind: "flag" as const, field, value: false })),
                                {
                                    kind: "mod",
                                    ids: [id],
                                    side: "suffix",
                                    fractured: false,
                                    crafted: false,
                                    count: { min: 1 },
                                },
                                ...(count === null
                                    ? []
                                    : [
                                          {
                                              kind: "range" as const,
                                              field: "suffixes" as const,
                                              value: { min: count, max: count },
                                          },
                                      ]),
                            ],
                        },
                    ],
                },
            });
        }
    }
}
const modifierIdentities = Object.entries(catalog.mods).flatMap(([id, mod]) =>
    mod.name && (mod.generation_type === "prefix" || mod.generation_type === "suffix")
        ? [
              modifierIdentitySchema.parse({
                  id,
                  name: mod.name,
                  side: mod.generation_type,
                  level: mod.required_level,
                  text: mod.text ?? null,
              }),
          ]
        : [],
);
const modifierTextModel = marketModifierTextModel(
    engine,
    new Set(
        cohorts.flatMap((cohort) =>
            cohort.query.groups.flatMap((group) =>
                group.filters.flatMap((filter) =>
                    filter.kind === "base" && filter.field === "baseType" ? filter.values : [],
                ),
            ),
        ),
    ),
);
for (const cohort of [...cohorts]) {
    if (!["isolated-modifier", "transfer-donor"].includes(cohort.purpose)) continue;
    for (const family of modifierTextModel.identityFamilies ?? []) {
        if (
            !cohort.query.groups.some((group) =>
                group.filters.some(
                    (filter) =>
                        filter.kind === "mod" &&
                        filter.ids?.length === 1 &&
                        family.includes(filter.ids[0]!),
                ),
            )
        )
            continue;
        cohorts.push({
            ...cohort,
            id: `donor-family:${createHash("sha256")
                .update(JSON.stringify([cohort.id, family]))
                .digest("hex")}`,
            name: `${cohort.name}, display-equivalent family`,
            query: {
                ...cohort.query,
                groups: cohort.query.groups.map((group) => ({
                    ...group,
                    filters: group.filters.map((filter) =>
                        filter.kind === "mod" &&
                        filter.ids?.length === 1 &&
                        family.includes(filter.ids[0]!)
                            ? { ...filter, ids: family }
                            : filter,
                    ),
                })),
            },
        });
    }
}
const revision = createHash("sha256")
    .update(JSON.stringify({ catalogHash, cohorts, modifierIdentities, modifierTextModel }))
    .digest("hex");
const manifest = marketCohortManifestSchema.parse({
    format: 1,
    game: "poe1",
    revision,
    catalogHash,
    cohorts,
    modifierIdentities,
    modifierTextModel,
});
await mkdir("../../packages/poe-market/data", { recursive: true });
await writeFile(
    "../../packages/poe-market/data/cohorts-poe1.json",
    `${JSON.stringify(manifest)}\n`,
);
console.log(
    `Generated ${cohorts.length} cohorts for ${generatedNames.size} base names: ${revision}`,
);

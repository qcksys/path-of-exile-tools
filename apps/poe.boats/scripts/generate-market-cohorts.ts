import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { ItemCondition } from "@poe-tools/item-query";
import {
    type MarketCohort,
    marketCohortManifestSchema,
    modifierLevelBands,
    significantLevelBands,
} from "@poe-tools/market";
import { CraftingEngine } from "../app/lib/crafting-engine";
import { incursionGloveModifiers } from "../app/lib/crafting-incursion";
import { modifierTiers } from "../app/lib/crafting-modifier-details";
import { validateRulesetIndex } from "../app/lib/crafting-rulesets";
import { cleanModText, rolledModText } from "../app/lib/crafting-text";
import {
    MARKET_BASE_ATTRIBUTES,
    MARKET_BASE_MIN_LEVEL,
    MARKET_CLUSTER_LEVEL_BANDS,
    type MarketBase,
    marketBasesSchema,
} from "../app/lib/market-bases";
import {
    MARKET_BASE_CATEGORIES,
    MARKET_CLUSTER_BASE_CATEGORY,
    marketBaseCategory,
} from "../app/lib/market-categories";
import { craftingCatalogSchema } from "../app/schemas/crafting";
import { craftingPresetCohorts } from "./crafting-preset-cohorts";
import { writeCapturePolicy } from "./generate-capture-policy";
import { marketBaseIdentities } from "./market-base-identities";
import { marketModifierIdentities, marketModifierTextModel } from "./market-modifier-text";

const bytes = await readFile("public/game-data/crafting-poe1.json");
const catalogHash = createHash("sha256").update(bytes).digest("hex");
const catalog = craftingCatalogSchema.parse(JSON.parse(bytes.toString()));
if (catalog.game !== "poe1") throw new Error("Public stash cohorts require PoE 1 data.");
const engine = new CraftingEngine(catalog);
const history = validateRulesetIndex(
    JSON.parse(await readFile("crafting-history/index.json", "utf8")),
);
const current = history.revisions.find((entry) =>
    history.latest.some(
        (latest) =>
            latest.game === catalog.game &&
            entry.game === latest.game &&
            entry.era === latest.era &&
            entry.revision === latest.revision,
    ),
);
if (!current) throw new Error("The crafting presets require a current ruleset.");
const presetCohorts = craftingPresetCohorts(engine, current);
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
const armour = new Set(["Helmet", "Body Armour", "Boots", "Gloves", "Shield"]);
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
    "Cryonic Ring",
    "Enthalpic Ring",
    "Synaptic Ring",
    "Organic Ring",
    "Fugitive Ring",
    "Formless Ring",
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
const marketBases: MarketBase[] = [];
const generatedNames = new Set<string>();
for (const [baseId, base] of [...selected].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (generatedNames.has(base.name)) continue;
    generatedNames.add(base.name);
    const variants = [...selected]
        .filter(([, variant]) => variant.name === base.name)
        .map(([id]) => id);
    const pool = (level: number) =>
        variants.flatMap((id) =>
            engine
                .pool({ ...engine.createItem(id, level), rarity: "rare" })
                .map((mod) => ({ ...mod, id: `${id}:${mod.id}` })),
        );
    const topTiers = new Set(
        variants.flatMap((id) =>
            [...modifierTiers(engine, id)].flatMap(([mod, tier]) =>
                tier === 1 ? [`${id}:${mod}`] : [],
            ),
        ),
    );
    const unlocked = (level: number) => {
        const previous = new Set(pool(level - 1).map((mod) => mod.id));
        return pool(level)
            .filter((mod) => topTiers.has(mod.id) && !previous.has(mod.id))
            .reduce((sum, mod) => sum + mod.weight, 0);
    };
    // At most three listed bands: the two highest levels that each unlock at least a tenth of the
    // base's gated top-tier weight split off, and lower levels group together.
    const bands = significantLevelBands(
        modifierLevelBands(changes, pool),
        MARKET_BASE_MIN_LEVEL,
        unlocked,
        0.1,
        2,
    );
    const slug = base.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    const unmodified: ItemCondition[] = (
        ["corrupted", "mirrored", "fractured", "synthesised", "influenced", "intangible"] as const
    ).map((field) => ({ kind: "flag" as const, field, value: false }));
    const category = MARKET_BASE_CATEGORIES[marketBaseCategory(baseId, base)];
    if (!category) throw new Error(`No crafting base market category for ${base.item_class}.`);
    const { strength = 0, dexterity = 0, intelligence = 0, level = 0 } = base.requirements ?? {};
    const identity = {
        // `marketBasesSchema` rejects a class outside `MARKET_BASE_CLASSES` when the file is written.
        itemClass: base.item_class as MarketBase["itemClass"],
        attributes: MARKET_BASE_ATTRIBUTES.filter(
            (_, index) => [strength, dexterity, intelligence][index]! > 0,
        ),
        level,
    };
    // One-handed weapons, shields, helmets, gloves and boots list six sockets at an unreachable level.
    const sixSockets = base.socketInfo.some(
        (socket) => socket.count === 6 && socket.weight > 0 && socket.level <= 100,
    );
    for (const band of bands) {
        const listed = band.max >= MARKET_BASE_MIN_LEVEL;
        for (const links of [
            "any",
            ...(sixSockets ? (["6"] as const) : []),
            ...(sixSockets && listed ? (["1-5"] as const) : []),
        ] as const) {
            const id = `base:${slug}:${band.min}-${band.max}:${links === "any" ? "any-links" : `${links}-link`}`;
            cohorts.push({
                id,
                name: `${base.name}, ilvl ${band.min}–${band.max}${{ any: "", "6": ", six-linked", "1-5": ", one to five linked" }[links]}`,
                purpose: "base",
                query: {
                    format: 1,
                    game: "poe1",
                    groups: [
                        {
                            type: "and",
                            filters: [
                                { kind: "base", field: "baseType", values: [base.name] },
                                { kind: "rarity", values: ["Normal", "Magic", "Rare"] },
                                { kind: "range", field: "ilvl", value: band },
                                ...unmodified,
                                ...(links === "any"
                                    ? []
                                    : [
                                          {
                                              kind: "range" as const,
                                              field: "links" as const,
                                              value: links === "6" ? { min: 6 } : { max: 5 },
                                          },
                                      ]),
                            ],
                        },
                    ],
                },
            });
            // Six-socket bases list their link split instead of the combined cohort.
            if (listed && (links !== "any" || !sixSockets))
                marketBases.push({
                    id,
                    baseType: base.name,
                    category,
                    ...identity,
                    ilvl: band,
                    links: links === "any" ? null : links,
                    quality: null,
                });
        }
    }
    if (!armour.has(base.item_class)) continue;
    for (const quality of [25, 30]) {
        const id = `base:${slug}:86-100:any-links:q${quality}`;
        cohorts.push({
            id,
            name: `${base.name}, ilvl 86–100, ${quality}%+ quality`,
            purpose: "base",
            query: {
                format: 1,
                game: "poe1",
                groups: [
                    {
                        type: "and",
                        filters: [
                            { kind: "base", field: "baseType", values: [base.name] },
                            { kind: "rarity", values: ["Normal", "Magic", "Rare"] },
                            { kind: "range", field: "ilvl", value: { min: 86, max: 100 } },
                            ...unmodified,
                            { kind: "range", field: "quality", value: { min: quality } },
                        ],
                    },
                ],
            },
        });
        marketBases.push({
            id,
            baseType: base.name,
            category,
            ...identity,
            ilvl: { min: 86, max: 100 },
            links: null,
            quality,
        });
    }
}
// Cluster Jewels split by size, skill, passive count and poe.ninja's item level bands.
const clusters = catalog.crafting.clusterJewels;
if (!clusters) throw new Error("Cluster Jewel bases require extracted Cluster Jewel data.");
for (const rule of Object.values(clusters.bases)) {
    const baseType = `${rule.size} Cluster Jewel`;
    const skills = Object.entries(clusters.skills).filter(([, skill]) => skill.size === rule.size);
    const firstLines = new Set(skills.map(([, skill]) => cleanModText(skill.text!).split("\n")[0]));
    if (firstLines.size !== skills.length)
        throw new Error(`${baseType} skills must differ in their first line.`);
    for (const [skillId, skill] of skills) {
        const lines = cleanModText(skill.text!).split("\n");
        for (let passives = rule.minNodes; passives <= rule.maxNodes; passives++)
            for (const band of MARKET_CLUSTER_LEVEL_BANDS) {
                const id = `base:${baseType.toLowerCase().replaceAll(" ", "-")}:${skillId}:${passives}-passives:${band.min}-${band.max}`;
                cohorts.push({
                    id,
                    name: `${baseType}, ${skill.name}, ${passives} passives, ilvl ${band.min}–${band.max}`,
                    purpose: "base",
                    query: {
                        format: 1,
                        game: "poe1",
                        groups: [
                            {
                                type: "and",
                                filters: [
                                    { kind: "base", field: "baseType", values: [baseType] },
                                    { kind: "rarity", values: ["Normal", "Magic", "Rare"] },
                                    { kind: "range", field: "ilvl", value: { ...band } },
                                    ...(
                                        [
                                            "corrupted",
                                            "mirrored",
                                            "fractured",
                                            "synthesised",
                                            "influenced",
                                            "intangible",
                                        ] as const
                                    ).map((field) => ({
                                        kind: "flag" as const,
                                        field,
                                        value: false,
                                    })),
                                    {
                                        kind: "enchant",
                                        values: [`Adds ${passives} Passive Skills`],
                                    },
                                    {
                                        kind: "enchant",
                                        values: [`Added Small Passive Skills grant: ${lines[0]}`],
                                    },
                                ],
                            },
                        ],
                    },
                });
                marketBases.push({
                    id,
                    baseType,
                    category: MARKET_CLUSTER_BASE_CATEGORY,
                    itemClass: baseType as MarketBase["itemClass"],
                    attributes: [],
                    level: null,
                    ilvl: { ...band },
                    links: null,
                    quality: null,
                    cluster: { skill: lines.join(", "), passives },
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
cohorts.push(...presetCohorts);
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
const modifierIdentities = marketModifierIdentities(engine, modifierTextModel);
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
const baseIdentities = marketBaseIdentities(
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
const scourBases = new Set([
    "Metadata/Items/Armours/Shields/ShieldStrE3",
    "Metadata/Items/Armours/Shields/ShieldStr17",
    "Metadata/Items/Armours/Shields/ShieldInt16",
    "Metadata/Items/Armours/Helmets/HelmetInt11",
    "Metadata/Items/Armours/Helmets/HelmetStr10",
    "Metadata/Items/Armours/Boots/BootsAtlas1",
    "Metadata/Items/Armours/BodyArmours/BodyDex16",
    "Metadata/Items/Armours/BodyArmours/BodyInt17",
]);
const sourcePreparationModel = {
    format: 6,
    bases: Object.entries(catalog.bases)
        .filter(
            ([id, base]) =>
                (["Body Armour", "Helmet", "Gloves", "Boots"].includes(base.item_class) ||
                    scourBases.has(id)) &&
                !base.implicits.some((id) =>
                    engine
                        .mod(id)
                        .stats.some((stat) => stat.id === "local_implicit_mod_cannot_be_changed"),
                ),
        )
        .map(([id, base]) => {
            const definition = { id, baseType: base.name, itemClass: base.item_class };
            if (!scourBases.has(id)) return definition;
            let texts: string[][] = [[]];
            for (const modId of base.implicits) {
                let rolls: number[][] = [[]];
                for (const stat of engine.mod(modId).stats) {
                    const count = stat.max - stat.min + 1;
                    if (
                        !Number.isInteger(count) ||
                        count < 1 ||
                        rolls.length * count * texts.length > 256
                    )
                        throw new Error(
                            `Unbounded native implicit rolls for Scouring source ${id}.`,
                        );
                    rolls = rolls.flatMap((values) =>
                        Array.from({ length: count }, (_, index) => [...values, stat.min + index]),
                    );
                }
                const rendered = rolls.map((values) =>
                    rolledModText(catalog, { id: modId, values, fractured: false, crafted: false }),
                );
                if (rendered.some((text) => !text))
                    throw new Error(`Unrenderable native implicit for Scouring source ${id}.`);
                texts = texts.flatMap((lines) =>
                    rendered.map((text) => [...lines, ...text!.split("\n")]),
                );
            }
            return { ...definition, scourImplicits: { ids: base.implicits, texts } };
        }),
};
const revision = createHash("sha256")
    .update(
        JSON.stringify({
            catalogHash,
            cohorts,
            modifierIdentities,
            modifierTextModel,
            baseIdentities,
            sourcePreparationModel,
        }),
    )
    .digest("hex");
const manifest = marketCohortManifestSchema.parse({
    format: 1,
    game: "poe1",
    revision,
    catalogHash,
    cohorts,
    modifierIdentities,
    modifierTextModel,
    baseIdentities,
    sourcePreparationModel,
});
await mkdir("../../packages/poe-market/data", { recursive: true });
await writeFile(
    "../../packages/poe-market/data/cohorts-poe1.json",
    `${JSON.stringify(manifest)}\n`,
);
await writeFile(
    "../../packages/poe-market/data/market-bases-poe1.json",
    `${JSON.stringify(marketBasesSchema.parse({ revision, bases: marketBases }))}\n`,
);
await writeCapturePolicy(catalog);
console.log(
    `Generated ${cohorts.length} cohorts for ${generatedNames.size} base names: ${revision}`,
);

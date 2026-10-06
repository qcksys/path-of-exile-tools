import { readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { Game } from "./config.ts";
import { extractAllflame } from "./crafting-allflame.ts";
import { extractAugments } from "./crafting-augments.ts";
import {
    type CraftingData,
    randomFossilOutcomeIds,
    validateCraftingData,
} from "./crafting-data-model.ts";
import { extractGenesis } from "./crafting-genesis.ts";
import {
    resolveBaseQuality,
    resolveBeastAugmentation,
    resolveBeastLinks,
    resolveBeastMapCorruption,
    resolveBeastMetamods,
    resolveBeastSockets,
    resolveBlightedMaps,
    resolveCatalystMaximumQuality,
    resolveFlaskEnchantments,
    resolveMemoryMaps,
    resolveQualityClasses,
    resolveQualityInfusers,
    resolveSanctification,
    resolveTaintedCatalysts,
    resolveTalismanCraft,
} from "./crafting-keywords.ts";
import { essenceClasses } from "./crafting-recipes.ts";
import { refreshCraftingPackage } from "./distribute.ts";
import { digest, writeJson } from "./io.ts";
import {
    baseItemsSchema,
    type Dataset,
    dataPackageManifestSchema,
    itemClassesSchema,
    modsSchema,
    tagsSchema,
} from "./model.ts";
import { passiveGraphNodes } from "./passive-graph.ts";
import { packageDirectory, schemaUrl } from "./pipeline.ts";
import { type AssetSource, Source } from "./source.ts";
import { type Row, Tables } from "./tables.ts";
import { Translations } from "./translations.ts";

function weights(row: Row, tags: string, values: string) {
    const keys = row.refs(tags).map((entry) => entry.id());
    const numbers = row.numbers(values);
    if (keys.length !== numbers.length) throw new Error(`${row.table.name}: weight arrays differ`);
    return keys.map((tag, index) => ({ tag, weight: numbers[index]! }));
}

export async function normalizeCraftingData(
    tables: Tables,
    mods: Dataset["mods"],
    source: AssetSource,
    bases: Dataset["base_items"],
): Promise<
    Omit<
        CraftingData,
        | "format"
        | "game"
        | "patch"
        | "source"
        | "statDescriptions"
        | "modDescriptions"
        | "modTexts"
        | "statLookups"
    >
> {
    const poe1 = tables.game === "poe1";
    await tables.load([
        "BaseItemTypes",
        "Mods",
        "Stats",
        "ItemClasses",
        "Tags",
        "CurrencyItems",
        "Rarity",
        "ModEquivalencies",
        "AlternateQualityTypes",
        "ModEffectStats",
        "RecombinableClasses",
        "BlightCraftingItems",
        "BlightCraftingRecipes",
        "BlightCraftingResults",
        "PassiveSkills",
        "Strongboxes",
        "Chests",
    ]);
    if (poe1)
        await tables.load([
            "InfluenceTags",
            "BlightCraftingTypes",
            "InfluenceModUpgrades",
            "Essences",
            "EssenceType",
            "CraftingBenchOptions",
            "CraftingItemClassCategories",
            "DelveCraftingModifiers",
            "DelveCraftingTags",
            "DelveCraftingModifierDescriptions",
            "HarvestCraftOptions",
            "BestiaryRecipes",
            "BestiaryRecipeComponent",
            "BestiaryRecipeCategories",
            "ZanaInfluenceCostPerCurrency",
            "Maps",
            "WorldAreas",
            "IncursionRooms",
            "DeepwaterCraftingClasses",
            "DeepwaterCraftingCurrencies",
            "DeepwaterBalancePerLevel",
            "KeywordPopupItemReference",
            "ClientStrings",
            "KeywordPopups",
            "PassiveSkillTrees",
            "BrequelPassiveSubTrees",
            "PassiveTreeExpansionJewels",
            "PassiveTreeExpansionJewelSizes",
            "PassiveTreeExpansionSkills",
            "PassiveTreeExpansionSpecialSkills",
        ]);
    else
        await tables.load([
            "TieredCurrency",
            "Essences",
            "EssenceMods",
            "EssenceTargetItemCategories",
            "EssenceReplacementType",
            "CraftableModTypes",
            "ModType",
            "AbyssBenchTicketTypes",
            "LiquidEmotionOutcomes",
            "KeywordPopups",
            "PassiveSkillTrees",
            "Ascendancy",
            "Maps",
            "MapTiers",
            "Incursion2CorruptionCurrencies",
            "ClientStrings",
            "SoulCores",
            "SoulCoreStats",
            "SoulCoreLimits",
            "SoulCoreTypes",
            "SoulCoreStatCategories",
            "ClientStrings2",
            "Expedition2WarpingRuneStatToTag",
            "Expedition2ElementalModConversions",
        ]);
    const field = (one: string, two: string) => (poe1 ? one : two);
    const optionalEnum = (row: Row, column: string, maximum = Number.POSITIVE_INFINITY) => {
        const value = row.value(column);
        return typeof value === "number" && value >= 0 && value <= maximum ? value : null;
    };
    const keywords = Object.fromEntries(
        poe1
            ? []
            : tables
                  .rows("KeywordPopups")
                  .filter((row) =>
                      ["Sanctified", "Abyssalify", "MarkofAbyssalLord", "Quality"].includes(
                          row.id(),
                      ),
                  )
                  .map((row) => [
                      row.id(),
                      { term: row.string("Term"), definition: row.string("Definition") },
                  ]),
    );
    const passiveData = (passive: Row) => ({
        name: passive.string("Name"),
        hash: passive.number("PassiveSkillGraphId"),
        notable: passive.boolean("IsNotable"),
        stats: passive.refs("Stats").map((stat, index) => ({
            id: stat.id(),
            min: passive.number(`Stat${index + 1}Value`),
            max: passive.number(`Stat${index + 1}Value`),
        })),
        text: null,
    });
    let passiveTree: CraftingData["passiveTree"] = null;
    if (!poe1) {
        const tree = tables.rows("PassiveSkillTrees").find((row) => row.id() === "Default");
        if (!tree) throw new Error("Missing default passive skill tree.");
        const asset = `${tree.string("PassiveSkillGraph")}.psg`;
        const nodes = passiveGraphNodes(await source.get(asset));
        passiveTree = {
            asset,
            notables: Object.fromEntries(
                tables
                    .rows("PassiveSkills")
                    .filter(
                        (row) =>
                            row.boolean("IsNotable") &&
                            row.string("Name") &&
                            nodes.has(row.number("PassiveSkillGraphId")),
                    )
                    .map((row) => [
                        row.id(),
                        {
                            ...passiveData(row),
                            ascendancy: row.ref("Ascendancy")?.id() ?? null,
                            visibleForAscendancy: row.ref("VisibleForAscendancy")?.id() ?? null,
                        },
                    ]),
            ),
        };
    }
    const currencies = tables.rows("CurrencyItems").flatMap((row) => {
        const base = row.ref(field("BaseItemTypesKey", "BaseItemType"));
        return base
            ? [
                  {
                      id: base.id(),
                      name: base.string("Name"),
                      action: row.string("Action"),
                      description: row.string("Description"),
                      directions: row.string("Directions"),
                  },
              ]
            : [];
    });
    const augments = extractAugments(tables, bases);
    const referencedStats = new Set([
        ...Object.values(mods).flatMap((entry) => entry.stats.map((stat) => stat.id)),
        ...augments.flatMap((entry) =>
            entry.rules.flatMap((rule) =>
                [...rule.stats, ...rule.bondedStats].map((stat) => stat.id),
            ),
        ),
    ]);
    return {
        currencies,
        allflame: extractAllflame(tables),
        genesis: await extractGenesis(tables, source),
        clusterJewels: poe1
            ? {
                  bases: Object.fromEntries(
                      tables.rows("PassiveTreeExpansionJewels").map((row) => [
                          row.ref("BaseItemTypesKey")!.id(),
                          {
                              size: row.ref("PassiveTreeExpansionJewelSizesKey")!.string("Name"),
                              minNodes: row.number("MinNodes"),
                              maxNodes: row.number("MaxNodes"),
                              socketIndices: row.numbers("SocketIndices"),
                          },
                      ]),
                  ),
                  skills: Object.fromEntries(
                      tables.rows("PassiveTreeExpansionSkills").map((row) => {
                          const passive = row.ref("PassiveSkillsKey")!;
                          return [
                              passive.id(),
                              {
                                  ...passiveData(passive),
                                  size: row
                                      .ref("PassiveTreeExpansionJewelSizesKey")!
                                      .string("Name"),
                                  tag: row.ref("TagsKey")!.id(),
                                  text: null,
                              },
                          ];
                      }),
                  ),
                  passives: Object.fromEntries(
                      tables.rows("PassiveTreeExpansionSpecialSkills").map((row) => {
                          const passive = row.ref("PassiveSkillsKey")!;
                          return [
                              row.ref("StatsKey")!.id(),
                              { id: passive.id(), ...passiveData(passive) },
                          ];
                      }),
                  ),
              }
            : null,
        strongboxes: tables.rows("Strongboxes").map((row) => {
            const chest = row.ref("ChestsKey");
            if (!chest) throw new Error("Strongbox has no resolved chest definition.");
            return {
                id: chest.id(),
                name: chest.string("Name"),
                inheritsFrom: chest.string("InheritsFrom"),
                baseItem: chest.ref("BaseItemTypesKey")?.id() ?? null,
                tags: chest.refs("TagsKeys").map((tag) => tag.id()),
                mods: chest.refs("ModsKeys").map((mod) => mod.id()),
                minimumLevel: chest.number("MinLevel"),
                maximumLevel: chest.number("MaxLevel"),
                spawnWeight: row.number("SpawnWeight"),
                spawnWeightIncreaseStat: row.ref("SpawnWeightIncrease")?.id() ?? null,
                spawnWeightHardmode: row.number("SpawnWeightHardmode"),
                basicSpawnChanceStat: poe1 ? null : (row.ref("BasicSpawnChanceStat")?.id() ?? null),
                requiredSpawnStats: poe1
                    ? []
                    : row.refs("RequiredSpawnStat").map((stat) => stat.id()),
                blockingSpawnStats: poe1
                    ? []
                    : row.refs("BlockingSpawnStat").map((stat) => stat.id()),
            };
        }),
        augments,
        augmentTags: Object.fromEntries(
            poe1
                ? []
                : tables.rows("Expedition2WarpingRuneStatToTag").map((row) => {
                      const stat = row.ref("Stat");
                      const tag = row.ref("Tag");
                      if (!stat || !tag) throw new Error("Unresolved Warping rune stat or tag.");
                      return [stat.id(), tag.id()];
                  }),
        ),
        taggedModifierEffects: tables.rows("ModEffectStats").flatMap((row) => {
            const stat = row.ref(field("StatsKey", "Stat"));
            const tags = row.refs(field("TagsKeys", "Tags")).map((entry) => entry.id());
            if (!stat || !referencedStats.has(stat.id()) || !tags.length) return [];
            return [
                {
                    stat: stat.id(),
                    tags,
                    explicit: row.boolean("ApplyToExplicit"),
                    implicit: row.boolean("ApplyToImplicit"),
                    prefix: poe1 && row.boolean("ApplyToPrefix"),
                    suffix: poe1 && row.boolean("ApplyToSuffix"),
                },
            ];
        }),
        memoryMaps: poe1 ? resolveMemoryMaps(currencies, mods) : null,
        locus: poe1
            ? (() => {
                  const room = tables
                      .rows("IncursionRooms")
                      .find((row) => row.id() === "CorruptionRoomIII");
                  if (!room) throw new Error("Missing Locus of Corruption room.");
                  return {
                      id: room.id(),
                      name: room.string("Name"),
                      tier: room.number("Tier"),
                      description: room.string("Description"),
                  };
              })()
            : null,
        maps: poe1
            ? tables.rows("Maps").map((row) => {
                  const base = row.ref("BaseItemTypesKey");
                  const area = row.ref("Regular_WorldAreasKey");
                  if (!base || !area) throw new Error("Unresolved map base or world area.");
                  return {
                      id: base.id(),
                      tier: row.number("Tier"),
                      generation: row.number("MapGeneration"),
                      upgrade: row.ref("MapUpgrade_BaseItemTypesKey")?.id() ?? null,
                      areaLevel: row.number("Shaped_AreaLevel") || area.number("AreaLevel"),
                  };
              })
            : [],
        waystones: poe1
            ? []
            : tables.rows("Maps").map((row) => {
                  const base = row.ref("BaseItemType");
                  const tier = row.number("Tier");
                  const levels = tables
                      .rows("MapTiers")
                      .filter((entry) => entry.number("Tier") === tier);
                  if (!base || levels.length !== 1)
                      throw new Error(`Unresolved Waystone tier: ${tier}`);
                  return {
                      id: base.id(),
                      tier,
                      series: row.number("MapSeries"),
                      areaLevel: levels[0]!.number("Level"),
                  };
              }),
        baseQuality: resolveBaseQuality(
            currencies,
            Object.values(bases),
            keywords.Quality?.definition,
        ),
        templeCorruption: poe1
            ? null
            : {
                  currencies: tables.rows("Incursion2CorruptionCurrencies").map((row) => ({
                      id: row.ref("BaseItemType")!.id(),
                      itemClasses: row.refs("ItemClasses").map((entry) => entry.id()),
                  })),
                  twiceCorruptedText: tables
                      .rows("ClientStrings")
                      .find((row) => row.id() === "ItemPopupDoubleCorrupted")!
                      .string("Text"),
                  alreadyTwiceCorruptedText: tables
                      .rows("ClientStrings")
                      .find((row) => row.id() === "ItemErrorAlreadyIncursionCorrupted")!
                      .string("Text"),
              },
        qualityInfusers: resolveQualityInfusers(currencies, Object.values(bases)),
        taintedCatalysts: poe1 ? resolveTaintedCatalysts(currencies, Object.values(bases)) : [],
        passiveTree,
        keywords,
        memoryStrandCosts: Object.fromEntries(
            poe1
                ? tables
                      .rows("ZanaInfluenceCostPerCurrency")
                      .map((row) => [row.string("Action"), row.number("Cost")])
                : [],
        ),
        sanctification: resolveSanctification(keywords.Sanctified?.definition),
        anointing: {
            maps: poe1 ? resolveBlightedMaps(mods) : [],
            items: tables.rows("BlightCraftingItems").map((row) => ({
                id: row.ref(field("Oil", "BaseItemType"))!.id(),
                useType: row.number("UseType"),
                tier: row.number("Tier"),
            })),
            recipes: tables.rows("BlightCraftingRecipes").map((row) => {
                const outcome = row.ref(field("BlightCraftingResultsKey", "BlightCraftingResult"));
                if (!outcome) throw new Error(`Missing anointing outcome: ${row.id()}`);
                return {
                    id: row.id(),
                    type: poe1 ? row.ref("BlightCraftingTypesKey")!.id() : null,
                    items: row
                        .refs(field("BlightCraftingItemsKeys", "BlightCraftingItems"))
                        .map((item) => item.ref(field("Oil", "BaseItemType"))!.id()),
                    mod: outcome.ref("Mod")?.id() ?? null,
                    passive: outcome.ref("PassiveSkill")?.id() ?? null,
                };
            }),
            passives: Object.fromEntries(
                tables.rows("BlightCraftingResults").flatMap((row) => {
                    const passive = row.ref("PassiveSkill");
                    if (!passive) return [];
                    return [[passive.id(), passiveData(passive)]];
                }),
            ),
        },
        liquidEmotions: poe1
            ? []
            : tables.rows("LiquidEmotionOutcomes").map((row) => {
                  const currency = row.ref("BaseItemType");
                  if (!currency)
                      throw new Error("LiquidEmotionOutcomes: missing currency reference.");
                  const radius = row.number("RadiusJewel");
                  if (radius !== 0 && radius !== 1)
                      throw new Error(`LiquidEmotionOutcomes: unknown jewel type ${radius}.`);
                  return {
                      id: currency.id(),
                      rules: ["Ruby", "Emerald", "Sapphire", "Diamond"].flatMap((colour) => {
                          const outcomes = ["Prefix", "Suffix"].flatMap((side) => {
                              const mod = row.ref(`${colour}${side}`);
                              if (!mod) return [];
                              if (mods[mod.id()]?.generation_type !== side.toLowerCase())
                                  throw new Error(
                                      `LiquidEmotionOutcomes: invalid ${side} ${mod.id()}.`,
                                  );
                              return [mod.id()];
                          });
                          if (!outcomes.length) return [];
                          const name = `${radius ? "Time-Lost " : ""}${colour}`;
                          const bases = tables
                              .rows("BaseItemTypes")
                              .filter(
                                  (entry) =>
                                      entry.string("Name") === name &&
                                      entry.ref("ItemClass")?.id() === "Jewel",
                              );
                          if (bases.length !== 1)
                              throw new Error(
                                  `LiquidEmotionOutcomes: unresolved or ambiguous jewel ${name}.`,
                              );
                          return [{ base: bases[0]!.id(), mods: outcomes }];
                      }),
                  };
              }),
        recombinableClasses: tables.rows("RecombinableClasses").map((row) => {
            const itemClass = row.ref("Id");
            if (!itemClass) throw new Error("RecombinableClasses: missing item class reference.");
            return itemClass.id();
        }),
        mapQuality: poe1
            ? tables.rows("AlternateQualityTypes").flatMap((row) => {
                  const item = row.ref("Item");
                  const currency = currencies.find((entry) => entry.id === item?.id());
                  if (currency?.action !== "add_map_alt_quality") return [];
                  return [
                      {
                          id: currency.id,
                          itemClasses: resolveQualityClasses(currency, Object.values(bases)),
                          maximumQuality: resolveCatalystMaximumQuality(currency.directions),
                          qualityType: row.id(),
                          description: row.string("Description"),
                          stats: row.refs("MapStats").map((stat) => stat.id()),
                      },
                  ];
              })
            : [],
        catalysts: tables.rows("AlternateQualityTypes").flatMap((row) => {
            const item = row.ref("Item");
            const effect = row.ref("ModEffectStat");
            const currency = tables
                .rows("CurrencyItems")
                .find(
                    (entry) =>
                        entry.ref(field("BaseItemTypesKey", "BaseItemType"))?.index === item?.index,
                );
            if (
                !item ||
                !effect ||
                !currency ||
                !["add_jewellery_quality", "add_alternate_quality"].includes(
                    currency.string("Action"),
                )
            )
                return [];
            const classes = poe1
                ? (
                      currency
                          .string("Directions")
                          .match(/left click a (.+?) to apply it\./)?.[1] ?? ""
                  )
                      .split(/, | or /)
                      .map((name) => {
                          const itemClass = tables
                              .rows("ItemClasses")
                              .find((entry) => entry.id().toLowerCase() === name);
                          if (!itemClass)
                              throw new Error(
                                  `Unresolved catalyst item class: ${item.id()}/${name}`,
                              );
                          return itemClass.id();
                      })
                : row.refs("ItemClass").map((entry) => entry.id());
            return [
                {
                    id: item.id(),
                    qualityType: row.id(),
                    description: row.string("Description"),
                    maximumQuality: resolveCatalystMaximumQuality(
                        poe1 ? currency.string("Directions") : keywords.Quality!.definition,
                    ),
                    itemClasses: classes,
                    tags: effect.refs(field("TagsKeys", "Tags")).map((entry) => entry.id()),
                    explicit: effect.boolean("ApplyToExplicit"),
                    implicit: effect.boolean("ApplyToImplicit"),
                    prefix: poe1 && effect.boolean("ApplyToPrefix"),
                    suffix: poe1 && effect.boolean("ApplyToSuffix"),
                },
            ];
        }),
        scalableStats: tables
            .rows("Stats")
            .filter((row) => row.boolean("IsScalable") && referencedStats.has(row.id()))
            .map((row) => row.id()),
        modEquivalencies: tables.rows("ModEquivalencies").map((row) => ({
            id: row.id(),
            mods: [
                "ModsKey0",
                "ModsKey1",
                "ModsKey2",
                ...(poe1 ? ["AbyssalMods1", "AbyssalMods2", "AbyssalMods3"] : []),
            ].flatMap((column) => (row.ref(column) ? [row.ref(column)!.id()] : [])),
        })),
        elementalConversions: poe1
            ? []
            : tables.rows("Expedition2ElementalModConversions").map((row) => ({
                  id: row.id(),
                  // Column 5 separates resistance conversions from Aldur weapon conversions.
                  resistance: row.unnamedBoolean(5),
                  mods: {
                      fire: row.ref("FireMod")?.id() ?? null,
                      cold: row.ref("ColdMod")?.id() ?? null,
                      lightning: row.ref("LightningMod")?.id() ?? null,
                      chaos: row.ref("ChaosMod")?.id() ?? null,
                  },
              })),
        desecration: poe1
            ? []
            : tables.rows("AbyssBenchTicketTypes").map((row) => ({
                  id: row.ref("BaseItemType")!.id(),
                  itemClasses: row.refs("UsableOnItemClasses").map((entry) => entry.id()),
                  maximumItemLevel: row.number("MaximumItemLevel"),
                  minimumModLevel: row.number("MinimumModLevel"),
                  tag: row.ref("Tag")?.id() ?? null,
              })),
        baseRules: Object.fromEntries(
            tables.rows("BaseItemTypes").map((row) => [
                row.id(),
                {
                    corrupted: row.boolean("IsCorrupted"),
                    unmodifiable: row.boolean("Unmodifiable"),
                    // The pinned PoE 2 schema leaves its initial socket count unnamed.
                    initialSockets: poe1 ? 0 : row.unnamedInt32(30),
                },
            ]),
        ),
        craftableModTypes: poe1
            ? []
            : tables.rows("CraftableModTypes").map((row) => row.ref("ModType")!.string("Name")),
        tieredCurrency: poe1
            ? []
            : tables.rows("TieredCurrency").flatMap((row) => {
                  const base = row.ref("BaseItemType");
                  return base
                      ? [
                            {
                                id: base.id(),
                                tier: row.number("Tier"),
                                minimumModLevel: row.number("MinimumModLevel"),
                            },
                        ]
                      : [];
              }),
        poe2Essences: poe1
            ? []
            : tables.rows("Essences").flatMap((row) => {
                  const base = row.ref("BaseItemType");
                  if (!base) return [];
                  return [
                      {
                          id: base.id(),
                          name: base.string("Name"),
                          tier: row.number("Tier"),
                          perfect: row.boolean("Perfect"),
                          replacement: row.refs("ReplacementType").map((entry) => entry.id()),
                          rules: tables
                              .rows("EssenceMods")
                              .filter((entry) => entry.ref("Essence")?.index === row.index)
                              .map((entry) => {
                                  const mods = entry.refs("OutcomeMods");
                                  const weights = entry.numbers("OutcomeModWeights");
                                  if (weights.length && mods.length !== weights.length)
                                      throw new Error("Essence outcome arrays differ");
                                  return {
                                      itemClasses:
                                          entry
                                              .ref("TargetItemCategory")
                                              ?.refs("ItemClasses")
                                              .map((itemClass) => itemClass.id()) ?? [],
                                      mod: entry.ref("Mod")?.id() ?? null,
                                      text: entry.string("Text"),
                                      outcomes: mods.map((mod, index) => ({
                                          mod: mod.id(),
                                          weight: weights[index] ?? null,
                                      })),
                                  };
                              }),
                      },
                  ];
              }),
        rarities: Object.fromEntries(
            tables.rows("Rarity").map((row) => [
                row.id(),
                {
                    min: row.number("MinMods"),
                    max: row.number("MaxMods"),
                    prefixes: row.number("MaxPrefix"),
                    suffixes: row.number("MaxSuffix"),
                },
            ]),
        ),
        classes: Object.fromEntries(
            tables.rows("ItemClasses").map((row) => [
                row.id(),
                {
                    influence: row.boolean("CanHaveInfluence"),
                    fracture: row.boolean("CanBeFractured"),
                    veiled: row.boolean("CanHaveVeiledMods"),
                    corrupt: row.boolean("CanBeCorrupted"),
                    doubleCorrupt: poe1 && row.boolean("CanBeDoubleCorrupted"),
                    aspects: row.boolean("CanHaveAspects"),
                    upgrade: row.boolean("CanUpgradeRarity"),
                    unmodifiable: row.boolean(field("Unmodifiable", "Unmodfiable")),
                },
            ]),
        ),
        influences: poe1
            ? tables.rows("InfluenceTags").flatMap((row) => {
                  const itemClass = row.ref("ItemClass");
                  const tag = row.ref("Tag");
                  const influence = row.number("Influence");
                  const nameId = [
                      "ItemPopupShaperItem",
                      "ItemPopupElderItem",
                      "ItemPopupCrusaderItem",
                      "ItemPopupRedeemerItem",
                      "ItemPopupHunterItem",
                      "ItemPopupWarlordItem",
                  ][influence];
                  const name = tables
                      .rows("ClientStrings")
                      .find((entry) => entry.id() === nameId)
                      ?.string("Text")
                      .replace(/ Item$/, "");
                  if (!name) throw new Error(`Missing client name for influence ${influence}.`);
                  return itemClass && tag
                      ? [
                            {
                                itemClass: itemClass.id(),
                                influence,
                                name,
                                tag: tag.id(),
                            },
                        ]
                      : [];
              })
            : [],
        modRules: Object.fromEntries(
            tables.rows("Mods").map((row) => [
                row.id(),
                {
                    itemClasses: row
                        .refs("CraftingItemClassRestrictions")
                        .map((entry) => entry.id()),
                    influence: optionalEnum(row, field("InfluenceTypes", "InfluenceType"), 5),
                    spawnLevel: poe1 ? null : row.number("SpawnLevel_Override") || null,
                    gameMode: poe1 ? optionalEnum(row, "GameMode") : null,
                },
            ]),
        ),
        essences: poe1
            ? tables.rows("Essences").flatMap((row) => {
                  const base = row.ref("BaseItemTypesKey");
                  const type = row.ref("EssenceTypeKey");
                  if (base && !type) throw new Error(`Unresolved essence type: ${base.id()}`);
                  return base
                      ? [
                            {
                                id: base.id(),
                                name: base.string("Name"),
                                level: row.number("Level"),
                                itemLevelLimit: row.number("ItemLevelRestriction"),
                                corrupted: type!.boolean("IsCorruptedEssence"),
                                mods: Object.fromEntries(
                                    Object.entries(essenceClasses).flatMap(([column, classes]) => {
                                        const mod = row.ref(`${column}_ModsKey`);
                                        return mod
                                            ? classes.map((itemClass) => [itemClass, mod.id()])
                                            : [];
                                    }),
                                ),
                            },
                        ]
                      : [];
              })
            : [],
        influenceUpgrades: poe1
            ? tables.rows("InfluenceModUpgrades").flatMap((row) => {
                  const mod = row.ref("InfluenceMod");
                  const upgraded = row.ref("UpgradedMod");
                  return mod && upgraded
                      ? [
                            {
                                mod: mod.id(),
                                upgraded: upgraded.id(),
                                highestTier: row.boolean("HighestTier"),
                            },
                        ]
                      : [];
              })
            : [],
        flaskEnchantments: poe1
            ? resolveFlaskEnchantments(
                  currencies,
                  mods,
                  tables
                      .rows("ItemClasses")
                      .map((row) => ({ id: row.id(), name: row.string("Name") })),
              )
            : [],
        bench: poe1
            ? tables
                  .rows("CraftingBenchOptions")
                  .filter((row) => !row.boolean("IsDisabled") && !row.boolean("IsAreaOption"))
                  .map((row) => {
                      const currencies = row.refs("Cost_BaseItemTypes");
                      const amounts = row.numbers("Cost_Values");
                      if (currencies.length !== amounts.length)
                          throw new Error("Bench cost arrays differ");
                      return {
                          id: `bench:${row.index}`,
                          name: row.string("Name"),
                          mod: row.ref("AddMod")?.id() ?? null,
                          socketCount: row.number("Sockets") > 0 ? row.number("Sockets") : null,
                          linkCount: row.number("Links") > 0 ? row.number("Links") : null,
                          enchantment: row.ref("AddEnchantment")
                              ? {
                                    mod: row.ref("AddEnchantment")!.id(),
                                    itemClasses: row.refs("ItemClasses").map((entry) => entry.id()),
                                }
                              : null,
                          itemClasses: [
                              ...new Set(
                                  [
                                      ...row.refs("ItemClasses"),
                                      ...row
                                          .refs("CraftingItemClassCategories")
                                          .flatMap((category) => category.refs("ItemClasses")),
                                  ].map((entry) => entry.id()),
                              ),
                          ],
                          cost: currencies.map((base, index) => ({
                              id: base.id(),
                              name: base.string("Name"),
                              amount: amounts[index]!,
                          })),
                          level: row.number("RequiredLevel"),
                          action: row.value("CraftingBenchCustomAction") as number | null,
                      };
                  })
            : [],
        fossils: poe1
            ? tables.rows("DelveCraftingModifiers").flatMap((row) => {
                  const base = row.ref("BaseItemTypesKey");
                  if (!base) return [];
                  const restrictions = (column: string) =>
                      row.refs(column).map((entry) => {
                          const tag = entry.ref("TagsKey")?.id() ?? null;
                          const name = entry.string("ItemClass");
                          const itemClass =
                              tables
                                  .rows("ItemClasses")
                                  .find(
                                      (value) =>
                                          value.id() === name || value.string("Name") === name,
                                  )
                                  ?.id() ?? "";
                          if (!tag && !itemClass)
                              throw new Error(`Unresolved fossil restriction: ${name}`);
                          return { tag, itemClass };
                      });
                  return [
                      {
                          id: base.id(),
                          name: base.string("Name"),
                          positive: weights(row, "Weight_TagsKeys", "Weight_Values"),
                          negative: weights(
                              row,
                              "NegativeWeight_TagsKeys",
                              "NegativeWeight_Values",
                          ),
                          added: row.refs("AddedModsKeys").map((entry) => entry.id()),
                          forced: row.refs("ForcedAddModsKeys").map((entry) => entry.id()),
                          allowed: restrictions("AllowedDelveCraftingTagsKeys"),
                          forbidden: restrictions("ForbiddenDelveCraftingTagsKeys"),
                          descriptions: row
                              .refs("DelveCraftingModifierDescriptionsKeys")
                              .map((entry) => entry.string("Description")),
                          effects: row
                              .refs("DelveCraftingModifierDescriptionsKeys")
                              .map((entry) => entry.id()),
                          randomOutcomes: row
                              .refs("DelveCraftingModifierDescriptionsKeys")
                              .some((entry) => entry.id() === "RandomModifier")
                              ? randomFossilOutcomeIds(
                                    tables
                                        .rows("DelveCraftingModifiers")
                                        .flatMap(
                                            (entry) => entry.ref("BaseItemTypesKey")?.id() ?? [],
                                        ),
                                )
                              : [],
                          lucky: row.boolean("HasLuckyRolls"),
                          quality: row.boolean("CanImproveQuality"),
                          mirrored: row.boolean("CanMirrorItem"),
                          whiteSockets: row.boolean("CanRollWhiteSockets"),
                          corruptedEssenceChance: row.number("CorruptedEssenceChance"),
                      },
                  ];
              })
            : [],
        harvest: poe1
            ? tables.rows("HarvestCraftOptions").map((row) => ({
                  id: row.id(),
                  name: row.string("Description") || row.string("Text"),
                  command: row.string("Command"),
                  parameters: row.string("Parameters"),
                  enchantment: resolveHarvestEnchantment(
                      row.string("Command"),
                      row.string("Parameters"),
                  ),
                  affinityMultiplier: resolveHarvestAffinity(
                      row.string("Command"),
                      row.string("Parameters"),
                  ),
                  influenceRerollClasses: resolveHarvestInfluenceClasses(
                      row.string("Command"),
                      row.string("Parameters"),
                  ),
                  lifeforceType: row.number("LifeforceType"),
                  lifeforce: row.number("LifeforceCost"),
                  sacred: row.number("SacredCost"),
                  gameMode: row.value("GameMode") as number | null,
              }))
            : [],
        beasts: poe1
            ? tables.rows("BestiaryRecipes").map((row) => ({
                  id: row.id(),
                  category: row.ref("Category")?.string("Text") ?? "",
                  description: row.string("Description"),
                  notes: row.string("Notes"),
                  components: row
                      .refs("BestiaryRecipeComponentKeys")
                      .map((entry) => ({ id: entry.id(), level: entry.number("MinLevel") })),
                  mod: row.ref("FlaskMod")?.id() ?? null,
                  aspectMod: resolveAspectModifier(row.string("Description"), mods),
                  metamods: resolveBeastMetamods(
                      row.ref("Category")?.string("Text") ?? "",
                      row.string("Description"),
                      mods,
                  ),
                  augmentation: resolveBeastAugmentation(
                      row.ref("Category")?.string("Text") ?? "",
                      row.string("Description"),
                  ),
                  mapCorruption: resolveBeastMapCorruption(
                      row.ref("Category")?.string("Text") ?? "",
                      row.string("Description"),
                  ),
                  maximumSockets: resolveBeastSockets(
                      row.ref("Category")?.string("Text") ?? "",
                      row.string("Description"),
                  ),
                  maximumLinks: resolveBeastLinks(
                      row.ref("Category")?.string("Text") ?? "",
                      row.string("Description"),
                  ),
                  talismanCraft: resolveTalismanCraft(
                      row.ref("Category")?.string("Text") ?? "",
                      row.string("Description"),
                      row.string("Notes"),
                  ),
                  gameMode: row.value("GameMode") as number | null,
              }))
            : [],
    };
}

export function resolveHarvestAffinity(command: string, parameters: string) {
    if (command !== "reroll_with_current_tags_affinity_multiplier") return null;
    const increase = Number(parameters);
    if (!/^-?\d+$/.test(parameters) || !Number.isSafeInteger(increase) || increase <= -100)
        throw new Error(`Unsupported Harvest affinity parameters: ${parameters}`);
    return (100 + increase) / 100;
}

export function resolveHarvestInfluenceClasses(command: string, parameters: string) {
    if (command !== "reroll_influence_types") return null;
    if (!/^[A-Za-z_]+(?: [A-Za-z_]+)*$/.test(parameters))
        throw new Error(`Unsupported Harvest influence parameters: ${parameters}`);
    const classes = parameters.split(" ").map((name) => name.replaceAll("_", " "));
    if (new Set(classes).size !== classes.length)
        throw new Error("Duplicate Harvest influence item class.");
    return classes;
}

export function resolveHarvestEnchantment(command: string, parameters: string) {
    if (command !== "add_enchant_to_class") return null;
    const match = /^([A-Za-z_]+(?: [A-Za-z_]+)*) ENCHANTS (\S+)$/.exec(parameters);
    if (!match) throw new Error(`Unsupported Harvest enchantment parameters: ${parameters}`);
    return {
        mod: match[2]!,
        itemClasses: match[1]!.split(" ").map((name) => name.replaceAll("_", " ")),
    };
}

export function resolveAspectModifier(description: string, mods: Dataset["mods"]) {
    const aspect = /^(?:Level (\d+) )?(Aspect of the .+?) skill$/i.exec(description);
    if (!aspect) return null;
    const candidates = Object.entries(mods).flatMap(([id, mod]) => {
        const text = /^Grants Level (\d+) (Aspect of the .+?) Skill$/i.exec(mod.text ?? "");
        if (
            mod.domain !== "item" ||
            mod.generation_type !== "suffix" ||
            !text ||
            text[2]!.toLowerCase() !== aspect[2]!.toLowerCase() ||
            !mod.grants_effects.some((effect) => effect.level === Number(text[1]))
        )
            return [];
        return [{ id, level: Number(text[1]) }];
    });
    const level = aspect[1]
        ? Number(aspect[1])
        : Math.min(...candidates.map((entry) => entry.level));
    const matching = candidates.filter((entry) => entry.level === level);
    if (matching.length !== 1)
        throw new Error(`Unresolved or ambiguous Aspect recipe: ${description}`);
    return matching[0]!.id;
}

export async function exportCraftingDescriptions(
    crafting: Pick<
        CraftingData,
        "anointing" | "passiveTree" | "augments" | "genesis" | "clusterJewels"
    >,
    mods: Dataset["mods"],
    translations: Translations,
) {
    for (const [id, passive] of [
        ...Object.entries(crafting.anointing.passives),
        ...Object.entries(crafting.genesis?.passives ?? {}),
        ...Object.entries(crafting.passiveTree?.notables ?? {}),
        ...Object.entries(crafting.clusterJewels?.skills ?? {}),
        ...Object.values(crafting.clusterJewels?.passives ?? {}).map(
            (passive) => [passive.id, passive] as const,
        ),
    ])
        passive.text = await translations.translate("passive_skill", passive.stats, id);
    const augmentRules = crafting.augments.flatMap((augment) => augment.rules);
    for (const rule of augmentRules) {
        rule.text = await translations.translate("item", rule.stats, rule.category);
        rule.bondedText = await translations.translate("item", rule.bondedStats, rule.category);
    }
    const { additionalDescriptions, ...text } = await translations.exportDescriptions(
        mods,
        augmentRules.flatMap((rule) => [rule.stats, rule.bondedStats]),
    );
    augmentRules.forEach((rule, index) => {
        rule.statDescriptions = additionalDescriptions[index * 2]!;
        rule.bondedDescriptions = additionalDescriptions[index * 2 + 1]!;
    });
    if (crafting.passiveTree) {
        const lookup = text.statLookups.passive_hash ?? {};
        text.statLookups.passive_hash = lookup;
        for (const passive of [
            ...Object.values(crafting.passiveTree.notables),
            ...Object.values(crafting.anointing.passives),
        ])
            lookup[String(passive.hash)] = passive.name;
    }
    return text;
}

export async function exportCraftingData(
    directory: string,
    options: { source?: string; schema?: string } = {},
) {
    const manifest = dataPackageManifestSchema.parse(
        JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")),
    );
    const verified = async (file: string) => {
        const bytes = await readFile(join(directory, "data", file));
        if (digest(bytes) !== manifest.files[file]?.sha256)
            throw new Error(`Package hash mismatch: ${file}`);
        return JSON.parse(bytes.toString("utf8"));
    };
    const data = {
        base_items: baseItemsSchema.parse(await verified("base_items.json")),
        mods: modsSchema.parse(await verified("mods.json")),
        item_classes: itemClassesSchema.parse(await verified("item_classes.json")),
        tags: tagsSchema.parse(await verified("tags.json")),
    };
    let schemaBytes: Buffer;
    if (options.schema) schemaBytes = await readFile(options.schema);
    else {
        const response = await fetch(schemaUrl, { signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error(`Schema download failed: ${response.status}`);
        schemaBytes = Buffer.from(await response.arrayBuffer());
    }
    const game: Game = manifest.game;
    const source = await Source.open(
        game,
        { patch: manifest.client_build, directory: options.source },
        join(packageDirectory, ".cache/crafting-data", game, manifest.client_build),
        join(packageDirectory, ".cache/bundles"),
    );
    try {
        const tables = new Tables(game, source, JSON.parse(schemaBytes.toString("utf8")));
        const normalized = await normalizeCraftingData(tables, data.mods, source, data.base_items);
        const translations = new Translations(source, tables);
        const text = await exportCraftingDescriptions(normalized, data.mods, translations);
        const expected = {
            game,
            patch: manifest.client_build,
            basesSha256: manifest.files["base_items.json"]!.sha256,
            modsSha256: manifest.files["mods.json"]!.sha256,
            schemaSha256: manifest.dat_schema_sha256,
        };
        const result = validateCraftingData(
            {
                format: 1,
                game,
                patch: manifest.client_build,
                source: {
                    basesSha256: manifest.files["base_items.json"]!.sha256,
                    modsSha256: manifest.files["mods.json"]!.sha256,
                    schemaSha256: digest(schemaBytes),
                    tables: Object.fromEntries(
                        Object.entries(source.inputs).map(([path, evidence]) => [
                            path,
                            evidence.sha256,
                        ]),
                    ),
                },
                ...normalized,
                ...text,
            },
            expected,
            data,
        );
        const output = join(directory, "crafting-data.json");
        await writeJson(`${output}.tmp`, result);
        await rename(`${output}.tmp`, output);
        await refreshCraftingPackage(directory, digest(await readFile(output)));
        return {
            game,
            patch: result.patch,
            currencies: result.currencies.length,
            fossils: result.fossils.length,
            harvest: result.harvest.length,
            bench: result.bench.length,
        };
    } finally {
        await source.close();
    }
}

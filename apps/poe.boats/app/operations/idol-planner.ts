import { z } from "zod";
import { IDOL_BASES } from "~/data/idol-bases";
import leagues from "~/data/leagues.json";
import { MAP_CRAFTING_OPTIONS } from "~/data/map-crafting-options";
import { MAP_DEVICE_UNLOCKS } from "~/data/map-device-unlocks";
import { SCARABS } from "~/data/scarab-data";
import { getUniqueIdolModText, getUniqueIdolName, UNIQUE_IDOLS } from "~/data/unique-idols";
import { SUPPORTED_LOCALES } from "~/i18n/types";
import { parseMultipleIdols } from "~/lib/idol-parser";
import { calculateScarabCost } from "~/lib/share";
import {
    generateTradeUrl,
    generateTradeUrlForBaseType,
    generateTradeUrlForMod,
} from "~/lib/trade-search";
import {
    IdolBaseKeySchema,
    IdolInstanceSchema,
    IdolModifierSchema,
    LeagueMechanicSchema,
    ValueRangeSchema,
} from "~/schemas/idol";
import { GridPositionSchema, IdolSetSchema } from "~/schemas/idol-set";
import { InventoryIdolSchema } from "~/schemas/inventory";
import { LeagueSchema } from "~/schemas/league";
import { MapCraftingOptionSchema, ScarabPricesDataSchema, ScarabSchema } from "~/schemas/scarab";
import { ImportShareResultSchema, ImportShareSchema, importPlannerShare } from "./import-share";
import { searchIdolInventory } from "./inventory";
import { defineOperation, IdSchema } from "./operation";
import { canPlaceInSet, EditPlannerSchema, editPlanner, PlannerResultSchema } from "./planner";
import { filterIdolModifiers, getModifierOptions, ModifierFiltersSchema } from "./planner-catalog";
import { aggregateStats } from "./planner-stats";

const base = {
    family: "idol-planner",
    access: "public",
    readOnly: true,
    method: "post",
    ui: "/1/idol-planner",
} as const;
const localeSchema = z.enum(SUPPORTED_LOCALES).default("en");
const tradeOptions = z.object({
    league: z.string().max(100).optional(),
    includeAllMods: z.boolean().optional(),
    maxWeight: z.number().nonnegative().nullable().optional(),
    maxPrefixWeight: z.number().nonnegative().nullable().optional(),
    maxSuffixWeight: z.number().nonnegative().nullable().optional(),
    weightFilterMode: z.enum(["gte", "lte"]).optional(),
    baseType: IdolBaseKeySchema.optional(),
    matchAffixType: z.boolean().optional(),
});
const stat = z.object({
    template: z.string(),
    totalValue: z.number(),
    mechanic: LeagueMechanicSchema.optional(),
    hasPercent: z.boolean(),
    contributions: z.array(z.object({ baseType: IdolBaseKeySchema })),
});

const ModifierResultSchema = z.object({
    modifiers: z.array(
        z.object({
            id: z.string(),
            type: z.enum(["prefix", "suffix"]),
            name: z.string(),
            mechanic: LeagueMechanicSchema,
            applicableIdols: z.array(z.string()),
            tiers: z.array(
                z.object({
                    tier: z.number(),
                    levelReq: z.number(),
                    text: z.string(),
                    values: z.array(z.object({ min: z.number(), max: z.number() })),
                    weight: z.number(),
                }),
            ),
        }),
    ),
});

export const idolPlannerOperations = [
    defineOperation({
        ...base,
        path: "/mods/search",
        name: "search_idol_modifiers",
        description:
            "Filter the localized modifier catalog by text, affix, mechanic, idol base and favorites, using the mod browser's rules.",
        input: ModifierFiltersSchema.extend({ locale: localeSchema }),
        output: ModifierResultSchema,
        execute: ({ locale, ...filters }) => ({
            modifiers: filterIdolModifiers(getModifierOptions(locale), filters),
        }),
    }),
    defineOperation({
        ...base,
        method: "get",
        path: "/uniques",
        name: "list_unique_idols",
        description:
            "Read the unique-idol picker catalog with localized names, modifiers and roll ranges.",
        input: z.object({ locale: localeSchema }),
        output: z.object({
            idols: z.array(
                z.object({
                    id: z.string(),
                    name: z.string(),
                    baseType: z.string(),
                    modifiers: z.array(
                        z.object({
                            text: z.string(),
                            values: z.array(ValueRangeSchema),
                            tradeStatId: z.string().optional(),
                        }),
                    ),
                }),
            ),
        }),
        execute: ({ locale }) => ({
            idols: UNIQUE_IDOLS.map((idol) => ({
                id: idol.id,
                name: getUniqueIdolName(idol, locale),
                baseType: idol.baseType,
                modifiers: idol.modifiers.map((mod) => ({
                    text: getUniqueIdolModText(mod, locale),
                    values: mod.values,
                    tradeStatId: mod.tradeStatId,
                })),
            })),
        }),
    }),
    defineOperation({
        ...base,
        path: "/import",
        name: "import_idol_share",
        description:
            "Import a shared set into supplied local state, remapping IDs and detecting duplicate sets. Use force to import a second copy.",
        input: ImportShareSchema,
        output: ImportShareResultSchema,
        execute: importPlannerShare,
    }),
    defineOperation({
        ...base,
        path: "/edit",
        name: "edit_idol_planner",
        description:
            "Apply a planner command to supplied browser-local state. Returns the updated state and created IDs; does not save it on the server.",
        input: EditPlannerSchema,
        output: PlannerResultSchema,
        execute: editPlanner,
    }),
    defineOperation({
        ...base,
        path: "/can-place",
        name: "can_place_idol",
        description: "Check the same grid, occupancy, and inventory rules used by drag and drop.",
        input: z.object({
            set: IdolSetSchema,
            idolId: IdSchema,
            position: GridPositionSchema,
            excludePlacementId: IdSchema.optional(),
        }),
        output: z.object({ allowed: z.boolean() }),
        execute: ({ set, idolId, position, excludePlacementId }) => ({
            allowed: canPlaceInSet(set, idolId, position, excludePlacementId),
        }),
    }),
    defineOperation({
        ...base,
        path: "/parse",
        name: "parse_idols",
        description:
            "Parse one or more copied in-game idol descriptions using the import dialog's parser.",
        input: z.object({ text: z.string().min(1).max(100000) }),
        output: z.object({
            results: z.array(
                z.object({
                    success: z.boolean(),
                    idol: IdolInstanceSchema.optional(),
                    error: z.string().optional(),
                }),
            ),
        }),
        execute: ({ text }) => ({ results: parseMultipleIdols(text) }),
    }),
    defineOperation({
        ...base,
        path: "/stats",
        name: "summarize_idol_set",
        description:
            "Aggregate placed-idol stats and map-device scarab cost using the planner's calculations.",
        input: z.object({
            set: IdolSetSchema,
            locale: localeSchema,
            prices: ScarabPricesDataSchema.optional(),
        }),
        output: z.object({
            statsByMechanic: z.array(
                z.object({ mechanic: LeagueMechanicSchema, stats: z.array(stat) }),
            ),
            uniqueStats: z.array(z.object({ text: z.string(), baseType: IdolBaseKeySchema })),
            baseImplicit: z.number(),
            scarabCost: z.number().nullable(),
        }),
        execute: ({ set, locale, prices }) => ({
            ...aggregateStats(set.placements, set.inventory, locale),
            scarabCost: calculateScarabCost(
                set.mapDevice.slots
                    .map((slot) => slot.scarabId)
                    .filter((id): id is string => id !== null),
                prices ?? null,
            ),
        }),
    }),
    defineOperation({
        ...base,
        path: "/trade",
        name: "build_idol_trade_url",
        description:
            "Build a trade search for an idol, base, or modifier, with the same weight filters as the UI.",
        input: z.object({
            target: z.discriminatedUnion("kind", [
                z.object({ kind: z.literal("idol"), idol: IdolInstanceSchema }),
                z.object({ kind: z.literal("base"), baseType: IdolBaseKeySchema }),
                z.object({ kind: z.literal("mod"), mod: IdolModifierSchema }),
            ]),
            options: tradeOptions.default({}),
        }),
        output: z.object({ url: z.url() }),
        execute: ({ target, options }) => ({
            url:
                target.kind === "idol"
                    ? generateTradeUrl(target.idol, options)
                    : target.kind === "base"
                      ? generateTradeUrlForBaseType(target.baseType, options)
                      : generateTradeUrlForMod(target.mod, options),
        }),
    }),
    defineOperation({
        ...base,
        method: "get",
        path: "/catalog",
        name: "get_idol_catalog",
        description:
            "Read the planner's idol bases, scarabs, crafting options, grid unlocks, and leagues.",
        input: z.object({}),
        output: z.object({
            bases: z.record(
                z.string(),
                z.object({
                    name: z.string(),
                    width: z.number(),
                    height: z.number(),
                    implicit: z.number(),
                    image: z.string(),
                    uniqueImage: z.string().optional(),
                }),
            ),
            scarabs: z.array(ScarabSchema),
            craftingOptions: z.array(MapCraftingOptionSchema),
            leagues: z.array(LeagueSchema),
            unlocks: z.array(
                z.object({
                    id: z.string(),
                    name: z.string(),
                    positions: z.array(z.object({ x: z.number(), y: z.number() })),
                }),
            ),
        }),
        execute: () => ({
            bases: IDOL_BASES,
            scarabs: SCARABS,
            craftingOptions: MAP_CRAFTING_OPTIONS,
            leagues: z.array(LeagueSchema).parse(leagues.result),
            unlocks: MAP_DEVICE_UNLOCKS,
        }),
    }),
    defineOperation({
        ...base,
        method: "get",
        path: "/mods",
        name: "list_idol_modifiers",
        description:
            "Read the localized, deduplicated modifier and tier catalog used by the idol editor and mod browser.",
        input: z.object({ locale: localeSchema }),
        output: ModifierResultSchema,
        execute: ({ locale }) => ({ modifiers: getModifierOptions(locale) }),
    }),
    defineOperation({
        ...base,
        path: "/inventory",
        name: "search_idol_inventory",
        description:
            "Search a supplied inventory by idol name, base type, or localized modifier text.",
        input: z.object({
            inventory: z.array(InventoryIdolSchema),
            query: z.string().max(200),
            locale: localeSchema,
        }),
        output: z.object({ inventory: z.array(InventoryIdolSchema) }),
        execute: ({ inventory, query, locale }) => ({
            inventory: searchIdolInventory(inventory, query, locale),
        }),
    }),
];

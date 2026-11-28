import { z } from "zod";
import { BOSS_ENCOUNTERS, type BossId } from "~/data/boss-encounters";

export const PROFIT_RUNS = [1, 5, 10, 50, 100] as const;
export const DROP_POOLS = [
    "Unique Pool",
    "Guaranteed",
    "Additional Drops",
    "Awakened Gems",
] as const;
export type DropPool = (typeof DROP_POOLS)[number];
const orderSchema = z.enum([
    "name",
    "cost",
    "loot",
    "profit",
    "total",
    "coverage",
    "chance1",
    "chance5",
    "chance10",
    "chance50",
    "chance100",
]);
export type BossOrder = z.infer<typeof orderSchema>;
export const bossRotaInputSchema = z.object({
    league: z.string().max(100).default(""),
    boss: z.enum(["all", ...(Object.keys(BOSS_ENCOUNTERS) as BossId[])]).default("all"),
    runs: z.coerce.number().int().min(1).max(10000).default(1),
    q: z.string().trim().max(100).default(""),
    pricing: z.enum(["all", "complete", "partial", "unknown"]).default("all"),
    order: orderSchema.default("profit"),
    direction: z.enum(["asc", "desc"]).default("desc"),
});
export type BossRotaInput = z.infer<typeof bossRotaInputSchema>;

const quoteSchema = z.object({
    source: z.enum(["exchange", "stash"]),
    foulbornState: z.enum(["identified", "unidentified"]).optional(),
    unitChaos: z.number().positive(),
    hour: z.number().int(),
    listings: z.number().int().nonnegative().optional(),
    likelySales24h: z.number().int().nonnegative().optional(),
    units24h: z.number().nonnegative().optional(),
});
export type BossQuote = z.infer<typeof quoteSchema>;

const marketSchema = z.object({
    href: z.string(),
    artName: z.string(),
    itemId: z.string().optional(),
    iconAsset: z.string().nullable().optional(),
    exact: z.boolean(),
});
export type BossItemMarket = z.infer<typeof marketSchema>;
export type LocatedBossQuote = BossQuote & { market?: BossItemMarket };
const itemSchema = z.object({
    name: z.string(),
    quantityPerKill: z.number().nonnegative(),
    quote: quoteSchema.nullable(),
    valueChaos: z.number().nonnegative().nullable(),
    market: marketSchema.nullable(),
});
const totalsSchema = z.object({
    entryChaos: z.number().nullable(),
    lootChaos: z.number().nullable(),
    profitChaos: z.number().nullable(),
    pricedLootChaos: z.number().nullable(),
    profitFromPricedDropsChaos: z.number().nullable(),
});
export const bossRotaResultSchema = z.object({
    rates: z.object({ source: z.url(), capturedOn: z.iso.date() }),
    league: z.string(),
    leagues: z.array(z.string()),
    priorLeagues: z
        .array(z.string())
        .describe(
            "Earlier leagues for inheriting per-boss kill times, in preference order, with the permanent league as a fallback.",
        ),
    runs: z.number().int(),
    chaosPerDivine: z.number().positive().nullable(),
    encounters: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
            icon: z.string().nullable(),
            quantityBonus: z.number(),
            entries: z.array(itemSchema),
            drops: z.array(itemSchema.extend({ pool: z.enum(DROP_POOLS) })),
            profitChances: z.array(
                z.object({
                    runs: z.number().int(),
                    chance: z.number().min(0).max(1).nullable(),
                    averageNetChaos: z.number().nullable(),
                    pricedAverageNetChaos: z.number().nullable(),
                }),
            ),
            poolValues: z.array(
                z.object({
                    pool: z.enum(DROP_POOLS),
                    pricedChaosPerKill: z.number().nullable(),
                    shareOfPricedLoot: z.number().nullable(),
                    fullyPriced: z.boolean(),
                }),
            ),
            askOnlyChaosPerKill: z.number().nonnegative(),
            perKill: totalsSchema,
            total: totalsSchema,
        }),
    ),
});
export type BossRotaResult = z.infer<typeof bossRotaResultSchema>;

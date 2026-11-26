import { z } from "zod";
import { BOSS_ENCOUNTERS, type BossId } from "~/data/boss-encounters";

export const bossRotaInputSchema = z.object({
    league: z.string().max(100).default(""),
    boss: z.enum(["all", ...(Object.keys(BOSS_ENCOUNTERS) as BossId[])]).default("all"),
    runs: z.coerce.number().int().min(1).max(10000).default(1),
});
export type BossRotaInput = z.infer<typeof bossRotaInputSchema>;

const quoteSchema = z.object({
    source: z.enum(["exchange", "stash"]),
    unitChaos: z.number().positive(),
    hour: z.number().int(),
});
export type BossQuote = z.infer<typeof quoteSchema>;

const itemSchema = z.object({
    name: z.string(),
    quantityPerKill: z.number().nonnegative(),
    quote: quoteSchema.nullable(),
    valueChaos: z.number().nonnegative().nullable(),
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
    runs: z.number().int(),
    encounters: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
            quantityBonus: z.number(),
            entries: z.array(itemSchema),
            drops: z.array(itemSchema),
            perKill: totalsSchema,
            total: totalsSchema,
        }),
    ),
});
export type BossRotaResult = z.infer<typeof bossRotaResultSchema>;

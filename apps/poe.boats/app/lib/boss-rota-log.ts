import { z } from "zod";
import { type BossRotaResult, DROP_POOLS } from "~/schemas/boss-rota";

export const killSecondsSchema = z.number().positive().max(86400);
const logDropSchema = z.object({
    name: z.string().min(1).max(150),
    pool: z.enum(DROP_POOLS),
    chance: z.number().min(0).max(1),
    unitChaos: z.number().nonnegative().nullable(),
    count: z.number().int().nonnegative(),
});
export const rotaLogSchema = z
    .object({
        kills: z.number().int().min(1).max(10000),
        entryPerKill: z.number().nonnegative().nullable(),
        drops: z.array(logDropSchema).min(1).max(150),
    })
    .superRefine(({ drops, kills }, context) => {
        const names = new Set<string>();
        const totals = new Map<string, number>();
        drops.forEach((drop, i) => {
            const total =
                drop.pool === "Additional Drops"
                    ? drop.count
                    : (totals.get(drop.pool) ?? 0) + drop.count;
            totals.set(drop.pool, total);
            if (total > kills || names.has(drop.name))
                context.addIssue({
                    code: "custom",
                    path: ["drops", i, "count"],
                    message:
                        "Each item must be unique and its pool cannot drop more than once per kill.",
                });
            names.add(drop.name);
        });
    });
export type RotaLog = z.infer<typeof rotaLogSchema>;
export const analyzeRotaSchema = z.object({
    log: rotaLogSchema,
    secondsPerKill: killSecondsSchema.nullable().default(null),
});
export const rotaAnalysisSchema = z.object({
    entryChaos: z.number().nullable(),
    pricedLootChaos: z.number(),
    lootChaos: z.number().nullable(),
    pricedNetChaos: z.number().nullable(),
    netChaos: z.number().nullable(),
    netPerHour: z.number().nullable(),
    pricedNetPerHour: z.number().nullable(),
    drops: z.array(
        z.object({
            name: z.string(),
            count: z.number(),
            median: z.number(),
            difference: z.number(),
            valueChaos: z.number().nullable(),
        }),
    ),
});

export function startRotaLog(
    encounter: BossRotaResult["encounters"][number],
    kills: number,
): RotaLog {
    return {
        kills,
        entryPerKill: encounter.perKill.entryChaos,
        drops: encounter.drops.map((row) => ({
            name: row.name,
            pool: row.pool,
            chance: row.quantityPerKill,
            unitChaos: row.quote?.unitChaos ?? null,
            count: 0,
        })),
    };
}

/** Lower binomial median. Relative probabilities start at the mode to avoid underflow for long rotas. */
export function medianDropCount(kills: number, chance: number) {
    if (chance === 0 || chance === 1) return kills * chance;
    const mode = Math.min(kills, Math.floor((kills + 1) * chance));
    const weights = new Float64Array(kills + 1);
    weights[mode] = 1;
    let total = 1;
    for (let k = mode; k > 0 && weights[k]; k--) {
        weights[k - 1] = weights[k]! * (k / (kills - k + 1)) * ((1 - chance) / chance);
        total += weights[k - 1]!;
    }
    for (let k = mode; k < kills && weights[k]; k++) {
        weights[k + 1] = weights[k]! * ((kills - k) / (k + 1)) * (chance / (1 - chance));
        total += weights[k + 1]!;
    }
    let cumulative = 0;
    for (let k = 0; k < kills; k++) {
        cumulative += weights[k]!;
        if (cumulative >= total * (0.5 - 8 * Number.EPSILON)) return k;
    }
    return kills;
}

export function netPerHour(netPerKill: number | null, seconds: number | null) {
    return netPerKill === null || !seconds ? null : (netPerKill * 3600) / seconds;
}

export function analyzeRotaLog({ log, secondsPerKill }: z.infer<typeof analyzeRotaSchema>) {
    const drops = log.drops.map((row) => {
        const median = medianDropCount(log.kills, row.chance);
        return {
            name: row.name,
            count: row.count,
            median,
            difference: row.count - median,
            valueChaos:
                row.count === 0 ? 0 : row.unitChaos === null ? null : row.count * row.unitChaos,
        };
    });
    const pricedLootChaos = drops.reduce((sum, row) => sum + (row.valueChaos ?? 0), 0);
    const lootChaos = drops.every((row) => row.valueChaos !== null) ? pricedLootChaos : null;
    const entryChaos = log.entryPerKill === null ? null : log.entryPerKill * log.kills;
    const pricedNetChaos = entryChaos === null ? null : pricedLootChaos - entryChaos;
    const netChaos = lootChaos === null ? null : pricedNetChaos;
    return {
        entryChaos,
        pricedLootChaos,
        lootChaos,
        pricedNetChaos,
        netChaos,
        drops,
        netPerHour: netPerHour(netChaos === null ? null : netChaos / log.kills, secondsPerKill),
        pricedNetPerHour: netPerHour(
            pricedNetChaos === null ? null : pricedNetChaos / log.kills,
            secondsPerKill,
        ),
    };
}

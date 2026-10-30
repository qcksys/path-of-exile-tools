import { z } from "zod";

/**
 * Signature kinds of uniques whose mods are drawn from a pool (ingest's `MOD_POOLS`). Each has one
 * market per item with an empty value, which the market list shows, and one per mod and mod count,
 * which the item page values. A listing counts once in its item's market and once per mod.
 */
export const MOD_POOL_KINDS = ["watchers-eye", "loreweave"] as const;

export function isModPool(kind: string) {
    return (MOD_POOL_KINDS as readonly string[]).includes(kind);
}

const signatureSchema = z.object({
    kind: z.string(),
    mod: z.string(),
    modCount: z.number().int(),
});

/** A per-mod market's mod (rolls masked, `Haste: #% increased Movement Speed`) and mod count. */
export function modPoolMod(signatureData: unknown) {
    const parsed = signatureSchema.safeParse(signatureData);
    if (!parsed.success || !isModPool(parsed.data.kind)) return null;
    return { mod: parsed.data.mod, modCount: parsed.data.modCount };
}

/**
 * One per-mod market's observation, priced in the display currency: its current listings and
 * asks, or one hour's likely sales and their median last ask.
 */
export type ModPoolObservation = {
    signatureValue: string;
    mod: string;
    modCount: number;
    listings: number;
    ask: number | null;
    medianAsk: number | null;
    sales: number;
    salePrice: number | null;
};

export type ModPoolModValue = {
    signatureValue: string;
    mod: string;
    modCount: number;
    listings: number;
    cheapest: number | null;
    medianAsk: number | null;
    sales: number;
    saleMedian: number | null;
};

type Weighted = { price: number; weight: number };

function weightedMedian(values: Weighted[]) {
    const sorted = values.filter((value) => value.weight > 0).sort((a, b) => a.price - b.price);
    const total = sorted.reduce((sum, value) => sum + value.weight, 0);
    let seen = 0;
    for (const value of sorted) {
        seen += value.weight;
        if (seen >= total / 2) return value.price;
    }
    return null;
}

/** Values each mod per mod count from its market's observations, best sellers first. */
export function modPoolValues(observations: ModPoolObservation[]): ModPoolModValue[] {
    const markets = Map.groupBy(observations, (row) => row.signatureValue);
    const values = [...markets.values()].map((rows) => {
        const asks = rows.flatMap((row) => (row.ask === null ? [] : [row.ask]));
        return {
            signatureValue: rows[0]!.signatureValue,
            mod: rows[0]!.mod,
            modCount: rows[0]!.modCount,
            listings: rows.reduce((sum, row) => sum + row.listings, 0),
            cheapest: asks.length ? Math.min(...asks) : null,
            medianAsk: weightedMedian(
                rows.flatMap((row) =>
                    row.medianAsk === null ? [] : [{ price: row.medianAsk, weight: row.listings }],
                ),
            ),
            sales: rows.reduce((sum, row) => sum + row.sales, 0),
            saleMedian: weightedMedian(
                rows.flatMap((row) =>
                    row.salePrice === null ? [] : [{ price: row.salePrice, weight: row.sales }],
                ),
            ),
        };
    });
    return values.sort(
        (a, b) =>
            (b.saleMedian ?? 0) - (a.saleMedian ?? 0) ||
            (b.medianAsk ?? 0) - (a.medianAsk ?? 0) ||
            a.signatureValue.localeCompare(b.signatureValue),
    );
}

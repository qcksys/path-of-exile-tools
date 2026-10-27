import { z } from "zod";

/**
 * Signature kinds of uniques whose mods are drawn from a pool (ingest's `MOD_POOLS`). One market
 * is one mod combination; the market list shows one row per item, and the item page values each mod.
 */
export const MOD_POOL_KINDS = ["watchers-eye", "loreweave"] as const;
/** Separates mod IDs in the `mods` and `anyMods` market filters. */
export const MOD_SEPARATOR = "|";
const MATCH_LIMIT = 20;

export function isModPool(kind: string) {
    return (MOD_POOL_KINDS as readonly string[]).includes(kind);
}

const signatureSchema = z.object({
    kind: z.string(),
    mods: z
        .array(
            z.union([
                z.string(),
                // Watcher's Eye signatures captured before the generic mod pools.
                z
                    .object({ aura: z.string(), stat: z.string() })
                    .transform((mod) => `${mod.aura}: ${mod.stat}`),
            ]),
        )
        .min(1),
});

/**
 * A pool unique's mods as IDs such as `Haste: #% increased Movement Speed`. Rolls are masked,
 * so signatures captured before ingest masked them still group with newer ones.
 */
export function modPoolMods(signatureData: unknown): string[] | null {
    const parsed = signatureSchema.safeParse(signatureData);
    if (!parsed.success || !isModPool(parsed.data.kind)) return null;
    return parsed.data.mods.map((mod) => mod.replace(/\d+(?:\.\d+)?/g, "#")).sort();
}

/**
 * A market's readable variant label: a pool unique's mods (empty for its every-combination
 * market, whose value is empty), otherwise the signature value.
 */
export function marketSignatureLabel(market: {
    signatureKind: string;
    signatureValue: string;
    signatureData?: unknown;
}) {
    if (!isModPool(market.signatureKind)) return market.signatureValue;
    if (!market.signatureValue) return "";
    return modPoolMods(market.signatureData)?.join(" · ") ?? market.signatureValue;
}

export function parseModList(value: string) {
    return value
        .split(MOD_SEPARATOR)
        .map((mod) => mod.trim())
        .filter(Boolean);
}

/**
 * One market's observation, priced in the display currency: its current listings and cheapest
 * ask, or one hour's likely sales and their median last ask.
 */
export type ModPoolObservation = {
    signatureValue: string;
    mods: string[];
    listings: number;
    ask: number | null;
    sales: number;
    salePrice: number | null;
};

export type ModPoolModValue = {
    mod: string;
    /** Distinct mod combinations with this mod among the matching items. */
    combinations: number;
    listings: number;
    cheapest: number | null;
    /** The market holding the cheapest ask, for linking. */
    cheapestValue: string | null;
    sales: number;
    saleMedian: number | null;
};

export type ModPoolMatch = {
    mods: string[];
    signatureValue: string;
    listings: number;
    cheapest: number | null;
    sales: number;
    saleMedian: number | null;
};

type Combination = ModPoolMatch & { salePrices: { price: number; weight: number }[] };

function weightedMedian(values: { price: number; weight: number }[]) {
    const sorted = values.filter((value) => value.weight > 0).sort((a, b) => a.price - b.price);
    const total = sorted.reduce((sum, value) => sum + value.weight, 0);
    let seen = 0;
    for (const value of sorted) {
        seen += value.weight;
        if (seen >= total / 2) return value.price;
    }
    return null;
}

/**
 * Values each mod of a pool unique from the items matching the filter: those with every `require`d
 * mod and, when `anyOf` is set, at least one of those. Each mod's row covers the matching items
 * that also have it, so with `require: [A]` a row for X is the cheapest item with A and X.
 * Observations of one mod combination (several rolls or older signatures) count as one item.
 */
export function modPoolValues(
    observations: ModPoolObservation[],
    filter: { require: string[]; anyOf: string[] },
) {
    const combinations = new Map<string, Combination>();
    for (const observation of observations) {
        const key = observation.mods.join(MOD_SEPARATOR);
        const combination = combinations.get(key) ?? {
            mods: observation.mods,
            signatureValue: observation.signatureValue,
            listings: 0,
            cheapest: null,
            sales: 0,
            saleMedian: null,
            salePrices: [],
        };
        combination.listings += observation.listings;
        if (
            observation.ask !== null &&
            (combination.cheapest === null || observation.ask < combination.cheapest)
        ) {
            combination.cheapest = observation.ask;
            combination.signatureValue = observation.signatureValue;
        }
        combination.sales += observation.sales;
        if (observation.salePrice !== null)
            combination.salePrices.push({
                price: observation.salePrice,
                weight: observation.sales,
            });
        combinations.set(key, combination);
    }
    const matching = [...combinations.values()].filter(
        (combination) =>
            filter.require.every((mod) => combination.mods.includes(mod)) &&
            (!filter.anyOf.length || filter.anyOf.some((mod) => combination.mods.includes(mod))),
    );
    const byMod = new Map<string, Combination[]>();
    for (const combination of matching)
        for (const mod of combination.mods)
            byMod.set(mod, [...(byMod.get(mod) ?? []), combination]);
    const mods: ModPoolModValue[] = [...byMod].map(([mod, group]) => {
        const cheapest = group.reduce<Combination | null>(
            (best, combination) =>
                combination.cheapest !== null &&
                (best?.cheapest == null || combination.cheapest < best.cheapest)
                    ? combination
                    : best,
            null,
        );
        return {
            mod,
            combinations: group.length,
            listings: group.reduce((sum, combination) => sum + combination.listings, 0),
            cheapest: cheapest?.cheapest ?? null,
            cheapestValue: cheapest?.signatureValue ?? null,
            sales: group.reduce((sum, combination) => sum + combination.sales, 0),
            saleMedian: weightedMedian(group.flatMap((combination) => combination.salePrices)),
        };
    });
    const listed = matching
        .filter((combination) => combination.cheapest !== null)
        .sort((a, b) => a.cheapest! - b.cheapest! || a.mods.join().localeCompare(b.mods.join()));
    return {
        require: filter.require,
        anyOf: filter.anyOf,
        cheapest: listed[0]?.cheapest ?? null,
        mods: mods.sort(
            (a, b) =>
                (b.saleMedian ?? 0) - (a.saleMedian ?? 0) ||
                (b.cheapest ?? 0) - (a.cheapest ?? 0) ||
                a.mod.localeCompare(b.mod),
        ),
        matchCount: listed.length,
        matches: listed.slice(0, MATCH_LIMIT).map(({ salePrices, ...match }) => ({
            ...match,
            saleMedian: weightedMedian(salePrices),
        })),
    };
}

export type ModPoolValues = ReturnType<typeof modPoolValues>;

import { z } from "zod";
import tradeListingCurrencies from "../data/listing-currencies.json" with { type: "json" };

const itemId = z.string().startsWith("Metadata/Items/").max(500);
export const exchangeRealmSchema = z.enum(["pc", "xbox", "sony", "poe2"]);
export const exchangePriceReferenceSchema = z.strictObject({
    realm: exchangeRealmSchema,
    league: z.string().min(1).max(100),
    itemId,
    quoteId: itemId,
    window: z.literal("adaptive-v1").optional(),
    conversion: z.enum(["reference-currency-v1", "two-leg-exchange-v1"]).optional(),
});
export type ExchangePriceReference = z.infer<typeof exchangePriceReferenceSchema>;
export const exchangeSnapshotSchema = z.object({
    realm: exchangeRealmSchema,
    league: z.string().min(1).max(100),
    marketId: z.string().min(1).max(1001),
    hour: z.number().int().nonnegative().multipleOf(3600),
    volumeTraded: z.record(z.string(), z.number().nonnegative()).nullable(),
    lowestRatio: z.record(z.string(), z.number().nonnegative()).nullable(),
    highestRatio: z.record(z.string(), z.number().nonnegative()).nullable(),
});
export type ExchangeSnapshot = z.infer<typeof exchangeSnapshotSchema>;
const directExchangeQuoteSchema = exchangePriceReferenceSchema.extend({
    amount: z.number().positive(),
    hour: z.number().int().nonnegative().multipleOf(3600).nullable(),
    marketId: z.string().nullable(),
    low: z.number().positive().nullable(),
    high: z.number().positive().nullable(),
    itemVolume: z.number().positive().nullable(),
    quoteVolume: z.number().positive().nullable(),
    windowStart: z.number().int().nonnegative().multipleOf(3600).optional(),
    estimator: z.enum(["traded-volume-ratio-v1", "adaptive-volume-ratio-v1", "currency-unit-v1"]),
});
export const exchangeQuoteSchema = directExchangeQuoteSchema.extend({
    estimator: z.enum([
        "traded-volume-ratio-v1",
        "adaptive-volume-ratio-v1",
        "currency-unit-v1",
        "cross-rate-v1",
    ]),
    legs: z.tuple([directExchangeQuoteSchema, directExchangeQuoteSchema]).optional(),
});
export type ExchangeQuote = z.infer<typeof exchangeQuoteSchema>;

export function convertExchangeQuote(
    first: ExchangeQuote,
    second: ExchangeQuote,
): ExchangeQuote | null {
    if (
        first.realm !== second.realm ||
        first.league !== second.league ||
        first.quoteId !== second.itemId ||
        first.itemId === second.quoteId ||
        first.hour === null ||
        first.hour !== second.hour ||
        first.window !== second.window ||
        first.windowStart !== second.windowStart ||
        first.estimator === "cross-rate-v1" ||
        second.estimator === "cross-rate-v1"
    )
        return null;
    const amount = first.amount * second.amount;
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return exchangeQuoteSchema.parse({
        ...first,
        quoteId: second.quoteId,
        amount,
        conversion: "reference-currency-v1",
        estimator: "cross-rate-v1",
        marketId: null,
        low: null,
        high: null,
        itemVolume: null,
        quoteVolume: null,
        legs: [first, second],
    });
}

const listingCurrencies = {
    chaos: "Metadata/Items/Currency/CurrencyRerollRare",
    divine: "Metadata/Items/Currency/CurrencyModValues",
    exalted: "Metadata/Items/Currency/CurrencyAddModToRare",
    mirror: "Metadata/Items/Currency/CurrencyDuplicate",
    blessed: "Metadata/Items/Currency/CurrencyRerollImplicit",
    chrome: "Metadata/Items/Currency/CurrencyRerollSocketColours",
    gcp: "Metadata/Items/Currency/CurrencyGemQuality",
    jewellers: "Metadata/Items/Currency/CurrencyRerollSocketNumbers",
    scour: "Metadata/Items/Currency/CurrencyConvertToNormal",
    regret: "Metadata/Items/Currency/CurrencyPassiveRefund",
    fusing: "Metadata/Items/Currency/CurrencyRerollSocketLinks",
    chance: "Metadata/Items/Currency/CurrencyUpgradeRandomly",
    alt: "Metadata/Items/Currency/CurrencyRerollMagic",
    alch: "Metadata/Items/Currency/CurrencyUpgradeToRare",
    regal: "Metadata/Items/Currency/CurrencyUpgradeMagicToRare",
    vaal: "Metadata/Items/Currency/CurrencyCorrupt",
} as const;
export const exchangeListingCurrencySchema = z.enum(
    Object.keys(listingCurrencies) as (keyof typeof listingCurrencies)[],
);
export function exchangeCurrencyId(currency: string) {
    const listing = exchangeListingCurrencySchema.safeParse(currency);
    return listing.success
        ? listingCurrencies[listing.data]
        : itemId.safeParse(currency).success
          ? currency
          : null;
}
/** Exchange item ID for any trade price currency, e.g. `wisdom`, from the game's trade static data. */
export function listingCurrencyId(currency: string, game: "poe1" | "poe2") {
    const ids: Record<string, string> = tradeListingCurrencies[game];
    return Object.hasOwn(ids, currency) ? ids[currency]! : exchangeCurrencyId(currency);
}
const exchangePriceCurrencies = {
    poe1: new Set(["chaos", "divine"].map((currency) => listingCurrencyId(currency, "poe1"))),
    poe2: new Set(
        ["exalted", "chaos", "annul", "divine"].map((currency) =>
            listingCurrencyId(currency, "poe2"),
        ),
    ),
};
/**
 * Whether an exchange market is stored: one of its items must be a currency the realm's game is
 * priced in. Other pairs, such as one Mirror for one Fragmented Delirium Orb, are dropped, and so
 * is every Ruthless league, whose economy runs on currencies outside that set.
 */
export function exchangeMarketTracked(realm: string, league: string, marketId: string) {
    if (/\bruthless\b/i.test(league)) return false;
    const currencies = exchangePriceCurrencies[realm === "poe2" ? "poe2" : "poe1"];
    return marketId.split("|").some((id) => currencies.has(id));
}
export function exchangeRealmMatchesGame(
    realm: ExchangePriceReference["realm"],
    game: "poe1" | "poe2",
) {
    return (realm === "poe2") === (game === "poe2");
}
export function exchangeUnitQuote(reference: ExchangePriceReference): ExchangeQuote {
    if (reference.itemId !== reference.quoteId)
        throw new Error("A currency unit must quote itself.");
    return {
        ...reference,
        amount: 1,
        hour: null,
        marketId: null,
        low: null,
        high: null,
        itemVolume: null,
        quoteVolume: null,
        estimator: "currency-unit-v1",
    };
}
export function quoteExchangeSnapshot(
    snapshot: ExchangeSnapshot,
    item: string,
    quote: string,
): ExchangeQuote | null {
    const pair = snapshot.marketId.split("|");
    if (item === quote || pair.length !== 2 || !pair.includes(item) || !pair.includes(quote))
        return null;
    const itemVolume = snapshot.volumeTraded?.[item];
    const quoteVolume = snapshot.volumeTraded?.[quote];
    if (
        !itemVolume ||
        !quoteVolume ||
        !Number.isSafeInteger(itemVolume) ||
        !Number.isSafeInteger(quoteVolume)
    )
        return null;
    const ratios = [snapshot.lowestRatio, snapshot.highestRatio].flatMap((ratio) => {
        const numerator = ratio?.[quote];
        const denominator = ratio?.[item];
        if (!numerator || !denominator) return [];
        const value = numerator / denominator;
        return Number.isFinite(value) && value > 0 ? [value] : [];
    });
    return exchangeQuoteSchema.parse({
        realm: snapshot.realm,
        league: snapshot.league,
        itemId: item,
        quoteId: quote,
        amount: quoteVolume / itemVolume,
        hour: snapshot.hour,
        marketId: snapshot.marketId,
        low: ratios.length === 2 ? Math.min(...ratios) : null,
        high: ratios.length === 2 ? Math.max(...ratios) : null,
        itemVolume,
        quoteVolume,
        estimator: "traded-volume-ratio-v1",
    });
}
const referencePrefix = "exchange:v1:";
export function encodeExchangePriceReference(reference: ExchangePriceReference) {
    return `${referencePrefix}${encodeURIComponent(JSON.stringify(exchangePriceReferenceSchema.parse(reference)))}`;
}
export function decodeExchangePriceReference(
    value: string | undefined,
): ExchangePriceReference | null {
    if (!value?.startsWith(referencePrefix)) return null;
    try {
        return exchangePriceReferenceSchema.parse(
            JSON.parse(decodeURIComponent(value.slice(referencePrefix.length))),
        );
    } catch {
        return null;
    }
}

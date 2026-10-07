import {
    decodeExchangePriceReference,
    type ExchangeQuote,
    encodeExchangePriceReference,
    exchangeCurrencyId,
    exchangeRealmMatchesGame,
} from "@poe-tools/market";
import type { CraftingGraph } from "~/schemas/crafting-graph";

export function liveExchangePrices(graph: CraftingGraph) {
    return Object.entries(graph.prices).flatMap(([id, price]) => {
        const reference =
            price.source === "market" ? decodeExchangePriceReference(price.cohortId) : null;
        return reference ? [{ id, reference }] : [];
    });
}
export function bindExchangePrice(
    graph: CraftingGraph,
    id: string,
    quote: ExchangeQuote,
): CraftingGraph {
    if (
        quote.itemId !== id ||
        quote.league !== graph.league ||
        !exchangeRealmMatchesGame(quote.realm, graph.game) ||
        exchangeCurrencyId(graph.currency) !== quote.quoteId
    )
        throw new Error(
            "The exchange quote does not match the graph's item, game, league or accounting currency.",
        );
    return {
        ...graph,
        prices: {
            ...graph.prices,
            [id]: {
                amount: quote.amount,
                currency: graph.currency,
                source: "market",
                confidence: quote.estimator === "currency-unit-v1" ? 1 : null,
                ...(quote.hour === null
                    ? {}
                    : { observedAt: new Date(quote.hour * 1000).toISOString() }),
                cohortId: encodeExchangePriceReference({
                    realm: quote.realm,
                    league: quote.league,
                    itemId: quote.itemId,
                    quoteId: quote.quoteId,
                    window: quote.window,
                }),
            },
        },
    };
}

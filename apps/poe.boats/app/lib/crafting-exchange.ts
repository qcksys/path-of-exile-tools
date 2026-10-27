import {
    decodeExchangePriceReference,
    type ExchangeQuote,
    encodeExchangePriceReference,
    exchangeCurrencyId,
    exchangeRealmMatchesGame,
} from "@poe-tools/market";
import type { CraftingGraph } from "~/schemas/crafting-graph";

const unavailablePrefix = "exchange:unavailable:v1:";

function exchangeReference(value: string | undefined) {
    return decodeExchangePriceReference(
        value?.startsWith(unavailablePrefix) ? value.slice(unavailablePrefix.length) : value,
    );
}

export function liveExchangePrices(graph: CraftingGraph) {
    return Object.entries(graph.prices).flatMap(([id, price]) => {
        const reference = price.source === "market" ? exchangeReference(price.cohortId) : null;
        return reference ? [{ id, reference }] : [];
    });
}

export function unavailableExchangePrices(graph: CraftingGraph) {
    return Object.entries(graph.prices).flatMap(([id, price]) =>
        price.source === "market" && price.cohortId?.startsWith(unavailablePrefix) ? [id] : [],
    );
}

export function markExchangePriceUnavailable(graph: CraftingGraph, id: string): CraftingGraph {
    const price = graph.prices[id];
    if (!price?.cohortId || price.cohortId.startsWith(unavailablePrefix)) return graph;
    return {
        ...graph,
        prices: {
            ...graph.prices,
            [id]: { ...price, cohortId: `${unavailablePrefix}${price.cohortId}` },
        },
    };
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
                    conversion: quote.conversion,
                }),
            },
        },
    };
}

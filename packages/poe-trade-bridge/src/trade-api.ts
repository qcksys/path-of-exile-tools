import { z } from "zod";

export const tradeGameSchema = z.enum(["poe1", "poe2"]);
export type TradeGame = z.infer<typeof tradeGameSchema>;

/** Official trade search payload (`{ query, sort }`), as built by poe.boats. */
export const tradePayloadSchema = z.record(z.string(), z.unknown());
export type TradePayload = z.infer<typeof tradePayloadSchema>;

export const TRADE_ORIGIN = "https://www.pathofexile.com";
/** The trade site returns at most this many listings per fetch request. */
export const TRADE_FETCH_LIMIT = 10;

const tradeIdSchema = z.string().regex(/^[\w-]{1,128}$/);

export const tradeSearchResponseSchema = z.object({
    id: tradeIdSchema,
    result: z.array(tradeIdSchema).max(10_000),
    total: z.number().int().nonnegative(),
});
export type TradeSearchResponse = z.infer<typeof tradeSearchResponseSchema>;

export const tradeFetchResponseSchema = z.object({ result: z.array(z.unknown()) });

export function tradeSearchPath(game: TradeGame, league: string) {
    const name = encodeURIComponent(league.trim());
    return game === "poe1" ? `/api/trade/search/${name}` : `/api/trade2/search/poe2/${name}`;
}

export function tradeFetchPath(game: TradeGame, ids: readonly string[], queryId: string) {
    if (!ids.length || ids.length > TRADE_FETCH_LIMIT)
        throw new Error(`Fetch between 1 and ${TRADE_FETCH_LIMIT} listings at a time.`);
    for (const id of [...ids, queryId]) tradeIdSchema.parse(id);
    return game === "poe1"
        ? `/api/trade/fetch/${ids.join(",")}?query=${queryId}`
        : `/api/trade2/fetch/${ids.join(",")}?query=${queryId}&realm=poe2`;
}

/** The only trade-site paths the extension may request. */
export function isTradeApiPath(path: string) {
    return /^\/api\/trade2?\/(?:search\/(?:poe2\/)?[^/?#]+|fetch\/[\w,-]+\?query=[\w-]+(?:&realm=poe2)?)$/.test(
        path,
    );
}

/** The trade page a pricing run uses for requests in each game. */
export function tradePageUrl(game: TradeGame) {
    return game === "poe1" ? `${TRADE_ORIGIN}/trade` : `${TRADE_ORIGIN}/trade2`;
}

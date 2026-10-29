import { getVendorRecipes } from "~/data/vendor-recipes";
import type { TDatabase } from "~/db/client";
import { getMarketExchangeLeagues, getMarketExchangePrices } from "~/db/queries/market.queries";
import { marketExchangeItemId } from "~/lib/market-exchange.server";
import type { ArbitrageGame, MarketSnapshot, RecipeCategory } from "~/schemas/arbitrage";

const REALMS = { "1": "pc", "2": "poe2" } as const;
const GAMES = { "1": "poe1", "2": "poe2" } as const;

/**
 * The game's vendor recipes priced from its PC currency exchange, as the market list prices them,
 * in chaos for PoE 1 and exalted for PoE 2. Without a league, the one that traded most recently.
 */
export async function loadArbitrageMarket(
    db: TDatabase,
    game: ArbitrageGame,
    requestedLeague: string | null,
) {
    const recipes = getVendorRecipes(game);
    const realm = REALMS[game];
    const leagues = await getMarketExchangeLeagues(db, realm);
    const league = requestedLeague ?? leagues[0] ?? "";
    if (!leagues.includes(league))
        return {
            game,
            leagues,
            league: "",
            recipes,
            snapshot: null,
            error: leagues.length
                ? "This league is not available. Choose a listed league."
                : "No league has captured exchange prices yet. Please retry shortly.",
        };

    const items = new Map<string, string>();
    for (const recipe of recipes)
        for (const item of [recipe.input, recipe.output]) {
            const itemId = marketExchangeItemId(GAMES[game], item.name);
            if (itemId) items.set(item.id, itemId);
        }
    const { latestHour, prices } = await getMarketExchangePrices(db, {
        realm,
        league,
        itemIds: [...new Set(items.values())],
    });
    const quotes: MarketSnapshot["quotes"] = {};
    for (const [id, itemId] of items) {
        const price = prices.get(itemId)?.price;
        if (price && Number.isFinite(price) && price > 0) quotes[id] = { value: price };
    }
    const unavailableCategories = [...new Set(recipes.map((recipe) => recipe.category))].filter(
        (category: RecipeCategory) =>
            !recipes.some((recipe) => recipe.category === category && quotes[recipe.input.id]),
    );
    const snapshot: MarketSnapshot = {
        game,
        league,
        quotes,
        fetchedAt: new Date(latestHour * 1000).toISOString(),
        unavailableCategories: unavailableCategories.sort(),
    };
    const error = Object.keys(quotes).length
        ? null
        : "Market prices are unavailable for this league. Try another league or retry shortly.";
    return { game, leagues, league, recipes, snapshot, error };
}

export type ArbitrageMarketData = Awaited<ReturnType<typeof loadArbitrageMarket>>;

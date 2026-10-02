import { z } from "zod";
import { getVendorRecipes } from "~/data/vendor-recipes";
import {
    type ArbitrageGame,
    MARKET_CURRENCIES,
    type MarketSnapshot,
    type RecipeCategory,
} from "~/schemas/arbitrage";

const LeagueIndexSchema = z.object({
    economyLeagues: z
        .array(
            z.object({
                name: z.string().min(1).max(100),
                indexed: z.boolean().optional(),
            }),
        )
        .min(1),
});

const ExchangeResponseSchema = z.object({
    core: z.object({
        primary: z.string(),
        rates: z.record(z.string(), z.number().positive()),
    }),
    lines: z.array(z.unknown()),
});
const ExchangeLineSchema = z.object({ id: z.string().min(1), primaryValue: z.number().positive() });

const CATEGORY_TYPES: Record<ArbitrageGame, Partial<Record<RecipeCategory, string>>> = {
    "1": { oils: "Oil", essences: "Essence", currency: "Currency" },
    "2": { emotions: "Delirium", essences: "Essences", runes: "Runes" },
};
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: unknown }>();

async function fetchMarketJson(url: string): Promise<unknown> {
    const cached = cache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Market data returned ${response.status}`);
    const value: unknown = await response.json();
    for (const [key, entry] of cache) {
        if (entry.expiresAt <= Date.now()) cache.delete(key);
    }
    if (cache.size >= 100) cache.clear();
    cache.set(url, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return value;
}

export function parseMarketQuotes(data: unknown, game: ArbitrageGame): MarketSnapshot["quotes"] {
    const parsed = ExchangeResponseSchema.parse(data);
    const currency = MARKET_CURRENCIES[game].id;
    const multiplier = parsed.core.primary === currency ? 1 : parsed.core.rates[currency];
    if (!multiplier) throw new Error("Market currency conversion is unavailable");
    const quotes: MarketSnapshot["quotes"] = {};
    for (const line of parsed.lines) {
        const result = ExchangeLineSchema.safeParse(line);
        if (!result.success) continue;
        const value = result.data.primaryValue * multiplier;
        if (Number.isFinite(value) && value > 0) quotes[result.data.id] = { value };
    }
    return quotes;
}

export async function loadArbitrageMarket(game: ArbitrageGame, requestedLeague: string | null) {
    let leagues: string[] = [];
    let league = "";
    let snapshot: MarketSnapshot | null = null;
    let error: string | null = null;
    const recipes = getVendorRecipes(game);

    try {
        const index = LeagueIndexSchema.parse(
            await fetchMarketJson(`https://poe.ninja/poe${game}/api/data/index-state`),
        );
        leagues = index.economyLeagues.map((entry) => entry.name);
        league =
            requestedLeague ??
            index.economyLeagues.find((entry) => entry.indexed)?.name ??
            leagues[0];
        if (!leagues.includes(league)) {
            return {
                game,
                leagues,
                league: "",
                recipes,
                snapshot,
                error: "This league is not available. Choose a listed league.",
            };
        }

        const quotes: MarketSnapshot["quotes"] = {};
        const unavailableCategories: RecipeCategory[] = [];
        const categories = [...new Set(recipes.map((recipe) => recipe.category))];
        let oldestFetch = Date.now();
        await Promise.all(
            categories.map(async (category) => {
                const url = new URL(
                    `https://poe.ninja/poe${game}/api/economy/exchange/current/overview`,
                );
                url.search = new URLSearchParams({
                    league,
                    type: CATEGORY_TYPES[game][category]!,
                }).toString();
                try {
                    const data = await fetchMarketJson(url.href);
                    const categoryQuotes = parseMarketQuotes(data, game);
                    if (Object.keys(categoryQuotes).length === 0) throw new Error("No prices");
                    Object.assign(quotes, categoryQuotes);
                    oldestFetch = Math.min(
                        oldestFetch,
                        (cache.get(url.href)?.expiresAt ?? Date.now() + CACHE_TTL_MS) -
                            CACHE_TTL_MS,
                    );
                } catch {
                    unavailableCategories.push(category);
                }
            }),
        );
        snapshot = {
            game,
            league,
            quotes,
            fetchedAt: new Date(oldestFetch).toISOString(),
            unavailableCategories: unavailableCategories.sort(),
        };
        if (Object.keys(quotes).length === 0)
            error =
                "Market prices are unavailable for this league. Try another league or retry shortly.";
    } catch {
        error = "Could not load market leagues from poe.ninja. Please retry shortly.";
    }

    return { game, leagues, league, recipes, snapshot, error };
}

export type ArbitrageMarketData = Awaited<ReturnType<typeof loadArbitrageMarket>>;

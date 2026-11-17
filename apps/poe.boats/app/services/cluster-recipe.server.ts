import {
    CLUSTER_RECIPE_SIZES,
    clusterRecipeBand,
    clusterRecipeMarketValue,
} from "~/data/cluster-jewel-recipe";
import type { TDatabase } from "~/db/client";
import { findCraftingRecipeListings, recipeMarketKey } from "~/db/queries/crafting-recipes.queries";
import { getMarketExchangeLeagues } from "~/db/queries/market.queries";
import type { ClusterRecipeSnapshot } from "~/schemas/arbitrage";

/**
 * Every 5-for-1 Cluster Jewel outcome at `itemLevel` priced from the league's captured
 * merchant-tab asks in chaos, as Bestiary and temple crafting inputs are. Leagues are the PoE 1
 * PC exchange's, as on the arbitrage page; without one, the league that traded most recently.
 */
export async function loadClusterRecipeMarket(
    db: TDatabase,
    requestedLeague: string | null,
    itemLevel: number,
) {
    const leagues = await getMarketExchangeLeagues(db, "pc");
    const league = requestedLeague ?? leagues[0] ?? "";
    if (!leagues.includes(league))
        return {
            leagues,
            league: "",
            itemLevel,
            snapshot: null,
            error: leagues.length
                ? "This league is not available. Choose a listed league."
                : "No league has captured exchange prices yet. Please retry shortly.",
        };

    const band = clusterRecipeBand(itemLevel);
    const markets = CLUSTER_RECIPE_SIZES.flatMap(({ outcomes }) =>
        outcomes.map((outcome) => ({
            id: outcome.id,
            market: { itemKey: outcome.baseType, base: clusterRecipeMarketValue(outcome, band) },
        })),
    );
    const listings = await findCraftingRecipeListings(
        db,
        league,
        "chaos",
        markets.map(({ market }) => market),
    );
    const quotes: ClusterRecipeSnapshot["quotes"] = {};
    let latestHour = 0;
    for (const { id, market } of markets) {
        const listing = listings.get(recipeMarketKey(market));
        if (!listing) continue;
        quotes[id] = { value: listing.unitPrice, listingCount: listing.listingCount };
        latestHour = Math.max(latestHour, listing.hour);
    }
    const snapshot: ClusterRecipeSnapshot = {
        league,
        band,
        fetchedAt: latestHour ? new Date(latestHour * 1000).toISOString() : null,
        quotes,
    };
    const error = latestHour
        ? null
        : "No Cluster Jewel asks were captured in this league within the last 24 hours.";
    return { leagues, league, itemLevel, snapshot, error };
}

export type ClusterRecipeMarketData = Awaited<ReturnType<typeof loadClusterRecipeMarket>>;

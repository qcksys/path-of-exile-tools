import { z } from "zod";
import { dbContext } from "~/context";
import { getPriceCache } from "~/db/queries/idol-planner.queries";
import type { ScarabPricesData } from "~/schemas/scarab";
import type { Route } from "./+types/api.prices.scarabs";

const LEAGUE_QUERY_SCHEMA = z
    .string()
    .min(1, "League is required")
    .max(100, "League name too long")
    .regex(/^[\w\s.-]+$/, "Invalid league name format");

export async function loader({ request, context }: Route.LoaderArgs) {
    const db = context.get(dbContext);

    const url = new URL(request.url);
    const leagueResult = LEAGUE_QUERY_SCHEMA.safeParse(url.searchParams.get("league"));

    if (!leagueResult.success) {
        return Response.json(
            {
                error: leagueResult.error.issues[0]?.message ?? "Invalid league",
            },
            { status: 400 },
        );
    }

    const league = leagueResult.data;
    const cached = await getPriceCache(db, league);

    if (!cached || !cached.prices) {
        return Response.json({ error: "Prices not available for this league" }, { status: 404 });
    }

    const pricesData: ScarabPricesData = {
        league,
        prices: cached.prices,
        updatedAt: cached.rowUpdatedAt?.toISOString() ?? new Date().toISOString(),
    };

    return Response.json(pricesData);
}

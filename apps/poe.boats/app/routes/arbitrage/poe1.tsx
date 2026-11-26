import { ArbitragePage } from "~/components/arbitrage/arbitrage-page";
import { dbContext } from "~/context";
import type { SiteHandle } from "~/routes/layouts/site";
import { ClusterRecipeItemLevelSchema } from "~/schemas/arbitrage";
import { loadArbitrageMarket } from "~/services/arbitrage.server";
import { loadClusterRecipeMarket } from "~/services/cluster-recipe.server";
import type { Route } from "./+types/poe1";

export { shouldRevalidateArbitrage as shouldRevalidate } from "~/lib/arbitrage-volume-filters";

export const handle = { section: "PoE 1" } satisfies SiteHandle;

export function meta() {
    return [{ title: "PoE 1 Vendor Recipe Arbitrage | POE.BOATS" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
    const params = new URL(request.url).searchParams;
    const db = context.get(dbContext);
    const league = params.get("league");
    const itemLevel = ClusterRecipeItemLevelSchema.catch(84).parse(params.get("clusterIlvl") ?? 84);
    const [market, clusterRecipe] = await Promise.all([
        loadArbitrageMarket(db, "1", league),
        loadClusterRecipeMarket(db, league, itemLevel),
    ]);
    return { market, clusterRecipe };
}

export default function Poe1Arbitrage({ loaderData }: Route.ComponentProps) {
    return <ArbitragePage data={loaderData.market} clusterRecipe={loaderData.clusterRecipe} />;
}

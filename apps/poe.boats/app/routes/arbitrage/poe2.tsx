import { ArbitragePage } from "~/components/arbitrage/arbitrage-page";
import { dbContext } from "~/context";
import type { SiteHandle } from "~/routes/layouts/site";
import { loadArbitrageMarket } from "~/services/arbitrage.server";
import type { Route } from "./+types/poe2";

export const handle = { section: "PoE 2" } satisfies SiteHandle;

export function meta() {
    return [{ title: "PoE 2 Reforging Arbitrage | POE.BOATS" }];
}

export function loader({ request, context }: Route.LoaderArgs) {
    return loadArbitrageMarket(
        context.get(dbContext),
        "2",
        new URL(request.url).searchParams.get("league"),
    );
}

export default function Poe2Arbitrage({ loaderData }: Route.ComponentProps) {
    return <ArbitragePage key={`2:${loaderData.league}`} data={loaderData} />;
}

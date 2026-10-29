import { ArbitragePage } from "~/components/arbitrage/arbitrage-page";
import { dbContext } from "~/context";
import type { SiteHandle } from "~/routes/layouts/site";
import { loadArbitrageMarket } from "~/services/arbitrage.server";
import type { Route } from "./+types/poe1";

export const handle = { section: "PoE 1" } satisfies SiteHandle;

export function meta() {
    return [{ title: "PoE 1 Vendor Recipe Arbitrage | POE.BOATS" }];
}

export function loader({ request, context }: Route.LoaderArgs) {
    return loadArbitrageMarket(
        context.get(dbContext),
        "1",
        new URL(request.url).searchParams.get("league"),
    );
}

export default function Poe1Arbitrage({ loaderData }: Route.ComponentProps) {
    return <ArbitragePage key={`1:${loaderData.league}`} data={loaderData} />;
}

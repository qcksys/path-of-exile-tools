import { ArbitragePage } from "~/components/arbitrage/arbitrage-page";
import { loadArbitrageMarket } from "~/services/arbitrage.server";
import type { Route } from "./+types/poe2";

export function meta() {
    return [{ title: "PoE 2 Reforging Arbitrage | POE.BOATS" }];
}

export function loader({ request }: Route.LoaderArgs) {
    return loadArbitrageMarket("2", new URL(request.url).searchParams.get("league"));
}

export default function Poe2Arbitrage({ loaderData }: Route.ComponentProps) {
    return <ArbitragePage key={`2:${loaderData.league}`} data={loaderData} />;
}

import { legacyPlannerRequest, runOperation } from "~/operations/legacy-planner.server";
import type { Route } from "./+types/api.prices.scarabs";
export function loader({ request, context }: Route.LoaderArgs) {
    return legacyPlannerRequest(
        request,
        context,
        (runtime) =>
            runOperation(
                "get_scarab_prices",
                { league: new URL(request.url).searchParams.get("league") },
                runtime,
            ),
        ["GET", "HEAD"],
    );
}

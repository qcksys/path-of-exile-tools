import { legacyPlannerRequest, runOperation } from "~/operations/legacy-planner.server";
import type { Route } from "./+types/api.share.$id";
export function loader({ request, context, params }: Route.LoaderArgs) {
    return legacyPlannerRequest(
        request,
        context,
        (runtime) => runOperation("get_idol_share", { shareId: params.id }, runtime),
        ["GET", "HEAD"],
    );
}

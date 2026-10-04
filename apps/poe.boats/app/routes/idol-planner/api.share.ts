import { legacyPlannerRequest, runOperation } from "~/operations/legacy-planner.server";
import type { Route } from "./+types/api.share";
export function action({ request, context }: Route.ActionArgs) {
    return legacyPlannerRequest(
        request,
        context,
        (runtime, body) => runOperation("create_idol_share", body, runtime),
        ["POST"],
    );
}

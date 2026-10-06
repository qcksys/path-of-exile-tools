import { legacyPlannerRequest, runOperation } from "~/operations/legacy-planner.server";
import { getOwnedSetData } from "~/operations/saved-planner.server";
import type { Route } from "./+types/api.sets.$id";
export function loader({ request, context, params }: Route.LoaderArgs) {
    return legacyPlannerRequest(
        request,
        context,
        (runtime) => getOwnedSetData(runtime.db, runtime.caller!.id, params.id),
        ["GET", "HEAD"],
        true,
    );
}
export function action({ request, context, params }: Route.ActionArgs) {
    return legacyPlannerRequest(
        request,
        context,
        async (runtime, body) => {
            await runOperation(
                request.method === "DELETE" ? "delete_idol_set" : "update_idol_set",
                { ...body, setId: params.id },
                runtime,
            );
            return { ok: true };
        },
        ["PATCH", "DELETE"],
        true,
    );
}

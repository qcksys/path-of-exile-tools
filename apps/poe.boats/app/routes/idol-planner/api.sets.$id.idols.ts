import { legacyPlannerRequest, runOperation } from "~/operations/legacy-planner.server";
import type { Route } from "./+types/api.sets.$id.idols";
export function action({ request, context, params }: Route.ActionArgs) {
    return legacyPlannerRequest(
        request,
        context,
        async (runtime, body) => {
            const command =
                request.method === "POST"
                    ? {
                          action: "addIdols",
                          setId: params.id,
                          idols: body.idols,
                          source: body.source ?? "manual",
                      }
                    : body.clearAll === true
                      ? { action: "clearInventory", setId: params.id }
                      : { action: "removeIdols", setId: params.id, ids: body.ids };
            const result = await runOperation("edit_saved_idol_set", { command }, runtime);
            return request.method === "POST" ? { ids: result.ids } : { ok: true };
        },
        ["POST", "DELETE"],
        true,
    );
}

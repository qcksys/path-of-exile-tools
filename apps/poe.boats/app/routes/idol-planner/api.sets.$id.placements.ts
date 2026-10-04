import { OperationError } from "~/operations/errors";
import { legacyPlannerRequest, runOperation } from "~/operations/legacy-planner.server";
import type { Route } from "./+types/api.sets.$id.placements";
export function action({ request, context, params }: Route.ActionArgs) {
    return legacyPlannerRequest(
        request,
        context,
        async (runtime, body) => {
            if (!["place", "move", "remove"].includes(String(body.action)))
                throw new OperationError("Invalid placement action.");
            const command = {
                action: body.action === "remove" ? "removePlacement" : body.action,
                setId: params.id,
                idolId: body.idolId,
                placementId: body.placementId,
                position: { x: body.posX, y: body.posY },
            };
            const result = await runOperation("edit_saved_idol_set", { command }, runtime);
            return body.action === "place" ? { id: (result.ids as string[])[0] } : { ok: true };
        },
        ["POST"],
        true,
    );
}

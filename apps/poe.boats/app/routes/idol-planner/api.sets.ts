import { getUserSets } from "~/db/queries/idol-planner.queries";
import { legacyPlannerRequest, runOperation } from "~/operations/legacy-planner.server";
import { SavedSetSchema } from "~/operations/planner-contracts";
import type { Route } from "./+types/api.sets";
export function loader({ request, context }: Route.LoaderArgs) {
    return legacyPlannerRequest(
        request,
        context,
        (runtime) => getUserSets(runtime.db, runtime.caller!.id),
        ["GET", "HEAD"],
        true,
    );
}
export function action({ request, context }: Route.ActionArgs) {
    return legacyPlannerRequest(
        request,
        context,
        async (runtime, body) => {
            const result = SavedSetSchema.parse(
                await runOperation("create_idol_set", { name: body.name ?? "New Set" }, runtime),
            );
            return { id: result.set.id };
        },
        ["POST"],
        true,
    );
}

import { api } from "~/api/router.server";
import { operationContext } from "~/operations/runtime.server";
import type { Route } from "./+types/api";

function handle({ request, context }: Route.LoaderArgs | Route.ActionArgs) {
    return api.fetch(request, { runtime: () => operationContext(request, context) });
}

export const loader = handle;
export const action = handle;

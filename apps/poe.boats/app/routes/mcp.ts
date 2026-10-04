import { handleMcpRequest } from "~/mcp/server.server";
import { operationContext } from "~/operations/runtime.server";
import type { Route } from "./+types/mcp";

function handle({ request, context }: Route.LoaderArgs | Route.ActionArgs) {
    return handleMcpRequest(request, () => operationContext(request, context));
}

export const loader = handle;
export const action = handle;

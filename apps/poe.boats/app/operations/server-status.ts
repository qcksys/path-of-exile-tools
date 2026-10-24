import { defineOperation } from "./operation";
import { getServerStatus, serverStatusFilters, serverStatusResult } from "./server-status.server";

export const serverStatusOperation = defineOperation({
    name: "get_server_status",
    family: "server",
    path: "/status",
    method: "get",
    description:
        "Read ingestion worker health, current stage, progress and stored league history coverage. Optional view=workers skips all coverage queries and returns coverage: [] because coverage was omitted; this does not mean no history exists. The default full view includes coverage.",
    ui: "/server-status",
    access: "public",
    readOnly: true,
    input: serverStatusFilters,
    output: serverStatusResult,
    execute: (input, context) => getServerStatus(context.db, input),
});

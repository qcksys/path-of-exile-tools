import { createRequestHandler, RouterContextProvider } from "react-router";
import { dbContext, envContext, exeContext, serverTimingContext } from "~/context";
import { createDbConnection } from "~/db/client.ts";
import { handleScheduled } from "~/scheduled/index.ts";
import { ServerTiming } from "~/services/server_timing.server.ts";

const requestHandler = createRequestHandler(
    () => import("virtual:react-router/server-build"),
    import.meta.env.MODE,
);

export default {
    async fetch(request, env, executionContext) {
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204 });
        }

        const timing = new ServerTiming();
        timing.start("total");

        const context = new RouterContextProvider();

        const db = createDbConnection(env.DATABASE_URL);

        context.set(envContext, env);
        context.set(exeContext, executionContext);
        context.set(dbContext, db);
        context.set(serverTimingContext, timing);

        // Strip body from GET/HEAD requests to work around Cloudflare Workers + React Router issue
        // Some bots send GET requests with Content-Length headers, which causes React Router's
        // internal stripIndexParam function to fail when creating a new Request
        const isGetOrHead = request.method === "GET" || request.method === "HEAD";
        const safeRequest = isGetOrHead ? new Request(request, { body: null }) : request;

        const response = await requestHandler(safeRequest, context);

        timing.stop("total");

        const headers = new Headers(response.headers);
        headers.set("Server-Timing", timing.toString());

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    },

    async scheduled(controller, env, ctx) {
        ctx.waitUntil(handleScheduled(controller, env));
    },
} satisfies ExportedHandler<CloudflareBindings>;

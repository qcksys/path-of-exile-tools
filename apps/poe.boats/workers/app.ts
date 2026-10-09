import { createRequestHandler, RouterContextProvider } from "react-router";
import { dbContext, envContext, exeContext, localeContext, serverTimingContext } from "~/context";
import { openDatabase } from "~/db/client.ts";
import { detectLocale } from "~/lib/locale.server.ts";
import { handleScheduled } from "~/scheduled/index.ts";
import { ServerTiming } from "~/services/server-timing.server.ts";

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

        const database = await openDatabase(env.DATABASE_URL, env.DATABASE_DRIVER);
        const db = database.db;

        context.set(envContext, env);
        context.set(exeContext, executionContext);
        context.set(dbContext, db);
        context.set(serverTimingContext, timing);
        context.set(localeContext, detectLocale(request));

        // Strip body from GET/HEAD requests to work around Cloudflare Workers + React Router issue
        // Some bots send GET requests with Content-Length headers, which causes React Router's
        // internal stripIndexParam function to fail when creating a new Request
        const isGetOrHead = request.method === "GET" || request.method === "HEAD";
        const safeRequest = isGetOrHead ? new Request(request, { body: null }) : request;

        let response: Response;
        try {
            response = await requestHandler(safeRequest, context);
        } finally {
            executionContext.waitUntil(database.close());
        }

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

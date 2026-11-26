/**
 * By default, Remix will handle generating the HTTP Response for you.
 * You are free to delete this file if you'd like to, but if you ever want it revealed again, you can run `npx remix reveal` ✨
 * For more information, see https://remix.run/file-conventions/entry.server
 */

import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import type { EntryContext, ServerInstrumentation } from "react-router";
import { ServerRouter } from "react-router";
import { logger } from "~/services/logger";
import { isPageRead, traceSpan } from "~/services/tracing.server";

const ABORT_DELAY = 5000;

export const instrumentations: ServerInstrumentation[] = [
    {
        route({ id, instrument }) {
            instrument({
                async loader(callLoader, { request }) {
                    if (!isPageRead(request)) {
                        await callLoader();
                        return;
                    }
                    await traceSpan("page.loader", async (span) => {
                        span.setAttributes({ "route.id": id });
                        const result = await callLoader();
                        span.setAttributes({ "route.outcome": result.status });
                    });
                },
            });
        },
    },
];

export default async function handleRequest(
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    reactRouterContext: EntryContext,
) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ABORT_DELAY);

    let returnResponseStatusCode = responseStatusCode;

    const body = await traceSpan("page.render_shell", (span) => {
        span.setAttributes({
            "route.id":
                reactRouterContext.staticHandlerContext.matches.at(-1)?.route.id ?? "unmatched",
        });
        return renderToReadableStream(
            <ServerRouter context={reactRouterContext} url={request.url} />,
            {
                signal: controller.signal,
                onError(error: unknown) {
                    if (!controller.signal.aborted) {
                        // Log streaming rendering errors from inside the shell
                        logger.error(error, "Streaming render error");
                    }
                    returnResponseStatusCode = 500;
                },
            },
        );
    });

    body.allReady.then(() => clearTimeout(timeoutId));

    if (isbot(request.headers.get("user-agent") || "")) {
        await traceSpan("page.wait_all_ready", () => body.allReady);
    }

    responseHeaders.set("Content-Type", "text/html");
    return new Response(body, {
        headers: responseHeaders,
        status: returnResponseStatusCode,
    });
}

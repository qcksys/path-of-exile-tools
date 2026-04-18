/**
 * By default, Remix will handle generating the HTTP Response for you.
 * You are free to delete this file if you'd like to, but if you ever want it revealed again, you can run `npx remix reveal` ✨
 * For more information, see https://remix.run/file-conventions/entry.server
 */

import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import type { EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import { logger } from "~/services/logger";

const ABORT_DELAY = 5000;

export default async function handleRequest(
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    reactRouterContext: EntryContext,
) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ABORT_DELAY);

    let returnResponseStatusCode = responseStatusCode;

    const body = await renderToReadableStream(
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

    body.allReady.then(() => clearTimeout(timeoutId));

    if (isbot(request.headers.get("user-agent") || "")) {
        await body.allReady;
    }

    responseHeaders.set("Content-Type", "text/html");
    return new Response(body, {
        headers: responseHeaders,
        status: returnResponseStatusCode,
    });
}

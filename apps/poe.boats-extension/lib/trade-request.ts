import { isTradeApiPath } from "@poe-tools/trade-bridge";
import type { TradeRequest, TradeResponse } from "./messages";

/**
 * Make one trade API request from the trade page itself. The request is same-origin, so the
 * browser attaches the user's pathofexile.com cookie; this code never reads it. Only rate-limit
 * headers are returned with the body.
 */
export async function performTradeRequest(
    request: TradeRequest,
    fetcher: (path: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<TradeResponse> {
    if (!isTradeApiPath(request.path)) return { status: 400, headers: {}, body: null };
    const response = await fetcher(request.path, {
        method: request.method,
        credentials: "same-origin",
        headers:
            request.method === "POST"
                ? // biome-ignore lint/style/useNamingConvention: HTTP header names.
                  { "Content-Type": "application/json", Accept: "application/json" }
                : // biome-ignore lint/style/useNamingConvention: HTTP header names.
                  { Accept: "application/json" },
        ...(request.method === "POST" ? { body: JSON.stringify(request.body) } : {}),
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, name) => {
        if (name.startsWith("x-rate-limit-") || name === "retry-after") headers[name] = value;
    });
    let body: unknown = null;
    try {
        body = await response.json();
    } catch {
        body = null;
    }
    return { status: response.status, headers, body };
}

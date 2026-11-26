import {
    type DataStrategyResult,
    isRouteErrorResponse,
    type MiddlewareFunction,
    replace,
} from "react-router";
import { toast } from "sonner";

let restoring: string | undefined;

/** Keep the last loaded results when a market or arbitrage navigation fails, even offline. */
export const recoverBrowseNavigation: MiddlewareFunction<
    Record<string, DataStrategyResult>
> = async ({ request }, next) => {
    const target = new URL(request.url);
    const current = window.location;
    const url = target.pathname + target.search;
    if (
        request.method === "GET" &&
        url === restoring &&
        url === current.pathname + current.search
    ) {
        restoring = undefined;
        // No loaders changed. React Router retains their committed data.
        return {};
    }
    restoring = undefined;
    const results = await next();
    const area = current.pathname.match(/^\/[12]\/(?:market|arbitrage)(?=\/|$)/)?.[0];
    if (
        request.signal.aborted ||
        request.method !== "GET" ||
        !area ||
        !(target.pathname === area || target.pathname.startsWith(`${area}/`)) ||
        url === current.pathname + current.search
    )
        return results;
    const failures = Object.values(results).filter((entry) => entry.type === "error");
    if (
        failures.length &&
        failures.every(({ result }) => {
            if (result instanceof Response || isRouteErrorResponse(result))
                return (
                    result.status >= 500 ||
                    (result.status === 400 && target.pathname === current.pathname)
                );
            return result instanceof Error;
        })
    ) {
        restoring = current.pathname + current.search;
        toast.error("Could not load the requested results. Showing your previous selection.");
        throw replace(restoring + current.hash);
    }
    return results;
};

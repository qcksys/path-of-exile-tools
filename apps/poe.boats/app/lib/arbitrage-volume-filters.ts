import type { ShouldRevalidateFunctionArgs } from "react-router";

export const ARBITRAGE_VOLUME_FILTERS = [
    { key: "minimumInputUnits24h", label: "Minimum inputs traded" },
    { key: "minimumOutputUnits24h", label: "Minimum outputs traded" },
] as const;

export function shouldRevalidateArbitrage({
    currentUrl,
    nextUrl,
    formMethod,
    defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
    if (
        formMethod ||
        currentUrl.pathname !== nextUrl.pathname ||
        currentUrl.search === nextUrl.search
    )
        return defaultShouldRevalidate;
    const marketParams = (url: URL) => {
        const params = new URLSearchParams(url.search);
        for (const { key } of ARBITRAGE_VOLUME_FILTERS) params.delete(key);
        return params.toString();
    };
    return marketParams(currentUrl) === marketParams(nextUrl) ? false : defaultShouldRevalidate;
}

import { useMemo } from "react";
import { useLocation, useNavigation } from "react-router";

/** Controls can reflect an in-flight GET while result rows still belong to the committed URL. */
export function usePendingSearchParams() {
    const { pathname } = useLocation();
    const { location, formMethod } = useNavigation();
    const search =
        location?.pathname === pathname && (!formMethod || formMethod === "GET")
            ? location.search
            : undefined;
    return useMemo(() => (search === undefined ? null : new URLSearchParams(search)), [search]);
}

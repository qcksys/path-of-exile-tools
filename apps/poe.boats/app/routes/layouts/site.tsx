import type { ReactNode } from "react";
import { Outlet, useMatches } from "react-router";
import { AppFooter } from "~/components/app-footer";
import { AppHeader } from "~/components/app-header";

/** Route modules under this layout export `handle` to fill the header; the deepest match wins. */
export type SiteHandle = {
    section?: ReactNode;
    sectionBadge?: ReactNode;
};

export default function SiteLayout() {
    const handle = useMatches().findLast((match) => match.handle)?.handle as SiteHandle | undefined;

    return (
        <div className="flex min-h-screen flex-col">
            <AppHeader section={handle?.section} sectionBadge={handle?.sectionBadge} />
            <Outlet />
            <AppFooter />
        </div>
    );
}

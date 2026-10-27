import type { ReactNode } from "react";
import { Outlet, useMatches } from "react-router";
import { AppFooter } from "~/components/app-footer";
import { AppHeader } from "~/components/app-header";
import { RouteError } from "~/components/route-error";
import type { Route } from "./+types/site";

/** Route modules under this layout export `handle` to fill the header; the deepest match wins. */
export type SiteHandle = {
    section?: ReactNode;
    sectionBadge?: ReactNode;
};

function SiteFrame({ children }: { children: ReactNode }) {
    const handle = useMatches().findLast((match) => match.handle)?.handle as SiteHandle | undefined;

    return (
        <div className="flex min-h-screen flex-col">
            <AppHeader section={handle?.section} sectionBadge={handle?.sectionBadge} />
            {children}
            <AppFooter />
        </div>
    );
}

export default function SiteLayout() {
    return (
        <SiteFrame>
            <Outlet />
        </SiteFrame>
    );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    return (
        <SiteFrame>
            <main className="container mx-auto flex-1 px-4 py-8">
                <RouteError error={error} />
            </main>
        </SiteFrame>
    );
}

import type { ReactNode } from "react";
import { isRouteErrorResponse, useRevalidator } from "react-router";
import { AppFooter } from "~/components/app-footer";
import { AppHeader } from "~/components/app-header";
import { Button } from "~/components/ui/button";

/** Error panel for a route's ErrorBoundary; it replaces only the failed route, so parent layouts keep rendering. */
export function RouteError({ error }: { error: unknown }) {
    const revalidator = useRevalidator();
    let message = "Something went wrong";
    let details = "An unexpected error occurred.";
    let stack: string | undefined;
    const notFound = isRouteErrorResponse(error) && error.status === 404;

    if (isRouteErrorResponse(error)) {
        message = notFound ? "404" : "Error";
        details = notFound ? "The requested page could not be found." : error.statusText || details;
    } else if (import.meta.env.DEV && error instanceof Error) {
        details = error.message;
        stack = error.stack;
    }

    return (
        <section role="alert" className="rounded-lg border border-border p-8">
            <h1 className="text-lg font-semibold">{message}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{details}</p>
            {stack && (
                <pre className="mt-4 w-full overflow-x-auto text-xs">
                    <code>{stack}</code>
                </pre>
            )}
            {!notFound && (
                <Button
                    className="mt-4"
                    variant="outline"
                    disabled={revalidator.state === "loading"}
                    onClick={() => revalidator.revalidate()}
                >
                    Try again
                </Button>
            )}
        </section>
    );
}

/** Error page for routes that render their own header and footer instead of the site layout. */
export function PageError({
    error,
    section,
    sectionBadge,
}: {
    error: unknown;
    section?: ReactNode;
    sectionBadge?: ReactNode;
}) {
    return (
        <div className="flex min-h-screen flex-col">
            <AppHeader section={section} sectionBadge={sectionBadge} />
            <main className="container mx-auto flex-1 px-4 py-8">
                <RouteError error={error} />
            </main>
            <AppFooter />
        </div>
    );
}

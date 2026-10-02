import clsx from "clsx";
import { type ReactNode, useState } from "react";
import { I18nextProvider } from "react-i18next";
import {
    isRouteErrorResponse,
    Links,
    Meta,
    Outlet,
    Scripts,
    ScrollRestoration,
    useLoaderData,
} from "react-router";
import { PreventFlashOnWrongTheme, Theme, ThemeProvider, useTheme } from "remix-themes";
import type { Route } from "./+types/root";
import "./app.css";
import { Toaster } from "~/components/ui/sonner";
import { localeContext } from "~/context";
import { createI18nInstance, DEFAULT_LOCALE } from "~/i18n";
import { themeSessionResolver } from "~/sessions.server";

export const links: Route.LinksFunction = () => [
    { rel: "icon", href: "/logo.avif", type: "image/avif" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
    const { getTheme } = await themeSessionResolver(request);
    const locale = context.get(localeContext);

    // Pre-load the non-default locale's resources on the server so they're
    // inlined into the SSR HTML (as React Router loader data). The client
    // re-uses them during hydration — no async roundtrip, no flash.
    let translations: unknown = null;
    if (locale !== DEFAULT_LOCALE) {
        const mod = await import(`./i18n/locales/${locale}.json`);
        translations = mod.default;
    }

    return {
        theme: getTheme() ?? Theme.DARK,
        locale,
        translations,
    };
}

function InnerLayout({ children }: { children: ReactNode }) {
    const data = useLoaderData<typeof loader>();
    const [theme] = useTheme();
    const locale = data?.locale ?? DEFAULT_LOCALE;

    return (
        <html lang={locale} className={clsx(theme)}>
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <Meta />
                <PreventFlashOnWrongTheme ssrTheme={Boolean(data?.theme)} />
                <Links />
            </head>
            <body className="bg-background text-foreground">
                {children}
                <Toaster />
                <ScrollRestoration />
                <Scripts />
            </body>
        </html>
    );
}

export function Layout({ children }: { children: ReactNode }) {
    const data = useLoaderData<typeof loader>();
    const theme = data?.theme ?? Theme.DARK;
    const locale = data?.locale ?? DEFAULT_LOCALE;
    const translations = data?.translations ?? null;

    // One instance per render tree: one on SSR, one on client hydrate. Both
    // see the same loader data so the two trees produce identical markup.
    const [instance] = useState(() =>
        createI18nInstance({
            lng: locale,
            resources:
                locale !== DEFAULT_LOCALE && translations
                    ? { [locale]: { translation: translations as Record<string, unknown> } }
                    : undefined,
        }),
    );

    return (
        <ThemeProvider specifiedTheme={theme} themeAction="/action/set-theme">
            <I18nextProvider i18n={instance}>
                <InnerLayout>{children}</InnerLayout>
            </I18nextProvider>
        </ThemeProvider>
    );
}

export default function App() {
    return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    let message = "Oops!";
    let details = "An unexpected error occurred.";
    let stack: string | undefined;

    if (isRouteErrorResponse(error)) {
        message = error.status === 404 ? "404" : "Error";
        details =
            error.status === 404
                ? "The requested page could not be found."
                : error.statusText || details;
    } else if (import.meta.env.DEV && error && error instanceof Error) {
        details = error.message;
        stack = error.stack;
    }

    return (
        <main className="container mx-auto p-4 pt-16">
            <h1>{message}</h1>
            <p>{details}</p>
            {stack && (
                <pre className="w-full overflow-x-auto p-4">
                    <code>{stack}</code>
                </pre>
            )}
        </main>
    );
}

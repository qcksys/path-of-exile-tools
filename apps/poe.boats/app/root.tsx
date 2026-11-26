import clsx from "clsx";
import { type ReactNode, useState } from "react";
import { I18nextProvider } from "react-i18next";
import {
    Links,
    Meta,
    Outlet,
    Scripts,
    ScrollRestoration,
    type ShouldRevalidateFunctionArgs,
    useLoaderData,
    useNavigation,
} from "react-router";
import { Theme } from "remix-themes";
import type { Route } from "./+types/root";
import "./app.css";
import { RouteError } from "~/components/route-error";
import { Toaster } from "~/components/ui/sonner";
import { localeContext } from "~/context";
import { ThemeProvider, useThemePreference } from "~/context/theme-context";
import { createI18nInstance, DEFAULT_LOCALE, useLocale } from "~/i18n";
import { recoverBrowseNavigation } from "~/lib/browse-navigation";
import { themeSessionResolver } from "~/sessions.server";

export const links: Route.LinksFunction = () => [
    { rel: "icon", href: "/logo.avif", type: "image/avif" },
];

export const clientMiddleware = [recoverBrowseNavigation];

export function shouldRevalidate({
    currentUrl,
    nextUrl,
    formMethod,
    defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
    // The mounted theme and locale providers own these preferences after hydration.
    if (
        (!formMethod || formMethod === "GET") &&
        (currentUrl.pathname !== nextUrl.pathname || currentUrl.search !== nextUrl.search)
    )
        return false;
    return defaultShouldRevalidate;
}

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
    const { theme } = useThemePreference();
    const locale = useLocale();

    return (
        <html lang={locale} className={clsx(theme)}>
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <Meta />
                <meta
                    name="color-scheme"
                    content={theme === Theme.LIGHT ? "light dark" : "dark light"}
                />
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
        <ThemeProvider initial={theme}>
            <I18nextProvider i18n={instance}>
                <InnerLayout>{children}</InnerLayout>
            </I18nextProvider>
        </ThemeProvider>
    );
}

export default function App() {
    const navigation = useNavigation();
    return (
        <>
            {navigation.state !== "idle" && (
                <div
                    role="status"
                    className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 bg-primary motion-safe:animate-pulse"
                >
                    <span className="sr-only">
                        {navigation.state === "submitting" ? "Submitting…" : "Loading page…"}
                    </span>
                </div>
            )}
            <Outlet />
        </>
    );
}

// Last resort: renders without the site header, since the header itself may be what failed.
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    return (
        <main className="container mx-auto p-4 pt-16">
            <RouteError error={error} />
        </main>
    );
}

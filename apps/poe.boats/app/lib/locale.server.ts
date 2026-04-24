import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from "~/i18n/types";

export const LOCALE_COOKIE_NAME = "poe-locale";

const SUPPORTED_SET = new Set<string>(SUPPORTED_LOCALES);

function isSupported(candidate: string | null | undefined): candidate is SupportedLocale {
    return typeof candidate === "string" && SUPPORTED_SET.has(candidate);
}

function parseCookieLocale(cookieHeader: string | null): SupportedLocale | null {
    if (!cookieHeader) return null;
    for (const pair of cookieHeader.split(";")) {
        const [rawName, ...rest] = pair.split("=");
        if (rawName?.trim() !== LOCALE_COOKIE_NAME) continue;
        const value = decodeURIComponent(rest.join("=").trim());
        return isSupported(value) ? value : null;
    }
    return null;
}

function parseAcceptLanguage(header: string | null): SupportedLocale | null {
    if (!header) return null;
    // Accept-Language is a comma-separated list of `lang;q=weight`. We order by
    // q (descending) and return the first entry that matches a supported locale
    // (with a prefix fallback: `de-AT` -> `de`).
    const ranked = header
        .split(",")
        .map((part) => {
            const [tag, ...params] = part.trim().split(";");
            const qParam = params.find((p) => p.trim().startsWith("q="));
            const q = qParam ? Number.parseFloat(qParam.split("=")[1]) : 1;
            return { tag: tag.trim(), q: Number.isFinite(q) ? q : 0 };
        })
        .filter((x) => x.tag)
        .sort((a, b) => b.q - a.q);

    for (const { tag } of ranked) {
        if (isSupported(tag)) return tag;
        const prefix = tag.split("-")[0];
        const prefixMatch = SUPPORTED_LOCALES.find((l) => l === prefix || l.split("-")[0] === prefix);
        if (prefixMatch) return prefixMatch;
    }
    return null;
}

export function detectLocale(request: Request): SupportedLocale {
    const url = new URL(request.url);
    const urlParam = url.searchParams.get("lang");
    if (isSupported(urlParam)) return urlParam;

    const cookieLocale = parseCookieLocale(request.headers.get("cookie"));
    if (cookieLocale) return cookieLocale;

    const acceptLocale = parseAcceptLanguage(request.headers.get("accept-language"));
    if (acceptLocale) return acceptLocale;

    return DEFAULT_LOCALE;
}

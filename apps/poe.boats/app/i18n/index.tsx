import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import deTranslations from "~/i18n/locales/de.json";
import enTranslations from "~/i18n/locales/en.json";
import esTranslations from "~/i18n/locales/es.json";
import frTranslations from "~/i18n/locales/fr.json";
import jaTranslations from "~/i18n/locales/ja.json";
import koTranslations from "~/i18n/locales/ko.json";
import ptBRTranslations from "~/i18n/locales/pt-BR.json";
import ruTranslations from "~/i18n/locales/ru.json";
import zhCNTranslations from "~/i18n/locales/zh-CN.json";
import zhTWTranslations from "~/i18n/locales/zh-TW.json";
import type { SupportedLocale, Translations } from "~/i18n/types";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "~/i18n/types";

const translations: Record<SupportedLocale, Translations> = {
    en: enTranslations,
    "zh-TW": zhTWTranslations,
    "zh-CN": zhCNTranslations,
    ko: koTranslations,
    ja: jaTranslations,
    ru: ruTranslations,
    "pt-BR": ptBRTranslations,
    de: deTranslations,
    fr: frTranslations,
    es: esTranslations,
};

const STORAGE_KEY = "poe-idol-planner-locale";

function detectLocale(): SupportedLocale {
    if (typeof window === "undefined") return DEFAULT_LOCALE;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LOCALES.includes(stored as SupportedLocale)) {
        return stored as SupportedLocale;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const urlLocale = urlParams.get("lang");
    if (urlLocale && SUPPORTED_LOCALES.includes(urlLocale as SupportedLocale)) {
        return urlLocale as SupportedLocale;
    }

    const browserLocale = navigator.language;
    const exactMatch = SUPPORTED_LOCALES.find((l) => l === browserLocale);
    if (exactMatch) return exactMatch;

    const langPrefix = browserLocale.split("-")[0];
    const prefixMatch = SUPPORTED_LOCALES.find((l) => l.split("-")[0] === langPrefix);
    if (prefixMatch) return prefixMatch;

    return DEFAULT_LOCALE;
}

interface I18nContextValue {
    locale: SupportedLocale;
    setLocale: (locale: SupportedLocale) => void;
    t: Translations;
}

const I18N_CONTEXT = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
    const [locale, setLocaleState] = useState<SupportedLocale>(DEFAULT_LOCALE);
    const [isHydrated, setIsHydrated] = useState(false);

    useEffect(() => {
        setLocaleState(detectLocale());
        setIsHydrated(true);
    }, []);

    const setLocale = useCallback((newLocale: SupportedLocale) => {
        setLocaleState(newLocale);
        localStorage.setItem(STORAGE_KEY, newLocale);
    }, []);

    const t = translations[locale];

    if (!isHydrated) {
        return (
            <I18N_CONTEXT.Provider
                value={{
                    locale: DEFAULT_LOCALE,
                    setLocale,
                    t: translations[DEFAULT_LOCALE],
                }}
            >
                {children}
            </I18N_CONTEXT.Provider>
        );
    }

    return (
        <I18N_CONTEXT.Provider value={{ locale, setLocale, t }}>{children}</I18N_CONTEXT.Provider>
    );
}

export function useI18n(): I18nContextValue {
    const context = useContext(I18N_CONTEXT);
    if (!context) {
        throw new Error("useI18n must be used within an I18nProvider");
    }
    return context;
}

export function useTranslations(): Translations {
    return useI18n().t;
}

export function useLocale(): SupportedLocale {
    return useI18n().locale;
}

export type { SupportedLocale, Translations };
export { DEFAULT_LOCALE, SUPPORTED_LOCALES };

import i18n, { type TFunction } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import resourcesToBackend from "i18next-resources-to-backend";
import { useTranslation, initReactI18next } from "react-i18next";
import en from "~/i18n/locales/en.json";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from "~/i18n/types";

const STORAGE_KEY = "poe-idol-planner-locale";

// `en` is bundled statically so SSR and the fallback chain are synchronous.
// Other locales are loaded on demand — Vite turns each `locales/*.json` into
// its own chunk, so a user visiting in English never pays for Japanese, etc.
const lazyBackend = resourcesToBackend(async (language: string) => {
    if (language === "en") return en;
    if (!(SUPPORTED_LOCALES as readonly string[]).includes(language)) return {};
    const mod = await import(`./locales/${language}.json`);
    return mod.default;
});

if (!i18n.isInitialized) {
    const chain =
        typeof window === "undefined"
            ? i18n.use(lazyBackend).use(initReactI18next)
            : i18n.use(lazyBackend).use(LanguageDetector).use(initReactI18next);

    chain.init({
        resources: { en: { translation: en } },
        fallbackLng: DEFAULT_LOCALE,
        supportedLngs: [...SUPPORTED_LOCALES],
        partialBundledLanguages: true,
        detection: {
            order: ["querystring", "localStorage", "navigator"],
            lookupQuerystring: "lang",
            lookupLocalStorage: STORAGE_KEY,
            caches: ["localStorage"],
        },
        interpolation: { escapeValue: false },
        react: { useSuspense: false },
        returnNull: false,
    });
}

export { i18n };

export function useTranslations(): TFunction {
    return useTranslation().t;
}

export function useLocale(): SupportedLocale {
    return useTranslation().i18n.language as SupportedLocale;
}

export function useI18n() {
    const { t, i18n: inst } = useTranslation();
    return {
        t,
        locale: inst.language as SupportedLocale,
        setLocale: (next: SupportedLocale) => inst.changeLanguage(next),
    };
}

export type { SupportedLocale };
export { DEFAULT_LOCALE, SUPPORTED_LOCALES };

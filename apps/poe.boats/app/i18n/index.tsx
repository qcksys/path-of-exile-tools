import { createInstance, type i18n as I18nInstance, type Resource, type TFunction } from "i18next";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next, useTranslation } from "react-i18next";
import en from "~/i18n/locales/en.json";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from "~/i18n/types";

// `en` is bundled statically so the fallback chain is synchronous everywhere.
// Other locales are resolved through `resourcesToBackend`, which calls a
// dynamic `import()` per language — Vite code-splits each locale JSON into
// its own chunk, and on the Worker the dynamic import is inlined at build.
const backend = resourcesToBackend(async (language: string) => {
    if (language === DEFAULT_LOCALE) return en;
    if (!(SUPPORTED_LOCALES as readonly string[]).includes(language)) return {};
    const mod = await import(`./locales/${language}.json`);
    return mod.default;
});

interface CreateInstanceOptions {
    lng: SupportedLocale;
    /**
     * Pre-populated resource store. When the active locale's bundle is provided
     * here, `init` completes synchronously and the instance is immediately
     * ready to translate — which is how SSR and hydration stay in sync.
     */
    resources?: Resource;
}

export function createI18nInstance({ lng, resources }: CreateInstanceOptions): I18nInstance {
    const instance = createInstance();
    instance
        .use(backend)
        .use(initReactI18next)
        .init({
            lng,
            fallbackLng: DEFAULT_LOCALE,
            supportedLngs: [...SUPPORTED_LOCALES],
            resources: {
                [DEFAULT_LOCALE]: { translation: en },
                ...resources,
            },
            partialBundledLanguages: true,
            interpolation: { escapeValue: false },
            react: { useSuspense: false },
            returnNull: false,
        });

    return instance;
}

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

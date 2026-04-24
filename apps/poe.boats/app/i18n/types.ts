export const SUPPORTED_LOCALES = [
    "en",
    "zh-TW",
    "zh-CN",
    "ko",
    "ja",
    "ru",
    "pt-BR",
    "de",
    "fr",
    "es",
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";

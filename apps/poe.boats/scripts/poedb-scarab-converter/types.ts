export const LOCALES = [
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
export type Locale = (typeof LOCALES)[number];

export const POEDB_LOCALE_MAP: Record<Locale, string> = {
    en: "us",
    "zh-TW": "tw",
    "zh-CN": "cn",
    ko: "kr",
    ja: "jp",
    ru: "ru",
    "pt-BR": "pt",
    de: "de",
    fr: "fr",
    es: "sp",
};

export interface RawScarab {
    id: string;
    name: string;
    effect: string;
    category: string;
    imageUrl: string;
    limit?: number;
}

export interface ScarabData {
    id: string;
    name: Record<Locale, string>;
    effect: Record<Locale, string>;
    category: string;
    image: string | null;
    limit: number;
}

export interface ConvertedScarabData {
    scarabs: ScarabData[];
    categories: string[];
    generatedAt: string;
    version: number;
}

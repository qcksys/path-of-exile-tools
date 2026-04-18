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

export const IDOL_BASE_TYPES = [
    "Minor",
    "Kamasan",
    "Totemic",
    "Noble",
    "Burial",
    "Conqueror",
] as const;
export type IdolBaseType = (typeof IDOL_BASE_TYPES)[number];

export interface ValueRange {
    min: number;
    max: number;
}

export interface RawModifier {
    modId: string;
    type: "prefix" | "suffix";
    name: string;
    tier: number;
    levelReq: number;
    mechanic: string;
    text: string;
    values: ValueRange[];
    weight: number;
    tags: string[];
    idolSource: IdolBaseType;
    modFamily: string;
}

export interface ModifierData {
    id: string;
    type: "prefix" | "suffix";
    name: Record<Locale, string>;
    tiers: ModifierTier[];
    mechanic: string;
    applicableIdols: IdolBaseType[];
}

export interface ModifierTier {
    tier: number;
    levelReq: number;
    text: Record<Locale, string>;
    values: ValueRange[];
    weight: number;
    tradeStatId?: string;
}

export interface UniqueIdolModifier {
    text: Record<Locale, string>;
    values: ValueRange[];
    tradeStatId?: string;
}

export interface UniqueIdol {
    id: string;
    name: Record<Locale, string>;
    baseType: IdolBaseType;
    modifiers: UniqueIdolModifier[];
    flavourText?: Record<Locale, string>;
}

export interface ParsedPage {
    modifiers: RawModifier[];
    uniqueIdols: UniqueIdol[];
}

export interface ConvertedData {
    modifiers: ModifierData[];
    uniqueIdols: UniqueIdol[];
    generatedAt: string;
    version: number;
}

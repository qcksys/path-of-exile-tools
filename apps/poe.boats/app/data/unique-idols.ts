import uniqueIdolsData from "~/data/unique-idols.json";
import type { SupportedLocale } from "~/i18n/types";

export interface UniqueIdolModifier {
    text: Record<SupportedLocale, string>;
    values: { min: number; max: number }[];
    tradeStatId?: string;
}

export interface UniqueIdol {
    id: string;
    name: Record<SupportedLocale, string>;
    baseType: "Minor" | "Kamasan" | "Totemic" | "Noble" | "Burial" | "Conqueror";
    modifiers: UniqueIdolModifier[];
    flavourText?: Record<SupportedLocale, string>;
}

export const UNIQUE_IDOLS = uniqueIdolsData as UniqueIdol[];

export function getUniqueIdolById(id: string): UniqueIdol | undefined {
    return UNIQUE_IDOLS.find((idol) => idol.id === id);
}

export function getUniqueIdolName(idol: UniqueIdol, locale: SupportedLocale): string {
    return idol.name[locale] || idol.name.en;
}

export function getUniqueIdolModText(mod: UniqueIdolModifier, locale: SupportedLocale): string {
    return mod.text[locale] || mod.text.en;
}

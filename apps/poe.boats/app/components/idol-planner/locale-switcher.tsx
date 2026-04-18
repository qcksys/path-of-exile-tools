import { Globe } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { SUPPORTED_LOCALES, type SupportedLocale, useI18n, useTranslations } from "~/i18n";

const LOCALE_NAMES: Record<SupportedLocale, string> = {
    en: "English",
    "zh-TW": "繁體中文",
    "zh-CN": "简体中文",
    ko: "한국어",
    ja: "日本語",
    ru: "Русский",
    "pt-BR": "Português (BR)",
    de: "Deutsch",
    fr: "Français",
    es: "Español",
};

export function LocaleSwitcher() {
    const { locale, setLocale } = useI18n();
    const t = useTranslations();

    return (
        <Tooltip>
            <TooltipTrigger render={<div />}>
                <Select value={locale} onValueChange={(v) => setLocale(v as SupportedLocale)}>
                    <SelectTrigger className="w-[140px]">
                        <Globe className="mr-2 h-4 w-4" />
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {SUPPORTED_LOCALES.map((loc) => (
                            <SelectItem key={loc} value={loc}>
                                {LOCALE_NAMES[loc]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </TooltipTrigger>
            <TooltipContent>{t.actions.changeLanguage}</TooltipContent>
        </Tooltip>
    );
}

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

const LOCALE_COOKIE_NAME = "poe-locale";
const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function persistLocaleCookie(locale: SupportedLocale) {
    if (typeof document === "undefined") return;
    document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

export function LocaleSwitcher() {
    const { locale, setLocale } = useI18n();
    const t = useTranslations();

    const handleChange = (value: SupportedLocale | null) => {
        if (!value) return;
        persistLocaleCookie(value);
        setLocale(value);
    };

    return (
        <Tooltip>
            <TooltipTrigger render={<div />}>
                <Select value={locale} onValueChange={handleChange}>
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
            <TooltipContent>{t("actions.changeLanguage")}</TooltipContent>
        </Tooltip>
    );
}

import { Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { SUPPORTED_LOCALES, type SupportedLocale } from "~/i18n";

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
    // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API lacks Safari support; a synchronous document.cookie write is intentional here
    document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

export function LocaleSwitcher() {
    const { t, i18n } = useTranslation();
    const [pending, setPending] = useState<SupportedLocale>();
    const attempt = useRef(0);
    useEffect(
        () => () => {
            attempt.current++;
        },
        [],
    );

    const handleChange = async (value: SupportedLocale | null) => {
        if (!value) return;
        const id = ++attempt.current;
        setPending(value);
        try {
            if (!i18n.hasResourceBundle(value, "translation")) {
                await i18n.reloadResources([value], ["translation"]);
                if (!i18n.hasResourceBundle(value, "translation"))
                    throw new Error("Language unavailable.");
            }
            if (id !== attempt.current) return;
            persistLocaleCookie(value);
            await i18n.changeLanguage(value);
        } catch {
            if (id === attempt.current) toast.error("Could not switch language.");
        } finally {
            if (id === attempt.current) setPending(undefined);
        }
    };

    return (
        <Tooltip>
            <TooltipTrigger render={<div />}>
                <Select
                    items={LOCALE_NAMES}
                    value={pending ?? (i18n.language as SupportedLocale)}
                    onValueChange={handleChange}
                >
                    <SelectTrigger
                        aria-label={t("actions.changeLanguage")}
                        className="w-14 justify-center px-2 sm:w-[140px]"
                    >
                        <Globe className="size-4 shrink-0" />
                        <SelectValue className="hidden sm:flex" />
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

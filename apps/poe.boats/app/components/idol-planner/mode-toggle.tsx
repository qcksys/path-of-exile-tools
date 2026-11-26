import { Moon, Sun } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { useThemePreference } from "~/context/theme-context";
import { useTranslations } from "~/i18n";

export function ModeToggle() {
    const t = useTranslations();
    const { toggle } = useThemePreference();

    return (
        <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={toggle} />}>
                <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">{t("actions.toggleTheme")}</span>
            </TooltipTrigger>
            <TooltipContent>{t("actions.toggleTheme")}</TooltipContent>
        </Tooltip>
    );
}

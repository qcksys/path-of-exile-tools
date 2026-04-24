import { Moon, Sun } from "lucide-react";
import { Theme, useTheme } from "remix-themes";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { useTranslations } from "~/i18n";

export function ModeToggle() {
    const t = useTranslations();
    const [theme, setTheme] = useTheme();

    const toggleTheme = () => {
        setTheme(theme === Theme.DARK ? Theme.LIGHT : Theme.DARK);
    };

    return (
        <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={toggleTheme} />}>
                <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">{t("actions.toggleTheme")}</span>
            </TooltipTrigger>
            <TooltipContent>{t("actions.toggleTheme")}</TooltipContent>
        </Tooltip>
    );
}

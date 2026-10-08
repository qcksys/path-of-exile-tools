import { Trophy } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { useLeague } from "~/context/league-context";
import { useTranslations } from "~/i18n";

export function LeagueSelector() {
    const { league, leagues, setLeague, isHydrated } = useLeague();
    const t = useTranslations();

    if (!isHydrated) {
        return (
            <Select disabled>
                <SelectTrigger className="w-full" aria-label={t("actions.selectLeague")}>
                    <Trophy className="mr-2 h-4 w-4" />
                    <SelectValue placeholder={t("actions.loading")} />
                </SelectTrigger>
            </Select>
        );
    }

    return (
        <Tooltip>
            <TooltipTrigger render={<div />}>
                <Select
                    value={league}
                    onValueChange={(value) => {
                        if (value) setLeague(value);
                    }}
                >
                    <SelectTrigger className="w-full" aria-label={t("actions.selectLeague")}>
                        <Trophy className="mr-2 h-4 w-4" />
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {leagues.map((l) => (
                            <SelectItem key={l.id} value={l.id}>
                                {l.text}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </TooltipTrigger>
            <TooltipContent>{t("actions.selectLeague")}</TooltipContent>
        </Tooltip>
    );
}

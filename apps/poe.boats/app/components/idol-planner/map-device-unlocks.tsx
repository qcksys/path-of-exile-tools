import { ChevronDown, Lock, Unlock } from "lucide-react";
import { useCallback, useMemo } from "react";
import { Button } from "~/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { MAP_DEVICE_UNLOCKS } from "~/data/map-device-unlocks";
import { useTranslations } from "~/i18n";

interface MapDeviceUnlocksProps {
    unlockedConditions: string[];
    onUnlockedConditionsChange: (conditions: string[]) => void;
}

export function MapDeviceUnlocks({
    unlockedConditions,
    onUnlockedConditionsChange,
}: MapDeviceUnlocksProps) {
    const t = useTranslations();
    const unlockedSet = useMemo(() => new Set(unlockedConditions), [unlockedConditions]);

    const toggleCondition = useCallback(
        (conditionId: string) => {
            const newConditions = unlockedSet.has(conditionId)
                ? unlockedConditions.filter((c) => c !== conditionId)
                : [...unlockedConditions, conditionId];
            onUnlockedConditionsChange(newConditions);
        },
        [unlockedConditions, unlockedSet, onUnlockedConditionsChange],
    );

    const unlockAll = useCallback(() => {
        onUnlockedConditionsChange(MAP_DEVICE_UNLOCKS.map((u) => u.id));
    }, [onUnlockedConditionsChange]);

    const lockAll = useCallback(() => {
        onUnlockedConditionsChange([]);
    }, [onUnlockedConditionsChange]);

    const unlockedCount = unlockedConditions.length;
    const totalCount = MAP_DEVICE_UNLOCKS.length;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-2" />}>
                {unlockedCount === totalCount ? (
                    <Unlock className="h-4 w-4" />
                ) : (
                    <Lock className="h-4 w-4" />
                )}
                <span>
                    {t.mapDevice.unlocksCount
                        .replace("{unlocked}", String(unlockedCount))
                        .replace("{total}", String(totalCount))}
                </span>
                <ChevronDown className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
                <DropdownMenuLabel className="flex items-center justify-between">
                    <span>{t.mapDevice.unlocksTitle}</span>
                    <div className="flex gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={unlockAll}
                        >
                            {t.filter.selectAll}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={lockAll}
                        >
                            {t.filter.selectNone}
                        </Button>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {MAP_DEVICE_UNLOCKS.map((unlock) => (
                    <DropdownMenuCheckboxItem
                        key={unlock.id}
                        checked={unlockedSet.has(unlock.id)}
                        onCheckedChange={() => toggleCondition(unlock.id)}
                        closeOnClick={false}
                    >
                        {unlock.name}
                    </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

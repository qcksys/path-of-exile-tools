import { Check, ChevronsUpDown, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "~/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { useFavorites } from "~/context/favorites-context";
import {
    IDOL_BASE_KEYS,
    IDOL_BASES,
    type IdolBaseKey,
    LEAGUE_MECHANICS,
    type LeagueMechanic,
} from "~/data/idol-bases";
import idolModifiers from "~/data/idol-modifiers.json";
import { useLocale, useTranslations } from "~/i18n";
import type { SupportedLocale } from "~/i18n/types";
import { cn } from "~/lib/utils";

export interface ModifierOption {
    id: string;
    type: "prefix" | "suffix";
    name: string;
    mechanic: LeagueMechanic;
    applicableIdols: string[];
    tiers: {
        tier: number;
        levelReq: number;
        text: string;
        values: { min: number; max: number }[];
        weight: number;
    }[];
}

interface ModSearchProps {
    type?: "prefix" | "suffix";
    mechanicFilter?: LeagueMechanic | LeagueMechanic[] | null;
    idolType?: string | null;
    selectedModId?: string | null;
    excludedModIds?: string[];
    onSelect: (mod: ModifierOption | null) => void;
    disabled?: boolean;
    placeholder?: string;
}

function getLocalizedText(textObj: Record<string, string>, locale: SupportedLocale): string {
    return textObj[locale] || textObj.en || "";
}

// Module-level cache for modifier options per locale
const modifierOptionsCache = new Map<SupportedLocale, ModifierOption[]>();

export function getModifierOptions(locale: SupportedLocale = "en"): ModifierOption[] {
    // Return cached result if available
    const cached = modifierOptionsCache.get(locale);
    if (cached) {
        return cached;
    }

    // Dedupe mods by tier text, merging applicableIdols for identical mods
    const modsByText = new Map<string, ModifierOption>();

    for (const mod of idolModifiers) {
        const tierText = getLocalizedText(mod.tiers[0]?.text || {}, locale);
        const key = `${mod.type}:${mod.mechanic}:${mod.tiers[0]?.text?.en || ""}`;

        const existing = modsByText.get(key);
        if (existing) {
            // Merge applicableIdols from duplicate
            const newIdols = mod.applicableIdols.filter(
                (idol) => !existing.applicableIdols.includes(idol),
            );
            existing.applicableIdols.push(...newIdols);
        } else {
            modsByText.set(key, {
                id: mod.id,
                type: mod.type as "prefix" | "suffix",
                name: getLocalizedText(mod.name, locale) || tierText || mod.id,
                mechanic: mod.mechanic as LeagueMechanic,
                applicableIdols: [...mod.applicableIdols],
                tiers: mod.tiers.map((tier) => ({
                    tier: tier.tier,
                    levelReq: tier.levelReq,
                    text: getLocalizedText(tier.text, locale),
                    values: tier.values || [],
                    weight: tier.weight ?? 0,
                })),
            });
        }
    }

    const result = Array.from(modsByText.values());
    modifierOptionsCache.set(locale, result);
    return result;
}

export function ModSearch({
    type,
    mechanicFilter,
    idolType,
    selectedModId,
    excludedModIds = [],
    onSelect,
    disabled = false,
    placeholder,
}: ModSearchProps) {
    const t = useTranslations();
    const locale = useLocale();
    const [open, setOpen] = useState(false);
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
    const { favorites, toggleFavorite, isFavorite } = useFavorites();

    const allModifiers = useMemo(() => getModifierOptions(locale), [locale]);

    const filteredModifiers = useMemo(() => {
        return allModifiers.filter((mod) => {
            if (type && mod.type !== type) return false;
            if (mechanicFilter) {
                if (Array.isArray(mechanicFilter)) {
                    if (mechanicFilter.length > 0 && !mechanicFilter.includes(mod.mechanic))
                        return false;
                } else if (mod.mechanic !== mechanicFilter) {
                    return false;
                }
            }
            if (idolType) {
                const idolTypeName = idolType.charAt(0).toUpperCase() + idolType.slice(1);
                if (!mod.applicableIdols.includes(idolTypeName)) return false;
            }
            if (excludedModIds.includes(mod.id)) return false;
            if (showFavoritesOnly && !favorites.includes(mod.id)) return false;
            return true;
        });
    }, [
        allModifiers,
        type,
        mechanicFilter,
        idolType,
        excludedModIds,
        showFavoritesOnly,
        favorites,
    ]);

    const groupedModifiers = useMemo(() => {
        const groups: Record<LeagueMechanic, ModifierOption[]> = {} as Record<
            LeagueMechanic,
            ModifierOption[]
        >;
        for (const mod of filteredModifiers) {
            if (!groups[mod.mechanic]) {
                groups[mod.mechanic] = [];
            }
            groups[mod.mechanic].push(mod);
        }
        // Sort favorites to the top within each group
        const favSet = new Set(favorites);
        for (const mods of Object.values(groups)) {
            mods.sort((a, b) => {
                const aFav = favSet.has(a.id);
                const bFav = favSet.has(b.id);
                if (aFav && !bFav) return -1;
                if (!aFav && bFav) return 1;
                return 0;
            });
        }
        return groups;
    }, [filteredModifiers, favorites]);

    const selectedMod = selectedModId ? allModifiers.find((m) => m.id === selectedModId) : null;

    const displayText =
        selectedMod?.tiers[0]?.text || selectedMod?.name || placeholder || t.editor.selectMod;

    const selectedWeight = selectedMod?.tiers[0]?.weight;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                render={
                    <Button
                        variant="outline"
                        aria-expanded={open}
                        className="h-auto min-h-9 w-full justify-between text-left font-normal"
                        disabled={disabled}
                    />
                }
            >
                <span className="flex items-start gap-1 whitespace-normal text-wrap">
                    <span>{displayText}</span>
                    {selectedWeight !== undefined && (
                        <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                            [{selectedWeight}]
                        </span>
                    )}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </PopoverTrigger>
            <PopoverContent className="w-[500px] p-0" align="start">
                <Command>
                    <CommandInput placeholder={t.editor.searchMods} />
                    <div className="flex items-center gap-2 border-b px-3 py-2">
                        <Checkbox
                            id="favorites-filter"
                            checked={showFavoritesOnly}
                            onCheckedChange={(checked) => setShowFavoritesOnly(checked === true)}
                        />
                        <label htmlFor="favorites-filter" className="cursor-pointer text-sm">
                            {t.editor.favoritesOnly}
                        </label>
                    </div>
                    <CommandList className="max-h-[300px]">
                        <CommandEmpty>{t.editor.noModsFound}</CommandEmpty>
                        {LEAGUE_MECHANICS.map((mechanic) => {
                            const mods = groupedModifiers[mechanic];
                            if (!mods || mods.length === 0) return null;

                            return (
                                <CommandGroup
                                    key={mechanic}
                                    heading={t.mechanics[mechanic] || mechanic}
                                >
                                    {mods.map((mod) => {
                                        const modIsFavorite = isFavorite(mod.id);
                                        return (
                                            <CommandItem
                                                key={mod.id}
                                                value={`${mod.name} ${mod.tiers[0]?.text || ""} ${mod.mechanic}`}
                                                onSelect={() => {
                                                    onSelect(mod.id === selectedModId ? null : mod);
                                                    setOpen(false);
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-4 w-4 shrink-0",
                                                        selectedModId === mod.id
                                                            ? "opacity-100"
                                                            : "opacity-0",
                                                    )}
                                                />
                                                <div className="flex flex-1 items-start gap-1">
                                                    <span className="text-sm">
                                                        {mod.tiers[0]?.text || mod.name}
                                                    </span>
                                                    {mod.tiers[0]?.weight !== undefined && (
                                                        <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                                                            [{mod.tiers[0].weight}]
                                                        </span>
                                                    )}
                                                </div>
                                                <Tooltip>
                                                    <TooltipTrigger
                                                        render={
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleFavorite(mod.id);
                                                                }}
                                                                className="ml-2 shrink-0 rounded p-1 hover:bg-accent"
                                                            />
                                                        }
                                                    >
                                                        <Star
                                                            className={cn(
                                                                "h-4 w-4",
                                                                modIsFavorite
                                                                    ? "fill-yellow-400 text-yellow-400"
                                                                    : "text-muted-foreground",
                                                            )}
                                                        />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        {modIsFavorite
                                                            ? t.editor.removeFromFavorites
                                                            : t.editor.addToFavorites}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </CommandItem>
                                        );
                                    })}
                                </CommandGroup>
                            );
                        })}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

interface MechanicFilterProps {
    value: LeagueMechanic | null;
    onChange: (mechanic: LeagueMechanic | null) => void;
    showAll?: boolean;
}

export function MechanicFilter({ value, onChange, showAll = true }: MechanicFilterProps) {
    const t = useTranslations();
    const [open, setOpen] = useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                render={
                    <Button
                        variant="outline"
                        aria-expanded={open}
                        className="w-full justify-between"
                        size="sm"
                    />
                }
            >
                <span>{value ? t.mechanics[value] : t.editor.allMechanics}</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                    <CommandInput placeholder={t.editor.searchMechanic} />
                    <CommandList className="max-h-[200px]">
                        <CommandEmpty>{t.editor.noMechanicsFound}</CommandEmpty>
                        <CommandGroup>
                            {showAll && (
                                <CommandItem
                                    value="all"
                                    onSelect={() => {
                                        onChange(null);
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === null ? "opacity-100" : "opacity-0",
                                        )}
                                    />
                                    {t.editor.allMechanics}
                                </CommandItem>
                            )}
                            {LEAGUE_MECHANICS.map((mechanic) => {
                                const displayText = t.mechanics[mechanic] || mechanic;
                                return (
                                    <CommandItem
                                        key={mechanic}
                                        value={`${mechanic} ${displayText}`}
                                        onSelect={() => {
                                            onChange(mechanic);
                                            setOpen(false);
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                value === mechanic ? "opacity-100" : "opacity-0",
                                            )}
                                        />
                                        {displayText}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

interface MultiMechanicFilterProps {
    value: LeagueMechanic[];
    onChange: (mechanics: LeagueMechanic[]) => void;
}

export function MultiMechanicFilter({ value, onChange }: MultiMechanicFilterProps) {
    const t = useTranslations();
    const [open, setOpen] = useState(false);

    const selectedSet = useMemo(() => new Set(value), [value]);

    const handleToggle = (mechanic: LeagueMechanic) => {
        if (selectedSet.has(mechanic)) {
            onChange(value.filter((m) => m !== mechanic));
        } else {
            onChange([...value, mechanic]);
        }
    };

    const handleSelectAll = () => {
        onChange([...LEAGUE_MECHANICS]);
    };

    const handleClearAll = () => {
        onChange([]);
    };

    const displayText =
        value.length === 0
            ? t.editor.allMechanics
            : value.length === 1
              ? t.mechanics[value[0]]
              : t.filter?.mechanicsSelected?.replace("{count}", String(value.length)) ||
                `${value.length} selected`;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                render={
                    <Button
                        variant="outline"
                        aria-expanded={open}
                        className="w-full justify-between"
                        size="sm"
                    />
                }
            >
                <span className="truncate">{displayText}</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </PopoverTrigger>
            <PopoverContent className="w-[250px] p-0" align="start">
                <Command>
                    <CommandInput placeholder={t.editor.searchMechanic} />
                    <div className="flex items-center justify-between border-b px-3 py-2">
                        <span className="text-muted-foreground text-xs">
                            {value.length}/{LEAGUE_MECHANICS.length}
                        </span>
                        <div className="flex gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={handleSelectAll}
                            >
                                {t.filter?.selectAll || "All"}
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={handleClearAll}
                            >
                                {t.filter?.selectNone || "None"}
                            </Button>
                        </div>
                    </div>
                    <CommandList className="max-h-[250px]">
                        <CommandEmpty>{t.editor.noMechanicsFound}</CommandEmpty>
                        <CommandGroup>
                            {LEAGUE_MECHANICS.map((mechanic) => {
                                const displayText = t.mechanics[mechanic] || mechanic;
                                const isSelected = selectedSet.has(mechanic);
                                return (
                                    <CommandItem
                                        key={mechanic}
                                        value={`${mechanic} ${displayText}`}
                                        onSelect={() => handleToggle(mechanic)}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                isSelected ? "opacity-100" : "opacity-0",
                                            )}
                                        />
                                        {displayText}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

interface MultiIdolTypeFilterProps {
    value: IdolBaseKey[];
    onChange: (idolTypes: IdolBaseKey[]) => void;
}

export function MultiIdolTypeFilter({ value, onChange }: MultiIdolTypeFilterProps) {
    const t = useTranslations();
    const [open, setOpen] = useState(false);

    const selectedSet = useMemo(() => new Set(value), [value]);

    const handleToggle = (idolType: IdolBaseKey) => {
        if (selectedSet.has(idolType)) {
            onChange(value.filter((i) => i !== idolType));
        } else {
            onChange([...value, idolType]);
        }
    };

    const handleSelectAll = () => {
        onChange([...IDOL_BASE_KEYS]);
    };

    const handleClearAll = () => {
        onChange([]);
    };

    const getIdolName = (key: IdolBaseKey) => {
        const idolNameKey = `${key}Idol` as keyof typeof t.idol;
        return t.idol?.[idolNameKey] || IDOL_BASES[key].name;
    };

    const displayText =
        value.length === 0
            ? t.filter?.allIdolTypes || "All Idol Types"
            : value.length === 1
              ? getIdolName(value[0])
              : (t.filter?.idolTypesSelected || "{count} idol types").replace(
                    "{count}",
                    String(value.length),
                );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                render={
                    <Button
                        variant="outline"
                        aria-expanded={open}
                        className="w-full justify-between"
                        size="sm"
                    />
                }
            >
                <span className="truncate">{displayText}</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </PopoverTrigger>
            <PopoverContent className="w-[250px] p-0" align="start">
                <Command>
                    <CommandInput placeholder={t.filter?.searchIdolType || "Search idol type..."} />
                    <div className="flex items-center justify-between border-b px-3 py-2">
                        <span className="text-muted-foreground text-xs">
                            {value.length}/{IDOL_BASE_KEYS.length}
                        </span>
                        <div className="flex gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={handleSelectAll}
                            >
                                {t.filter?.selectAll || "All"}
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={handleClearAll}
                            >
                                {t.filter?.selectNone || "None"}
                            </Button>
                        </div>
                    </div>
                    <CommandList className="max-h-[250px]">
                        <CommandEmpty>
                            {t.filter?.noIdolTypesFound || "No idol types found."}
                        </CommandEmpty>
                        <CommandGroup>
                            {IDOL_BASE_KEYS.map((idolType) => {
                                const displayText = getIdolName(idolType);
                                const isSelected = selectedSet.has(idolType);
                                return (
                                    <CommandItem
                                        key={idolType}
                                        value={`${idolType} ${displayText}`}
                                        onSelect={() => handleToggle(idolType)}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                isSelected ? "opacity-100" : "opacity-0",
                                            )}
                                        />
                                        {displayText}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

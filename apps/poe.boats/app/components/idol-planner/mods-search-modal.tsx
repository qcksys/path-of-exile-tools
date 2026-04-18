import { Search, ShoppingCart, Star } from "lucide-react";
import { memo, useCallback, useDeferredValue, useMemo, useState } from "react";
import {
    getModifierOptions,
    type ModifierOption,
    MultiIdolTypeFilter,
    MultiMechanicFilter,
} from "~/components/idol-planner/mod-search";
import { WeightFilterAccordion } from "~/components/idol-planner/weight-filter-accordion";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { useFavorites } from "~/context/favorites-context";
import { useLeague } from "~/context/league-context";
import { useTradeSettings } from "~/context/trade-settings-context";
import {
    IDOL_BASES,
    type IdolBaseKey,
    LEAGUE_MECHANICS,
    type LeagueMechanic,
} from "~/data/idol-bases";
import { useLocale, useTranslations } from "~/i18n";
import type { Translations } from "~/i18n/types";
import { generateTradeUrlForMod } from "~/lib/trade-search";
import { cn } from "~/lib/utils";

interface ModsSearchModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type FavoriteFilter = "all" | "favorites" | "non-favorites";
type TypeFilter = "all" | "prefix" | "suffix";

interface ModifierRowProps {
    mod: ModifierOption;
    isFavorite: boolean;
    onToggleFavorite: (id: string) => void;
    t: Translations;
    league: string;
    tradeSettings: {
        maxWeight: number | null;
        filterByMaxWeight: boolean;
        separateWeightFilters: boolean;
        maxPrefixWeight: number | null;
        maxSuffixWeight: number | null;
        weightFilterMode: "gte" | "lte";
    };
    matchAffixType: boolean;
    idolTypeFilter: IdolBaseKey[];
}

const MODIFIER_ROW = memo(function modifierRow({
    mod,
    isFavorite,
    onToggleFavorite,
    t,
    league,
    tradeSettings,
    matchAffixType,
    idolTypeFilter,
}: ModifierRowProps) {
    const handleToggle = useCallback(() => {
        onToggleFavorite(mod.id);
    }, [mod.id, onToggleFavorite]);

    const handleTradeSearch = useCallback(() => {
        // Use selected idol type filter if exactly one is selected, otherwise use first applicable
        const baseType =
            idolTypeFilter.length === 1
                ? idolTypeFilter[0]
                : (mod.applicableIdols[0]?.toLowerCase() as IdolBaseKey | undefined);

        const url = generateTradeUrlForMod(
            {
                modId: mod.id,
                tier: mod.tiers[0]?.tier ?? 1,
                type: mod.type,
                text: mod.tiers[0]?.text || "",
                rolledValue: 0,
            },
            {
                league,
                baseType,
                maxWeight: tradeSettings.filterByMaxWeight
                    ? tradeSettings.separateWeightFilters
                        ? null
                        : tradeSettings.maxWeight
                    : null,
                maxPrefixWeight:
                    tradeSettings.filterByMaxWeight && tradeSettings.separateWeightFilters
                        ? tradeSettings.maxPrefixWeight
                        : null,
                maxSuffixWeight:
                    tradeSettings.filterByMaxWeight && tradeSettings.separateWeightFilters
                        ? tradeSettings.maxSuffixWeight
                        : null,
                weightFilterMode: tradeSettings.weightFilterMode,
                matchAffixType,
            },
        );
        window.open(url, "_blank", "noopener,noreferrer");
    }, [mod, league, tradeSettings, matchAffixType, idolTypeFilter]);

    const weight = mod.tiers[0]?.weight ?? 0;

    return (
        <div className="flex items-start gap-2 rounded-md p-2 hover:bg-muted/50">
            <Tooltip>
                <TooltipTrigger
                    render={
                        <button
                            type="button"
                            onClick={handleToggle}
                            className="mt-0.5 shrink-0 rounded p-1 hover:bg-accent"
                        />
                    }
                >
                    <Star
                        className={cn(
                            "h-4 w-4",
                            isFavorite
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-muted-foreground",
                        )}
                    />
                </TooltipTrigger>
                <TooltipContent>
                    {isFavorite ? t.editor.removeFromFavorites : t.editor.addToFavorites}
                </TooltipContent>
            </Tooltip>
            <div className="min-w-0 flex-1">
                <div
                    className={cn(
                        "text-sm",
                        mod.type === "prefix" ? "text-mod-prefix" : "text-mod-suffix",
                    )}
                >
                    {mod.tiers[0]?.text || mod.name}
                </div>
                <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    <span>
                        {mod.type === "prefix"
                            ? t.modsSearch?.prefix || "Prefix"
                            : t.modsSearch?.suffix || "Suffix"}
                    </span>
                    <span>•</span>
                    <span title={t.modsSearch?.weight || "Weight"}>{weight}</span>
                    <span>•</span>
                    {mod.applicableIdols.map((idol, index) => {
                        const key = idol.toLowerCase() as IdolBaseKey;
                        const base = IDOL_BASES[key];
                        if (!base) return null;
                        return (
                            <span key={key} className="inline-flex items-center gap-0.5">
                                {index > 0 && <span className="mr-0.5">,</span>}
                                <img src={base.image} alt="" className="h-4 w-4 object-contain" />
                                <span>{idol}</span>
                            </span>
                        );
                    })}
                </div>
            </div>
            <Tooltip>
                <TooltipTrigger
                    render={
                        <button
                            type="button"
                            onClick={handleTradeSearch}
                            className="mt-0.5 shrink-0 rounded p-1 hover:bg-accent"
                        />
                    }
                >
                    <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>{t.modsSearch?.searchTrade || "Search Trade"}</TooltipContent>
            </Tooltip>
        </div>
    );
});

interface MechanicSectionProps {
    mechanic: LeagueMechanic;
    mods: ModifierOption[];
    isFavorite: (id: string) => boolean;
    onToggleFavorite: (id: string) => void;
    t: Translations;
    league: string;
    tradeSettings: {
        maxWeight: number | null;
        filterByMaxWeight: boolean;
        separateWeightFilters: boolean;
        maxPrefixWeight: number | null;
        maxSuffixWeight: number | null;
        weightFilterMode: "gte" | "lte";
    };
    matchAffixType: boolean;
    idolTypeFilter: IdolBaseKey[];
}

const MECHANIC_SECTION = memo(function mechanicSection({
    mechanic,
    mods,
    isFavorite,
    onToggleFavorite,
    t,
    league,
    tradeSettings,
    matchAffixType,
    idolTypeFilter,
}: MechanicSectionProps) {
    if (mods.length === 0) return null;

    return (
        <div>
            <h4 className="mb-2 border-b pb-1 font-medium text-sm">
                {t.mechanics[mechanic] || mechanic}
            </h4>
            <div className="space-y-1">
                {mods.map((mod) => (
                    <MODIFIER_ROW
                        key={mod.id}
                        mod={mod}
                        isFavorite={isFavorite(mod.id)}
                        onToggleFavorite={onToggleFavorite}
                        t={t}
                        league={league}
                        tradeSettings={tradeSettings}
                        matchAffixType={matchAffixType}
                        idolTypeFilter={idolTypeFilter}
                    />
                ))}
            </div>
        </div>
    );
});

export function ModsSearchModal({ open, onOpenChange }: ModsSearchModalProps) {
    const t = useTranslations();
    const locale = useLocale();
    const { favorites, toggleFavorite, isFavorite } = useFavorites();
    const { league } = useLeague();
    const { settings: tradeSettings } = useTradeSettings();

    const [searchQuery, setSearchQuery] = useState("");
    const [mechanicFilter, setMechanicFilter] = useState<LeagueMechanic[]>([]);
    const [idolTypeFilter, setIdolTypeFilter] = useState<IdolBaseKey[]>([]);
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
    const [favoriteFilter, setFavoriteFilter] = useState<FavoriteFilter>("all");
    const [matchAffixType, setMatchAffixType] = useState(true);

    // Defer the search query to avoid blocking input
    const deferredSearchQuery = useDeferredValue(searchQuery);

    // Module-level cached call
    const allModifiers = useMemo(() => getModifierOptions(locale), [locale]);

    const filteredModifiers = useMemo(() => {
        return allModifiers.filter((mod) => {
            if (typeFilter !== "all" && mod.type !== typeFilter) return false;

            if (mechanicFilter.length > 0) {
                if (!mechanicFilter.includes(mod.mechanic)) return false;
            }

            if (idolTypeFilter.length > 0) {
                const idolTypeNames = idolTypeFilter.map(
                    (key) => key.charAt(0).toUpperCase() + key.slice(1),
                );
                const hasIdolType = mod.applicableIdols.some((idol) =>
                    idolTypeNames.includes(idol),
                );
                if (!hasIdolType) return false;
            }

            if (favoriteFilter === "favorites" && !favorites.includes(mod.id)) return false;
            if (favoriteFilter === "non-favorites" && favorites.includes(mod.id)) return false;

            if (deferredSearchQuery) {
                const query = deferredSearchQuery.toLowerCase();
                const tierText = mod.tiers[0]?.text?.toLowerCase() || "";
                const nameText = mod.name.toLowerCase();
                if (!tierText.includes(query) && !nameText.includes(query)) return false;
            }

            return true;
        });
    }, [
        allModifiers,
        typeFilter,
        mechanicFilter,
        idolTypeFilter,
        favoriteFilter,
        favorites,
        deferredSearchQuery,
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

    const handleToggleFavorite = useCallback(
        (id: string) => {
            toggleFavorite(id);
        },
        [toggleFavorite],
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-[800px] flex-col overflow-hidden">
                <DialogHeader>
                    <DialogTitle>{t.modsSearch?.title || "Search Modifiers"}</DialogTitle>
                    <DialogDescription>
                        {t.modsSearch?.description ||
                            "Browse and search all available idol modifiers."}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="relative">
                        <Search className="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder={t.modsSearch?.searchPlaceholder || "Search by text..."}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <span className="text-muted-foreground text-xs">
                                {t.modsSearch?.typeFilter || "Type"}
                            </span>
                            <Select
                                value={typeFilter}
                                onValueChange={(v) => setTypeFilter(v as TypeFilter)}
                            >
                                <SelectTrigger className="h-8 w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        {t.modsSearch?.all || "All"}
                                    </SelectItem>
                                    <SelectItem value="prefix">
                                        {t.modsSearch?.prefix || "Prefix"}
                                    </SelectItem>
                                    <SelectItem value="suffix">
                                        {t.modsSearch?.suffix || "Suffix"}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <span className="text-muted-foreground text-xs">
                                {t.modsSearch?.favoriteFilter || "Favorites"}
                            </span>
                            <Select
                                value={favoriteFilter}
                                onValueChange={(v) => setFavoriteFilter(v as FavoriteFilter)}
                            >
                                <SelectTrigger className="h-8 w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        {t.modsSearch?.favoritesAll || "All"}
                                    </SelectItem>
                                    <SelectItem value="favorites">
                                        {t.modsSearch?.favoritesOnly || "Favorites Only"}
                                    </SelectItem>
                                    <SelectItem value="non-favorites">
                                        {t.modsSearch?.favoritesExclude || "Non-Favorites Only"}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <span className="text-muted-foreground text-xs">
                                {t.filter?.idolType || "Idol Type"}
                            </span>
                            <MultiIdolTypeFilter
                                value={idolTypeFilter}
                                onChange={setIdolTypeFilter}
                            />
                        </div>

                        <div className="space-y-1">
                            <span className="text-muted-foreground text-xs">
                                {t.filter?.mechanic || "Mechanic"}
                            </span>
                            <MultiMechanicFilter
                                value={mechanicFilter}
                                onChange={setMechanicFilter}
                            />
                        </div>
                    </div>

                    <WeightFilterAccordion
                        matchAffixType={matchAffixType}
                        onMatchAffixTypeChange={setMatchAffixType}
                        showMatchAffixType
                    />

                    <div className="text-muted-foreground text-xs">
                        {(t.modsSearch?.modsFound || "{count} modifiers found").replace(
                            "{count}",
                            String(filteredModifiers.length),
                        )}
                    </div>
                </div>

                <ScrollArea className="h-0 flex-1">
                    <div className="space-y-4 pr-4">
                        {LEAGUE_MECHANICS.map((mechanic) => {
                            const mods = groupedModifiers[mechanic];
                            if (!mods || mods.length === 0) return null;

                            return (
                                <MECHANIC_SECTION
                                    key={mechanic}
                                    mechanic={mechanic}
                                    mods={mods}
                                    isFavorite={isFavorite}
                                    onToggleFavorite={handleToggleFavorite}
                                    t={t}
                                    league={league}
                                    tradeSettings={tradeSettings}
                                    matchAffixType={matchAffixType}
                                    idolTypeFilter={idolTypeFilter}
                                />
                            );
                        })}

                        {filteredModifiers.length === 0 && (
                            <div className="py-8 text-center text-muted-foreground">
                                {t.editor.noModsFound}
                            </div>
                        )}
                    </div>
                </ScrollArea>

                <div className="flex justify-end">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t.actions.cancel}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

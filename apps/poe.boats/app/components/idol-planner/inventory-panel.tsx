import { ClipboardPaste, Copy, PenLine, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { type DragEvent, useState } from "react";
import { IdolCard } from "~/components/idol-planner/idol-card";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { useDnd } from "~/context/dnd-context";
import { useLeague } from "~/context/league-context";
import { useTradeSettings } from "~/context/trade-settings-context";
import { useLocale, useTranslations } from "~/i18n";
import { generateTradeUrl } from "~/lib/trade-search";
import { searchIdolInventory } from "~/operations/inventory";
import type { InventoryIdol } from "~/schemas/inventory";

interface InventoryPanelProps {
    inventory: InventoryIdol[];
    onImportClick: () => void;
    onCreateClick?: () => void;
    onIdolClick?: (idol: InventoryIdol) => void;
    onDuplicateIdol?: (id: string) => void;
    onRemoveIdol?: (id: string) => void;
    onRemoveIdols?: (ids: string[]) => void;
    onClearAll?: () => void;
    onPasteIdol?: () => void;
    hasClipboardIdol?: boolean;
}

function DraggableIdolCard({
    item,
    league,
    tradeSettings,
    onIdolClick,
    onDuplicateIdol,
    onRemoveIdol,
    t,
}: {
    item: InventoryIdol;
    league: string;
    tradeSettings: {
        maxWeight: number | null;
        filterByMaxWeight: boolean;
        separateWeightFilters: boolean;
        maxPrefixWeight: number | null;
        maxSuffixWeight: number | null;
        weightFilterMode: "gte" | "lte";
    };
    onIdolClick?: (idol: InventoryIdol) => void;
    onDuplicateIdol?: (id: string) => void;
    onRemoveIdol?: (id: string) => void;
    t: ReturnType<typeof useTranslations>;
}) {
    const { setDraggedItem } = useDnd();

    const handleDragStart = (e: DragEvent<HTMLLIElement>) => {
        setDraggedItem(item);
        e.dataTransfer.setData("text/plain", item.id);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
    };

    const handleFindOnTrade = (e: React.MouseEvent) => {
        e.stopPropagation();
        const url = generateTradeUrl(item.idol, {
            league,
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
        });
        window.open(url, "_blank", "noopener,noreferrer");
    };

    const handleClick = () => {
        onIdolClick?.(item);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLLIElement>) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onIdolClick?.(item);
        }
    };

    return (
        <li
            className="group relative cursor-grab list-none active:cursor-grabbing"
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
        >
            <IdolCard idol={item.idol} showTooltip={false} />
            <div className="absolute top-1 right-1 flex gap-1">
                <Tooltip>
                    <TooltipTrigger
                        render={
                            <Button
                                variant="secondary"
                                size="icon"
                                className="h-6 w-6"
                                onClick={handleFindOnTrade}
                                aria-label={`${t("trade.findSimilar")}: ${item.idol.name || item.idol.baseType}`}
                            />
                        }
                    >
                        <ShoppingCart className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent>{t("trade.findSimilar")}</TooltipContent>
                </Tooltip>
                {onIdolClick && (
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onIdolClick(item);
                                    }}
                                    aria-label={`${t("inventory.edit")}: ${item.idol.name || item.idol.baseType}`}
                                />
                            }
                        >
                            <PenLine className="h-3 w-3" />
                        </TooltipTrigger>
                        <TooltipContent>{t("inventory.edit")}</TooltipContent>
                    </Tooltip>
                )}
                {onDuplicateIdol && (
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDuplicateIdol(item.id);
                                    }}
                                    aria-label={`${t("inventory.duplicate")}: ${item.idol.name || item.idol.baseType}`}
                                />
                            }
                        >
                            <Copy className="h-3 w-3" />
                        </TooltipTrigger>
                        <TooltipContent>{t("inventory.duplicate")}</TooltipContent>
                    </Tooltip>
                )}
                {onRemoveIdol && (
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <Button
                                    variant="destructive"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRemoveIdol(item.id);
                                    }}
                                    aria-label={`${t("inventory.removeFromInventory")}: ${item.idol.name || item.idol.baseType}`}
                                />
                            }
                        >
                            <Trash2 className="h-3 w-3" />
                        </TooltipTrigger>
                        <TooltipContent>{t("inventory.removeFromInventory")}</TooltipContent>
                    </Tooltip>
                )}
            </div>
            {item.usageCount > 0 && (
                <span className="absolute right-1 bottom-1 rounded bg-primary px-1 text-primary-foreground text-xs">
                    {t("inventory.usedInSets", { count: item.usageCount })}
                </span>
            )}
        </li>
    );
}

export function InventoryPanel({
    inventory,
    onImportClick,
    onCreateClick,
    onIdolClick,
    onDuplicateIdol,
    onRemoveIdol,
    onRemoveIdols,
    onClearAll,
    onPasteIdol,
    hasClipboardIdol,
}: InventoryPanelProps) {
    const t = useTranslations();
    const locale = useLocale();
    const { league } = useLeague();
    const { settings: tradeSettings } = useTradeSettings();
    const [searchQuery, setSearchQuery] = useState("");
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [idsToDelete, setIdsToDelete] = useState<string[]>([]);

    const filteredInventory = searchIdolInventory(inventory, searchQuery, locale);

    const handleRequestDelete = (ids: string[]) => {
        setIdsToDelete(ids);
        setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = () => {
        const isDeletingAll = idsToDelete.length === inventory.length && onClearAll;
        if (isDeletingAll) {
            onClearAll();
        } else if (idsToDelete.length === 1) {
            onRemoveIdol?.(idsToDelete[0]);
        } else if (onRemoveIdols) {
            onRemoveIdols(idsToDelete);
        } else if (onRemoveIdol) {
            for (const id of idsToDelete) {
                onRemoveIdol(id);
            }
        }
        setDeleteDialogOpen(false);
        setIdsToDelete([]);
    };

    return (
        <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{t("inventory.title")}</CardTitle>
                    <span className="text-muted-foreground text-sm">
                        {t("inventory.idolCount", { count: inventory.length })}
                    </span>
                </div>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-2 overflow-hidden">
                <div className="relative">
                    <Search className="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder={t("inventory.search")}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8"
                    />
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button onClick={onImportClick} className="flex-1" size="sm">
                        <Plus className="mr-1 h-4 w-4" />
                        {t("inventory.import")}
                    </Button>
                    {onCreateClick && (
                        <Button
                            onClick={onCreateClick}
                            variant="outline"
                            className="flex-1"
                            size="sm"
                        >
                            <PenLine className="mr-1 h-4 w-4" />
                            {t("inventory.create")}
                        </Button>
                    )}
                    {hasClipboardIdol && onPasteIdol && (
                        <Button
                            onClick={onPasteIdol}
                            variant="secondary"
                            size="sm"
                            className="flex-1"
                        >
                            <ClipboardPaste className="mr-1 h-4 w-4" />
                            {t("inventory.paste")}
                        </Button>
                    )}
                    {onClearAll && inventory.length > 0 && (
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        aria-label={t("inventory.clear")}
                                        onClick={() =>
                                            handleRequestDelete(inventory.map((i) => i.id))
                                        }
                                    />
                                }
                            >
                                <Trash2 className="h-4 w-4" />
                            </TooltipTrigger>
                            <TooltipContent>{t("inventory.clear")}</TooltipContent>
                        </Tooltip>
                    )}
                </div>

                <ScrollArea className="max-h-[50vh] lg:h-0 lg:max-h-none lg:flex-1">
                    {filteredInventory.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground">
                            {inventory.length === 0
                                ? t("inventory.empty")
                                : t("inventory.noMatches")}
                        </div>
                    ) : (
                        <ul className="space-y-2 px-2 py-1 pr-3">
                            {filteredInventory.map((item) => (
                                <DraggableIdolCard
                                    key={item.id}
                                    item={item}
                                    league={league}
                                    tradeSettings={tradeSettings}
                                    onIdolClick={onIdolClick}
                                    onDuplicateIdol={onDuplicateIdol}
                                    onRemoveIdol={
                                        onRemoveIdol ? (id) => handleRequestDelete([id]) : undefined
                                    }
                                    t={t}
                                />
                            ))}
                        </ul>
                    )}
                </ScrollArea>
            </CardContent>

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {idsToDelete.length === 1
                                ? t("inventory.confirmDelete")
                                : t("inventory.confirmDeleteMultiple", {
                                      count: idsToDelete.length,
                                  })}
                        </DialogTitle>
                        <DialogDescription>
                            {idsToDelete.length === 1
                                ? t("inventory.confirmDeleteMessage")
                                : t("inventory.confirmDeleteMultipleMessage", {
                                      count: idsToDelete.length,
                                  })}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>
                            {t("actions.cancel")}
                        </Button>
                        <Button variant="destructive" onClick={handleConfirmDelete}>
                            {t("idolSet.delete")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

import { Check, ChevronDown, X } from "lucide-react";
import { useMemo, useState } from "react";
import { MapDeviceUnlocks } from "~/components/idol-planner/map-device-unlocks";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { useScarabPrices } from "~/context/scarab-prices-context";
import { getAvailableOptions, getMapCraftingOptionById } from "~/data/map-crafting-options";
import {
  getScarabById,
  getScarabEffect,
  getScarabName,
  getScarabsByCategory,
  SCARAB_CATEGORIES,
  SCARABS,
} from "~/data/scarab-data";
import { useLocale, useTranslations } from "~/i18n";
import type { SupportedLocale } from "~/i18n/types";
import { cn } from "~/lib/utils";
import {
  HORNED_SCARAB_OF_AWAKENING_ID,
  type MapCraftingOption,
  type MapDevice,
  type Scarab,
} from "~/schemas/scarab";

function formatChaosPrice(price: number | null): string | null {
  if (price === null) return null;
  if (price >= 1000) {
    return `${(price / 1000).toFixed(1)}k`;
  }
  if (price >= 10) {
    return Math.round(price).toString();
  }
  if (price >= 1) {
    return price.toFixed(1);
  }
  return price.toFixed(2);
}

interface MapDeviceProps {
  mapDevice: MapDevice;
  onSlotChange: (slotIndex: number, scarabId: string | null) => void;
  onCraftingOptionChange: (optionId: string | null) => void;
  unlockedConditions?: string[];
  onUnlockedConditionsChange?: (conditions: string[]) => void;
}

interface ScarabSlotProps {
  slotIndex: number;
  scarabId: string | null;
  onSelect: (scarabId: string | null) => void;
  scarabUsageCount: Map<string, number>;
  categoryFilter: string | null;
  onCategoryFilterChange: (category: string | null) => void;
  getPrice: (scarabId: string) => number | null;
  showPriceBelow?: boolean;
  locale: SupportedLocale;
}

function ScarabSlot({
  slotIndex,
  scarabId,
  onSelect,
  scarabUsageCount,
  categoryFilter,
  onCategoryFilterChange,
  getPrice,
  showPriceBelow = true,
  locale,
}: ScarabSlotProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  const scarab = scarabId ? getScarabById(scarabId) : null;

  const filteredScarabs = useMemo(() => {
    let scarabs = categoryFilter ? getScarabsByCategory(categoryFilter) : SCARABS;

    // Filter out scarabs that have reached their limit
    // (unless it's the current slot's scarab, which can be reselected)
    scarabs = scarabs.filter((s) => {
      const currentUsage = scarabUsageCount.get(s.id) ?? 0;
      // If this slot already has this scarab, don't count it toward the limit
      const effectiveUsage = s.id === scarabId ? currentUsage - 1 : currentUsage;
      return effectiveUsage < s.limit;
    });

    return scarabs;
  }, [categoryFilter, scarabUsageCount, scarabId]);

  const groupedScarabs = useMemo(() => {
    const groups: Record<string, Scarab[]> = {};
    for (const s of filteredScarabs) {
      if (!groups[s.category]) {
        groups[s.category] = [];
      }
      groups[s.category].push(s);
    }
    return groups;
  }, [filteredScarabs]);

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
  };

  const price = scarab ? getPrice(scarab.id) : null;
  const formattedSlotPrice = formatChaosPrice(price);

  return (
    <div className="flex flex-col items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <TooltipProvider>
          <div className="group relative">
            <Tooltip>
              <TooltipTrigger
                render={
                  <PopoverTrigger
                    render={
                      <button
                        type="button"
                        className={cn(
                          "relative flex h-16 w-16 items-center justify-center rounded-lg border-2 transition-all hover:border-primary",
                          scarab
                            ? "border-primary/50 bg-card"
                            : "border-muted-foreground/30 border-dashed bg-muted/20",
                        )}
                      />
                    }
                  />
                }
              >
                {scarab ? (
                  scarab.image ? (
                    <img
                      src={scarab.image}
                      alt={getScarabName(scarab, locale)}
                      className="h-12 w-12 object-contain"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center text-muted-foreground text-xs">
                      {getScarabName(scarab, locale).slice(0, 2)}
                    </div>
                  )
                ) : (
                  <span className="text-muted-foreground text-xs">{slotIndex + 1}</span>
                )}
              </TooltipTrigger>
              {scarab && (
                <TooltipContent
                  side="top"
                  className="max-w-xs border border-border bg-card text-card-foreground"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold">
                      <span>{getScarabName(scarab, locale)}</span>
                      {formattedSlotPrice && (
                        <span className="text-yellow-600 dark:text-yellow-400">
                          {formattedSlotPrice}c
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {getScarabEffect(scarab, locale)}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {t("mapDevice.limitLabel")} {scarab.limit}
                    </div>
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
            {scarab && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute -top-1 -right-1 h-5 w-5 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100"
                      onClick={handleClear}
                    />
                  }
                >
                  <X className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>{t("mapDevice.clearSlot")}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>

        <PopoverContent className="w-[400px] p-0" align="start">
          <Command>
            <CommandInput placeholder={t("mapDevice.searchScarabs")} />
            <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto border-b p-2">
              <Button
                variant={categoryFilter === null ? "secondary" : "ghost"}
                size="sm"
                className="h-6 text-xs"
                onClick={() => onCategoryFilterChange(null)}
              >
                {t("filter.selectAll")}
              </Button>
              {SCARAB_CATEGORIES.map((cat) => (
                <Button
                  key={cat}
                  variant={categoryFilter === cat ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => onCategoryFilterChange(cat)}
                >
                  {t(`mechanics.${cat}`, { defaultValue: cat })}
                </Button>
              ))}
            </div>
            <CommandList className="max-h-[300px]">
              <CommandEmpty>{t("mapDevice.noScarabsFound")}</CommandEmpty>
              {Object.entries(groupedScarabs).map(([category, scarabs]) => (
                <CommandGroup
                  key={category}
                  heading={t(`mechanics.${category}`, { defaultValue: category })}
                >
                  {scarabs.map((s) => {
                    const usage = scarabUsageCount.get(s.id) ?? 0;
                    const isCurrentSlot = s.id === scarabId;
                    const price = getPrice(s.id);
                    const formattedPrice = formatChaosPrice(price);
                    const scarabName = getScarabName(s, locale);
                    const scarabEffect = getScarabEffect(s, locale);
                    return (
                      <CommandItem
                        key={s.id}
                        value={`${scarabName} ${scarabEffect} ${s.category}`}
                        onSelect={() => {
                          onSelect(isCurrentSlot ? null : s.id);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4 shrink-0",
                            isCurrentSlot ? "opacity-100" : "opacity-0",
                          )}
                        />
                        {s.image ? (
                          <img src={s.image} alt="" className="mr-2 h-6 w-6 object-contain" />
                        ) : (
                          <div className="mr-2 flex h-6 w-6 items-center justify-center bg-muted text-muted-foreground text-xs">
                            ?
                          </div>
                        )}
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{scarabName}</span>
                            {formattedPrice && (
                              <span className="text-xs text-yellow-600 dark:text-yellow-400">
                                {formattedPrice}c
                              </span>
                            )}
                            {s.limit > 1 && (
                              <span className="text-muted-foreground text-xs">
                                ({usage}/{s.limit})
                              </span>
                            )}
                          </div>
                          <span className="line-clamp-1 text-muted-foreground text-xs">
                            {scarabEffect}
                          </span>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {showPriceBelow && (
        <span
          className={cn(
            "h-4 text-xs",
            formattedSlotPrice
              ? "text-yellow-600 dark:text-yellow-400"
              : "text-muted-foreground/50",
          )}
        >
          {formattedSlotPrice ? `${formattedSlotPrice}c` : "-"}
        </span>
      )}
    </div>
  );
}

function CraftingOptionSelector({
  selectedOptionId,
  hasAwakeningScrab,
  onSelect,
}: {
  selectedOptionId: string | null;
  hasAwakeningScrab: boolean;
  onSelect: (optionId: string | null) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  const availableOptions = useMemo(
    () => getAvailableOptions(hasAwakeningScrab),
    [hasAwakeningScrab],
  );

  const selectedOption = selectedOptionId ? getMapCraftingOptionById(selectedOptionId) : null;

  const standardOptions = availableOptions.filter((opt) => !opt.imbued);
  const imbuedOptions = availableOptions.filter((opt) => opt.imbued);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" className="w-full justify-between text-left" />}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm">
            {selectedOption?.name || t("mapDevice.selectCraftingOption")}
          </span>
          {selectedOption && (
            <span className="truncate text-muted-foreground text-xs">
              {selectedOption.cost > 0 ? `${selectedOption.cost}c` : t("mapDevice.costFree")}
              {selectedOption.imbued && " (Imbued)"}
            </span>
          )}
        </div>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput placeholder={t("mapDevice.searchCraftingOptions")} />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>{t("mapDevice.noCraftingOptionsFound")}</CommandEmpty>
            <CommandGroup heading={t("mapDevice.standardOptions")}>
              {standardOptions.map((opt) => (
                <CraftingOptionItem
                  key={opt.id}
                  option={opt}
                  isSelected={opt.id === selectedOptionId}
                  onSelect={() => {
                    onSelect(opt.id === selectedOptionId ? null : opt.id);
                    setOpen(false);
                  }}
                />
              ))}
            </CommandGroup>
            {imbuedOptions.length > 0 && (
              <CommandGroup heading={t("mapDevice.imbuedOptions")}>
                {imbuedOptions.map((opt) => (
                  <CraftingOptionItem
                    key={opt.id}
                    option={opt}
                    isSelected={opt.id === selectedOptionId}
                    onSelect={() => {
                      onSelect(opt.id === selectedOptionId ? null : opt.id);
                      setOpen(false);
                    }}
                  />
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CraftingOptionItem({
  option,
  isSelected,
  onSelect,
}: {
  option: MapCraftingOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations();
  return (
    <CommandItem value={`${option.name} ${option.effect}`} onSelect={onSelect}>
      <Check className={cn("mr-2 h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="text-sm">{option.name}</span>
          <span className="text-muted-foreground text-xs">
            {option.cost > 0 ? `${option.cost}c` : t("mapDevice.costFree")}
          </span>
        </div>
        <span className="line-clamp-2 text-muted-foreground text-xs">{option.effect}</span>
      </div>
    </CommandItem>
  );
}

export function MapDeviceComponent({
  mapDevice,
  onSlotChange,
  onCraftingOptionChange,
  unlockedConditions,
  onUnlockedConditionsChange,
}: MapDeviceProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const { getPrice } = useScarabPrices();

  // Count how many times each scarab is used across all slots
  const scarabUsageCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const slot of mapDevice.slots) {
      if (slot.scarabId) {
        counts.set(slot.scarabId, (counts.get(slot.scarabId) ?? 0) + 1);
      }
    }
    return counts;
  }, [mapDevice.slots]);

  const selectedScarabs = useMemo(() => {
    return mapDevice.slots
      .map((slot) => (slot.scarabId ? getScarabById(slot.scarabId) : null))
      .filter((s): s is Scarab => s !== null);
  }, [mapDevice.slots]);

  const hasAwakeningScrab = useMemo(() => {
    return mapDevice.slots.some((slot) => slot.scarabId === HORNED_SCARAB_OF_AWAKENING_ID);
  }, [mapDevice.slots]);

  const selectedCraftingOption = mapDevice.craftingOptionId
    ? getMapCraftingOptionById(mapDevice.craftingOptionId)
    : null;

  return (
    <Card className="w-fit">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">{t("mapDevice.title")}</CardTitle>
          </div>
          <span className="text-muted-foreground text-sm">
            {t("mapDevice.scarabCount", { count: selectedScarabs.length })}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          {unlockedConditions && onUnlockedConditionsChange && (
            <MapDeviceUnlocks
              unlockedConditions={unlockedConditions}
              onUnlockedConditionsChange={onUnlockedConditionsChange}
            />
          )}
        </div>
      </CardHeader>
      <CardContent className="w-[384px] space-y-3">
        <div className="flex justify-center gap-2">
          {mapDevice.slots.map((slot) => (
            <ScarabSlot
              key={slot.slotIndex}
              slotIndex={slot.slotIndex}
              scarabId={slot.scarabId}
              onSelect={(scarabId) => onSlotChange(slot.slotIndex, scarabId)}
              scarabUsageCount={scarabUsageCount}
              categoryFilter={categoryFilter}
              onCategoryFilterChange={setCategoryFilter}
              getPrice={getPrice}
              locale={locale}
            />
          ))}
        </div>
        <CraftingOptionSelector
          selectedOptionId={mapDevice.craftingOptionId}
          hasAwakeningScrab={hasAwakeningScrab}
          onSelect={onCraftingOptionChange}
        />
        {selectedCraftingOption && (
          <div className="rounded-md border border-border bg-muted/30 p-2 text-center text-muted-foreground text-sm">
            {selectedCraftingOption.effect}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

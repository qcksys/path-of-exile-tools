import { Check, ChevronsUpDown, X } from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getModifierOptions,
  type ModifierOption,
  ModSearch,
  MultiMechanicFilter,
} from "~/components/idol-planner/mod-search";
import { WeightFilterAccordion } from "~/components/idol-planner/weight-filter-accordion";
import { Button } from "~/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Slider } from "~/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import {
  IDOL_BASE_KEYS,
  IDOL_BASES,
  type IdolBaseKey,
  type LeagueMechanic,
} from "~/data/idol-bases";
import {
  getUniqueIdolModText,
  getUniqueIdolName,
  UNIQUE_IDOLS,
  type UniqueIdol,
} from "~/data/unique-idols";
import { useLocale, useTranslations } from "~/i18n";
import { highlightNumbers } from "~/lib/highlight-numbers";
import { cn } from "~/lib/utils";
import type { IdolInstance, IdolModifier } from "~/schemas/idol";

interface IdolEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (idol: IdolInstance) => void;
  initialIdol?: IdolInstance | null;
}

interface ModSlotProps {
  type: "prefix" | "suffix";
  index: number;
  mod: SelectedMod | null;
  mechanicFilter: LeagueMechanic[];
  idolType: IdolBaseKey;
  excludedModIds: string[];
  onModChange: (mod: SelectedMod | null) => void;
  onTierChange: (tier: number) => void;
  onValueChange: (value: number) => void;
}

interface SelectedMod {
  modOption: ModifierOption;
  tier: number;
  rolledValue: number;
}

function ModSlot({
  type,
  index,
  mod,
  mechanicFilter,
  idolType,
  excludedModIds,
  onModChange,
  onTierChange,
  onValueChange,
}: ModSlotProps) {
  const t = useTranslations();
  const selectedTier = mod?.modOption.tiers.find((tier) => tier.tier === mod.tier);
  const valueRange = selectedTier?.values?.[0];

  const handleModSelect = (modOption: ModifierOption | null) => {
    if (!modOption) {
      onModChange(null);
      return;
    }
    const firstTier = modOption.tiers[0];
    const defaultValue = firstTier?.values?.[0]?.min ?? 0;
    onModChange({
      modOption,
      tier: firstTier?.tier ?? 1,
      rolledValue: defaultValue,
    });
  };

  const slotLabel =
    type === "prefix"
      ? t("editor.prefixSlot", { index: index + 1 })
      : t("editor.suffixSlot", { index: index + 1 });

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span className="w-16 text-muted-foreground text-sm">{slotLabel}</span>
        <div className="flex-1">
          <ModSearch
            type={type}
            mechanicFilter={mechanicFilter}
            idolType={idolType}
            selectedModId={mod?.modOption.id ?? null}
            excludedModIds={excludedModIds}
            onSelect={handleModSelect}
          />
        </div>
        {mod && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => onModChange(null)}
                />
              }
            >
              <X className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>{t("actions.clear")}</TooltipContent>
          </Tooltip>
        )}
      </div>

      {mod && (
        <div className="ml-16 space-y-2">
          <div className="flex gap-2">
            {mod.modOption.tiers.length > 1 && (
              <Select
                value={String(mod.tier)}
                onValueChange={(v: string | null) => {
                  if (v) onTierChange(Number(v));
                }}
              >
                <SelectTrigger className="w-24">
                  <SelectValue placeholder={t("editor.tier")} />
                </SelectTrigger>
                <SelectContent>
                  {mod.modOption.tiers.map((tier) => (
                    <SelectItem key={tier.tier} value={String(tier.tier)}>
                      {t("editor.tierLabel", { tier: tier.tier })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {valueRange && valueRange.min !== valueRange.max && (
              <div className="flex flex-1 items-center gap-3">
                <Slider
                  value={[mod.rolledValue]}
                  min={valueRange.min}
                  max={valueRange.max}
                  step={1}
                  onValueChange={(sliderValue: number | readonly number[]) => {
                    const value = Array.isArray(sliderValue) ? sliderValue[0] : sliderValue;
                    onValueChange(value);
                  }}
                  className="flex-1"
                />
                <span className="w-16 text-right text-sm tabular-nums">{mod.rolledValue}</span>
              </div>
            )}
          </div>
          {selectedTier?.text && (
            <div
              className={cn(
                "flex items-start gap-1 text-sm",
                type === "prefix" ? "text-mod-prefix" : "text-mod-suffix",
              )}
            >
              <span>{highlightNumbers(selectedTier.text)}</span>
              {selectedTier.weight !== undefined && (
                <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                  [{selectedTier.weight}]
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type EditorMode = "regular" | "unique";

export function IdolEditor({ open, onOpenChange, onSave, initialIdol }: IdolEditorProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [editorMode, setEditorMode] = useState<EditorMode>("regular");
  const [baseType, setBaseType] = useState<IdolBaseKey>("minor");
  const [itemLevel, setItemLevel] = useState(68);
  const [name, setName] = useState("");
  const [mechanicFilter, setMechanicFilter] = useState<LeagueMechanic[]>([]);
  const [prefixes, setPrefixes] = useState<(SelectedMod | null)[]>([null, null]);
  const [suffixes, setSuffixes] = useState<(SelectedMod | null)[]>([null, null]);
  const [selectedUniqueIdol, setSelectedUniqueIdol] = useState<UniqueIdol | null>(null);
  const [uniqueIdolOpen, setUniqueIdolOpen] = useState(false);

  const allModifiers = useMemo(() => getModifierOptions(locale), [locale]);

  useEffect(() => {
    if (initialIdol) {
      if (initialIdol.rarity === "unique") {
        setEditorMode("unique");
        const foundUnique = UNIQUE_IDOLS.find(
          (u) =>
            u.name.en === initialIdol.name && u.baseType.toLowerCase() === initialIdol.baseType,
        );
        setSelectedUniqueIdol(foundUnique || null);
      } else {
        setEditorMode("regular");
        setSelectedUniqueIdol(null);
      }
      setBaseType(initialIdol.baseType);
      setItemLevel(initialIdol.itemLevel);
      setName(initialIdol.name || "");

      const convertToSelectedMod = (
        mod: import("~/schemas/idol").IdolModifier,
      ): SelectedMod | null => {
        const modOption = allModifiers.find((m) => m.id === mod.modId);
        if (!modOption) return null;
        return {
          modOption,
          tier: mod.tier ?? 1,
          rolledValue: mod.rolledValue,
        };
      };

      const loadedPrefixes: (SelectedMod | null)[] = [null, null];
      initialIdol.prefixes.forEach((mod, i) => {
        if (i < 2) loadedPrefixes[i] = convertToSelectedMod(mod);
      });
      setPrefixes(loadedPrefixes);

      const loadedSuffixes: (SelectedMod | null)[] = [null, null];
      initialIdol.suffixes.forEach((mod, i) => {
        if (i < 2) loadedSuffixes[i] = convertToSelectedMod(mod);
      });
      setSuffixes(loadedSuffixes);
    } else {
      setEditorMode("regular");
      setBaseType("minor");
      setItemLevel(68);
      setName("");
      setPrefixes([null, null]);
      setSuffixes([null, null]);
      setSelectedUniqueIdol(null);
    }
  }, [initialIdol, allModifiers]);

  useEffect(() => {
    const idolTypeName = baseType.charAt(0).toUpperCase() + baseType.slice(1);

    const isModValidForIdol = (mod: SelectedMod | null): boolean => {
      if (!mod) return true;
      return mod.modOption.applicableIdols.includes(idolTypeName);
    };

    setPrefixes((prev) => prev.map((mod) => (isModValidForIdol(mod) ? mod : null)));
    setSuffixes((prev) => prev.map((mod) => (isModValidForIdol(mod) ? mod : null)));
  }, [baseType]);

  const updateMod = useCallback(
    (type: "prefix" | "suffix", index: number, mod: SelectedMod | null) => {
      if (type === "prefix") {
        setPrefixes((prev) => {
          const next = [...prev];
          next[index] = mod;
          return next;
        });
      } else {
        setSuffixes((prev) => {
          const next = [...prev];
          next[index] = mod;
          return next;
        });
      }
    },
    [],
  );

  const updateTier = useCallback((type: "prefix" | "suffix", index: number, tier: number) => {
    const update = (prev: (SelectedMod | null)[]) => {
      const next = [...prev];
      const mod = next[index];
      if (mod) {
        const tierData = mod.modOption.tiers.find((td) => td.tier === tier);
        next[index] = {
          ...mod,
          tier,
          rolledValue: tierData?.values?.[0]?.min ?? mod.rolledValue,
        };
      }
      return next;
    };

    if (type === "prefix") {
      setPrefixes(update);
    } else {
      setSuffixes(update);
    }
  }, []);

  const updateValue = useCallback((type: "prefix" | "suffix", index: number, value: number) => {
    const update = (prev: (SelectedMod | null)[]) => {
      const next = [...prev];
      const mod = next[index];
      if (mod) {
        next[index] = { ...mod, rolledValue: value };
      }
      return next;
    };

    if (type === "prefix") {
      setPrefixes(update);
    } else {
      setSuffixes(update);
    }
  }, []);

  const convertToIdolModifier = (mod: SelectedMod): IdolModifier => {
    const tierData = mod.modOption.tiers.find((tier) => tier.tier === mod.tier);
    return {
      modId: mod.modOption.id,
      type: mod.modOption.type,
      text: tierData?.text || mod.modOption.name,
      rolledValue: mod.rolledValue,
      tier: mod.tier,
    };
  };

  const handleSave = () => {
    if (editorMode === "unique" && selectedUniqueIdol) {
      const uniqueMods: IdolModifier[] = selectedUniqueIdol.modifiers.map((mod, index) => ({
        modId: `unique_${selectedUniqueIdol.id}_${index}`,
        type: "unique" as const,
        text: mod.text[locale] || mod.text.en || "",
        rolledValue: mod.values[0]?.min ?? mod.values[0]?.max ?? 0,
        tier: 1,
      }));

      const idol: IdolInstance = {
        id: initialIdol?.id || nanoid(),
        baseType: selectedUniqueIdol.baseType.toLowerCase() as IdolBaseKey,
        itemLevel,
        rarity: "unique",
        name: getUniqueIdolName(selectedUniqueIdol, locale),
        prefixes: uniqueMods,
        suffixes: [],
      };

      onSave(idol);
      onOpenChange(false);
      return;
    }

    const prefixMods = prefixes
      .filter((p): p is SelectedMod => p !== null)
      .map(convertToIdolModifier);
    const suffixMods = suffixes
      .filter((s): s is SelectedMod => s !== null)
      .map(convertToIdolModifier);

    const hasAnyMods = prefixMods.length > 0 || suffixMods.length > 0;
    const rarity = hasAnyMods
      ? prefixMods.length + suffixMods.length > 2
        ? "rare"
        : "magic"
      : "normal";

    const idol: IdolInstance = {
      id: initialIdol?.id || nanoid(),
      baseType,
      itemLevel,
      rarity,
      name: name || undefined,
      prefixes: prefixMods,
      suffixes: suffixMods,
    };

    onSave(idol);
    onOpenChange(false);
  };

  const hasAnyMods = prefixes.some((p) => p !== null) || suffixes.some((s) => s !== null);

  const canSave = editorMode === "unique" ? selectedUniqueIdol !== null : hasAnyMods;

  const allSelectedModIds = useMemo(() => {
    return [
      ...prefixes.filter((p) => p !== null).map((p) => p.modOption.id),
      ...suffixes.filter((s) => s !== null).map((s) => s.modOption.id),
    ];
  }, [prefixes, suffixes]);

  const getExcludedModIds = useCallback(
    (currentModId: string | null) => {
      return allSelectedModIds.filter((id) => id !== currentModId);
    },
    [allSelectedModIds],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-250 flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{initialIdol ? t("editor.editIdol") : t("editor.createIdol")}</DialogTitle>
          <DialogDescription>{t("editor.description")}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-0 flex-1 pr-4">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="font-medium text-sm">{t("editor.baseType")}</span>
                <Select
                  value={editorMode === "unique" ? "unique" : baseType}
                  onValueChange={(v: string | null) => {
                    if (!v) return;
                    if (v === "unique") {
                      setEditorMode("unique");
                    } else {
                      setEditorMode("regular");
                      setBaseType(v as IdolBaseKey);
                      setSelectedUniqueIdol(null);
                    }
                  }}
                >
                  <SelectTrigger aria-label={t("editor.baseType")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IDOL_BASE_KEYS.map((key) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <img
                            src={IDOL_BASES[key].image}
                            alt=""
                            className="h-5 w-5 object-contain"
                          />
                          <span>{IDOL_BASES[key].name}</span>
                        </div>
                      </SelectItem>
                    ))}
                    <SelectItem value="unique">
                      <div className="flex items-center gap-2">
                        <img
                          src={IDOL_BASES.minor.uniqueImage}
                          alt=""
                          className="h-5 w-5 object-contain"
                        />
                        <span>{t("editor.uniqueIdols")}</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editorMode === "regular" && (
                <div className="space-y-2">
                  <label htmlFor="idol-editor-name" className="font-medium text-sm">
                    {t("editor.name")} ({t("editor.optional")})
                  </label>
                  <Input
                    id="idol-editor-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("editor.namePlaceholder")}
                  />
                </div>
              )}
            </div>

            {editorMode === "unique" ? (
              <>
                <div className="space-y-2">
                  <span className="font-medium text-sm">{t("editor.selectUniqueIdol")}</span>
                  <Popover open={uniqueIdolOpen} onOpenChange={setUniqueIdolOpen}>
                    <PopoverTrigger
                      render={
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={uniqueIdolOpen}
                          className="w-full justify-between"
                        />
                      }
                    >
                      {selectedUniqueIdol
                        ? getUniqueIdolName(selectedUniqueIdol, locale)
                        : t("editor.selectUniqueIdol")}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </PopoverTrigger>
                    <PopoverContent className="w-[500px] p-0">
                      <Command
                        filter={(value, search, keywords) => {
                          const searchLower = search.toLowerCase();
                          const valueLower = value.toLowerCase();
                          if (valueLower.includes(searchLower)) return 1;
                          if (keywords?.some((kw) => kw.toLowerCase().includes(searchLower)))
                            return 0.5;
                          return 0;
                        }}
                      >
                        <CommandInput placeholder="Search unique idols..." />
                        <CommandList className="max-h-80">
                          <CommandEmpty>{t("editor.noUniqueIdolsFound")}</CommandEmpty>
                          {UNIQUE_IDOLS.map((idol) => {
                            const base = IDOL_BASES[idol.baseType.toLowerCase() as IdolBaseKey];
                            const imageSrc = base?.uniqueImage ?? base?.image;
                            const modTexts = idol.modifiers
                              .map((mod) => getUniqueIdolModText(mod, locale))
                              .join(" ");
                            return (
                              <CommandItem
                                key={idol.id}
                                value={`${getUniqueIdolName(idol, locale)} ${idol.baseType}`}
                                keywords={[modTexts]}
                                onSelect={() => {
                                  setSelectedUniqueIdol(idol);
                                  setUniqueIdolOpen(false);
                                }}
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${selectedUniqueIdol?.id === idol.id ? "opacity-100" : "opacity-0"}`}
                                />
                                <div className="flex flex-col gap-1 py-1">
                                  <div className="flex items-center gap-2">
                                    <img src={imageSrc} alt="" className="h-5 w-5 object-contain" />
                                    <span className="font-medium text-amber-500">
                                      {getUniqueIdolName(idol, locale)}
                                    </span>
                                    <span className="text-xs opacity-70">({idol.baseType})</span>
                                  </div>
                                  <div className="ml-7 space-y-0.5">
                                    {idol.modifiers.map((mod, i) => (
                                      <div
                                        // biome-ignore lint/suspicious/noArrayIndexKey: static modifier list order never changes
                                        key={i}
                                        className="text-xs opacity-70"
                                      >
                                        {getUniqueIdolModText(mod, locale)}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {selectedUniqueIdol && (
                  <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                    <h4 className="font-medium text-amber-500 text-sm">
                      {getUniqueIdolName(selectedUniqueIdol, locale)}
                    </h4>
                    <div className="space-y-1">
                      {selectedUniqueIdol.modifiers.map((mod, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: static modifier list order never changes
                        <div key={i} className="text-sm">
                          {highlightNumbers(mod.text[locale] || mod.text.en || "")}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <span className="font-medium text-sm">{t("editor.filterByMechanic")}</span>
                  <MultiMechanicFilter value={mechanicFilter} onChange={setMechanicFilter} />
                </div>

                <WeightFilterAccordion />

                <div className="space-y-4">
                  <h4 className="font-medium text-sm">{t("editor.prefixes")}</h4>
                  {prefixes.map((mod, i) => (
                    <ModSlot
                      // biome-ignore lint/suspicious/noArrayIndexKey: prefix slot index is the stable identifier for this position
                      key={`prefix-${i}`}
                      type="prefix"
                      index={i}
                      mod={mod}
                      mechanicFilter={mechanicFilter}
                      idolType={baseType}
                      excludedModIds={getExcludedModIds(mod?.modOption.id ?? null)}
                      onModChange={(m) => updateMod("prefix", i, m)}
                      onTierChange={(tier) => updateTier("prefix", i, tier)}
                      onValueChange={(value) => updateValue("prefix", i, value)}
                    />
                  ))}
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium text-sm">{t("editor.suffixes")}</h4>
                  {suffixes.map((mod, i) => (
                    <ModSlot
                      // biome-ignore lint/suspicious/noArrayIndexKey: suffix slot index is the stable identifier for this position
                      key={`suffix-${i}`}
                      type="suffix"
                      index={i}
                      mod={mod}
                      mechanicFilter={mechanicFilter}
                      idolType={baseType}
                      excludedModIds={getExcludedModIds(mod?.modOption.id ?? null)}
                      onModChange={(m) => updateMod("suffix", i, m)}
                      onTierChange={(tier) => updateTier("suffix", i, tier)}
                      onValueChange={(value) => updateValue("suffix", i, value)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {t("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

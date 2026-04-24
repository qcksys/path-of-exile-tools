import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useScarabPrices } from "~/context/scarab-prices-context";
import { IDOL_BASES, LEAGUE_MECHANICS } from "~/data/idol-bases";
import { getMapCraftingOptionById } from "~/data/map-crafting-options";
import { getScarabById, getScarabEffect } from "~/data/scarab-data";
import { useLocale, useTranslations } from "~/i18n";
import type { SupportedLocale } from "~/i18n/types";
import { highlightNumbers } from "~/lib/highlight-numbers";
import { getModMechanic, resolveModTextWithRange } from "~/lib/mod-text-resolver";
import type { IdolBaseKey, IdolModifier, LeagueMechanic } from "~/schemas/idol";
import type { IdolPlacement } from "~/schemas/idol-set";
import type { InventoryIdol } from "~/schemas/inventory";
import type { MapCraftingOption, MapDevice, Scarab } from "~/schemas/scarab";

interface StatsSummaryProps {
  placements: IdolPlacement[];
  inventory: InventoryIdol[];
  mapDevice?: MapDevice;
}

interface IdolContribution {
  baseType: IdolBaseKey;
}

interface AggregatedStat {
  template: string;
  totalValue: number;
  mechanic: LeagueMechanic | undefined;
  hasPercent: boolean;
  contributions: IdolContribution[];
}

type IdolSizeGroup = "minor" | "small" | "medium" | "large";

function getIdolSizeGroup(baseType: IdolBaseKey): IdolSizeGroup {
  const base = IDOL_BASES[baseType];
  const cells = base.width * base.height;
  if (cells === 1) return "minor";
  if (cells === 2) return "small";
  if (cells === 3) return "medium";
  return "large";
}

type SizeGroupNameKey = "sizeGroupMinor" | "sizeGroupSmall" | "sizeGroupMedium" | "sizeGroupLarge";

const SIZE_GROUP_NAME_KEYS: Record<IdolSizeGroup, SizeGroupNameKey> = {
  minor: "sizeGroupMinor",
  small: "sizeGroupSmall",
  medium: "sizeGroupMedium",
  large: "sizeGroupLarge",
};

const SIZE_GROUP_FALLBACKS: Record<IdolSizeGroup, string> = {
  minor: "Minor",
  small: "Kamasan/Noble",
  medium: "Totemic/Burial",
  large: "Conqueror",
};

function formatContributions(
  contributions: IdolContribution[],
  idolTranslations?: Record<string, string>,
): string {
  const counts: Record<IdolSizeGroup, number> = {
    minor: 0,
    small: 0,
    medium: 0,
    large: 0,
  };

  for (const c of contributions) {
    counts[getIdolSizeGroup(c.baseType)]++;
  }

  const parts: string[] = [];
  for (const [group, count] of Object.entries(counts)) {
    if (count > 0) {
      const key = SIZE_GROUP_NAME_KEYS[group as IdolSizeGroup];
      const name = idolTranslations?.[key] || SIZE_GROUP_FALLBACKS[group as IdolSizeGroup];
      parts.push(`${count}x ${name}`);
    }
  }

  return parts.join(", ");
}

interface StatsByMechanic {
  mechanic: LeagueMechanic;
  stats: AggregatedStat[];
}

interface UniqueIdolStat {
  text: string;
  baseType: IdolBaseKey;
}

// Create a template by replacing the rolled value with a placeholder
function createTemplate(
  text: string,
  rolledValue: number,
): {
  template: string;
  hasPercent: boolean;
} {
  // First, try to match range format like (10—8)% or (15—25)% (using em-dash or regular dash)
  // The range format is (min—max) where rolled value falls within
  const rangePattern = /\((\d+(?:\.\d+)?)[—\-–](\d+(?:\.\d+)?)\)(%?)/g;
  let rangeMatch: RegExpExecArray | null;
  let bestRangeMatch: {
    match: string;
    index: number;
    hasPercent: boolean;
  } | null = null;

  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec pattern
  while ((rangeMatch = rangePattern.exec(text)) !== null) {
    const num1 = Number.parseFloat(rangeMatch[1]);
    const num2 = Number.parseFloat(rangeMatch[2]);
    const min = Math.min(num1, num2);
    const max = Math.max(num1, num2);
    // Check if rolled value is within or close to this range
    if (rolledValue >= min - 1 && rolledValue <= max + 1) {
      bestRangeMatch = {
        match: rangeMatch[0],
        index: rangeMatch.index,
        hasPercent: rangeMatch[3] === "%",
      };
      break;
    }
  }

  if (bestRangeMatch) {
    const template =
      text.substring(0, bestRangeMatch.index) +
      "{value}" +
      (bestRangeMatch.hasPercent ? "" : "") +
      text.substring(bestRangeMatch.index + bestRangeMatch.match.length);
    return { template, hasPercent: bestRangeMatch.hasPercent };
  }

  // Try to match the specific rolled value (with optional % suffix)
  const valueStr = Number.isInteger(rolledValue) ? String(rolledValue) : rolledValue.toFixed(1);

  // Try to match the exact value with optional %
  const exactPattern = new RegExp(`(${valueStr.replace(".", "\\.")}%?)`);
  const exactMatch = text.match(exactPattern);

  if (exactMatch) {
    const hasPercent = exactMatch[1].includes("%");
    const template = text.replace(exactPattern, "{value}");
    return { template, hasPercent };
  }

  // Fallback: find the first number that could be the value
  // Look for numbers that are close to the rolled value (within the value range)
  const numberPattern = /(\d+(?:\.\d+)?%?)/g;
  let match: RegExpExecArray | null;
  let bestMatch: { match: string; index: number } | null = null;

  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec pattern
  while ((match = numberPattern.exec(text)) !== null) {
    const numStr = match[1].replace("%", "");
    const num = Number.parseFloat(numStr);
    // If this number is close to the rolled value, it's likely the right one
    if (Math.abs(num - rolledValue) <= Math.max(rolledValue * 0.5, 5)) {
      bestMatch = { match: match[1], index: match.index };
      break;
    }
  }

  if (bestMatch) {
    const hasPercent = bestMatch.match.includes("%");
    const template =
      text.substring(0, bestMatch.index) +
      "{value}" +
      text.substring(bestMatch.index + bestMatch.match.length);
    return { template, hasPercent };
  }

  // Last resort: just use the first number
  const firstMatch = text.match(/(\d+(?:\.\d+)?%?)/);
  const hasPercent = firstMatch ? firstMatch[1].includes("%") : false;
  const template = text.replace(/(\d+(?:\.\d+)?%?)/, "{value}");
  return { template, hasPercent };
}

// Replace the placeholder with the actual summed value
function formatStatText(template: string, value: number, hasPercent: boolean): string {
  const formattedValue = Number.isInteger(value) ? value.toString() : value.toFixed(1);
  const displayValue = hasPercent ? `${formattedValue}%` : formattedValue;
  return template.replace("{value}", displayValue);
}

function getModTextForAggregation(mod: IdolModifier, locale: SupportedLocale): string {
  return resolveModTextWithRange(mod, locale);
}

interface AggregatedStatsResult {
  statsByMechanic: StatsByMechanic[];
  uniqueStats: UniqueIdolStat[];
  baseImplicit: number;
}

function aggregateStats(
  placements: IdolPlacement[],
  inventory: InventoryIdol[],
  locale: SupportedLocale,
): AggregatedStatsResult {
  const statMap = new Map<string, AggregatedStat>();
  const uniqueStats: UniqueIdolStat[] = [];
  let baseImplicit = 0;

  for (const placement of placements) {
    const inventoryIdol = inventory.find((i) => i.id === placement.inventoryIdolId);
    if (!inventoryIdol) continue;

    const idol = inventoryIdol.idol;
    const base = IDOL_BASES[idol.baseType];
    baseImplicit += base.implicit;

    const allMods = [...idol.prefixes, ...idol.suffixes];
    const contribution: IdolContribution = {
      baseType: idol.baseType,
    };

    for (const mod of allMods) {
      // Unique mods are handled separately since they don't aggregate
      if (mod.type === "unique") {
        const modText = resolveModTextWithRange(mod, locale);
        uniqueStats.push({
          text: modText,
          baseType: idol.baseType,
        });
        continue;
      }

      const modText = getModTextForAggregation(mod, locale);
      const { template, hasPercent } = createTemplate(modText, mod.rolledValue);
      const mechanic = getModMechanic(mod.modId);
      const key = `${mechanic}:${template}`;
      const existing = statMap.get(key);
      if (existing) {
        existing.totalValue += mod.rolledValue;
        existing.contributions.push(contribution);
      } else {
        statMap.set(key, {
          template,
          totalValue: mod.rolledValue,
          mechanic,
          hasPercent,
          contributions: [contribution],
        });
      }
    }
  }

  const statsByMechanic: StatsByMechanic[] = [];
  for (const mechanic of LEAGUE_MECHANICS) {
    const stats = Array.from(statMap.values()).filter((s) => s.mechanic === mechanic);
    if (stats.length > 0) {
      statsByMechanic.push({ mechanic, stats });
    }
  }

  return { statsByMechanic, uniqueStats, baseImplicit };
}

function MechanicSection({ data }: { data: StatsByMechanic }) {
  const t = useTranslations();
  const mechanicName = t(`mechanics.${data.mechanic}`, { defaultValue: data.mechanic });

  return (
    <div className="mb-4">
      <h4 className="mb-2 font-semibold text-primary text-sm">{mechanicName}</h4>
      <div className="space-y-1">
        {data.stats.map((stat, index) => {
          const displayText = formatStatText(stat.template, stat.totalValue, stat.hasPercent);
          const contributionText = formatContributions(
            stat.contributions,
            t("idol", { returnObjects: true }) as Record<string, string>,
          );
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: stat template may repeat; positional index keeps display stable
              key={`${stat.template}-${index}`}
              className="text-secondary-foreground text-sm"
            >
              <div>{highlightNumbers(displayText)}</div>
              {contributionText && (
                <div className="text-muted-foreground text-xs">({contributionText})</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BaseImplicitSection({ value }: { value: number }) {
  if (value === 0) return null;

  return (
    <div className="mb-4">
      <h4 className="mb-2 font-semibold text-primary text-sm">Base Implicit</h4>
      <div className="text-secondary-foreground text-sm">
        {highlightNumbers(`${value}% increased Maps found in Area`)}
      </div>
    </div>
  );
}

function UniqueIdolSection({ stats }: { stats: UniqueIdolStat[] }) {
  const t = useTranslations();

  if (stats.length === 0) return null;

  return (
    <div className="mb-4">
      <h4 className="mb-2 font-semibold text-primary text-sm">{t("editor.uniqueIdols")}</h4>
      <div className="space-y-1">
        {stats.map((stat, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: unique idols with the same baseType may appear more than once
            key={`unique-${stat.baseType}-${index}`}
            className="text-secondary-foreground text-sm"
          >
            <div>{highlightNumbers(stat.text)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CraftingOptionSection({ craftingOption }: { craftingOption: MapCraftingOption | null }) {
  const t = useTranslations();

  if (!craftingOption) return null;

  return (
    <div className="mb-4 border-border border-t pt-4">
      <h4 className="mb-2 font-semibold text-primary text-sm">
        {t("mapDevice.craftingOptionEffect")}
      </h4>
      <div className="mb-1 text-muted-foreground text-xs">
        {craftingOption.name}
        {craftingOption.cost > 0 && ` (${craftingOption.cost}c)`}
        {craftingOption.imbued && " - Imbued"}
      </div>
      <div className="text-secondary-foreground text-sm">
        {highlightNumbers(craftingOption.effect)}
      </div>
    </div>
  );
}

function ScarabsSection({ scarabs, locale }: { scarabs: Scarab[]; locale: SupportedLocale }) {
  const t = useTranslations();

  if (scarabs.length === 0) return null;

  // Group scarabs by category
  const scarabsByCategory = scarabs.reduce(
    (acc, scarab) => {
      const category = scarab.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(scarab);
      return acc;
    },
    {} as Record<string, Scarab[]>,
  );

  return (
    <div className="mb-4 border-border border-t pt-4">
      <h4 className="mb-2 font-semibold text-primary text-sm">{t("mapDevice.scarabEffects")}</h4>
      {Object.entries(scarabsByCategory).map(([category, catScarabs]) => (
        <div key={category} className="mb-2">
          <div className="mb-1 text-muted-foreground text-xs">
            {t(`mechanics.${category}`, { defaultValue: category })}
          </div>
          <div className="space-y-1">
            {catScarabs.map((scarab) => (
              <div key={scarab.id} className="text-secondary-foreground text-sm">
                {highlightNumbers(getScarabEffect(scarab, locale))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatChaosPrice(price: number): string {
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

export function StatsSummary({ placements, inventory, mapDevice }: StatsSummaryProps) {
  const t = useTranslations();
  const locale = useLocale();
  const { getPrice } = useScarabPrices();

  const { statsByMechanic, uniqueStats, baseImplicit } = useMemo(
    () => aggregateStats(placements, inventory, locale),
    [placements, inventory, locale],
  );

  const selectedScarabs = useMemo(() => {
    if (!mapDevice) return [];
    return mapDevice.slots
      .map((slot) => (slot.scarabId ? getScarabById(slot.scarabId) : null))
      .filter((s): s is Scarab => s !== null);
  }, [mapDevice]);

  const selectedCraftingOption = useMemo(() => {
    if (!mapDevice?.craftingOptionId) return null;
    return getMapCraftingOptionById(mapDevice.craftingOptionId) ?? null;
  }, [mapDevice?.craftingOptionId]);

  const totalStats = useMemo(
    () => statsByMechanic.reduce((sum, m) => sum + m.stats.length, 0) + uniqueStats.length,
    [statsByMechanic, uniqueStats],
  );

  const totalCost = useMemo(() => {
    let cost = 0;

    // Add scarab costs
    for (const scarab of selectedScarabs) {
      const price = getPrice(scarab.id);
      if (price !== null) {
        cost += price;
      }
    }

    // Add crafting option cost
    if (selectedCraftingOption?.cost) {
      cost += selectedCraftingOption.cost;
    }

    return cost;
  }, [selectedScarabs, selectedCraftingOption, getPrice]);

  const hasContent =
    baseImplicit > 0 ||
    statsByMechanic.length > 0 ||
    uniqueStats.length > 0 ||
    selectedScarabs.length > 0 ||
    selectedCraftingOption !== null;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{t("stats.totalStats")}</CardTitle>
            <span className="text-muted-foreground text-sm">
              {t("stats.modifierCount", { count: totalStats })}
              {selectedScarabs.length > 0 &&
                ` + ${t("stats.scarabCount", { count: selectedScarabs.length })}`}
            </span>
          </div>
          {totalCost > 0 && (
            <div className="text-right text-sm text-yellow-600 dark:text-yellow-400">
              {t("stats.totalCost")} {formatChaosPrice(totalCost)}c
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 overflow-hidden">
        {!hasContent ? (
          <div className="py-8 text-center text-muted-foreground">{t("stats.noStats")}</div>
        ) : (
          <ScrollArea className="h-full">
            <div className="space-y-2 pr-2">
              {statsByMechanic.map((data) => (
                <MechanicSection key={data.mechanic} data={data} />
              ))}
              <UniqueIdolSection stats={uniqueStats} />
              <BaseImplicitSection value={baseImplicit} />
              <CraftingOptionSection craftingOption={selectedCraftingOption} />
              <ScarabsSection scarabs={selectedScarabs} locale={locale} />
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

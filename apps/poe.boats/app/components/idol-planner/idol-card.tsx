import { Copy, ExternalLink, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { IDOL_BASES, type IdolBaseKey } from "~/data/idol-bases";
import { useLocale, useTranslations } from "~/i18n";
import type { SupportedLocale } from "~/i18n/types";
import { highlightNumbers } from "~/lib/highlight-numbers";
import { getModWeight, resolveModText } from "~/lib/mod-text-resolver";
import { generateTradeUrlForMod } from "~/lib/trade-search";
import { cn } from "~/lib/utils";
import type { IdolInstance, IdolModifier } from "~/schemas/idol";

interface IdolCardProps {
  idol: IdolInstance;
  className?: string;
  compact?: boolean;
  onClick?: () => void;
  showTooltip?: boolean;
}

function getRarityColor(rarity: IdolInstance["rarity"]): string {
  switch (rarity) {
    case "normal":
      return "border-rarity-normal";
    case "magic":
      return "border-rarity-magic";
    case "rare":
      return "border-rarity-rare";
    case "unique":
      return "border-rarity-unique";
    default:
      return "border-rarity-normal";
  }
}

function getRarityBg(rarity: IdolInstance["rarity"]): string {
  switch (rarity) {
    case "normal":
      return "bg-rarity-normal-bg";
    case "magic":
      return "bg-rarity-magic-bg";
    case "rare":
      return "bg-rarity-rare-bg";
    case "unique":
      return "bg-rarity-unique-bg";
    default:
      return "bg-rarity-normal-bg";
  }
}

function getModTypeColor(type: IdolModifier["type"]): string {
  switch (type) {
    case "prefix":
      return "text-mod-prefix";
    case "suffix":
      return "text-mod-suffix";
    case "unique":
      return "text-mod-unique";
    default:
      return "text-mod-prefix";
  }
}

function ModifierLine({
  mod,
  locale,
  showTradeButton = false,
}: {
  mod: IdolModifier;
  locale: SupportedLocale;
  showTradeButton?: boolean;
}) {
  const displayText = resolveModText(mod, locale);
  const weight = getModWeight(mod.modId, mod.tier);

  const handleTradeSearch = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = generateTradeUrlForMod(mod);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="group/mod flex items-start gap-1 text-sm">
      <span className={cn("flex-1", getModTypeColor(mod.type))}>
        {highlightNumbers(displayText)}
      </span>
      {weight !== undefined && (
        <span className="shrink-0 text-muted-foreground text-xs tabular-nums">[{weight}]</span>
      )}
      {showTradeButton && (
        <button
          type="button"
          onClick={handleTradeSearch}
          className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-accent group-hover/mod:opacity-100"
          title="Search Trade"
        >
          <ExternalLink className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

function IdolCardContent({
  idol,
  compact,
  showTradeButtons = false,
}: {
  idol: IdolInstance;
  compact?: boolean;
  showTradeButtons?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const base = IDOL_BASES[idol.baseType as IdolBaseKey];
  const allMods = [...idol.prefixes, ...idol.suffixes];
  const imageSrc = idol.rarity === "unique" && base.uniqueImage ? base.uniqueImage : base.image;

  const idolName = t(`idol.${idol.baseType}Idol`, { defaultValue: base.name });

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <img src={imageSrc} alt="" className="h-5 w-5 object-contain" />
        <span className="text-muted-foreground text-xs">{idolName}</span>
      </div>

      {idol.implicit && !compact && (
        <div className="border-border border-b pb-1 text-mod-implicit text-sm">
          {idol.implicit.text}
        </div>
      )}

      {compact ? (
        <div className="text-muted-foreground text-sm">
          {t("idol.modCount", { count: allMods.length })}
        </div>
      ) : (
        <div className="space-y-0.5">
          {allMods.map((mod, index) => (
            <ModifierLine
              // biome-ignore lint/suspicious/noArrayIndexKey: modIds can repeat within an idol; positional index disambiguates stable list
              key={`${mod.modId}-${index}`}
              mod={mod}
              locale={locale}
              showTradeButton={showTradeButtons}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function IdolCard({
  idol,
  className,
  compact = false,
  onClick,
  showTooltip = true,
}: IdolCardProps) {
  const rarityColor = getRarityColor(idol.rarity);
  const rarityBg = getRarityBg(idol.rarity);
  const base = IDOL_BASES[idol.baseType as IdolBaseKey];

  const cardElement = (
    <Card
      className={cn(
        "cursor-pointer border-2 transition-all hover:scale-102",
        rarityColor,
        rarityBg,
        className,
      )}
      onClick={onClick}
    >
      <CardHeader className="px-2 pt-1.5 pb-0">
        <CardTitle className="font-medium text-sm">{idol.name || base.name}</CardTitle>
      </CardHeader>
      <CardContent className="p-2 pt-0.5">
        <IdolCardContent idol={idol} compact={compact} />
      </CardContent>
    </Card>
  );

  if (!showTooltip || !compact) {
    return cardElement;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={cardElement} />
        <TooltipContent
          side="right"
          className="max-w-xs border border-border bg-card text-card-foreground"
        >
          <IdolCardContent idol={idol} compact={false} showTradeButtons />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface IdolCardMiniProps {
  idol: IdolInstance;
  cellSize?: number;
  onClick?: () => void;
  onRemove?: () => void;
  onCopy?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: (e: React.DragEvent<HTMLButtonElement>) => void;
  isHovered?: boolean;
}

export function IdolCardMini({
  idol,
  cellSize = 64,
  onClick,
  onRemove,
  onCopy,
  draggable = false,
  onDragStart,
  onDragEnd,
  isHovered = false,
}: IdolCardMiniProps) {
  const t = useTranslations();
  const base = IDOL_BASES[idol.baseType as IdolBaseKey];
  const rarityColor = getRarityColor(idol.rarity);
  const imageSrc = idol.rarity === "unique" && base.uniqueImage ? base.uniqueImage : base.image;
  const style = {
    width: `${base.width * cellSize}px`,
    height: `${base.height * cellSize}px`,
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove?.();
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopy?.();
  };

  return (
    <TooltipProvider>
      <div className="group/mini relative" style={style}>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                draggable={draggable}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                className={cn(
                  "flex h-full w-full items-center justify-center overflow-hidden rounded border-2 transition-all hover:scale-102",
                  draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                  rarityColor,
                  isHovered && "scale-105",
                )}
                onClick={onClick}
              />
            }
          >
            <img
              src={imageSrc}
              alt={base.name}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </TooltipTrigger>
          <TooltipContent
            side="right"
            className="max-w-xs border border-border bg-card text-card-foreground"
          >
            <IdolCardContent idol={idol} compact={false} showTradeButtons />
          </TooltipContent>
        </Tooltip>
        {(onCopy || onRemove) && (
          <div
            className={cn(
              "absolute top-0.5 right-0.5 flex gap-0.5 transition-opacity group-hover/mini:opacity-100",
              isHovered ? "opacity-100" : "opacity-0",
            )}
          >
            {onCopy && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-5 w-5"
                      onClick={handleCopy}
                    />
                  }
                >
                  <Copy className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>{t("actions.copyToInventory")}</TooltipContent>
              </Tooltip>
            )}
            {onRemove && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-5 w-5"
                      onClick={handleRemove}
                    />
                  }
                >
                  <X className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>{t("grid.removeFromGrid")}</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

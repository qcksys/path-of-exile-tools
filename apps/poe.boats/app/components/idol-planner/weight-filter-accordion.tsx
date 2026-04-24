import { Filter } from "lucide-react";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "~/components/ui/accordion";
import { Slider } from "~/components/ui/slider";
import { Switch } from "~/components/ui/switch";
import { useTradeSettings } from "~/context/trade-settings-context";
import { useTranslations } from "~/i18n";
import { getWeightRange, snapToNearestWeight } from "~/lib/trade-search";

interface WeightFilterAccordionProps {
    matchAffixType?: boolean;
    onMatchAffixTypeChange?: (value: boolean) => void;
    showMatchAffixType?: boolean;
}

export function WeightFilterAccordion({
    matchAffixType,
    onMatchAffixTypeChange,
    showMatchAffixType = false,
}: WeightFilterAccordionProps) {
    const t = useTranslations();
    const { settings: tradeSettings, updateSettings } = useTradeSettings();

    const weightRange = getWeightRange();

    return (
        <Accordion className="w-full">
            <AccordionItem value="weight-filter" className="border-0">
                <AccordionTrigger className="rounded-md border border-border px-3 py-2 hover:no-underline data-open:rounded-b-none">
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground text-xs">
                            {t("trade.weightFilter")}
                        </span>
                        {tradeSettings.filterByMaxWeight && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary text-xs">
                                {t("trade.weightFilterActive")}
                            </span>
                        )}
                    </div>
                </AccordionTrigger>
                <AccordionContent className="rounded-b-md border border-border border-t-0 px-3 pb-3">
                    <div className="space-y-3 pt-1">
                        <div className="flex items-center gap-2">
                            <Switch
                                id="filter-by-weight"
                                checked={tradeSettings.filterByMaxWeight}
                                onCheckedChange={(v) => updateSettings({ filterByMaxWeight: v })}
                            />
                            <label
                                htmlFor="filter-by-weight"
                                className="text-muted-foreground text-xs"
                            >
                                {t("trade.filterByMaxWeight")}
                            </label>
                        </div>

                        {tradeSettings.filterByMaxWeight && (
                            <>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        id="separate-weights"
                                        checked={tradeSettings.separateWeightFilters}
                                        onCheckedChange={(v: boolean) =>
                                            updateSettings({
                                                separateWeightFilters: v,
                                            })
                                        }
                                    />
                                    <label
                                        htmlFor="separate-weights"
                                        className="text-muted-foreground text-xs"
                                    >
                                        {t("trade.separateWeights")}
                                    </label>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            updateSettings({
                                                weightFilterMode: "gte",
                                            })
                                        }
                                        className={`rounded px-2 py-0.5 text-xs ${
                                            tradeSettings.weightFilterMode === "gte"
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-muted text-muted-foreground"
                                        }`}
                                    >
                                        ≥ {t("trade.gte")}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            updateSettings({
                                                weightFilterMode: "lte",
                                            })
                                        }
                                        className={`rounded px-2 py-0.5 text-xs ${
                                            tradeSettings.weightFilterMode === "lte"
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-muted text-muted-foreground"
                                        }`}
                                    >
                                        ≤ {t("trade.lte")}
                                    </button>
                                    <span className="text-muted-foreground text-xs">
                                        {t("trade.weightThreshold")}
                                    </span>
                                </div>

                                {tradeSettings.separateWeightFilters ? (
                                    <>
                                        <div className="space-y-1">
                                            <label
                                                htmlFor="max-prefix-weight"
                                                className="text-muted-foreground text-xs"
                                            >
                                                {t("trade.prefixWeight")}:{" "}
                                                <span className="font-medium text-foreground">
                                                    {tradeSettings.maxPrefixWeight ??
                                                        weightRange.max}
                                                </span>
                                            </label>
                                            <Slider
                                                id="max-prefix-weight"
                                                min={weightRange.min}
                                                max={weightRange.max}
                                                step={1}
                                                value={[
                                                    tradeSettings.maxPrefixWeight ??
                                                        weightRange.max,
                                                ]}
                                                onValueChange={(
                                                    sliderValue: number | readonly number[],
                                                ) => {
                                                    const value = Array.isArray(sliderValue)
                                                        ? sliderValue[0]
                                                        : sliderValue;
                                                    updateSettings({
                                                        maxPrefixWeight: snapToNearestWeight(value),
                                                    });
                                                }}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label
                                                htmlFor="max-suffix-weight"
                                                className="text-muted-foreground text-xs"
                                            >
                                                {t("trade.suffixWeight")}:{" "}
                                                <span className="font-medium text-foreground">
                                                    {tradeSettings.maxSuffixWeight ??
                                                        weightRange.max}
                                                </span>
                                            </label>
                                            <Slider
                                                id="max-suffix-weight"
                                                min={weightRange.min}
                                                max={weightRange.max}
                                                step={1}
                                                value={[
                                                    tradeSettings.maxSuffixWeight ??
                                                        weightRange.max,
                                                ]}
                                                onValueChange={(
                                                    sliderValue: number | readonly number[],
                                                ) => {
                                                    const value = Array.isArray(sliderValue)
                                                        ? sliderValue[0]
                                                        : sliderValue;
                                                    updateSettings({
                                                        maxSuffixWeight: snapToNearestWeight(value),
                                                    });
                                                }}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-1">
                                        <label
                                            htmlFor="max-weight"
                                            className="text-muted-foreground text-xs"
                                        >
                                            {t("trade.maxWeight")}:{" "}
                                            <span className="font-medium text-foreground">
                                                {tradeSettings.maxWeight ?? weightRange.max}
                                            </span>
                                        </label>
                                        <Slider
                                            id="max-weight"
                                            min={weightRange.min}
                                            max={weightRange.max}
                                            step={1}
                                            value={[tradeSettings.maxWeight ?? weightRange.max]}
                                            onValueChange={(
                                                sliderValue: number | readonly number[],
                                            ) => {
                                                const value = Array.isArray(sliderValue)
                                                    ? sliderValue[0]
                                                    : sliderValue;
                                                updateSettings({
                                                    maxWeight: snapToNearestWeight(value),
                                                });
                                            }}
                                        />
                                    </div>
                                )}

                                {showMatchAffixType && onMatchAffixTypeChange && (
                                    <div className="flex items-center gap-2 border-border border-t pt-3">
                                        <Switch
                                            id="match-affix-type"
                                            checked={matchAffixType}
                                            onCheckedChange={onMatchAffixTypeChange}
                                        />
                                        <label
                                            htmlFor="match-affix-type"
                                            className="text-muted-foreground text-xs"
                                        >
                                            {t("trade.matchAffixType")}
                                        </label>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
}

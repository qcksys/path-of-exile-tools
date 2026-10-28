import {
    formatGemBandFilter,
    GEM_LEVEL_BANDS,
    GEM_QUALITY_BANDS,
    GEM_QUALITY_LABELS,
    GEM_TIERS,
    type GemBandState,
    parseGemBandFilter,
} from "@poe-tools/market";
import { CheckIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import type { MarketFilters } from "~/schemas/market";

type ToggleState = GemBandState | undefined;

/** Neither, then included, then excluded. */
function nextState(state: ToggleState): ToggleState {
    return state === undefined ? "include" : state === "include" ? "exclude" : undefined;
}

const STATE_TEXT = { include: "included", exclude: "excluded" } as const;

function TriStateToggle({
    label,
    state,
    onChange,
}: {
    label: string;
    state: ToggleState;
    onChange: (state: ToggleState) => void;
}) {
    return (
        <Button
            type="button"
            size="sm"
            variant={
                state === "include" ? "default" : state === "exclude" ? "destructive" : "outline"
            }
            aria-label={`${label}: ${state ? STATE_TEXT[state] : "any"}`}
            title="Click to include, again to exclude, again to clear"
            onClick={() => onChange(nextState(state))}
        >
            {state === "include" ? <CheckIcon aria-hidden /> : null}
            {state === "exclude" ? <XIcon aria-hidden /> : null}
            <span className={state === "exclude" ? "line-through" : undefined}>{label}</span>
        </Button>
    );
}

/** A URL band filter (`20,-21`) as one tri-state toggle per band, kept in a hidden input. */
function BandToggles<Band extends string>({
    name,
    legend,
    bands,
    labels,
    value,
    onChange,
}: {
    name: "gemLevel" | "gemQuality";
    legend: string;
    bands: readonly Band[];
    labels: readonly string[];
    value: string;
    onChange: () => void;
}) {
    const [current, setCurrent] = useState(value);
    useEffect(() => setCurrent(value), [value]);
    const filter = parseGemBandFilter(current, bands);
    const stateOf = (band: Band): ToggleState =>
        filter?.include.has(band) ? "include" : filter?.exclude.has(band) ? "exclude" : undefined;
    return (
        <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-xs text-muted-foreground">{legend}</legend>
            <Input type="hidden" name={name} value={current} />
            <div className="flex flex-wrap gap-1.5">
                {bands.map((band, index) => (
                    <TriStateToggle
                        key={band}
                        label={labels[index]!}
                        state={stateOf(band)}
                        onChange={(state) => {
                            setCurrent(
                                formatGemBandFilter({
                                    ...Object.fromEntries(
                                        bands.map((entry) => [entry, stateOf(entry)]),
                                    ),
                                    [band]: state,
                                }),
                            );
                            onChange();
                        }}
                    />
                ))}
            </div>
        </fieldset>
    );
}

const CORRUPTION_STATES = { true: "include", false: "exclude", all: undefined } as const;

/** Corruption as one tri-state toggle: included lists corrupted gems only, excluded uncorrupted. */
function CorruptionToggle({
    value,
    onChange,
}: {
    value: MarketFilters["corruption"];
    onChange: () => void;
}) {
    const [current, setCurrent] = useState(value);
    useEffect(() => setCurrent(value), [value]);
    return (
        <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-xs text-muted-foreground">Corruption</legend>
            <Input type="hidden" name="corruption" value={current} />
            <div className="flex gap-1.5">
                <TriStateToggle
                    label="Corrupted"
                    state={CORRUPTION_STATES[current]}
                    onChange={(state) => {
                        setCurrent(
                            state === "include" ? "true" : state === "exclude" ? "false" : "all",
                        );
                        onChange();
                    }}
                />
            </div>
        </fieldset>
    );
}

/** The skill gem category's level, quality and corruption filters. */
export function MarketGemFilters({
    filters,
    onChange,
}: {
    filters: MarketFilters;
    onChange: () => void;
}) {
    return (
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3 border-t border-border pt-4">
            <div className="grid gap-1">
                <BandToggles
                    name="gemLevel"
                    legend="Gem level"
                    bands={GEM_LEVEL_BANDS}
                    labels={GEM_TIERS.normal.levels}
                    value={filters.gemLevel}
                    onChange={onChange}
                />
                <p className="text-xs text-muted-foreground">
                    {Object.values(GEM_TIERS)
                        .slice(1)
                        .map((tier) => `${tier.label}: ${tier.levels.join(", ")}`)
                        .join(" · ")}
                </p>
            </div>
            <BandToggles
                name="gemQuality"
                legend="Gem quality"
                bands={GEM_QUALITY_BANDS}
                labels={GEM_QUALITY_LABELS}
                value={filters.gemQuality}
                onChange={onChange}
            />
            <CorruptionToggle value={filters.corruption} onChange={onChange} />
        </div>
    );
}

import type { ReactNode } from "react";
import { BandToggles, FlagToggle, MarketSelect } from "~/components/market-form";
import { MARKET_AXES, type MarketAxisParam, type MarketSettings } from "~/lib/market-kinds";
import { type MarketFilters, marketCorruption } from "~/schemas/market";

type AxisChange = (name: string, value: string) => void;

function flagAxes(axes: readonly MarketAxisParam[]) {
    return axes.flatMap((param) => {
        const axis = MARKET_AXES[param];
        return axis.control === "flag" ? [{ param, axis }] : [];
    });
}

/** An axis list's band toggles and flags, in one wrapping row. */
export function MarketAxisToggles({
    filters,
    axes,
    shown,
    onChange,
    middle,
    children,
}: {
    filters: Pick<MarketFilters, MarketAxisParam>;
    axes: readonly MarketAxisParam[];
    /** On one item's page: the bands its variants have. */
    shown?: Partial<Record<MarketAxisParam, ReadonlySet<string>>>;
    onChange: AxisChange;
    /** Controls between the band toggles and the flags. */
    middle?: ReactNode;
    children?: ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3 border-t border-border pt-4">
            {axes.map((param) => {
                const axis = MARKET_AXES[param];
                if (axis.control !== "bands") return null;
                const toggles = (
                    <BandToggles
                        key={param}
                        name={param}
                        legend={axis.legend}
                        bands={axis.bands}
                        labels={axis.labels}
                        value={filters[param]}
                        shown={shown?.[param]}
                        onChange={(value) => onChange(param, value)}
                    />
                );
                return "hint" in axis && !shown ? (
                    <div key={param} className="grid gap-1">
                        {toggles}
                        <p className="text-xs text-muted-foreground">{axis.hint}</p>
                    </div>
                ) : (
                    toggles
                );
            })}
            {middle}
            {flagAxes(axes).map(({ param, axis }) => (
                <FlagToggle
                    key={param}
                    name={param}
                    legend={axis.legend}
                    label={axis.label}
                    value={filters[param] as "all" | "true" | "false"}
                    onChange={(value) => onChange(param, value)}
                />
            ))}
            {children}
        </div>
    );
}

/** A category list's axes: its toggles, then its selects. */
export function MarketListAxes({
    filters,
    settings,
    onChange,
}: {
    filters: MarketFilters;
    settings: MarketSettings;
    onChange: () => void;
}) {
    const toggles = settings.axes.some((param) => MARKET_AXES[param].control !== "select");
    const selects = settings.axes.flatMap((param) => {
        const axis = MARKET_AXES[param];
        return axis.control === "select" ? [{ param, axis }] : [];
    });
    return (
        <>
            {toggles ? (
                <MarketAxisToggles
                    filters={filters}
                    axes={settings.axes}
                    onChange={onChange}
                    middle={
                        settings.corruption === "toggle" ? (
                            <FlagToggle
                                name="corruption"
                                legend="Corruption"
                                label="Corrupted"
                                value={marketCorruption(filters)}
                                onChange={onChange}
                            />
                        ) : null
                    }
                />
            ) : null}
            {selects.length ? (
                <div className="flex flex-wrap items-end gap-3">
                    {selects.map(({ param, axis }) =>
                        "applies" in axis && !axis.applies(filters) ? null : (
                            <MarketSelect
                                key={param}
                                name={param}
                                label={axis.label}
                                value={filters[param]}
                                options={axis.options(settings)}
                                onChange={onChange}
                            />
                        ),
                    )}
                </div>
            ) : null}
        </>
    );
}

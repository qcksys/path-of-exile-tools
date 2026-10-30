import {
    MAP_DELIRIUM_BANDS,
    MAP_DELIRIUM_LABELS,
    MAP_INFLUENCE_BAND_LABELS,
    MAP_INFLUENCE_BANDS,
    MAP_MOD_BANDS,
    MAP_MOD_LABELS,
    MAP_QUANTITY_BANDS,
    MAP_QUANTITY_LABELS,
} from "@poe-tools/market";
import type { ReactNode } from "react";
import { BandToggles } from "~/components/market-gem-filters";
import type { MarketFilters, MarketMapBandFilter } from "~/schemas/market";

/** The map category's mod count, item quantity, delirium and influence band filters. */
export function MarketMapFilters({
    filters,
    shown,
    onChange,
    children,
}: {
    filters: MarketFilters;
    /** On one map's page: the bands its variants have. */
    shown?: Record<MarketMapBandFilter, ReadonlySet<string>>;
    onChange: (name: MarketMapBandFilter, value: string) => void;
    children?: ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3 border-t border-border pt-4">
            <BandToggles
                name="mapMods"
                legend="Mods"
                bands={MAP_MOD_BANDS}
                labels={MAP_MOD_LABELS}
                value={filters.mapMods}
                shown={shown?.mapMods}
                onChange={(value) => onChange("mapMods", value)}
            />
            <div className="grid gap-1">
                <BandToggles
                    name="mapQuantity"
                    legend="Item quantity"
                    bands={MAP_QUANTITY_BANDS}
                    labels={MAP_QUANTITY_LABELS}
                    value={filters.mapQuantity}
                    shown={shown?.mapQuantity}
                    onChange={(value) => onChange("mapQuantity", value)}
                />
                {shown ? null : (
                    <p className="text-xs text-muted-foreground">Tier 16 and Nightmare maps only</p>
                )}
            </div>
            <BandToggles
                name="mapDelirium"
                legend="Delirium"
                bands={MAP_DELIRIUM_BANDS}
                labels={MAP_DELIRIUM_LABELS}
                value={filters.mapDelirium}
                shown={shown?.mapDelirium}
                onChange={(value) => onChange("mapDelirium", value)}
            />
            <BandToggles
                name="mapInfluence"
                legend="Influence"
                bands={MAP_INFLUENCE_BANDS}
                labels={MAP_INFLUENCE_BAND_LABELS}
                value={filters.mapInfluence}
                shown={shown?.mapInfluence}
                onChange={(value) => onChange("mapInfluence", value)}
            />
            {children}
        </div>
    );
}

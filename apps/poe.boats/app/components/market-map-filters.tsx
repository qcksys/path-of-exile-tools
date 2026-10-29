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
import { BandToggles } from "~/components/market-gem-filters";
import type { MarketFilters } from "~/schemas/market";

/** The map category's mod count, item quantity, delirium and influence band filters. */
export function MarketMapFilters({
    filters,
    onChange,
}: {
    filters: MarketFilters;
    onChange: () => void;
}) {
    return (
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3 border-t border-border pt-4">
            <BandToggles
                name="mapMods"
                legend="Mods"
                bands={MAP_MOD_BANDS}
                labels={MAP_MOD_LABELS}
                value={filters.mapMods}
                onChange={onChange}
            />
            <div className="grid gap-1">
                <BandToggles
                    name="mapQuantity"
                    legend="Item quantity"
                    bands={MAP_QUANTITY_BANDS}
                    labels={MAP_QUANTITY_LABELS}
                    value={filters.mapQuantity}
                    onChange={onChange}
                />
                <p className="text-xs text-muted-foreground">Tier 16 and Nightmare maps only</p>
            </div>
            <BandToggles
                name="mapDelirium"
                legend="Delirium"
                bands={MAP_DELIRIUM_BANDS}
                labels={MAP_DELIRIUM_LABELS}
                value={filters.mapDelirium}
                onChange={onChange}
            />
            <BandToggles
                name="mapInfluence"
                legend="Influence"
                bands={MAP_INFLUENCE_BANDS}
                labels={MAP_INFLUENCE_BAND_LABELS}
                value={filters.mapInfluence}
                onChange={onChange}
            />
        </div>
    );
}

import { CurrencyLabel } from "~/components/currency-label";
import { MarketListAxes } from "~/components/market-axis-filters";
import { MarketListForm, MarketSelect } from "~/components/market-form";
import { marketSettings } from "~/lib/market-kinds";
import {
    MARKET_ORDERS,
    MARKET_RANGE_PARAMS,
    type MarketFilters,
    marketCorruption,
    marketLink,
} from "~/schemas/market";

export const marketUtc = (hour: number) =>
    `${new Date(hour * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

/** A category list's filters, as its settings ask for. */
export function MarketFiltersForm({
    filters: input,
    seasons,
}: {
    filters: MarketFilters;
    seasons: { league: string }[];
}) {
    const filters = { ...input, corruption: marketCorruption(input) };
    const settings = marketSettings(filters.category);
    const game = filters.realm === "poe2" ? "poe2" : "poe1";
    return (
        <MarketListForm
            action={marketLink(filters).split("?")[0]!}
            hidden={Object.fromEntries(MARKET_RANGE_PARAMS.map((param) => [param, filters[param]]))}
            realm={filters.realm}
            league={filters.league}
            seasons={seasons}
            days={filters.days}
            currency={filters.currency}
            game={game}
            q={filters.q}
            placeholder="Item, base type or variant…"
            note={
                <>
                    Prices sort by the value each row shows, at the exchange rate of the hour it was
                    listed, and filter in{" "}
                    {filters.currency ? (
                        <CurrencyLabel currency={filters.currency} game={game} />
                    ) : (
                        "the selected currency"
                    )}
                    ; missing prices appear last.
                </>
            }
            controls={(apply) => (
                <>
                    <MarketSelect
                        name="order"
                        label="Order by"
                        value={filters.order}
                        options={MARKET_ORDERS}
                        onChange={apply}
                    />
                    {settings.identification ? (
                        <MarketSelect
                            name="identification"
                            label="Identification"
                            value={filters.identification}
                            options={{
                                all: "Any identification",
                                true: "Identified",
                                false: "Unidentified",
                            }}
                            onChange={apply}
                        />
                    ) : null}
                    {settings.corruption === "select" ? (
                        <MarketSelect
                            name="corruption"
                            label="Corruption"
                            value={filters.corruption}
                            options={{
                                all: "Any corruption",
                                false: "Uncorrupted",
                                true: "Corrupted",
                            }}
                            onChange={apply}
                        />
                    ) : null}
                </>
            )}
        >
            {(apply) => <MarketListAxes filters={filters} settings={settings} onChange={apply} />}
        </MarketListForm>
    );
}

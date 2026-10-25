import { Form, useNavigation } from "react-router";
import { CurrencyLabel } from "~/components/currency-label";
import { Button } from "~/components/ui/button";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
    MARKET_ORDERS,
    MARKET_RANGE_PARAMS,
    type MarketFilters,
    marketLink,
} from "~/schemas/market";

export const marketUtc = (hour: number) =>
    `${new Date(hour * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

export function MarketFiltersForm({
    filters,
    seasons,
}: {
    filters: MarketFilters;
    seasons: { league: string }[];
}) {
    const navigation = useNavigation();
    const item = filters.item
        ? {
              itemKey: filters.item,
              identified: filters.identified === "true",
              corrupted: filters.corrupted === "true",
              foilVariation: filters.foil,
              signatureKind: filters.kind,
              signatureValue: filters.value,
          }
        : undefined;
    const href = marketLink(filters, item);
    const select = (name: keyof MarketFilters, label: string, options: Record<string, string>) => (
        <Label className="grid gap-1.5 text-xs text-muted-foreground">
            {label}
            <FormSelect
                name={name}
                defaultValue={String(filters[name])}
                className="min-w-32 bg-background text-sm text-foreground"
            >
                {Object.entries(options).map(([value, text]) => (
                    <FormSelectItem key={value} value={value}>
                        {text}
                    </FormSelectItem>
                ))}
            </FormSelect>
        </Label>
    );
    return (
        <Form
            method="get"
            action={href.split("?")[0]}
            key={href}
            className="space-y-4 rounded-xl border border-border bg-card p-4"
        >
            <Input type="hidden" name="category" value={filters.category} />
            {MARKET_RANGE_PARAMS.map((param) =>
                filters[param] === undefined ? null : (
                    <Input key={param} type="hidden" name={param} value={filters[param]} />
                ),
            )}
            {item
                ? Object.entries({
                      q: filters.q,
                      order: filters.order,
                      rarity: filters.rarity,
                      identification: filters.identification,
                      corruption: filters.corruption,
                      page: filters.page,
                      identified: filters.identified,
                      corrupted: filters.corrupted,
                      foil: filters.foil,
                      kind: filters.kind,
                      value: filters.value,
                  }).map(([name, value]) => (
                      <Input key={name} type="hidden" name={name} value={value} />
                  ))
                : null}
            <div className="flex flex-wrap items-end gap-3">
                {select("realm", "Realm", {
                    pc: "PoE 1 · PC",
                    poe2: "PoE 2",
                    xbox: "Xbox",
                    sony: "PlayStation",
                })}
                {select("league", "Season", {
                    "": "Latest available",
                    ...Object.fromEntries(seasons.map(({ league }) => [league, league])),
                })}
                {select("days", "Period", {
                    "7": "Last 7 days",
                    "30": "Last 30 days",
                    "90": "Last 90 days",
                })}
                <Label className="grid gap-1.5 text-xs text-muted-foreground">
                    Price currency
                    <Input
                        name="currency"
                        defaultValue={filters.currency}
                        maxLength={40}
                        className="w-32 bg-background text-foreground"
                    />
                </Label>
            </div>
            {!item ? (
                <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
                    <Label className="grid min-w-48 flex-1 gap-1.5 text-xs text-muted-foreground">
                        Search items
                        <Input
                            type="search"
                            name="q"
                            defaultValue={filters.q}
                            placeholder="Item, base type or variant…"
                            maxLength={100}
                            className="bg-background text-foreground"
                        />
                    </Label>
                    {select("order", "Order by", MARKET_ORDERS)}
                    {select("rarity", "Rarity", {
                        all: "Any rarity",
                        normal: "Normal",
                        magic: "Magic",
                        rare: "Rare",
                        unique: "Unique",
                    })}
                    {select("identification", "Identification", {
                        all: "Any identification",
                        true: "Identified",
                        false: "Unidentified",
                    })}
                    {select("corruption", "Corruption", {
                        all: "Any corruption",
                        false: "Uncorrupted",
                        true: "Corrupted",
                    })}
                </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                    Price sorting and filters use{" "}
                    {filters.currency ? (
                        <CurrencyLabel
                            currency={filters.currency}
                            game={filters.realm === "poe2" ? "poe2" : "poe1"}
                        />
                    ) : (
                        "the selected currency"
                    )}
                    ; missing prices appear last.
                </p>
                <Button type="submit" disabled={navigation.state !== "idle"}>
                    {navigation.state === "idle" ? "Apply filters" : "Loading…"}
                </Button>
            </div>
        </Form>
    );
}

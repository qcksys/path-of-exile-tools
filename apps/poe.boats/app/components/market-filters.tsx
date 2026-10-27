import { exchangeListingCurrencySchema } from "@poe-tools/market";
import { useEffect, useRef, useState } from "react";
import { Form, useNavigation, useSubmit } from "react-router";
import { CurrencyLabel } from "~/components/currency-label";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { isMarketBaseCategory } from "~/lib/market-categories";
import {
    MARKET_ORDERS,
    MARKET_RANGE_PARAMS,
    type MarketFilters,
    marketLink,
} from "~/schemas/market";

export const marketUtc = (hour: number) =>
    `${new Date(hour * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

const APPLY_DELAY_MS = 400;

export function MarketFiltersForm({
    filters,
    seasons,
}: {
    filters: MarketFilters;
    seasons: { league: string }[];
}) {
    const navigation = useNavigation();
    const submit = useSubmit();
    const form = useRef<HTMLFormElement>(null);
    const pending = useRef<ReturnType<typeof setTimeout>>(undefined);
    const apply = () => {
        clearTimeout(pending.current);
        pending.current = setTimeout(() => {
            if (form.current) submit(form.current);
        }, APPLY_DELAY_MS);
    };
    useEffect(() => () => clearTimeout(pending.current), []);
    // The search box keeps what the user is typing while their earlier text loads;
    // it only follows the URL (e.g. a table column filter) when it isn't focused.
    const search = useRef<HTMLInputElement>(null);
    const [q, setQ] = useState(filters.q);
    useEffect(() => {
        if (document.activeElement !== search.current) setQ(filters.q);
    }, [filters.q]);
    const item = filters.item
        ? {
              itemKey: filters.item,
              identified: filters.identified === "true",
              corrupted: filters.corrupted === "true",
              signatureKind: filters.kind,
              signatureValue: filters.value,
          }
        : undefined;
    const href = marketLink(filters, item);
    const game = filters.realm === "poe2" ? "poe2" : "poe1";
    const currencies = [
        ...new Set([...exchangeListingCurrencySchema.options, filters.currency]),
    ].filter(Boolean);
    const select = (name: keyof MarketFilters, label: string, options: Record<string, string>) => (
        <Label className="grid gap-1.5 text-xs text-muted-foreground">
            {label}
            <FormSelect
                key={String(filters[name])}
                name={name}
                defaultValue={String(filters[name])}
                onValueChange={apply}
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
            ref={form}
            method="get"
            action={href.split("?")[0]}
            className="space-y-4 rounded-xl border border-border bg-card p-4"
        >
            {MARKET_RANGE_PARAMS.map((param) =>
                filters[param] === undefined ? null : (
                    <Input key={param} type="hidden" name={param} value={filters[param]} />
                ),
            )}
            {item
                ? Object.entries({
                      q: filters.q,
                      category: filters.category,
                      order: filters.order,
                      identification: filters.identification,
                      corruption: filters.corruption,
                      page: filters.page,
                      identified: filters.identified,
                      corrupted: filters.corrupted,
                      kind: filters.kind,
                      value: filters.value,
                      mods: filters.mods,
                      anyMods: filters.anyMods,
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
                    <FormSelect
                        key={filters.currency}
                        name="currency"
                        defaultValue={filters.currency}
                        onValueChange={apply}
                        className="min-w-32 bg-background text-sm text-foreground"
                    >
                        {currencies.map((currency) => (
                            <FormSelectItem key={currency} value={currency}>
                                <CurrencyLabel currency={currency} game={game} />
                            </FormSelectItem>
                        ))}
                    </FormSelect>
                </Label>
            </div>
            {!item ? (
                <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
                    <Label className="grid min-w-48 flex-1 gap-1.5 text-xs text-muted-foreground">
                        Search items
                        <Input
                            ref={search}
                            type="search"
                            name="q"
                            value={q}
                            onChange={(event) => {
                                setQ(event.target.value);
                                apply();
                            }}
                            placeholder="Item, base type or variant…"
                            maxLength={100}
                            className="bg-background text-foreground"
                        />
                    </Label>
                    {select("order", "Order by", MARKET_ORDERS)}
                    {isMarketBaseCategory(filters.category)
                        ? null
                        : select("identification", "Identification", {
                              all: "Any identification",
                              true: "Identified",
                              false: "Unidentified",
                          })}
                    {isMarketBaseCategory(filters.category)
                        ? null
                        : select("corruption", "Corruption", {
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
                        <CurrencyLabel currency={filters.currency} game={game} />
                    ) : (
                        "the selected currency"
                    )}
                    ; missing prices appear last.
                </p>
                <p role="status" className="text-xs text-muted-foreground">
                    {navigation.state === "idle" ? null : "Loading…"}
                </p>
            </div>
        </Form>
    );
}

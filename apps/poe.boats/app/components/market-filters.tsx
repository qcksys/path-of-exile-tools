import { exchangeListingCurrencySchema } from "@poe-tools/market";
import { useEffect, useRef, useState } from "react";
import { Form, useNavigation, useSubmit } from "react-router";
import { CurrencyLabel } from "~/components/currency-label";
import { MarketGemFilters } from "~/components/market-gem-filters";
import { MarketMapFilters } from "~/components/market-map-filters";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
    MARKET_BASE_ATTRIBUTE_SETS,
    MARKET_BASE_CLASSES,
    MARKET_BASE_LEVELS,
    MARKET_BASE_LINK_CLASSES,
    MARKET_CLUSTER_LEVEL_BANDS,
} from "~/lib/market-bases";
import {
    isMarketBaseCategory,
    isMarketUniqueCategory,
    MARKET_BASE_CATEGORIES,
    MARKET_CLUSTER_BASE_CATEGORY,
    type MarketCategory,
    marketHasCorruption,
    marketHasIdentification,
} from "~/lib/market-categories";
import {
    MARKET_ORDERS,
    MARKET_RANGE_PARAMS,
    MARKET_TABS,
    type MarketFilters,
    marketCorruption,
    marketLink,
} from "~/schemas/market";

export const marketUtc = (hour: number) =>
    `${new Date(hour * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

const APPLY_DELAY_MS = 400;

export function MarketFiltersForm({
    filters: input,
    seasons,
}: {
    filters: MarketFilters;
    seasons: { league: string }[];
}) {
    const filters = { ...input, corruption: marketCorruption(input) };
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
              links: filters.links === undefined ? null : Number(filters.links),
          }
        : undefined;
    const href = marketLink(filters, item);
    const gems = filters.category === "gems";
    // Unique equipment filters by its base's type and attributes, like its crafting bases.
    const uniques = isMarketUniqueCategory(filters.category);
    const baseCategory = uniques
        ? MARKET_BASE_CATEGORIES[filters.category as MarketCategory]!
        : filters.category;
    const baseClasses =
        baseCategory in MARKET_BASE_CLASSES
            ? MARKET_BASE_CLASSES[baseCategory as keyof typeof MARKET_BASE_CLASSES]
            : undefined;
    const game = filters.realm === "poe2" ? "poe2" : "poe1";
    const currencies = [
        ...new Set([...exchangeListingCurrencySchema.options, filters.currency]),
    ].filter(Boolean);
    // Pass entries where values look like integers: objects list integer keys before "".
    const select = (
        name: keyof MarketFilters,
        label: string,
        options: Record<string, string> | [string, string][],
    ) => (
        <Label className="grid gap-1.5 text-xs text-muted-foreground">
            {label}
            <FormSelect
                key={String(filters[name])}
                name={name}
                defaultValue={String(filters[name])}
                onValueChange={apply}
                className="min-w-32 bg-background text-sm text-foreground"
            >
                {(Array.isArray(options) ? options : Object.entries(options)).map(
                    ([value, text]) => (
                        <FormSelectItem key={value} value={value}>
                            {text}
                        </FormSelectItem>
                    ),
                )}
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
                      gemLevel: filters.gemLevel,
                      gemQuality: filters.gemQuality,
                      gemTransfigured: filters.gemTransfigured,
                      gemVaal: filters.gemVaal,
                      mapMods: filters.mapMods,
                      mapQuantity: filters.mapQuantity,
                      mapDelirium: filters.mapDelirium,
                      mapInfluence: filters.mapInfluence,
                      page: filters.page,
                      identified: filters.identified,
                      corrupted: filters.corrupted,
                      kind: filters.kind,
                      value: filters.value,
                      // An empty `links` would fail validation; omitted, link counts merge.
                      ...(filters.links ? { links: filters.links } : {}),
                  }).map(([name, value]) => (
                      <Input key={name} type="hidden" name={name} value={value} />
                  ))
                : null}
            <div className="flex flex-wrap items-end gap-3">
                {select("realm", "Realm", {
                    pc: "PC",
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
                {/* Crafting bases always count merchant tabs only. */}
                {isMarketBaseCategory(filters.category)
                    ? null
                    : select("tab", "Stash tabs", MARKET_TABS)}
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
                    {marketHasIdentification(filters.category)
                        ? select("identification", "Identification", {
                              all: "Any identification",
                              true: "Identified",
                              false: "Unidentified",
                          })
                        : null}
                    {/* Skill gems choose corruption among their own filters. */}
                    {!marketHasCorruption(filters.category) || gems
                        ? null
                        : select("corruption", "Corruption", {
                              all: "Any corruption",
                              false: "Uncorrupted",
                              true: "Corrupted",
                          })}
                </div>
            ) : null}
            {!item && gems ? <MarketGemFilters filters={filters} onChange={apply} /> : null}
            {!item && filters.category === "maps" ? (
                <MarketMapFilters filters={filters} onChange={apply} />
            ) : null}
            {!item && baseClasses ? (
                <div className="flex flex-wrap items-end gap-3">
                    {select("baseClass", "Type", {
                        "": "Any type",
                        ...Object.fromEntries(baseClasses.map((name) => [name, name])),
                    })}
                    {baseCategory === "armour-bases"
                        ? select("attributes", "Attributes", {
                              "": "Any attributes",
                              ...MARKET_BASE_ATTRIBUTE_SETS,
                          })
                        : null}
                    {uniques
                        ? null
                        : select("ilvl", "Item level", [
                              ["", "Any item level"],
                              ...(filters.category === MARKET_CLUSTER_BASE_CATEGORY
                                  ? MARKET_CLUSTER_LEVEL_BANDS.map(
                                        ({ min, max }): [string, string] => [
                                            String(min),
                                            max === 100 ? `ilvl ${min}+` : `ilvl ${min}–${max}`,
                                        ],
                                    )
                                  : MARKET_BASE_LEVELS.map((level): [string, string] => [
                                        level,
                                        level === "86" ? "ilvl 86+" : `ilvl ${level}`,
                                    ])),
                          ])}
                    {uniques ||
                    !baseClasses.some((name) => MARKET_BASE_LINK_CLASSES.includes(name)) ||
                    (filters.baseClass && !MARKET_BASE_LINK_CLASSES.includes(filters.baseClass))
                        ? null
                        : select("baseLinks", "Links", [
                              ["", "Any links"],
                              ["1-5", "1–5 links"],
                              ["6", "6 links"],
                          ])}
                    {filters.category === "armour-bases"
                        ? select("quality", "Quality", [
                              ["", "Any quality"],
                              ["25", "25%+ quality"],
                              ["30", "30%+ quality"],
                          ])
                        : null}
                </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                    Prices sort by the value each row shows, at the exchange rate of the hour it was
                    listed, and filter in{" "}
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

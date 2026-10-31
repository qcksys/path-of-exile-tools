import {
    exchangeListingCurrencySchema,
    formatGemBandFilter,
    type GemBandState,
    parseGemBandFilter,
} from "@poe-tools/market";
import { CheckIcon, XIcon } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Form, useLocation, useNavigation, useSearchParams, useSubmit } from "react-router";
import { CurrencyLabel } from "~/components/currency-label";
import { Button } from "~/components/ui/button";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { MARKET_PERIODS, MARKET_REALMS } from "~/schemas/market";

const APPLY_DELAY_MS = 400;

/** Submits a filter form shortly after a control changes, so several quick changes load once. */
function useMarketFormApply() {
    const submit = useSubmit();
    const form = useRef<HTMLFormElement>(null);
    const pending = useRef<ReturnType<typeof setTimeout>>(undefined);
    const apply = useCallback(() => {
        clearTimeout(pending.current);
        pending.current = setTimeout(() => {
            if (form.current) submit(form.current);
        }, APPLY_DELAY_MS);
    }, [submit]);
    useEffect(() => () => clearTimeout(pending.current), []);
    return { form, apply };
}

/** Pass entries where values look like integers: objects list integer keys before "". */
export function MarketSelect({
    name,
    label,
    value,
    options,
    onChange,
}: {
    name: string;
    label: string;
    value: string;
    options: Record<string, string> | [string, string][];
    onChange: () => void;
}) {
    return (
        <Label className="grid gap-1.5 text-xs text-muted-foreground">
            {label}
            <FormSelect
                key={value}
                name={name}
                defaultValue={value}
                onValueChange={onChange}
                className="min-w-32 bg-background text-sm text-foreground"
            >
                {(Array.isArray(options) ? options : Object.entries(options)).map(
                    ([option, text]) => (
                        <FormSelectItem key={option} value={option}>
                            {text}
                        </FormSelectItem>
                    ),
                )}
            </FormSelect>
        </Label>
    );
}

function MarketCurrencySelect({
    value,
    game,
    onChange,
}: {
    value: string;
    game: "poe1" | "poe2";
    onChange: () => void;
}) {
    const currencies = [...new Set([...exchangeListingCurrencySchema.options, value])].filter(
        Boolean,
    );
    return (
        <Label className="grid gap-1.5 text-xs text-muted-foreground">
            Price currency
            <FormSelect
                key={value}
                name="currency"
                defaultValue={value}
                onValueChange={onChange}
                className="min-w-32 bg-background text-sm text-foreground"
            >
                {currencies.map((currency) => (
                    <FormSelectItem key={currency} value={currency}>
                        <CurrencyLabel currency={currency} game={game} />
                    </FormSelectItem>
                ))}
            </FormSelect>
        </Label>
    );
}

/** The season options, keeping a league the seasons leave out so the select can show it. */
function marketSeasonOptions(league: string, seasons: { league: string }[]) {
    return {
        "": "Latest available",
        ...Object.fromEntries(
            [league, ...seasons.map((season) => season.league)]
                .filter(Boolean)
                .map((name) => [name, name]),
        ),
    };
}

/** The controls every market form starts with; a page shows those it passes. */
type MarketScope = {
    league: string;
    seasons: { league: string }[];
    days?: string;
    realm?: string;
    currency?: string;
    game: "poe1" | "poe2";
};

function MarketScopeControls({
    league,
    seasons,
    days,
    realm,
    currency,
    game,
    onChange,
}: MarketScope & { onChange: () => void }) {
    return (
        <>
            {realm === undefined ? null : (
                <MarketSelect
                    name="realm"
                    label="Realm"
                    value={realm}
                    options={MARKET_REALMS}
                    onChange={onChange}
                />
            )}
            <MarketSelect
                name="league"
                label="Season"
                value={league}
                options={marketSeasonOptions(league, seasons)}
                onChange={onChange}
            />
            {days === undefined ? null : (
                <MarketSelect
                    name="days"
                    label="Period"
                    value={days}
                    options={MARKET_PERIODS}
                    onChange={onChange}
                />
            )}
            {currency === undefined ? null : (
                <MarketCurrencySelect value={currency} game={game} onChange={onChange} />
            )}
        </>
    );
}

function MarketFormStatus() {
    const navigation = useNavigation();
    return (
        <p role="status" className="text-xs text-muted-foreground">
            {navigation.state === "idle" ? null : "Loading…"}
        </p>
    );
}

/**
 * The controls of every market detail page. Every other search parameter stays in the URL for the
 * way back to the list.
 */
export function MarketDetailFilters(scope: MarketScope & { days: string }) {
    const { pathname } = useLocation();
    const [params] = useSearchParams();
    const { form, apply } = useMarketFormApply();
    const controls = new Set([
        "league",
        "days",
        ...(scope.realm === undefined ? [] : ["realm"]),
        ...(scope.currency === undefined ? [] : ["currency"]),
    ]);
    return (
        <Form
            ref={form}
            method="get"
            action={pathname}
            className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4"
        >
            {[...params]
                .filter(([name]) => !controls.has(name))
                .map(([name, value]) => (
                    <Input key={name} type="hidden" name={name} value={value} />
                ))}
            <MarketScopeControls {...scope} onChange={apply} />
            <MarketFormStatus />
        </Form>
    );
}

/**
 * The filter form of every market list: its scope and search, then what the list adds through
 * `controls` (beside the search) and `children`.
 */
export function MarketListForm({
    action,
    hidden,
    q,
    placeholder,
    note,
    controls,
    children,
    ...scope
}: MarketScope & {
    action: string;
    /** Search parameters the form keeps without a control. */
    hidden?: Record<string, string | number | undefined>;
    q: string;
    placeholder: string;
    note?: ReactNode;
    controls?: (apply: () => void) => ReactNode;
    children?: (apply: () => void) => ReactNode;
}) {
    const { form, apply } = useMarketFormApply();
    // The search box keeps what the user is typing while their earlier text loads;
    // it only follows the URL (e.g. a table column filter) when it isn't focused.
    const search = useRef<HTMLInputElement>(null);
    const [text, setText] = useState(q);
    useEffect(() => {
        if (document.activeElement !== search.current) setText(q);
    }, [q]);
    return (
        <Form
            ref={form}
            method="get"
            action={action}
            className="space-y-4 rounded-xl border border-border bg-card p-4"
        >
            {Object.entries(hidden ?? {}).map(([name, value]) =>
                value === undefined ? null : (
                    <Input key={name} type="hidden" name={name} value={value} />
                ),
            )}
            <div className="flex flex-wrap items-end gap-3">
                <MarketScopeControls {...scope} onChange={apply} />
            </div>
            <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
                <Label className="grid min-w-48 flex-1 gap-1.5 text-xs text-muted-foreground">
                    Search items
                    <Input
                        ref={search}
                        type="search"
                        name="q"
                        value={text}
                        onChange={(event) => {
                            setText(event.target.value);
                            apply();
                        }}
                        placeholder={placeholder}
                        maxLength={100}
                        className="bg-background text-foreground"
                    />
                </Label>
                {controls?.(apply)}
            </div>
            {children?.(apply)}
            <div className="flex flex-wrap items-center justify-between gap-3">
                {note ? <p className="text-xs text-muted-foreground">{note}</p> : <span />}
                <MarketFormStatus />
            </div>
        </Form>
    );
}

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
export function BandToggles({
    name,
    legend,
    bands,
    labels,
    value,
    shown,
    onChange,
}: {
    name: string;
    legend: string;
    bands: readonly string[];
    labels: readonly string[];
    value: string;
    /** Only these bands get a toggle, plus any already set; with one left to choose, none do. */
    shown?: ReadonlySet<string>;
    onChange: (value: string) => void;
}) {
    const [current, setCurrent] = useState(value);
    useEffect(() => setCurrent(value), [value]);
    const filter = parseGemBandFilter(current, bands);
    const stateOf = (band: string): ToggleState =>
        filter?.include.has(band) ? "include" : filter?.exclude.has(band) ? "exclude" : undefined;
    const visible = (band: string) => !shown || shown.has(band) || stateOf(band) !== undefined;
    if (shown && !current && bands.filter(visible).length < 2) return null;
    return (
        <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-xs text-muted-foreground">{legend}</legend>
            <Input type="hidden" name={name} value={current} />
            <div className="flex flex-wrap gap-1.5">
                {bands.map((band, index) =>
                    visible(band) ? (
                        <TriStateToggle
                            key={band}
                            label={labels[index]!}
                            state={stateOf(band)}
                            onChange={(state) => {
                                const next = formatGemBandFilter({
                                    ...Object.fromEntries(
                                        bands.map((entry) => [entry, stateOf(entry)]),
                                    ),
                                    [band]: state,
                                });
                                setCurrent(next);
                                onChange(next);
                            }}
                        />
                    ) : null,
                )}
            </div>
        </fieldset>
    );
}

const FLAG_STATES = { true: "include", false: "exclude", all: undefined } as const;

/**
 * A yes/no filter (`all`, `true`, `false`) as one tri-state toggle: included lists only the markets
 * with the flag, excluded only those without it.
 */
export function FlagToggle({
    name,
    legend,
    label,
    value,
    onChange,
}: {
    name: string;
    legend: string;
    label: string;
    value: keyof typeof FLAG_STATES;
    onChange: (value: keyof typeof FLAG_STATES) => void;
}) {
    const [current, setCurrent] = useState(value);
    useEffect(() => setCurrent(value), [value]);
    return (
        <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-xs text-muted-foreground">{legend}</legend>
            <Input type="hidden" name={name} value={current} />
            <div className="flex gap-1.5">
                <TriStateToggle
                    label={label}
                    state={FLAG_STATES[current]}
                    onChange={(state) => {
                        const next =
                            state === "include" ? "true" : state === "exclude" ? "false" : "all";
                        setCurrent(next);
                        onChange(next);
                    }}
                />
            </div>
        </fieldset>
    );
}

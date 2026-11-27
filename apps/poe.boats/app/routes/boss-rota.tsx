import { useMemo } from "react";
import { Form, Link } from "react-router";
import { bossMoney as money } from "~/components/boss-money";
import { BossRotaTracker, useBossPace } from "~/components/boss-rota-tracker";
import { CurrencyLabel } from "~/components/currency-label";
import { DataTable, dataTableColumns } from "~/components/data-table";
import { CatalogItemArt, ItemArt } from "~/components/item-art";
import { RouteError } from "~/components/route-error";
import { Button } from "~/components/ui/button";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";
import { dbContext } from "~/context";
import { PROFIT_TRIALS } from "~/lib/boss-profit-chances";
import { netPerHour } from "~/lib/boss-rota-log";
import { marketItemArtUrl } from "~/lib/item-presentation";
import { marketNumber } from "~/lib/market-number";
import type { SiteHandle } from "~/routes/layouts/site";
import {
    type BossOrder,
    type BossRotaResult,
    bossRotaInputSchema,
    PROFIT_RUNS,
} from "~/schemas/boss-rota";
import { loadBossRota } from "~/services/boss-rota.server";
import type { Route } from "./+types/boss-rota";

export const handle = { section: "PoE 1" } satisfies SiteHandle;
export function meta() {
    return [{ title: "Boss Rota Profits · POE.BOATS" }];
}
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    return <RouteError error={error} />;
}
export async function loader({ request, context, params }: Route.LoaderArgs) {
    const input = bossRotaInputSchema.safeParse({
        ...Object.fromEntries(new URL(request.url).searchParams),
        boss: params.boss,
    });
    if (!input.success)
        throw new Response(null, { status: 400, statusText: "Invalid boss, league or kill count" });
    return {
        ...input.data,
        result: await loadBossRota(context.get(dbContext), input.data),
    };
}

type Encounter = BossRotaResult["encounters"][number];
type RotaItem = Encounter["entries"][number];
const itemColumn = dataTableColumns<RotaItem>();

function BossArt({ boss }: { boss: Encounter }) {
    if (boss.icon)
        return (
            <img src={boss.icon} alt="" width={32} height={32} className="size-8 object-contain" />
        );
    const entry = boss.entries[0];
    if (!entry) return null;
    return entry.market?.iconAsset ? (
        <ItemArt
            src={marketItemArtUrl(entry.market.iconAsset)}
            name={entry.name}
            className="size-8"
            decorative
        />
    ) : (
        <CatalogItemArt
            id={entry.market?.itemId}
            name={entry.market?.artName ?? entry.name}
            game="poe1"
        />
    );
}

function QuoteActivity({ quote }: { quote: RotaItem["quote"] }) {
    if (!quote) return <span className="text-muted-foreground">Unpriced</span>;
    const observed = new Date(quote.hour * 1000).toISOString();
    return (
        <div className="mt-1 grid gap-0.5 whitespace-normal text-xs text-muted-foreground">
            {quote.source === "exchange" ? (
                <span>
                    {quote.units24h === undefined
                        ? "Volume unavailable"
                        : `${marketNumber(quote.units24h / 24)} units/h · ${marketNumber(quote.units24h)} traded / 24h`}
                </span>
            ) : (
                <>
                    <span>
                        {quote.listings === undefined
                            ? "Listing count unavailable"
                            : `${marketNumber(quote.listings)} listed in quote hour`}
                    </span>
                    <span
                        className={
                            quote.likelySales24h === 0 ? "font-medium text-foreground" : undefined
                        }
                    >
                        {quote.likelySales24h === undefined
                            ? "Sales unavailable"
                            : `${marketNumber(quote.likelySales24h)} likely sales / 24h`}
                    </span>
                </>
            )}
            <time dateTime={observed}>
                {quote.source === "exchange" ? "Exchange" : "Merchant ask"} ·{" "}
                {observed.slice(0, 16).replace("T", " ")} UTC
            </time>
        </div>
    );
}

function ItemTable({
    entries,
    items,
    title,
    divine,
    poolValue,
    pricedLoot,
}: {
    entries?: boolean;
    items: RotaItem[];
    title: string;
    divine: number | null;
    poolValue?: Encounter["poolValues"][number];
    pricedLoot?: number | null;
}) {
    const columns = useMemo(
        () =>
            itemColumn.columns([
                itemColumn.accessor("name", {
                    header: "Item",
                    meta: { filter: "text" },
                    cell: ({ row: { original: item } }) =>
                        item.market ? (
                            <Link
                                to={item.market.href}
                                className="inline-flex items-center gap-2 font-medium text-primary hover:underline"
                                title={
                                    item.market.exact ? "Open this market" : "Browse item variants"
                                }
                            >
                                {item.market.iconAsset ? (
                                    <ItemArt
                                        src={marketItemArtUrl(item.market.iconAsset)}
                                        name={item.name}
                                        className="size-7"
                                        decorative
                                    />
                                ) : (
                                    <CatalogItemArt
                                        id={item.market.itemId}
                                        name={item.market.artName}
                                    />
                                )}
                                <span className="whitespace-normal">{item.name}</span>
                            </Link>
                        ) : (
                            item.name
                        ),
                }),
                itemColumn.accessor("quantityPerKill", {
                    enableColumnFilter: false,
                    header: entries ? "Per kill" : "Chance",
                    sortDescFirst: true,
                    cell: ({ getValue }) =>
                        entries ? getValue() : `${marketNumber(getValue() * 100)}%`,
                }),
                itemColumn.accessor((item) => item.quote?.unitChaos, {
                    id: "unit",
                    enableColumnFilter: false,
                    header: "Unit price",
                    sortDescFirst: true,
                    sortUndefined: "last",
                    cell: ({ row: { original: item } }) => (
                        <>
                            {item.quote && money(divine, item.quote.unitChaos)}
                            <QuoteActivity quote={item.quote} />
                        </>
                    ),
                }),
                itemColumn.accessor((item) => item.valueChaos ?? undefined, {
                    id: "value",
                    enableColumnFilter: false,
                    header: "Value per kill",
                    sortDescFirst: true,
                    sortUndefined: "last",
                    cell: ({ row: { original: item } }) => (
                        <>
                            {money(divine, item.valueChaos)}
                            {!!pricedLoot && item.valueChaos !== null && (
                                <small className="block text-muted-foreground">
                                    {marketNumber((100 * item.valueChaos) / pricedLoot)}% of priced
                                    loot
                                </small>
                            )}
                        </>
                    ),
                }),
            ]),
        [entries, divine, pricedLoot],
    );
    return (
        <section className="min-w-0">
            <h3 className="mb-1 font-heading text-lg font-semibold">{title}</h3>
            {poolValue && (
                <p className="mb-2 text-sm text-muted-foreground">
                    {money(
                        divine,
                        poolValue.fullyPriced ? poolValue.pricedChaosPerKill : null,
                        poolValue.pricedChaosPerKill,
                    )}{" "}
                    per kill
                    {poolValue.shareOfPricedLoot !== null &&
                        ` · ${marketNumber(100 * poolValue.shareOfPricedLoot)}% of priced loot`}
                </p>
            )}
            <DataTable label={title} data={items} columns={columns} getRowId={(row) => row.name} />
        </section>
    );
}

export default function BossRotaPage({
    loaderData: { boss, result, q, pricing, order, direction },
}: Pick<Route.ComponentProps, "loaderData">) {
    const { leagues, league, runs, encounters, chaosPerDivine: divine } = result;
    const [pace, savePace] = useBossPace(league);
    const selected = boss === "all" ? undefined : encounters[0];
    const link = (id: string, sort = order, dir = direction) => {
        const path = id === "all" ? "/1/boss-rota" : `/1/boss-rota/${id}`;
        return `${path}?${new URLSearchParams({ league, runs: String(runs), ...(q && { q }), pricing, order: sort, direction: dir })}`;
    };
    function heading(label: string, key: BossOrder) {
        const active = order === key;
        const next = active
            ? direction === "asc"
                ? "desc"
                : "asc"
            : key === "name"
              ? "asc"
              : "desc";
        return (
            <TableHead
                key={key}
                scope="col"
                aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : undefined}
            >
                {boss === "all" ? (
                    <Link
                        to={link("all", key, next)}
                        className="inline-flex items-center gap-1 hover:underline"
                        aria-label={`Sort by ${label}`}
                    >
                        {label}
                        <span aria-hidden="true">
                            {active ? (direction === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                    </Link>
                ) : (
                    label
                )}
            </TableHead>
        );
    }
    const kills = runs === 1 ? "1 kill" : `${marketNumber(runs)} kills`;
    return (
        <main className="mx-auto flex w-full min-w-0 max-w-[104rem] flex-1 flex-col gap-6 px-4 py-8">
            <header className="space-y-2">
                <h1 className="flex items-center gap-2 font-heading text-3xl font-bold">
                    {selected && <BossArt boss={selected} />}
                    {selected ? `${selected.name} rota` : "Boss rota profits"}
                </h1>
                <p className="text-muted-foreground">
                    One player pays for each entry set and keeps all drops from that instance.
                </p>
            </header>
            <Form
                key={`${league}-${runs}-${boss}-${q}-${pricing}`}
                method="get"
                className="flex flex-wrap items-end gap-3"
            >
                <Input type="hidden" name="order" value={order} />
                <Input type="hidden" name="direction" value={direction} />
                {boss === "all" ? (
                    <label htmlFor="boss-pricing" className="grid gap-1 text-sm">
                        Price coverage
                        <FormSelect id="boss-pricing" name="pricing" defaultValue={pricing}>
                            <FormSelectItem value="all">All bosses</FormSelectItem>
                            <FormSelectItem value="complete">Fully priced</FormSelectItem>
                            <FormSelectItem value="partial">Priced drops only</FormSelectItem>
                            <FormSelectItem value="unknown">Unknown profit</FormSelectItem>
                        </FormSelect>
                    </label>
                ) : (
                    <Input type="hidden" name="pricing" value={pricing} />
                )}
                {boss === "all" ? (
                    <label htmlFor="boss-filter" className="grid gap-1 text-sm">
                        Filter bosses
                        <Input
                            id="boss-filter"
                            type="search"
                            name="q"
                            defaultValue={q}
                            placeholder="Boss name"
                            maxLength={100}
                        />
                    </label>
                ) : (
                    <Input type="hidden" name="q" value={q} />
                )}
                <label htmlFor="boss-league" className="grid gap-1 text-sm">
                    PC league
                    <FormSelect
                        id="boss-league"
                        name="league"
                        defaultValue={leagues.includes(league) ? league : leagues[0]}
                        disabled={!leagues.length}
                    >
                        {leagues.map((name) => (
                            <FormSelectItem key={name} value={name}>
                                {name}
                            </FormSelectItem>
                        ))}
                    </FormSelect>
                </label>
                <label htmlFor="boss-kills" className="grid w-28 gap-1 text-sm">
                    Kills
                    <Input
                        id="boss-kills"
                        name="runs"
                        type="number"
                        required
                        min={1}
                        max={10000}
                        defaultValue={runs}
                    />
                </label>
                <Button type="submit" disabled={!leagues.length}>
                    Calculate
                </Button>
                {boss !== "all" && (
                    <Link to={link("all")} className="text-sm text-primary underline">
                        All bosses
                    </Link>
                )}
            </Form>
            {encounters.length ? (
                <>
                    <section>
                        <h2 className="mb-2 font-heading text-xl font-semibold">
                            Expected return for {kills}
                        </h2>
                        <Table className="tabular-nums">
                            <TableHeader>
                                <TableRow>
                                    <TableHead colSpan={runs > 1 ? 6 : 5} scope="colgroup">
                                        Expected value
                                    </TableHead>
                                    <TableHead colSpan={PROFIT_RUNS.length} scope="colgroup">
                                        Chance to profit · average net return
                                    </TableHead>
                                </TableRow>
                                <TableRow>
                                    {heading("Boss", "name")}
                                    {heading("Entry cost", "cost")}
                                    {heading("Loot value", "loot")}
                                    {heading("Net per kill", "profit")}
                                    {runs > 1 && heading(`Net for ${kills}`, "total")}
                                    {heading("Drops priced", "coverage")}
                                    {PROFIT_RUNS.map((n) =>
                                        heading(`${n} ${n === 1 ? "run" : "runs"}`, `chance${n}`),
                                    )}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {encounters.map((encounter) => {
                                    const { id, name, drops, perKill, total, profitChances } =
                                        encounter;
                                    return (
                                        <TableRow key={id}>
                                            <TableCell>
                                                {selected ? (
                                                    name
                                                ) : (
                                                    <Link
                                                        to={link(id)}
                                                        className="inline-flex items-center gap-2 font-medium text-primary underline"
                                                    >
                                                        <BossArt boss={encounter} />
                                                        {name}
                                                    </Link>
                                                )}
                                            </TableCell>
                                            <TableCell>{money(divine, total.entryChaos)}</TableCell>
                                            <TableCell>
                                                {money(
                                                    divine,
                                                    total.lootChaos,
                                                    total.pricedLootChaos,
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {money(
                                                    divine,
                                                    perKill.profitChaos,
                                                    perKill.profitFromPricedDropsChaos,
                                                )}
                                                {pace[id] && (
                                                    <small className="block text-muted-foreground">
                                                        {money(
                                                            divine,
                                                            netPerHour(
                                                                perKill.profitChaos,
                                                                pace[id],
                                                            ),
                                                            netPerHour(
                                                                perKill.profitFromPricedDropsChaos,
                                                                pace[id],
                                                            ),
                                                        )}
                                                        /hour
                                                    </small>
                                                )}
                                            </TableCell>
                                            {runs > 1 && (
                                                <TableCell className="font-medium">
                                                    {money(
                                                        divine,
                                                        total.profitChaos,
                                                        total.profitFromPricedDropsChaos,
                                                    )}
                                                </TableCell>
                                            )}
                                            <TableCell>
                                                {drops.filter((row) => row.quote).length} /{" "}
                                                {drops.length}
                                            </TableCell>
                                            {profitChances.map(
                                                ({
                                                    runs: horizon,
                                                    chance,
                                                    averageNetChaos,
                                                    pricedAverageNetChaos,
                                                }) => (
                                                    <TableCell key={horizon}>
                                                        {chance === null
                                                            ? "Unknown"
                                                            : `${total.lootChaos === null ? "≥ " : ""}${marketNumber(100 * chance)}%`}
                                                        <small
                                                            className="block text-muted-foreground"
                                                            title={`Average net for ${horizon} runs`}
                                                        >
                                                            {money(
                                                                divine,
                                                                averageNetChaos,
                                                                pricedAverageNetChaos,
                                                            )}
                                                        </small>
                                                    </TableCell>
                                                ),
                                            )}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                        <p className="mt-3 text-sm text-muted-foreground">
                            ≥ counts only priced drops. A missing entry price leaves net profit
                            unknown. Chance to profit means total loot exceeds the full entry cost.
                            One-run odds use the drop distribution. Longer rotas use{" "}
                            {marketNumber(PROFIT_TRIALS)} simulated rotas each. Average net is the
                            expected total after entry costs for that many runs.
                            {divine !== null && (
                                <>
                                    {" "}
                                    1{" "}
                                    <CurrencyLabel
                                        currency="divine"
                                        label="Divine Orb"
                                        game="poe1"
                                        iconOnly
                                    />{" "}
                                    = {marketNumber(divine)}{" "}
                                    <CurrencyLabel
                                        currency="chaos"
                                        label="Chaos Orbs"
                                        game="poe1"
                                        iconOnly
                                    />
                                    .
                                </>
                            )}
                        </p>
                    </section>
                    {selected && (
                        <>
                            <BossRotaTracker
                                key={league + selected.id}
                                boss={selected}
                                league={league}
                                runs={runs}
                                divine={divine}
                                seconds={pace[selected.id] ?? null}
                                setSeconds={(seconds) =>
                                    savePace((previous) => {
                                        const next = { ...previous };
                                        if (seconds === null) delete next[selected.id];
                                        else next[selected.id] = seconds;
                                        return next;
                                    })
                                }
                            />
                            <ItemTable
                                entries
                                title="Entry set"
                                items={selected.entries}
                                divine={divine}
                            />
                            <h2 className="font-heading text-xl font-semibold">Expected drops</h2>
                            {selected.perKill.pricedLootChaos !== null && (
                                <p className="text-sm">
                                    {money(divine, selected.perKill.pricedLootChaos)} of priced loot
                                    per kill. {money(divine, selected.askOnlyChaosPerKill)} comes
                                    from merchant asks with zero likely sales in the observed 24
                                    hours.
                                </p>
                            )}
                            {selected.quantityBonus > 0 && (
                                <p className="text-sm">
                                    Extra drop chances include the source's {selected.quantityBonus}
                                    % invitation quantity bonus.
                                </p>
                            )}
                            <div className="grid items-start gap-x-6 gap-y-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,38rem),1fr))]">
                                {selected.poolValues.map((value) => (
                                    <ItemTable
                                        key={value.pool}
                                        title={value.pool}
                                        poolValue={value}
                                        pricedLoot={selected.perKill.pricedLootChaos}
                                        items={selected.drops.filter(
                                            (item) => item.pool === value.pool,
                                        )}
                                        divine={divine}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </>
            ) : (
                <p role="status">
                    {(q || pricing !== "all") && leagues.includes(league)
                        ? "No bosses match this filter."
                        : leagues.length
                          ? "This league is unavailable. Choose a listed league."
                          : "No PoE 1 PC league has captured market prices yet."}
                </p>
            )}
            <p className="max-w-3xl text-sm text-muted-foreground">
                Prices use this league’s exchange trades and merchant asking prices. Merchant quotes
                use the newest listed hour in the last 24 completed hours. Likely sales are inferred
                from stash changes. Exchange volume shows units traded across its observed 24-hour
                window. Drop rates use the {result.rates.capturedOn} estimates from{" "}
                <a href={result.rates.source} className="text-primary underline">
                    Perandus Ledger
                </a>
                .
            </p>
        </main>
    );
}

import { useMemo } from "react";
import { Form, Link } from "react-router";
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
import { marketItemArtUrl } from "~/lib/item-presentation";
import { marketNumber } from "~/lib/market-number";
import type { SiteHandle } from "~/routes/layouts/site";
import {
    type BossOrder,
    type BossRotaResult,
    bossRotaInputSchema,
    DROP_POOLS,
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

function money(divine: number | null, value: number | null, priced: number | null = null) {
    const amount = value ?? priced;
    if (amount === null) return "Unknown";
    const prefix = value === null ? "≥ " : "";
    if (divine && Math.abs(amount) >= divine)
        return (
            <span title={`${marketNumber(amount)} c`}>
                {prefix}
                {marketNumber(amount / divine)} div
            </span>
        );
    return `${prefix}${marketNumber(amount)} c`;
}

type RotaItem = BossRotaResult["encounters"][number]["entries"][number];
const itemColumn = dataTableColumns<RotaItem>();

function ItemTable({
    entries,
    items,
    title,
    divine,
}: {
    entries?: boolean;
    items: RotaItem[];
    title: string;
    divine: number | null;
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
                                {item.name}
                            </Link>
                        ) : (
                            item.name
                        ),
                }),
                itemColumn.accessor("quantityPerKill", {
                    enableColumnFilter: false,
                    header: entries ? "Required per kill" : "Drop chance",
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
                    cell: ({ getValue }) => money(divine, getValue() ?? null),
                }),
                itemColumn.accessor((item) => item.valueChaos ?? undefined, {
                    id: "value",
                    enableColumnFilter: false,
                    header: "Value per kill",
                    sortDescFirst: true,
                    sortUndefined: "last",
                    cell: ({ getValue }) => money(divine, getValue() ?? null),
                }),
                itemColumn.accessor((item) => item.quote?.hour, {
                    id: "hour",
                    enableColumnFilter: false,
                    header: "Quote observed (UTC)",
                    sortDescFirst: true,
                    sortUndefined: "last",
                    cell: ({
                        row: {
                            original: { quote },
                        },
                    }) =>
                        quote
                            ? `${quote.source === "exchange" ? "Exchange" : "Merchant ask"} · ${new Date(quote.hour * 1000).toISOString().slice(0, 16).replace("T", " ")}`
                            : "Unpriced",
                }),
            ]),
        [entries, divine],
    );
    return (
        <section>
            <h3 className="mb-2 font-heading text-lg font-semibold">{title}</h3>
            <DataTable label={title} data={items} columns={columns} getRowId={(row) => row.name} />
        </section>
    );
}

export default function BossRotaPage({
    loaderData: { boss, result, q, pricing, order, direction },
}: Pick<Route.ComponentProps, "loaderData">) {
    const { leagues, league, runs, encounters, chaosPerDivine: divine } = result;
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
        <main className="container mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
            <header className="space-y-2">
                <h1 className="font-heading text-3xl font-bold">
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
                                        Chance to profit
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
                                {encounters.map(
                                    ({ id, name, drops, perKill, total, profitChances }) => (
                                        <TableRow key={id}>
                                            <TableCell>
                                                {selected ? (
                                                    name
                                                ) : (
                                                    <Link
                                                        to={link(id)}
                                                        className="font-medium text-primary underline"
                                                    >
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
                                            {profitChances.map(({ runs: horizon, chance }) => (
                                                <TableCell key={horizon}>
                                                    {chance === null
                                                        ? "Unknown"
                                                        : `${total.lootChaos === null ? "≥ " : ""}${marketNumber(100 * chance)}%`}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ),
                                )}
                            </TableBody>
                        </Table>
                        <p className="mt-3 text-sm text-muted-foreground">
                            ≥ counts only priced drops. A missing entry price leaves net profit
                            unknown. Chance to profit means total loot exceeds the full entry cost.
                            One-run odds use the drop distribution. Longer rotas use{" "}
                            {marketNumber(PROFIT_TRIALS)} simulated rotas each.
                            {divine && ` 1 div = ${marketNumber(divine)} c.`}
                        </p>
                    </section>
                    {selected && (
                        <>
                            <ItemTable
                                entries
                                title="Entry set"
                                items={selected.entries}
                                divine={divine}
                            />
                            <h2 className="font-heading text-xl font-semibold">Expected drops</h2>
                            {selected.quantityBonus > 0 && (
                                <p className="text-sm">
                                    Extra drop chances include the source's {selected.quantityBonus}
                                    % invitation quantity bonus.
                                </p>
                            )}
                            {DROP_POOLS.map((pool) => {
                                const items = selected.drops.filter((item) => item.pool === pool);
                                return items.length ? (
                                    <ItemTable
                                        key={pool}
                                        title={pool}
                                        items={items}
                                        divine={divine}
                                    />
                                ) : null;
                            })}
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
                use the newest listed hour in the last 24 completed hours. Drop rates use the{" "}
                {result.rates.capturedOn} estimates from{" "}
                <a href={result.rates.source} className="text-primary underline">
                    Perandus Ledger
                </a>
                .
            </p>
        </main>
    );
}

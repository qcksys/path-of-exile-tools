import { Form, Link } from "react-router";
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
import { marketNumber } from "~/lib/market-number";
import type { SiteHandle } from "~/routes/layouts/site";
import { type BossRotaResult, bossRotaInputSchema } from "~/schemas/boss-rota";
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
        boss: input.data.boss,
        result: await loadBossRota(context.get(dbContext), input.data),
    };
}

function chaos(value: number | null, priced: number | null = null) {
    if (value !== null) return `${marketNumber(value)} c`;
    return priced === null ? "Unknown" : `≥ ${marketNumber(priced)} c`;
}

function ItemTable({
    entries,
    items,
}: {
    entries?: boolean;
    items: BossRotaResult["encounters"][number]["drops"];
}) {
    return (
        <section>
            <h2 className="mb-2 font-heading text-xl font-semibold">
                {entries ? "Entry set" : "Expected drops"}
            </h2>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>{entries ? "Required per kill" : "Drop chance"}</TableHead>
                        <TableHead>Unit price</TableHead>
                        <TableHead>Value per kill</TableHead>
                        <TableHead>Quote observed (UTC)</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items.map((item) => (
                        <TableRow key={item.name}>
                            <TableCell>{item.name}</TableCell>
                            <TableCell>
                                {entries
                                    ? item.quantityPerKill
                                    : `${marketNumber(item.quantityPerKill * 100)}%`}
                            </TableCell>
                            <TableCell>{chaos(item.quote?.unitChaos ?? null)}</TableCell>
                            <TableCell>{chaos(item.valueChaos)}</TableCell>
                            <TableCell>
                                {item.quote ? (
                                    <>
                                        {item.quote.source === "exchange"
                                            ? "Exchange"
                                            : "Merchant ask"}{" "}
                                        ·{" "}
                                        {new Date(item.quote.hour * 1000)
                                            .toISOString()
                                            .slice(0, 16)
                                            .replace("T", " ")}
                                    </>
                                ) : (
                                    "Unpriced"
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </section>
    );
}

export default function BossRotaPage({
    loaderData: { boss, result },
}: Pick<Route.ComponentProps, "loaderData">) {
    const { leagues, league, runs, encounters } = result;
    const selected = boss === "all" ? undefined : encounters[0];
    const link = (id: string) => {
        const path = id === "all" ? "/1/boss-rota" : `/1/boss-rota/${id}`;
        return `${path}?${new URLSearchParams({ league, runs: String(runs) })}`;
    };
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
                key={`${league}-${runs}-${boss}`}
                method="get"
                className="flex flex-wrap items-end gap-3"
            >
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
                                    <TableHead>Boss</TableHead>
                                    <TableHead>Entry cost</TableHead>
                                    <TableHead>Loot value</TableHead>
                                    <TableHead>Net per kill</TableHead>
                                    {runs > 1 && <TableHead>Net for {kills}</TableHead>}
                                    <TableHead>Drops priced</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {encounters.map(({ id, name, drops, perKill, total }) => (
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
                                        <TableCell>{chaos(total.entryChaos)}</TableCell>
                                        <TableCell>
                                            {chaos(total.lootChaos, total.pricedLootChaos)}
                                        </TableCell>
                                        <TableCell>
                                            {chaos(
                                                perKill.profitChaos,
                                                perKill.profitFromPricedDropsChaos,
                                            )}
                                        </TableCell>
                                        {runs > 1 && (
                                            <TableCell className="font-medium">
                                                {chaos(
                                                    total.profitChaos,
                                                    total.profitFromPricedDropsChaos,
                                                )}
                                            </TableCell>
                                        )}
                                        <TableCell>
                                            {drops.filter((row) => row.quote).length} /{" "}
                                            {drops.length}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <p className="mt-3 text-sm text-muted-foreground">
                            ≥ counts only priced drops. A missing entry price leaves net profit
                            unknown.
                        </p>
                    </section>
                    {selected && (
                        <>
                            <ItemTable entries items={selected.entries} />
                            {selected.quantityBonus > 0 && (
                                <p className="text-sm">
                                    Extra drop chances include the source's {selected.quantityBonus}
                                    % invitation quantity bonus.
                                </p>
                            )}
                            <ItemTable items={selected.drops} />
                        </>
                    )}
                </>
            ) : (
                <p role="status">
                    {leagues.length
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

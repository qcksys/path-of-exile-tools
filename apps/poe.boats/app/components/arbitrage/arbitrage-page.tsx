import { useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { AppFooter } from "~/components/app-footer";
import { AppHeader } from "~/components/app-header";
import { ManualRecipeCalculator } from "~/components/arbitrage/manual-recipe-calculator";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";
import { RECIPE_CATEGORY_LABELS } from "~/data/vendor-recipes";
import { buildRecipeTradeUrl, findArbitrage } from "~/lib/arbitrage";
import {
    ArbitrageOptionsSchema,
    DEFAULT_ARBITRAGE_OPTIONS,
    MARKET_CURRENCIES,
} from "~/schemas/arbitrage";
import type { ArbitrageMarketData } from "~/services/arbitrage.server";

const formatNumber = new Intl.NumberFormat("en", { maximumSignificantDigits: 4 });

export function ArbitragePage({ data }: { data: ArbitrageMarketData }) {
    const { game, leagues, league, recipes, snapshot, error } = data;
    const navigation = useNavigation();
    const [options, setOptions] = useState(DEFAULT_ARBITRAGE_OPTIONS);
    const [buffer, setBuffer] = useState("0");
    const [minimumProfit, setMinimumProfit] = useState("0");
    const parsed = ArbitrageOptionsSchema.safeParse({
        ...options,
        buffer: buffer.trim() ? Number(buffer) : Number.NaN,
        minimumProfit: options.showUnprofitable
            ? 0
            : minimumProfit.trim()
              ? Number(minimumProfit)
              : Number.NaN,
    });
    const results =
        snapshot && parsed.success ? findArbitrage(recipes, snapshot, parsed.data) : null;
    const currency = MARKET_CURRENCIES[game].short;
    const loading = navigation.state !== "idle";
    const categories = [...new Set(recipes.map((recipe) => recipe.category))];
    const invalidBuffer =
        !Number.isFinite(Number(buffer)) ||
        !buffer.trim() ||
        Number(buffer) < 0 ||
        Number(buffer) > 99;
    const invalidMinimum =
        !options.showUnprofitable &&
        (!Number.isFinite(Number(minimumProfit)) ||
            !minimumProfit.trim() ||
            Number(minimumProfit) < 0);
    const value = (amount: number) => `${formatNumber.format(amount)} ${currency}`;

    return (
        <div className="flex min-h-screen flex-col">
            <AppHeader section={`PoE ${game}`} />
            <main
                className="container mx-auto flex flex-1 flex-col gap-6 px-4 py-8"
                aria-busy={loading}
            >
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex flex-col gap-2">
                        <h1 className="font-heading text-3xl font-bold tracking-tight">
                            Vendor recipe arbitrage
                        </h1>
                        <p className="text-muted-foreground">
                            {game === "1"
                                ? "Compare vendor recipes and NPC purchases with player trade prices."
                                : "Buy ingredients, combine them at the Reforging Bench, then trade the result."}
                        </p>
                    </div>
                    <Link
                        to={`/${game === "1" ? "2" : "1"}/arbitrage`}
                        className={buttonVariants({ variant: "outline" })}
                    >
                        Switch to PoE {game === "1" ? "2" : "1"}
                    </Link>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Market and filters</CardTitle>
                        <CardDescription>
                            PC trade leagues · Prices from poe.ninja · All values in {currency}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-6">
                        <Form method="get" className="flex flex-wrap items-end gap-3">
                            <Field className="max-w-sm">
                                <FieldLabel htmlFor="league">League</FieldLabel>
                                <Select
                                    name="league"
                                    defaultValue={league || null}
                                    items={leagues.map((name) => ({ value: name, label: name }))}
                                >
                                    <SelectTrigger id="league" className="w-full">
                                        <SelectValue placeholder="Choose a league" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            {leagues.map((name) => (
                                                <SelectItem key={name} value={name}>
                                                    {name}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Button type="submit" disabled={loading}>
                                {loading ? "Loading prices…" : "Load prices"}
                            </Button>
                        </Form>
                        <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <Field>
                                <FieldLabel htmlFor="category">Recipe category</FieldLabel>
                                <Select
                                    value={options.category}
                                    onValueChange={(category) => {
                                        const result =
                                            ArbitrageOptionsSchema.shape.category.safeParse(
                                                category,
                                            );
                                        if (result.success)
                                            setOptions({ ...options, category: result.data });
                                    }}
                                    items={[
                                        { value: "all", label: "All recipes" },
                                        ...categories.map((category) => ({
                                            value: category,
                                            label: RECIPE_CATEGORY_LABELS[category],
                                        })),
                                    ]}
                                >
                                    <SelectTrigger id="category" className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem value="all">All recipes</SelectItem>
                                            {categories.map((category) => (
                                                <SelectItem key={category} value={category}>
                                                    {RECIPE_CATEGORY_LABELS[category]}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field data-invalid={invalidBuffer}>
                                <FieldLabel htmlFor="buffer">Price buffer (%)</FieldLabel>
                                <Input
                                    id="buffer"
                                    type="number"
                                    min="0"
                                    max="99"
                                    step="0.1"
                                    value={buffer}
                                    onChange={(event) => setBuffer(event.target.value)}
                                    aria-invalid={invalidBuffer}
                                    aria-describedby="buffer-help"
                                />
                                <FieldDescription id="buffer-help">
                                    Adds to buying cost and subtracts from sale value. Enter 0–99.
                                </FieldDescription>
                            </Field>
                            <Field data-invalid={invalidMinimum}>
                                <FieldLabel htmlFor="minimum-profit">
                                    Minimum profit ({currency})
                                </FieldLabel>
                                <Input
                                    id="minimum-profit"
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={minimumProfit}
                                    onChange={(event) => setMinimumProfit(event.target.value)}
                                    aria-invalid={invalidMinimum}
                                    disabled={options.showUnprofitable}
                                />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="sort">Sort by</FieldLabel>
                                <Select
                                    value={options.sort}
                                    onValueChange={(sort) => {
                                        const result =
                                            ArbitrageOptionsSchema.shape.sort.safeParse(sort);
                                        if (result.success)
                                            setOptions({ ...options, sort: result.data });
                                    }}
                                    items={[
                                        { value: "profit", label: "Highest profit" },
                                        { value: "roi", label: "Highest ROI" },
                                    ]}
                                >
                                    <SelectTrigger id="sort" className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem value="profit">Highest profit</SelectItem>
                                            <SelectItem value="roi">Highest ROI</SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>
                        </FieldGroup>
                        <Field orientation="horizontal">
                            <Checkbox
                                id="show-unprofitable"
                                checked={options.showUnprofitable}
                                onCheckedChange={(showUnprofitable) =>
                                    setOptions({ ...options, showUnprofitable })
                                }
                            />
                            <FieldLabel htmlFor="show-unprofitable">
                                Show all priced recipes, including losses
                            </FieldLabel>
                        </Field>
                    </CardContent>
                </Card>

                {error ? (
                    <Alert variant="destructive">
                        <AlertTitle>Market data unavailable</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}
                {snapshot?.unavailableCategories.length ? (
                    <Alert>
                        <AlertTitle>Some prices are unavailable</AlertTitle>
                        <AlertDescription>
                            Could not price{" "}
                            {snapshot.unavailableCategories
                                .map((category) => RECIPE_CATEGORY_LABELS[category])
                                .join(", ")}
                            . Other categories are still shown.
                        </AlertDescription>
                    </Alert>
                ) : null}
                {!parsed.success ? (
                    <Alert variant="destructive">
                        <AlertTitle>Check the filters</AlertTitle>
                        <AlertDescription>
                            Enter a price buffer from 0 to 99 and a non-negative minimum profit.
                        </AlertDescription>
                    </Alert>
                ) : null}

                {results ? (
                    <section className="flex flex-col gap-3" aria-label="Arbitrage results">
                        <div
                            className="flex flex-wrap items-center justify-between gap-2"
                            role="status"
                        >
                            <h2 className="text-xl font-semibold">
                                {results.opportunities.length}{" "}
                                {options.showUnprofitable ? "priced recipes" : "opportunities"}
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                {results.pricedCount} recipes priced ·{" "}
                                {results.missingPrices.length} missing prices
                            </p>
                        </div>
                        {results.opportunities.length ? (
                            <Table>
                                <TableCaption>
                                    Per recipe: adjusted sale value − adjusted input cost =
                                    estimated profit. ROI = profit ÷ cost.
                                </TableCaption>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Recipe</TableHead>
                                        <TableHead>Buy inputs</TableHead>
                                        <TableHead>Sell output</TableHead>
                                        <TableHead>Profit</TableHead>
                                        <TableHead>ROI</TableHead>
                                        <TableHead>Trade</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {results.opportunities.map((opportunity) => {
                                        const { recipe } = opportunity;
                                        return (
                                            <TableRow key={recipe.id}>
                                                <TableCell className="whitespace-normal min-w-64">
                                                    <div className="flex flex-col gap-1">
                                                        <a
                                                            href={recipe.source}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="font-medium underline underline-offset-4"
                                                        >
                                                            {recipe.input.quantity} ×{" "}
                                                            {recipe.input.name} →{" "}
                                                            {recipe.output.quantity} ×{" "}
                                                            {recipe.output.name}
                                                        </a>
                                                        <span className="text-xs text-muted-foreground">
                                                            {
                                                                RECIPE_CATEGORY_LABELS[
                                                                    recipe.category
                                                                ]
                                                            }
                                                        </span>
                                                        {recipe.method ? (
                                                            <Badge variant="secondary">
                                                                {recipe.method === "purchase"
                                                                    ? "NPC purchase"
                                                                    : "Sell to vendor"}{" "}
                                                                · Fixed currency amount
                                                            </Badge>
                                                        ) : null}
                                                        {recipe.notes ? (
                                                            <p className="max-w-sm text-xs text-muted-foreground">
                                                                {recipe.notes}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div>{value(opportunity.cost)}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {value(opportunity.inputUnitValue)} / item
                                                        before buffer
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div>{value(opportunity.revenue)}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {value(opportunity.outputUnitValue)} / item
                                                        before buffer
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant={
                                                            opportunity.profit > 0
                                                                ? "default"
                                                                : "secondary"
                                                        }
                                                    >
                                                        {value(opportunity.profit)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {formatNumber.format(opportunity.roi)}%
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex gap-3">
                                                        <a
                                                            href={buildRecipeTradeUrl(
                                                                game,
                                                                league,
                                                                recipe.input.id,
                                                            )}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="underline underline-offset-4"
                                                            aria-label={`Buy ${recipe.input.name}`}
                                                        >
                                                            Inputs
                                                        </a>
                                                        <a
                                                            href={buildRecipeTradeUrl(
                                                                game,
                                                                league,
                                                                recipe.output.id,
                                                            )}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="underline underline-offset-4"
                                                            aria-label={`Check ${recipe.output.name} listings`}
                                                        >
                                                            Output listings
                                                        </a>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        ) : (
                            <Empty>
                                <EmptyHeader>
                                    <EmptyTitle>
                                        {results.pricedCount
                                            ? "No recipes meet these filters"
                                            : "No fully priced recipes"}
                                    </EmptyTitle>
                                    <EmptyDescription>
                                        {results.pricedCount
                                            ? "Reduce the minimum profit or price buffer, or show all priced recipes."
                                            : "Try another league or retry when more market prices are available."}
                                    </EmptyDescription>
                                </EmptyHeader>
                            </Empty>
                        )}
                        {results.missingPrices.length ? (
                            <details className="text-sm text-muted-foreground">
                                <summary className="cursor-pointer">
                                    Recipes excluded because an input or output price is missing
                                </summary>
                                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                                    {results.missingPrices.map((recipe) => (
                                        <li key={recipe.id}>
                                            {recipe.input.name} → {recipe.output.name}
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        ) : null}
                    </section>
                ) : null}

                {game === "1" ? <ManualRecipeCalculator /> : null}

                <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                    <p>
                        These are market estimates, not executable offers. Check both sides of the
                        trade before buying. Gold costs, available stock, trade time, and changes in
                        price are not included.
                    </p>
                    <p>
                        {game === "1"
                            ? "Automatic estimates cover standard oils through Golden, essences through Deafening, NPC currency purchases, and currency-to-wisdom exchanges. Item-dependent and random 3-for-1 / 5-for-1 recipes use the separate calculator. Special oils are excluded."
                            : "Covers regular liquid emotions through Isolation, Lesser/regular essences, and Lesser/regular runes. Unlock the Reforging Bench in Act 3. Random rerolls, Ancient/Potent emotions, and equipment recipes are excluded."}
                    </p>
                    <p>
                        <a
                            href="https://poe.ninja"
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                        >
                            poe.ninja
                        </a>{" "}
                        prices are cached for up to five minutes.{" "}
                        {snapshot && Object.keys(snapshot.quotes).length > 0 ? (
                            <>
                                Oldest data fetched:{" "}
                                <time dateTime={snapshot.fetchedAt}>
                                    {snapshot.fetchedAt
                                        .replace("T", " ")
                                        .replace(/\.\d+Z$/, " UTC")}
                                </time>
                                . This is the retrieval time, not the time of the underlying trades.
                            </>
                        ) : null}
                    </p>
                </div>
            </main>
            <AppFooter />
        </div>
    );
}

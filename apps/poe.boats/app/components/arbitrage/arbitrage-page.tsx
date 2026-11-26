import { useMemo, useState } from "react";
import { Form, Link, useNavigation, useSearchParams } from "react-router";
import { ClusterRecipeCalculator } from "~/components/arbitrage/cluster-recipe-calculator";
import { ManualRecipeCalculator } from "~/components/arbitrage/manual-recipe-calculator";
import { OpportunityRow } from "~/components/arbitrage/opportunity-row";
import { RecipeItems } from "~/components/arbitrage/recipe-items";
import { VolumeQueryFields } from "~/components/arbitrage/volume-query-fields";
import { CurrencyLabel } from "~/components/currency-label";
import { LocalTime } from "~/components/local-time";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty";
import {
    Field,
    FieldDescription,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from "~/components/ui/field";
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
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { RECIPE_CATEGORY_LABELS } from "~/data/vendor-recipes";
import { usePendingSearchParams } from "~/hooks/use-pending-search-params";
import { findArbitrage } from "~/lib/arbitrage";
import { ARBITRAGE_VOLUME_FILTERS } from "~/lib/arbitrage-volume-filters";
import { calculateClusterRecipe } from "~/lib/cluster-recipe";
import {
    ArbitrageOptionsSchema,
    ClusterRecipeOptionsSchema,
    DEFAULT_ARBITRAGE_OPTIONS,
    MARKET_CURRENCIES,
} from "~/schemas/arbitrage";
import type { ArbitrageMarketData } from "~/services/arbitrage.server";
import type { ClusterRecipeMarketData } from "~/services/cluster-recipe.server";

const roiFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

function roiLabel(roi: number | null | undefined, label = "Best ROI") {
    return roi == null ? "ROI unavailable" : `${label} ${roiFormat.format(roi)}%`;
}

export function ArbitragePage({
    data,
    clusterRecipe,
}: {
    data: ArbitrageMarketData;
    clusterRecipe?: ClusterRecipeMarketData;
}) {
    const { game, leagues, league, recipes, snapshot, error } = data;
    const navigation = useNavigation();
    const pending = usePendingSearchParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const [volumeEdit, setVolumeEdit] = useState<{
        base: URLSearchParams;
        next: URLSearchParams;
    } | null>(null);
    const viewParams =
        volumeEdit?.base === searchParams ? volumeEdit.next : (pending ?? searchParams);
    function updateVolume(key: string, value: string) {
        const next = new URLSearchParams(viewParams);
        if (value) next.set(key, value);
        else next.delete(key);
        // Keep the typed value visible until the router commits the new search parameters.
        setVolumeEdit({ base: searchParams, next });
        setSearchParams(next, { replace: true, preventScrollReset: true });
    }
    const selectedLeague = pending?.get("league") ?? league;
    const [options, setOptions] = useState(DEFAULT_ARBITRAGE_OPTIONS);
    const [buffer, setBuffer] = useState("0");
    const [minimumProfit, setMinimumProfit] = useState("0");
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [tab, setTab] = useState("upgrades");
    const [manualRoi, setManualRoi] = useState<number | null>(null);
    const [clusterBuffer, setClusterBuffer] = useState("0");
    const clusterOptions = ClusterRecipeOptionsSchema.safeParse({
        buffer: clusterBuffer.trim() ? Number(clusterBuffer) : Number.NaN,
    });
    const clusterValue = clusterOptions.data?.buffer;
    const clusterSnapshot = clusterRecipe?.snapshot;
    const clusterResult = useMemo(
        () =>
            clusterSnapshot?.fetchedAt && clusterValue !== undefined
                ? calculateClusterRecipe(clusterSnapshot, { buffer: clusterValue })
                : null,
        [clusterSnapshot, clusterValue],
    );
    const clusterRois =
        clusterResult?.sizes.flatMap(({ roi }) => (roi === null ? [] : [roi])) ?? [];
    const parsed = ArbitrageOptionsSchema.safeParse({
        ...options,
        minimumInputUnits24h: Number(viewParams.get("minimumInputUnits24h")),
        minimumOutputUnits24h: Number(viewParams.get("minimumOutputUnits24h")),
        buffer: buffer.trim() ? Number(buffer) : Number.NaN,
        minimumProfit: options.showUnprofitable
            ? 0
            : minimumProfit.trim()
              ? Number(minimumProfit)
              : Number.NaN,
    });
    const upgrades = recipes.filter((recipe) => recipe.category !== "currency");
    const exchanges = recipes.filter((recipe) => recipe.category === "currency");
    const upgradeResults =
        snapshot && parsed.success
            ? findArbitrage(upgrades, snapshot, { ...parsed.data, category: "all" })
            : null;
    const currencyResults =
        snapshot && parsed.success
            ? findArbitrage(exchanges, snapshot, { ...parsed.data, category: "all" })
            : null;
    const results =
        tab === "currency"
            ? currencyResults
            : snapshot && parsed.success && parsed.data.category !== "all"
              ? findArbitrage(upgrades, snapshot, parsed.data)
              : upgradeResults;
    const automatic = tab === "upgrades" || tab === "currency";
    const tabs = [{ id: "upgrades", label: "Upgrades", detail: roiLabel(upgradeResults?.bestRoi) }];
    if (exchanges.length)
        tabs.push({
            id: "currency",
            label: "Currency exchanges",
            detail: roiLabel(currencyResults?.bestRoi),
        });
    if (clusterRecipe)
        tabs.push({
            id: "clusters",
            label: "Cluster Jewel rerolls",
            detail: roiLabel(
                clusterRois.length ? Math.max(...clusterRois) : null,
                "Best expected ROI",
            ),
        });
    if (game === "1")
        tabs.push({
            id: "manual",
            label: "Item recipes",
            detail:
                manualRoi === null ? "Enter prices for ROI" : roiLabel(manualRoi, "Scenario ROI"),
        });
    const currency = MARKET_CURRENCIES[game].short;
    const loading = navigation.state !== "idle";
    const categories = [...new Set(upgrades.map((recipe) => recipe.category))];
    const unavailableCategories =
        snapshot?.unavailableCategories.filter((category) =>
            tab === "currency" ? category === "currency" : categories.includes(category),
        ) ?? [];
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
    const currencyGame = game === "1" ? "poe1" : "poe2";
    const currencyLabel = <CurrencyLabel currency={currency} game={currencyGame} />;
    const changedFilters = [
        tab === "upgrades" && options.category !== DEFAULT_ARBITRAGE_OPTIONS.category,
        invalidBuffer || Number(buffer) !== DEFAULT_ARBITRAGE_OPTIONS.buffer,
        !options.showUnprofitable &&
            (invalidMinimum || Number(minimumProfit) !== DEFAULT_ARBITRAGE_OPTIONS.minimumProfit),
        options.sort !== DEFAULT_ARBITRAGE_OPTIONS.sort,
        ...ARBITRAGE_VOLUME_FILTERS.map(({ key }) => Number(viewParams.get(key)) !== 0),
        options.showUnprofitable,
    ].filter(Boolean).length;

    return (
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

            <Form method="get" className="flex flex-wrap items-end gap-3">
                <VolumeQueryFields />
                {clusterRecipe ? (
                    <Input
                        type="hidden"
                        name="clusterIlvl"
                        value={pending?.get("clusterIlvl") ?? clusterRecipe.itemLevel}
                    />
                ) : null}
                <Field className="min-w-0 max-w-sm flex-1">
                    <FieldLabel htmlFor="league">League</FieldLabel>
                    <Select
                        name="league"
                        key={selectedLeague}
                        defaultValue={selectedLeague || null}
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
                <Button type="submit">{loading ? "Loading prices…" : "Load prices"}</Button>
            </Form>
            <Tabs value={tab} onValueChange={setTab} className="gap-5">
                <TabsList
                    aria-label="Arbitrage types"
                    className="grid w-full grid-cols-2 gap-1 group-data-horizontal/tabs:h-auto sm:flex"
                >
                    {tabs.map(({ id, label, detail }) => (
                        <TabsTrigger
                            key={id}
                            value={id}
                            aria-label={`${label} ${detail}`}
                            className="h-auto flex-col items-start gap-1 whitespace-normal px-3 py-2 text-left"
                        >
                            <span className="font-semibold">{label}</span>
                            <span className="text-xs tabular-nums text-muted-foreground">
                                {detail}
                            </span>
                        </TabsTrigger>
                    ))}
                </TabsList>
                {automatic ? (
                    <TabsContent value={tab} className="space-y-5">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between gap-2">
                                    <CardTitle>Market filters</CardTitle>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="sm:hidden"
                                        aria-controls="arbitrage-filters"
                                        aria-expanded={filtersOpen}
                                        onClick={() => setFiltersOpen(!filtersOpen)}
                                    >
                                        Filters{changedFilters > 0 ? ` (${changedFilters})` : ""}
                                    </Button>
                                </div>
                                <CardDescription>
                                    PC currency exchange · Prices in {currencyLabel}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div
                                    id="arbitrage-filters"
                                    className={`flex flex-col gap-6 xl:grid xl:grid-cols-3 xl:gap-y-4 ${filtersOpen ? "" : "max-sm:hidden"}`}
                                >
                                    <FieldGroup
                                        className={`grid gap-4 sm:grid-cols-2 xl:col-span-2 ${tab === "upgrades" ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
                                    >
                                        {tab === "upgrades" && (
                                            <Field>
                                                <FieldLabel htmlFor="category">
                                                    Recipe category
                                                </FieldLabel>
                                                <Select
                                                    value={options.category}
                                                    onValueChange={(category) => {
                                                        const result =
                                                            ArbitrageOptionsSchema.shape.category.safeParse(
                                                                category,
                                                            );
                                                        if (result.success)
                                                            setOptions({
                                                                ...options,
                                                                category: result.data,
                                                            });
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
                                                            <SelectItem value="all">
                                                                All recipes
                                                            </SelectItem>
                                                            {categories.map((category) => (
                                                                <SelectItem
                                                                    key={category}
                                                                    value={category}
                                                                >
                                                                    {
                                                                        RECIPE_CATEGORY_LABELS[
                                                                            category
                                                                        ]
                                                                    }
                                                                </SelectItem>
                                                            ))}
                                                        </SelectGroup>
                                                    </SelectContent>
                                                </Select>
                                            </Field>
                                        )}
                                        <Field data-invalid={invalidBuffer}>
                                            <FieldLabel htmlFor="buffer">
                                                Price buffer (%)
                                            </FieldLabel>
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
                                                Adds to buying cost and subtracts from sale value.
                                                Enter 0–99.
                                            </FieldDescription>
                                        </Field>
                                        <Field data-invalid={invalidMinimum}>
                                            <FieldLabel htmlFor="minimum-profit">
                                                Minimum profit ({currencyLabel})
                                            </FieldLabel>
                                            <Input
                                                id="minimum-profit"
                                                type="number"
                                                min="0"
                                                step="any"
                                                value={minimumProfit}
                                                onChange={(event) =>
                                                    setMinimumProfit(event.target.value)
                                                }
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
                                                        ArbitrageOptionsSchema.shape.sort.safeParse(
                                                            sort,
                                                        );
                                                    if (result.success)
                                                        setOptions({
                                                            ...options,
                                                            sort: result.data,
                                                        });
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
                                                        <SelectItem value="profit">
                                                            Highest profit
                                                        </SelectItem>
                                                        <SelectItem value="roi">
                                                            Highest ROI
                                                        </SelectItem>
                                                    </SelectGroup>
                                                </SelectContent>
                                            </Select>
                                        </Field>
                                    </FieldGroup>
                                    <FieldSet className="min-w-0">
                                        <FieldLegend>Trade volume in the last 24 hours</FieldLegend>
                                        <FieldGroup className="grid gap-4 sm:grid-cols-2">
                                            {ARBITRAGE_VOLUME_FILTERS.map(({ key, label }) => {
                                                const invalid = parsed.error?.issues.some(
                                                    (issue) => issue.path[0] === key,
                                                );
                                                return (
                                                    <Field key={key} data-invalid={invalid}>
                                                        <FieldLabel htmlFor={key}>
                                                            {label}
                                                        </FieldLabel>
                                                        <Input
                                                            id={key}
                                                            type="number"
                                                            min="0"
                                                            step="1"
                                                            placeholder="0"
                                                            value={viewParams.get(key) ?? ""}
                                                            aria-invalid={invalid}
                                                            onChange={(event) =>
                                                                updateVolume(
                                                                    key,
                                                                    event.target.value,
                                                                )
                                                            }
                                                        />
                                                    </Field>
                                                );
                                            })}
                                        </FieldGroup>
                                    </FieldSet>
                                    <Field orientation="horizontal" className="xl:col-span-full">
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
                                </div>
                            </CardContent>
                        </Card>

                        {error ? (
                            <Alert variant="destructive">
                                <AlertTitle>Market data unavailable</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        ) : null}
                        {unavailableCategories.length ? (
                            <Alert>
                                <AlertTitle>Some prices are unavailable</AlertTitle>
                                <AlertDescription>
                                    Could not price{" "}
                                    {unavailableCategories
                                        .map((category) => RECIPE_CATEGORY_LABELS[category])
                                        .join(", ")}
                                    .
                                </AlertDescription>
                            </Alert>
                        ) : null}
                        {!parsed.success ? (
                            <Alert variant="destructive">
                                <AlertTitle>Check the filters</AlertTitle>
                                <AlertDescription>
                                    Enter a price buffer from 0 to 99, a non-negative minimum
                                    profit, and whole numbers of zero or more for trade volume.
                                </AlertDescription>
                            </Alert>
                        ) : null}

                        {results ? (
                            <section
                                id="opportunities"
                                className="flex scroll-mt-20 flex-col gap-3"
                                aria-label="Arbitrage results"
                            >
                                <div
                                    className="flex flex-wrap items-center justify-between gap-2"
                                    role="status"
                                >
                                    <h2 className="text-xl font-semibold">
                                        {results.opportunities.length}{" "}
                                        {options.showUnprofitable
                                            ? results.opportunities.length === 1
                                                ? "priced recipe"
                                                : "priced recipes"
                                            : results.opportunities.length === 1
                                              ? "opportunity"
                                              : "opportunities"}
                                    </h2>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                        <p>
                                            {results.pricedCount} recipes priced ·{" "}
                                            {results.missingPrices.length} missing prices
                                            {results.lowVolumeCount > 0 &&
                                                ` · ${results.lowVolumeCount} with insufficient or unknown volume`}
                                        </p>
                                        {snapshot && Object.keys(snapshot.quotes).length > 0 ? (
                                            <p>
                                                Latest hour:{" "}
                                                <LocalTime
                                                    at={Date.parse(snapshot.fetchedAt)}
                                                    seconds
                                                />
                                            </p>
                                        ) : null}
                                    </div>
                                </div>
                                {results.opportunities.length ? (
                                    <Table className="max-xl:flex max-xl:flex-col">
                                        <TableCaption className="max-xl:order-last">
                                            Per recipe: adjusted sale value − adjusted input cost =
                                            estimated profit. ROI = profit ÷ cost.
                                        </TableCaption>
                                        <TableHeader className="max-xl:sr-only">
                                            <TableRow>
                                                <TableHead>Recipe</TableHead>
                                                <TableHead>Buy inputs</TableHead>
                                                <TableHead>Sell output</TableHead>
                                                <TableHead id="recipe-profit">Profit</TableHead>
                                                <TableHead id="recipe-roi">ROI</TableHead>
                                                <TableHead>Trade</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody className="max-xl:block">
                                            {results.opportunities.map((opportunity) => (
                                                <OpportunityRow
                                                    key={opportunity.recipe.id}
                                                    opportunity={opportunity}
                                                    league={league}
                                                />
                                            ))}
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
                                                    ? "Try lowering the minimum trade volume or adjusting the profit filters."
                                                    : "Try another league or retry when more market prices are available."}
                                            </EmptyDescription>
                                        </EmptyHeader>
                                    </Empty>
                                )}
                                {results.missingPrices.length ? (
                                    <details className="text-sm text-muted-foreground">
                                        <summary className="cursor-pointer">
                                            Recipes excluded because an input or output price is
                                            missing
                                        </summary>
                                        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                                            {results.missingPrices.map((recipe) => (
                                                <li key={recipe.id}>
                                                    <RecipeItems recipe={recipe} />
                                                </li>
                                            ))}
                                        </ul>
                                    </details>
                                ) : null}
                            </section>
                        ) : null}

                        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                            <p>
                                Volume counts units traded across exchange pairs in the last 24
                                completed hours. Full batches use the smaller of input and output
                                volume after recipe quantities. Check current stock and prices
                                before trading. The exchange feed does not report gold fees.
                            </p>
                            <p>
                                {game === "1"
                                    ? "Automatic estimates cover standard oils through Golden, essences through Deafening, NPC currency purchases, and currency-to-wisdom exchanges. Item-dependent and random 3-for-1 / 5-for-1 recipes use the separate calculator. Special oils are excluded."
                                    : "Covers regular liquid emotions through Isolation, Lesser/regular essences, and Lesser/regular runes. Unlock the Reforging Bench in Act 3. Random rerolls, Ancient/Potent emotions, and equipment recipes are excluded."}
                            </p>
                            <p>
                                Prices come from the hourly currency exchange, as the{" "}
                                <Link to={`/${game}/market`} className="underline">
                                    market
                                </Link>{" "}
                                lists them: the latest completed hour's trades, or else the newest
                                of the last seven days that traded.
                            </p>
                        </div>
                    </TabsContent>
                ) : null}
                {game === "1" ? (
                    <TabsContent value="manual" keepMounted>
                        <ManualRecipeCalculator key={league} onRoiChange={setManualRoi} />
                    </TabsContent>
                ) : null}
                {clusterRecipe ? (
                    <TabsContent value="clusters">
                        <ClusterRecipeCalculator
                            data={clusterRecipe}
                            result={clusterResult}
                            buffer={clusterBuffer}
                            setBuffer={setClusterBuffer}
                            validBuffer={clusterOptions.success}
                        />
                    </TabsContent>
                ) : null}
            </Tabs>
        </main>
    );
}

import { useState } from "react";
import { RecipeItems } from "~/components/arbitrage/recipe-items";
import { CurrencyLabel } from "~/components/currency-label";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { TableCell, TableRow } from "~/components/ui/table";
import { RECIPE_CATEGORY_LABELS } from "~/data/vendor-recipes";
import { type ArbitrageOpportunity, buildRecipeTradeUrl } from "~/lib/arbitrage";
import { cn } from "~/lib/utils";
import { MARKET_CURRENCIES } from "~/schemas/arbitrage";

const formatNumber = new Intl.NumberFormat("en", { maximumSignificantDigits: 4 });

export function OpportunityRow({
    opportunity,
    league,
}: {
    opportunity: ArbitrageOpportunity;
    league: string;
}) {
    const [expanded, setExpanded] = useState(false);
    const { recipe, profit, roi } = opportunity;
    const { input, output, game } = recipe;
    const recipeName = `${input.quantity} × ${input.name} → ${output.quantity} × ${output.name}`;
    const currency = (
        <CurrencyLabel
            currency={MARKET_CURRENCIES[game].short}
            game={game === "1" ? "poe1" : "poe2"}
        />
    );
    const value = (amount: number) => (
        <>
            {formatNumber.format(amount)} {currency}
        </>
    );
    const detailCell = cn("max-xl:order-2 max-xl:whitespace-normal", !expanded && "max-xl:hidden");
    const costId = `cost-${recipe.id}`;
    const saleId = `sale-${recipe.id}`;
    const tradeId = `trade-${recipe.id}`;

    return (
        <TableRow className="max-xl:grid max-xl:grid-cols-2 max-xl:py-2">
            <TableCell className="whitespace-normal max-xl:col-span-2 xl:min-w-64">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-1">
                        <a
                            href={recipe.source}
                            aria-label={recipeName}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium underline underline-offset-4"
                        >
                            <RecipeItems recipe={recipe} />
                        </a>
                        <span className="text-xs text-muted-foreground">
                            {RECIPE_CATEGORY_LABELS[recipe.category]}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {opportunity.batches24h === null
                                ? "Volume unavailable"
                                : `${opportunity.batches24h.toLocaleString("en")} full batches by 24h volume`}
                        </span>
                        {recipe.method ? (
                            <Badge variant="secondary">
                                {recipe.method === "purchase" ? "NPC purchase" : "Sell to vendor"} ·
                                Fixed currency amount
                            </Badge>
                        ) : null}
                        {recipe.notes ? (
                            <p
                                className={cn(
                                    "max-w-sm text-xs text-muted-foreground",
                                    !expanded && "max-xl:hidden",
                                )}
                            >
                                {recipe.notes}
                            </p>
                        ) : null}
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="xl:hidden"
                        aria-label={`Details for ${recipeName}`}
                        aria-expanded={expanded}
                        aria-controls={`${costId} ${saleId} ${tradeId}`}
                        onClick={() => setExpanded(!expanded)}
                    >
                        Details
                    </Button>
                </div>
            </TableCell>
            <TableCell id={costId} className={detailCell}>
                <span className="block text-xs text-muted-foreground xl:hidden">Buy inputs</span>
                <div>{value(opportunity.cost)}</div>
                <div className="text-xs text-muted-foreground">
                    {value(opportunity.inputUnitValue)} / item before buffer
                </div>
                <div className="text-xs text-muted-foreground">
                    {opportunity.inputUnits24h?.toLocaleString("en") ?? "—"} inputs traded in 24h
                </div>
            </TableCell>
            <TableCell id={saleId} className={detailCell}>
                <span className="block text-xs text-muted-foreground xl:hidden">Sell output</span>
                <div>{value(opportunity.revenue)}</div>
                <div className="text-xs text-muted-foreground">
                    {value(opportunity.outputUnitValue)} / item before buffer
                </div>
                <div className="text-xs text-muted-foreground">
                    {opportunity.outputUnits24h?.toLocaleString("en") ?? "—"} outputs traded in 24h
                </div>
            </TableCell>
            <TableCell headers="recipe-profit" className="max-xl:whitespace-normal">
                <span aria-hidden="true" className="mr-2 text-xs text-muted-foreground xl:hidden">
                    Profit
                </span>
                <Badge variant={profit > 0 ? "default" : "secondary"}>{value(profit)}</Badge>
            </TableCell>
            <TableCell headers="recipe-roi" className="max-xl:whitespace-normal">
                <span aria-hidden="true" className="mr-2 text-xs text-muted-foreground xl:hidden">
                    ROI
                </span>
                {formatNumber.format(roi)}%
            </TableCell>
            <TableCell id={tradeId} className={cn(detailCell, "max-xl:col-span-2")}>
                <div className="flex gap-3">
                    <a
                        href={buildRecipeTradeUrl(game, league, input.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-4"
                        aria-label={`Buy ${input.name}`}
                    >
                        Inputs
                    </a>
                    <a
                        href={buildRecipeTradeUrl(game, league, output.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-4"
                        aria-label={`Check ${output.name} listings`}
                    >
                        Output listings
                    </a>
                </div>
            </TableCell>
        </TableRow>
    );
}

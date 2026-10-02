import {
    type ArbitrageOptions,
    ArbitrageOptionsSchema,
    MarketQuoteSchema,
    type MarketSnapshot,
    RecipeScenarioSchema,
    type VendorRecipe,
} from "~/schemas/arbitrage";

export type ArbitrageOpportunity = {
    recipe: VendorRecipe;
    inputUnitValue: number;
    outputUnitValue: number;
    cost: number;
    revenue: number;
    profit: number;
    roi: number;
};

export function findArbitrage(
    recipes: VendorRecipe[],
    snapshot: MarketSnapshot,
    options: ArbitrageOptions,
) {
    const settings = ArbitrageOptionsSchema.parse(options);
    const opportunities: ArbitrageOpportunity[] = [];
    const missingPrices: VendorRecipe[] = [];
    let pricedCount = 0;

    for (const recipe of recipes) {
        if (recipe.game !== snapshot.game) continue;
        if (settings.category !== "all" && recipe.category !== settings.category) continue;
        const input = MarketQuoteSchema.safeParse(snapshot.quotes[recipe.input.id]);
        const output = MarketQuoteSchema.safeParse(snapshot.quotes[recipe.output.id]);
        if (!input.success || !output.success) {
            missingPrices.push(recipe);
            continue;
        }

        const cost = input.data.value * recipe.input.quantity * (1 + settings.buffer / 100);
        const revenue = output.data.value * recipe.output.quantity * (1 - settings.buffer / 100);
        const difference = revenue - cost;
        const profit = Math.abs(difference) <= Math.max(cost, revenue) * 1e-12 ? 0 : difference;
        const roi = (profit / cost) * 100;
        if (![cost, revenue, profit, roi].every(Number.isFinite)) {
            missingPrices.push(recipe);
            continue;
        }
        pricedCount++;
        if (!settings.showUnprofitable && (profit <= 0 || profit < settings.minimumProfit))
            continue;
        opportunities.push({
            recipe,
            inputUnitValue: input.data.value,
            outputUnitValue: output.data.value,
            cost,
            revenue,
            profit,
            roi,
        });
    }

    opportunities.sort(
        (a, b) => b[settings.sort] - a[settings.sort] || a.recipe.id.localeCompare(b.recipe.id),
    );
    return { opportunities, missingPrices, pricedCount };
}

export function calculateRecipeScenario(input: {
    inputCost: number;
    outputValue: number;
    buffer: number;
}) {
    const { inputCost, outputValue, buffer } = RecipeScenarioSchema.parse(input);
    const cost = inputCost * (1 + buffer / 100);
    const revenue = outputValue * (1 - buffer / 100);
    const profit = revenue - cost;
    const breakEven = cost / (1 - buffer / 100);
    const roi = (profit / cost) * 100;
    if (![cost, revenue, profit, breakEven, roi].every(Number.isFinite)) return null;
    return { cost, revenue, profit, breakEven, roi };
}

export function buildRecipeTradeUrl(game: MarketSnapshot["game"], league: string, itemId: string) {
    const base = game === "1" ? "trade/exchange" : "trade2/exchange/poe2";
    const query = {
        exchange: {
            status: { option: "online" },
            have: [game === "1" ? "chaos" : "exalted"],
            want: [itemId],
        },
    };
    return `https://www.pathofexile.com/${base}/${encodeURIComponent(league)}?q=${encodeURIComponent(JSON.stringify(query))}`;
}

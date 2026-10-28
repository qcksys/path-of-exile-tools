import { redirect } from "react-router";
import { MarketExchangeItem } from "~/components/market-exchange-item";
import { RouteError } from "~/components/route-error";
import { dbContext } from "~/context";
import { getMarketExchangeItem } from "~/db/queries/market.queries";
import { MARKET_CATEGORIES, type MarketCategory } from "~/lib/market-categories";
import {
    marketExchangeItemId,
    marketLink,
    parseMarketFilters,
    poe2ExchangeCategorySchema,
    poe2MarketExchangeLink,
} from "~/schemas/market";
import type { Route } from "./+types/exchange";

export const meta: Route.MetaFunction = ({ loaderData }) => [
    {
        title: `${loaderData?.item ? `${loaderData.item.name} · ` : ""}Season market · POE.BOATS`,
    },
];

export async function loader({ request, context, params }: Route.LoaderArgs) {
    const filters = parseMarketFilters(request);
    const itemId = marketExchangeItemId(params["*"] ?? "");
    if (filters.realm === "poe2") {
        const category = poe2ExchangeCategorySchema.safeParse(filters.category);
        return redirect(
            poe2MarketExchangeLink(
                {
                    league: filters.league,
                    days: filters.days,
                    q: filters.q,
                    category: category.success ? category.data : "all",
                },
                itemId,
            ),
            308,
        );
    }
    const data = await getMarketExchangeItem(context.get(dbContext), {
        realm: filters.realm,
        league: filters.league,
        days: filters.days,
        itemId,
    });
    const { item } = data;
    if (!item) throw new Response("Unknown exchange item", { status: 404 });
    return { ...data, item, filters: { ...filters, league: data.league } };
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    return <RouteError error={error} />;
}

export default function MarketExchangeItemPage({
    loaderData,
}: Pick<Route.ComponentProps, "loaderData">) {
    const { filters, item } = loaderData;
    return (
        <MarketExchangeItem
            data={loaderData}
            league={filters.league}
            days={filters.days}
            game="poe1"
            categoryLabel={MARKET_CATEGORIES[item.category as MarketCategory].label}
            backTo={marketLink(filters)}
        />
    );
}

import { MarketExchangeItem } from "~/components/market-exchange-item";
import { RouteError } from "~/components/route-error";
import { dbContext } from "~/context";
import { getMarketExchangeItem } from "~/db/queries/market.queries";
import { POE2_EXCHANGE_CATEGORIES, type Poe2ExchangeCategory } from "~/lib/market-categories";
import { marketExchangeItemId, parsePoe2MarketFilters, poe2MarketLink } from "~/schemas/market";
import type { Route } from "./+types/poe2-exchange";

export const meta: Route.MetaFunction = ({ loaderData }) => [
    {
        title: `${loaderData?.item ? `${loaderData.item.name} · ` : ""}PoE 2 market · POE.BOATS`,
    },
];

export async function loader({ request, context, params }: Route.LoaderArgs) {
    const filters = parsePoe2MarketFilters(request);
    const data = await getMarketExchangeItem(context.get(dbContext), {
        realm: "poe2",
        league: filters.league,
        days: filters.days,
        itemId: marketExchangeItemId(params["*"] ?? ""),
    });
    const { item } = data;
    if (!item) throw new Response("Unknown exchange item", { status: 404 });
    return { ...data, item, filters: { ...filters, league: data.league } };
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    return <RouteError error={error} />;
}

export default function Poe2MarketExchangeItem({
    loaderData,
}: Pick<Route.ComponentProps, "loaderData">) {
    const { filters, item } = loaderData;
    return (
        <MarketExchangeItem
            data={loaderData}
            league={filters.league}
            days={filters.days}
            game="poe2"
            categoryLabel={POE2_EXCHANGE_CATEGORIES[item.category as Poe2ExchangeCategory].label}
            backTo={poe2MarketLink(filters)}
        />
    );
}

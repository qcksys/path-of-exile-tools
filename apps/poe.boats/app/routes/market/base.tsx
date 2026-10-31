import { marketBaseFromCohortId } from "@poe-tools/market";
import { redirect } from "react-router";
import { marketCategorySchema, marketLink, parseMarketFilters } from "~/schemas/market";
import type { Route } from "./+types/base";

/**
 * Crafting bases had their own pages, by cohort ID. They are ordinary item pages now, so an old
 * bookmark goes to its market, or to its list when that base is no longer listed.
 */
export function loader({ request, params }: Route.LoaderArgs) {
    const filters = parseMarketFilters(request);
    const market = marketBaseFromCohortId(params.base);
    if (!market) return redirect(marketLink(filters), 308);
    return redirect(
        marketLink(
            { ...filters, category: marketCategorySchema.parse(market.category) },
            {
                itemKey: market.baseType,
                identified: true,
                corrupted: false,
                signatureKind: "base",
                signatureValue: market.value,
            },
        ),
        308,
    );
}

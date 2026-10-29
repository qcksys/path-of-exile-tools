import type { z } from "zod";
import { SCARABS } from "~/data/scarab-data";
import { getMarketExchangePrices } from "~/db/queries/market.queries";
import { marketExchangeItemId } from "~/lib/market-exchange.server";
import { buildShareUrl } from "~/lib/share";
import { loadShare, saveShare } from "~/lib/share.server";
import type { ScarabPricesData } from "~/schemas/scarab";
import { OperationError } from "./errors";
import type { OperationContext } from "./operation";
import { validatePlannerSet } from "./planner";
import { CreateShareSchema, GetShareSchema, LeaguePriceSchema } from "./planner-contracts";

export async function createPlannerShare(
    context: OperationContext,
    input: z.input<typeof CreateShareSchema>,
) {
    const { set, inventory } = CreateShareSchema.parse(input);
    validatePlannerSet({ ...set, inventory });
    const shareId = await saveShare(context.db, set, inventory);
    return { shareId, shareUrl: buildShareUrl(context.origin, shareId) };
}

export async function getPlannerShare(
    context: OperationContext,
    input: z.input<typeof GetShareSchema>,
) {
    const { shareId } = GetShareSchema.parse(input);
    const shared = await loadShare(context.db, shareId);
    if (!shared) throw new OperationError("Share not found or expired.", 404);
    return shared;
}

/** Scarabs with a PoE 1 exchange item, keyed by scarab ID. */
const scarabItems = SCARABS.flatMap((scarab) => {
    const itemId = marketExchangeItemId("poe1", scarab.name.en);
    return itemId ? [{ scarab, itemId }] : [];
});

/** Scarab prices in chaos from the league's PC currency exchange, as the market list prices them. */
export async function getScarabPrices(
    context: Pick<OperationContext, "db">,
    input: z.input<typeof LeaguePriceSchema>,
) {
    const { league } = LeaguePriceSchema.parse(input);
    const { latestHour, prices } = await getMarketExchangePrices(context.db, {
        realm: "pc",
        league,
        itemIds: scarabItems.map(({ itemId }) => itemId),
    });
    const result: ScarabPricesData["prices"] = {};
    for (const { scarab, itemId } of scarabItems) {
        const price = prices.get(itemId);
        if (price) result[scarab.id] = { name: scarab.name.en, chaosValue: price.price };
    }
    if (!Object.keys(result).length)
        throw new OperationError("Prices not available for this league.", 404);
    return { league, prices: result, updatedAt: new Date(latestHour * 1000).toISOString() };
}

import type { z } from "zod";
import { getPriceCache } from "~/db/queries/idol-planner.queries";
import { buildShareUrl } from "~/lib/share";
import { loadShare, saveShare } from "~/lib/share.server";
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

export async function getScarabPrices(
    context: Pick<OperationContext, "db">,
    input: z.input<typeof LeaguePriceSchema>,
) {
    const { league } = LeaguePriceSchema.parse(input);
    const cached = await getPriceCache(context.db, league);
    if (!cached?.prices) throw new OperationError("Prices not available for this league.", 404);
    return { league, prices: cached.prices, updatedAt: cached.rowUpdatedAt.toISOString() };
}

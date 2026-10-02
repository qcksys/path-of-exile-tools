import { z } from "zod";
import { dbContext } from "~/context";
import { buildShareUrl } from "~/lib/share";
import { saveShare } from "~/lib/share.server";
import { IdolSetSchema } from "~/schemas/idol-set";
import { InventoryIdolSchema } from "~/schemas/inventory";
import { logger } from "~/services/logger";
import type { Route } from "./+types/api.share";

const CREATE_SHARE_REQUEST_SCHEMA = z.object({
    set: IdolSetSchema,
    inventory: z.array(InventoryIdolSchema),
});

export async function action({ request, context }: Route.ActionArgs) {
    if (request.method !== "POST") {
        return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const db = context.get(dbContext);

    try {
        const body = await request.json();
        const result = CREATE_SHARE_REQUEST_SCHEMA.safeParse(body);

        if (!result.success) {
            logger.warn({ error: result.error.message }, "Invalid share request");
            return Response.json({ error: "Invalid request data" }, { status: 400 });
        }

        const { set, inventory } = result.data;
        const shareId = await saveShare(db, set, inventory);

        const baseUrl = new URL(request.url).origin;
        const shareUrl = buildShareUrl(baseUrl, shareId);

        return Response.json({ shareId, shareUrl });
    } catch (error) {
        logger.error(
            { error: error instanceof Error ? error.message : "Unknown error" },
            "Share creation failed",
        );
        return Response.json({ error: "Failed to create share" }, { status: 500 });
    }
}

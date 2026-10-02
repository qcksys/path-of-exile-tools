import type { TDatabase } from "~/db/client";
import {
    loadSharedSet as dbLoadSharedSet,
    saveSharedSet as dbSaveSharedSet,
} from "~/db/queries/idol-planner.queries";
import { createSharePayload, generateShareId } from "~/lib/share";
import type { IdolSet } from "~/schemas/idol-set";
import type { InventoryIdol } from "~/schemas/inventory";
import { type SharedSet, SharedSetSchema } from "~/schemas/share";
import { logger } from "~/services/logger";

export function validateSharePayload(data: unknown): SharedSet | null {
    const result = SharedSetSchema.safeParse(data);
    if (result.success) {
        return result.data;
    }
    logger.warn({ error: result.error.message }, "Share payload validation failed");
    return null;
}

export async function saveShare(
    db: TDatabase,
    set: IdolSet,
    inventory: InventoryIdol[],
): Promise<string> {
    const shareId = generateShareId();
    const payload = createSharePayload(set, inventory);

    await dbSaveSharedSet(db, shareId, payload as unknown as Parameters<typeof dbSaveSharedSet>[2]);

    logger.info({ shareId, setName: set.name, idolCount: payload.idols.length }, "Share created");

    return shareId;
}

export async function loadShare(db: TDatabase, shareId: string): Promise<SharedSet | null> {
    const result = await dbLoadSharedSet(db, shareId);
    if (!result) {
        logger.info({ shareId }, "Share not found");
        return null;
    }

    return validateSharePayload(result.data);
}

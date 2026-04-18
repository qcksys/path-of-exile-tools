import { nanoid } from "nanoid";
import { getScarabById, getScarabName } from "~/data/scarab-data";
import type { TDatabase } from "~/db/client";
import {
    loadSharedSet as dbLoadSharedSet,
    saveSharedSet as dbSaveSharedSet,
} from "~/db/queries/idol-planner.queries";
import type { SupportedLocale } from "~/i18n/types";
import { getModMechanic } from "~/lib/mod-text-resolver";
import type { IdolSet } from "~/schemas/idol-set";
import type { InventoryIdol } from "~/schemas/inventory";
import type { ScarabPricesData } from "~/schemas/scarab";
import { SHARE_ID_LENGTH, type SharedSet, SharedSetSchema } from "~/schemas/share";
import { logger } from "~/services/logger";

export function generateShareId(): string {
    return nanoid(SHARE_ID_LENGTH);
}

export function createSharePayload(set: IdolSet, inventory: InventoryIdol[]): SharedSet {
    const relevantIdols = inventory.filter((inv) =>
        set.placements.some((p) => p.inventoryIdolId === inv.id),
    );

    return {
        version: 1,
        set,
        idols: relevantIdols,
        createdAt: Date.now(),
    };
}

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

export function buildShareUrl(baseUrl: string, shareId: string): string {
    const url = new URL(baseUrl);
    url.pathname = `/idol-planner/share/${shareId}`;
    return url.toString();
}

export function extractMechanics(sharedSet: SharedSet): string[] {
    const mechanics = new Set<string>();
    for (const idol of sharedSet.idols) {
        for (const mod of [...idol.idol.prefixes, ...idol.idol.suffixes]) {
            const mechanic = getModMechanic(mod.modId);
            if (mechanic) {
                mechanics.add(mechanic);
            }
        }
    }
    return Array.from(mechanics).sort();
}

export function extractScarabNames(sharedSet: SharedSet, locale: SupportedLocale = "en"): string[] {
    const names: string[] = [];
    for (const slot of sharedSet.set.mapDevice.slots) {
        if (slot.scarabId) {
            const scarab = getScarabById(slot.scarabId);
            if (scarab) {
                names.push(getScarabName(scarab, locale));
            }
        }
    }
    return names;
}

export function extractScarabIds(sharedSet: SharedSet): string[] {
    return sharedSet.set.mapDevice.slots
        .filter((slot) => slot.scarabId !== null)
        .map((slot) => slot.scarabId as string);
}

export function calculateScarabCost(
    scarabIds: string[],
    prices: ScarabPricesData | null,
): number | null {
    if (!prices) return null;

    let total = 0;
    for (const scarabId of scarabIds) {
        const price = prices.prices[scarabId];
        if (price) {
            total += price.chaosValue;
        }
    }
    return total > 0 ? Math.round(total * 10) / 10 : null;
}

function capitalizeFirstLetter(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export function formatMetaDescription(
    mechanics: string[],
    scarabNames: string[],
    cost: number | null,
): string {
    const parts: string[] = [];

    if (mechanics.length > 0) {
        parts.push(mechanics.map(capitalizeFirstLetter).join(", "));
    }

    if (scarabNames.length > 0) {
        const scarabPart =
            cost !== null ? `${scarabNames.join(", ")} (${cost}c)` : scarabNames.join(", ");
        parts.push(scarabPart);
    }

    if (parts.length === 0) {
        return "View and import this shared idol set";
    }

    return parts.join(" | ");
}

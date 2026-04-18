import { and, eq } from "drizzle-orm";
import type { TDatabase } from "~/db/client.ts";
import { tIdolPlannerIdol } from "~/db/schema/idol-planner.idol";
import { tIdolPlannerPlacement } from "~/db/schema/idol-planner.placement";
import { tIdolPlannerPriceCache } from "~/db/schema/idol-planner.price-cache";
import { tIdolPlannerSet } from "~/db/schema/idol-planner.set";
import { tIdolPlannerSharedSet } from "~/db/schema/idol-planner.shared-set";
import { tIdolPlannerUserPrefs } from "~/db/schema/idol-planner.user-prefs";

// -- Sets --

export async function getUserSets(db: TDatabase, userId: string) {
    return db
        .select()
        .from(tIdolPlannerSet)
        .where(and(eq(tIdolPlannerSet.userId, userId), eq(tIdolPlannerSet.rowDeletedAt, null!)));
}

export async function getSetWithData(db: TDatabase, setId: string) {
    const [set] = await db.select().from(tIdolPlannerSet).where(eq(tIdolPlannerSet.id, setId));

    if (!set) return null;

    const [idols, placements] = await Promise.all([
        db.select().from(tIdolPlannerIdol).where(eq(tIdolPlannerIdol.setId, setId)),
        db.select().from(tIdolPlannerPlacement).where(eq(tIdolPlannerPlacement.setId, setId)),
    ]);

    return { set, idols, placements };
}

export async function createSet(
    db: TDatabase,
    data: {
        id: string;
        userId: string;
        name: string;
        mapDevice: NonNullable<typeof tIdolPlannerSet.$inferInsert.mapDevice>;
        unlockedConditions: string[];
        isActive: boolean;
    },
) {
    if (data.isActive) {
        await db
            .update(tIdolPlannerSet)
            .set({ isActive: false })
            .where(eq(tIdolPlannerSet.userId, data.userId));
    }
    await db.insert(tIdolPlannerSet).values(data);
    return data.id;
}

export async function updateSet(
    db: TDatabase,
    setId: string,
    data: Partial<{
        name: string;
        mapDevice: NonNullable<typeof tIdolPlannerSet.$inferInsert.mapDevice>;
        unlockedConditions: string[];
        isActive: boolean;
    }>,
) {
    await db.update(tIdolPlannerSet).set(data).where(eq(tIdolPlannerSet.id, setId));
}

export async function setActiveSet(db: TDatabase, userId: string, setId: string) {
    await db
        .update(tIdolPlannerSet)
        .set({ isActive: false })
        .where(eq(tIdolPlannerSet.userId, userId));
    await db.update(tIdolPlannerSet).set({ isActive: true }).where(eq(tIdolPlannerSet.id, setId));
}

export async function deleteSet(db: TDatabase, setId: string) {
    await db
        .update(tIdolPlannerSet)
        .set({ rowDeletedAt: new Date() })
        .where(eq(tIdolPlannerSet.id, setId));
}

// -- Idols --

export async function addIdol(db: TDatabase, data: typeof tIdolPlannerIdol.$inferInsert) {
    await db.insert(tIdolPlannerIdol).values(data);
}

export async function addIdols(db: TDatabase, data: Array<typeof tIdolPlannerIdol.$inferInsert>) {
    if (data.length === 0) return;
    await db.insert(tIdolPlannerIdol).values(data);
}

export async function updateIdol(
    db: TDatabase,
    idolId: string,
    data: Partial<typeof tIdolPlannerIdol.$inferInsert>,
) {
    await db.update(tIdolPlannerIdol).set(data).where(eq(tIdolPlannerIdol.id, idolId));
}

export async function removeIdol(db: TDatabase, idolId: string) {
    await db.delete(tIdolPlannerPlacement).where(eq(tIdolPlannerPlacement.idolId, idolId));
    await db.delete(tIdolPlannerIdol).where(eq(tIdolPlannerIdol.id, idolId));
}

export async function removeIdols(db: TDatabase, idolIds: string[]) {
    for (const id of idolIds) {
        await removeIdol(db, id);
    }
}

export async function clearSetInventory(db: TDatabase, setId: string) {
    await db.delete(tIdolPlannerPlacement).where(eq(tIdolPlannerPlacement.setId, setId));
    await db.delete(tIdolPlannerIdol).where(eq(tIdolPlannerIdol.setId, setId));
}

// -- Placements --

export async function addPlacement(db: TDatabase, data: typeof tIdolPlannerPlacement.$inferInsert) {
    await db.insert(tIdolPlannerPlacement).values(data);
}

export async function movePlacement(
    db: TDatabase,
    placementId: string,
    posX: number,
    posY: number,
) {
    await db
        .update(tIdolPlannerPlacement)
        .set({ posX, posY })
        .where(eq(tIdolPlannerPlacement.id, placementId));
}

export async function removePlacement(db: TDatabase, placementId: string) {
    await db.delete(tIdolPlannerPlacement).where(eq(tIdolPlannerPlacement.id, placementId));
}

// -- User Preferences --

export async function getUserPrefs(db: TDatabase, userId: string) {
    const [prefs] = await db
        .select()
        .from(tIdolPlannerUserPrefs)
        .where(eq(tIdolPlannerUserPrefs.userId, userId));
    return prefs ?? null;
}

export async function upsertUserPrefs(
    db: TDatabase,
    userId: string,
    data: Partial<{
        leagueId: string | null;
        realm: string | null;
        favorites: string[];
        tradeSettings: Record<string, unknown>;
    }>,
) {
    const existing = await getUserPrefs(db, userId);
    if (existing) {
        await db
            .update(tIdolPlannerUserPrefs)
            .set(data)
            .where(eq(tIdolPlannerUserPrefs.userId, userId));
    } else {
        await db.insert(tIdolPlannerUserPrefs).values({ userId, ...data });
    }
}

// -- Shared Sets (replaces KV_SAVE) --

export async function saveSharedSet(
    db: TDatabase,
    id: string,
    data: NonNullable<typeof tIdolPlannerSharedSet.$inferInsert.data>,
) {
    await db.insert(tIdolPlannerSharedSet).values({ id, data });
}

export async function loadSharedSet(db: TDatabase, shareId: string) {
    const [result] = await db
        .select()
        .from(tIdolPlannerSharedSet)
        .where(eq(tIdolPlannerSharedSet.id, shareId));
    return result ?? null;
}

// -- Price Cache (replaces KV_POENINJA) --

export async function getPriceCache(db: TDatabase, league: string) {
    const [result] = await db
        .select()
        .from(tIdolPlannerPriceCache)
        .where(eq(tIdolPlannerPriceCache.league, league));
    return result ?? null;
}

export async function upsertPriceCache(
    db: TDatabase,
    league: string,
    prices: NonNullable<typeof tIdolPlannerPriceCache.$inferInsert.prices>,
) {
    const existing = await getPriceCache(db, league);
    if (existing) {
        await db
            .update(tIdolPlannerPriceCache)
            .set({ prices, rowUpdatedAt: new Date() })
            .where(eq(tIdolPlannerPriceCache.league, league));
    } else {
        await db.insert(tIdolPlannerPriceCache).values({ league, prices });
    }
}

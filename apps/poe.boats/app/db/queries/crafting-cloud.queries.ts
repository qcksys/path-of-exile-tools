import { and, desc, eq, isNull } from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { type TCraftingShareI, tCraftingShare } from "~/db/schema/crafting.share";
import { type TCraftingWorkspaceI, tCraftingWorkspace } from "~/db/schema/crafting.workspace";

export type CraftingCloudDatabase = Pick<TDatabase, "select" | "insert" | "update">;

export async function getCraftingCloudRow(db: CraftingCloudDatabase, userId: string, lock = false) {
    const query = db
        .select()
        .from(tCraftingWorkspace)
        .where(and(eq(tCraftingWorkspace.userId, userId), isNull(tCraftingWorkspace.rowDeletedAt)));
    const [row] = await (lock ? query.for("update") : query);
    return row ?? null;
}
export async function ensureCraftingCloudRow(db: CraftingCloudDatabase, userId: string) {
    await db
        .insert(tCraftingWorkspace)
        .values({ userId, bundle: { format: 1, projects: [], builds: [] } })
        .onDuplicateKeyUpdate({ set: { userId } });
}
export async function updateCraftingCloudRow(
    db: CraftingCloudDatabase,
    userId: string,
    data: Pick<TCraftingWorkspaceI, "bundle" | "revision" | "defaultStorage">,
) {
    await db
        .update(tCraftingWorkspace)
        .set(data)
        .where(and(eq(tCraftingWorkspace.userId, userId), isNull(tCraftingWorkspace.rowDeletedAt)));
}
export async function insertCraftingShare(db: CraftingCloudDatabase, data: TCraftingShareI) {
    await db.insert(tCraftingShare).values(data);
}
export async function getCraftingShareRow(db: CraftingCloudDatabase, id: string) {
    const [row] = await db
        .select()
        .from(tCraftingShare)
        .where(and(eq(tCraftingShare.id, id), isNull(tCraftingShare.rowDeletedAt)));
    return row ?? null;
}
export async function listCraftingShareRows(db: CraftingCloudDatabase, userId: string) {
    return db
        .select()
        .from(tCraftingShare)
        .where(and(eq(tCraftingShare.userId, userId), isNull(tCraftingShare.rowDeletedAt)))
        .orderBy(desc(tCraftingShare.rowCreatedAt));
}
export async function revokeCraftingShareRow(
    db: CraftingCloudDatabase,
    userId: string,
    id: string,
) {
    await db
        .update(tCraftingShare)
        .set({ rowDeletedAt: new Date() })
        .where(and(eq(tCraftingShare.id, id), eq(tCraftingShare.userId, userId)));
}

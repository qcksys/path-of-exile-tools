import { eq } from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { tAuthUser } from "~/db/schema/auth.user";

export const selectUserRole = (db: TDatabase, userId: string) => {
    return db
        .select({ role: tAuthUser.role })
        .from(tAuthUser)
        .where(eq(tAuthUser.id, userId))
        .limit(1);
};

import { nanoid } from "nanoid";
import { dbContext } from "~/context";
import {
    addIdols,
    clearSetInventory,
    getSetWithData,
    removeIdols,
} from "~/db/queries/idol-planner.queries";
import { requireSession } from "~/lib/session.server";
import type { Route } from "./+types/api.sets.$id.idols";

export async function action({ params, request, context }: Route.ActionArgs) {
    const session = await requireSession(request, context);
    const db = context.get(dbContext);

    const data = await getSetWithData(db, params.id);
    if (!data || data.set.userId !== session.user.id) {
        return Response.json({ error: "Not found" }, { status: 404 });
    }

    if (request.method === "POST") {
        const body = (await request.json()) as Record<string, unknown>;
        const idols = (body.idols ?? []) as Array<Record<string, unknown>>;
        const source = (body.source as string) ?? "manual";

        const rows = idols.map((idol) => ({
            id: nanoid(),
            setId: params.id,
            data: idol as typeof import("~/db/schema/idol-planner.idol").tIdolPlannerIdol.$inferInsert.data,
            importedAt: Date.now(),
            source,
        }));

        await addIdols(db, rows);
        return Response.json({ ids: rows.map((r: { id: string }) => r.id) });
    }

    if (request.method === "DELETE") {
        const body = (await request.json()) as Record<string, unknown>;
        if (body.clearAll) {
            await clearSetInventory(db, params.id);
        } else if (body.ids) {
            await removeIdols(db, body.ids as string[]);
        }
        return Response.json({ ok: true });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
}

import { dbContext } from "~/context";
import {
    deleteSet,
    getSetWithData,
    setActiveSet,
    updateSet,
} from "~/db/queries/idol-planner.queries";
import { requireSession } from "~/lib/session.server";
import type { Route } from "./+types/api.sets.$id";

export async function loader({ params, request, context }: Route.LoaderArgs) {
    const session = await requireSession(request, context);
    const db = context.get(dbContext);

    const data = await getSetWithData(db, params.id);
    if (!data || data.set.userId !== session.user.id) {
        return Response.json({ error: "Not found" }, { status: 404 });
    }

    return Response.json(data);
}

export async function action({ params, request, context }: Route.ActionArgs) {
    const session = await requireSession(request, context);
    const db = context.get(dbContext);

    const data = await getSetWithData(db, params.id);
    if (!data || data.set.userId !== session.user.id) {
        return Response.json({ error: "Not found" }, { status: 404 });
    }

    if (request.method === "PATCH") {
        const body = (await request.json()) as Record<string, unknown>;
        const updates: Record<string, unknown> = {};

        if (body.name !== undefined) updates.name = body.name;
        if (body.mapDevice !== undefined) updates.mapDevice = body.mapDevice;
        if (body.unlockedConditions !== undefined)
            updates.unlockedConditions = body.unlockedConditions;
        if (body.isActive !== undefined) {
            await setActiveSet(db, session.user.id, params.id);
            return Response.json({ ok: true });
        }

        await updateSet(db, params.id, updates);
        return Response.json({ ok: true });
    }

    if (request.method === "DELETE") {
        await deleteSet(db, params.id);
        return Response.json({ ok: true });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
}

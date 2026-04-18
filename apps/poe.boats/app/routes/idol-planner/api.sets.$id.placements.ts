import { nanoid } from "nanoid";
import { dbContext } from "~/context";
import {
    addPlacement,
    getSetWithData,
    movePlacement,
    removePlacement,
} from "~/db/queries/idol-planner.queries";
import { requireSession } from "~/lib/session.server";
import type { Route } from "./+types/api.sets.$id.placements";

export async function action({ params, request, context }: Route.ActionArgs) {
    const session = await requireSession(request, context);
    const db = context.get(dbContext);

    const data = await getSetWithData(db, params.id);
    if (!data || data.set.userId !== session.user.id) {
        return Response.json({ error: "Not found" }, { status: 404 });
    }

    if (request.method === "POST") {
        const body = (await request.json()) as Record<string, unknown>;

        if (body.action === "place") {
            const id = nanoid();
            await addPlacement(db, {
                id,
                setId: params.id,
                idolId: body.idolId as string,
                posX: body.posX as number,
                posY: body.posY as number,
            });
            return Response.json({ id });
        }

        if (body.action === "move") {
            await movePlacement(
                db,
                body.placementId as string,
                body.posX as number,
                body.posY as number,
            );
            return Response.json({ ok: true });
        }

        if (body.action === "remove") {
            await removePlacement(db, body.placementId as string);
            return Response.json({ ok: true });
        }
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
}

import { nanoid } from "nanoid";
import { dbContext } from "~/context";
import { getAllUnlockIds } from "~/data/map-device-unlocks";
import { createSet, getUserSets } from "~/db/queries/idol-planner.queries";
import { requireSession } from "~/lib/session.server";
import { createEmptyMapDevice } from "~/schemas/scarab";
import type { Route } from "./+types/api.sets";

export async function loader({ request, context }: Route.LoaderArgs) {
    const session = await requireSession(request, context);
    const db = context.get(dbContext);
    const sets = await getUserSets(db, session.user.id);
    return Response.json(sets);
}

export async function action({ request, context }: Route.ActionArgs) {
    if (request.method !== "POST") {
        return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const session = await requireSession(request, context);
    const db = context.get(dbContext);

    const body = (await request.json()) as Record<string, unknown>;
    const name = (body.name as string) ?? "New Set";

    const id = nanoid();
    await createSet(db, {
        id,
        userId: session.user.id,
        name,
        mapDevice: createEmptyMapDevice(),
        unlockedConditions: getAllUnlockIds(),
        isActive: true,
    });

    return Response.json({ id });
}

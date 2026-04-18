import { dbContext } from "~/context";
import { loadShare } from "~/lib/share";
import { ShareIdSchema } from "~/schemas/share";
import type { Route } from "./+types/api.share.$id";

export async function loader({ params, context }: Route.LoaderArgs) {
    const db = context.get(dbContext);

    const shareIdResult = ShareIdSchema.safeParse(params.id);
    if (!shareIdResult.success) {
        return Response.json({ error: "Invalid share ID format" }, { status: 400 });
    }

    const shareId = shareIdResult.data;
    const shared = await loadShare(db, shareId);
    if (!shared) {
        return Response.json({ error: "Share not found or expired" }, { status: 404 });
    }

    return Response.json(shared);
}

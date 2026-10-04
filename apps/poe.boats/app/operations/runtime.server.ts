import type { RouterContext } from "react-router";
import { dbContext, envContext } from "~/context";
import { selectUserRole } from "~/db/queries/auth.queries";
import { authServer } from "~/lib/auth.server";
import { recombinatorCatalogSchema } from "~/schemas/recombinator-catalog";
import { OperationError } from "./errors";
import type { OperationContext } from "./operation";

export async function operationContext(
    request: Request,
    context: { get: <T>(key: RouterContext<T>) => T },
): Promise<OperationContext> {
    const db = context.get(dbContext);
    const env = context.get(envContext);
    let caller: OperationContext["caller"] = null;
    if (
        request.headers.has("authorization") ||
        /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/.test(
            request.headers.get("cookie") ?? "",
        )
    ) {
        const session = await authServer({ env, db }).api.getSession({ headers: request.headers });
        if (session) {
            const [user] = await selectUserRole(db, session.user.id);
            caller = {
                id: session.user.id,
                name: session.user.name,
                email: session.user.email,
                role: user?.role ?? "user",
            };
        } else if (request.headers.has("authorization")) {
            throw new OperationError("Invalid or expired bearer session.", 401);
        }
    }
    return {
        db,
        caller,
        origin: new URL(request.url).origin,
        loadCatalog: async () => {
            const response = await env.ASSETS.fetch(
                new Request(new URL("/game-data/recombinator-poe1.json", request.url)),
            );
            if (!response.ok) throw new OperationError("Recombinator catalog unavailable.", 503);
            return recombinatorCatalogSchema.parse(await response.json());
        },
    };
}

import type { RouterContext } from "react-router";
import { dbContext, envContext } from "~/context";
import { selectUserRole } from "~/db/queries/auth.queries";
import { authServer } from "~/lib/auth.server";
import { loadCraftingCatalog } from "~/lib/crafting-catalog";
import { loadCraftingRevision } from "~/lib/crafting-ruleset-loader";
import { CRAFTING_RULESET_INDEX_URL, validateRulesetIndex } from "~/lib/crafting-rulesets";
import { craftingRuntimeHashes, craftingRuntimes } from "~/lib/crafting-runtimes.generated";
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
        loadWorkbenchCatalog: async (game) => {
            try {
                return await loadCraftingCatalog(game, false, (path) =>
                    env.ASSETS.fetch(new Request(new URL(String(path), request.url))),
                );
            } catch {
                throw new OperationError("Current crafting catalog unavailable.", 503);
            }
        },
        loadCraftingRulesets: async () => {
            const response = await env.ASSETS.fetch(
                new Request(new URL(CRAFTING_RULESET_INDEX_URL, request.url)),
            );
            if (!response.ok) throw new OperationError("Crafting revisions unavailable.", 503);
            return validateRulesetIndex(await response.json());
        },
        loadCraftingRevision: async (ruleset) => {
            try {
                return await loadCraftingRevision(
                    ruleset,
                    async (path) => {
                        const response = await env.ASSETS.fetch(
                            new Request(new URL(path, request.url)),
                        );
                        if (!response.ok) throw new Error("Retained crafting catalog unavailable.");
                        return new Uint8Array(await response.arrayBuffer());
                    },
                    async (entry) => {
                        const runtime = craftingRuntimes[entry.engine];
                        if (
                            !runtime ||
                            craftingRuntimeHashes[entry.engine] !== entry.implementation.sha256
                        )
                            throw new Error("Retained crafting implementation unavailable.");
                        return runtime;
                    },
                );
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Crafting revision unavailable.",
                    503,
                );
            }
        },
        loadCatalog: async () => {
            const response = await env.ASSETS.fetch(
                new Request(new URL("/game-data/recombinator-poe1.json", request.url)),
            );
            if (!response.ok) throw new OperationError("Recombinator catalog unavailable.", 503);
            return recombinatorCatalogSchema.parse(await response.json());
        },
    };
}

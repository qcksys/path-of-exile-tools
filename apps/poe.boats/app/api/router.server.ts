import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { OperationError } from "~/operations/errors";
import {
    checkRequestOrigin,
    ErrorSchema,
    MAX_OPERATION_BODY_BYTES,
    operationError,
} from "~/operations/http";
import type { OperationContext } from "~/operations/operation";
import { operations } from "~/operations/registry.server";

type ApiEnvironment = {
    // biome-ignore lint/style/useNamingConvention: Hono requires this environment key.
    Bindings: { runtime: () => Promise<OperationContext> };
    // biome-ignore lint/style/useNamingConvention: Hono requires this environment key.
    Variables: { runtime: OperationContext };
};
const json = (schema: typeof ErrorSchema, description: string) => ({
    description,
    content: { "application/json": { schema } },
});
const accountSecurity: Record<string, string[]>[] = [{ bearerAuth: [] }, { sessionCookie: [] }];

function router() {
    return new OpenAPIHono<ApiEnvironment>({
        defaultHook: (result, context) => {
            if (!result.success) return context.json(operationError(result.error).body, 400);
        },
    });
}

export const api = router().basePath("/api");
api.use("*", async (context, next) => {
    context.header("Cache-Control", "no-store");
    context.header("X-Content-Type-Options", "nosniff");
    checkRequestOrigin(context.req.raw);
    await next();
});
api.use(
    "/v1/*",
    bodyLimit({
        maxSize: MAX_OPERATION_BODY_BYTES,
        onError: (context) => context.json({ error: "Request body exceeds 1 MiB." }, 413),
    }),
);

for (const family of new Set(operations.map((operation) => operation.family))) {
    const subrouter = router();
    const members = operations.filter((operation) => operation.family === family);
    for (const operation of members) {
        const definition = {
            method: operation.method,
            path: operation.path,
            operationId: operation.name,
            summary: operation.description,
            tags: [family],
            security: operation.access === "account" ? accountSecurity : [],
            middleware: [
                createMiddleware<ApiEnvironment>(async (context, next) => {
                    const runtime = await context.env.runtime();
                    if (operation.access === "account" && !runtime.caller)
                        throw new OperationError("Authentication required.", 401);
                    context.set("runtime", runtime);
                    await next();
                }),
            ],
            responses: {
                200: {
                    description: "Operation result.",
                    content: { "application/json": { schema: operation.output } },
                },
                400: json(ErrorSchema, "Invalid input."),
                401: json(ErrorSchema, "Authentication required."),
                403: json(ErrorSchema, "Request refused."),
                404: json(ErrorSchema, "Resource not found."),
                409: json(ErrorSchema, "Operation conflicts with the current state."),
                413: json(ErrorSchema, "Request body exceeds 1 MiB."),
                500: json(ErrorSchema, "Unexpected failure."),
                503: json(ErrorSchema, "Data unavailable."),
            },
        } satisfies Parameters<typeof createRoute>[0];
        if (operation.method === "get") {
            subrouter.openapi(
                createRoute({ ...definition, method: "get", request: { query: operation.input } }),
                async (context) =>
                    context.json(
                        await operation.execute(context.req.valid("query"), context.get("runtime")),
                        200,
                    ),
            );
        } else {
            subrouter.openapi(
                createRoute({
                    ...definition,
                    method: "post",
                    request: {
                        body: {
                            required: true,
                            content: { "application/json": { schema: operation.input } },
                        },
                    },
                }),
                async (context) =>
                    context.json(
                        await operation.execute(context.req.valid("json"), context.get("runtime")),
                        200,
                    ),
            );
        }
    }
    for (const path of new Set(members.map((operation) => operation.path))) {
        subrouter.all(path, (context) => {
            context.header(
                "Allow",
                members
                    .filter((operation) => operation.path === path)
                    .map((operation) => operation.method.toUpperCase())
                    .join(", "),
            );
            return context.json({ error: "Method not allowed." }, 405);
        });
    }
    api.route(`/v1/${family}`, subrouter);
}

api.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    description:
        "An existing Better Auth session token. Expiry and revocation apply on every request.",
});
api.openAPIRegistry.registerComponent("securitySchemes", "sessionCookie", {
    type: "apiKey",
    in: "cookie",
    name: "better-auth.session_token",
});
api.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: {
        title: "POE.BOATS API",
        version: "1.0.0",
        description:
            "The same operations power the UI, versioned HTTP API, and /mcp tools. Browser-local operations accept and return state; saved-set operations require an account.",
    },
});
api.get(
    "/docs",
    Scalar({
        url: "/api/openapi.json",
        pageTitle: "API Reference · POE.BOATS",
    }),
);
api.notFound((context) => context.json({ error: "Endpoint not found." }, 404));
api.onError((error, context) => {
    if (error instanceof HTTPException && error.status === 400)
        return context.json({ error: "Invalid JSON request." }, 400);
    const result = operationError(error);
    return context.json(result.body, result.status);
});

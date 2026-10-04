import type { RouterContext } from "react-router";
import { z } from "zod";
import { checkRequestOrigin, operationError, readOperationBody } from "./http";
import type { OperationContext } from "./operation";
import { getOperation } from "./registry.server";
import { operationContext } from "./runtime.server";

export async function legacyPlannerRequest(
    request: Request,
    context: { get: <T>(key: RouterContext<T>) => T },
    handler: (runtime: OperationContext, body: Record<string, unknown>) => Promise<unknown>,
    methods: string[],
    account = false,
) {
    try {
        if (!methods.includes(request.method))
            return Response.json(
                { error: "Method not allowed." },
                { status: 405, headers: { allow: methods.join(", ") } },
            );
        checkRequestOrigin(request);
        const runtime = await operationContext(request, context);
        if (account && !runtime.caller)
            return Response.json({ error: "Authentication required." }, { status: 401 });
        let body: Record<string, unknown> = {};
        if (!["GET", "HEAD"].includes(request.method)) {
            const bytes = await readOperationBody(request);
            const text = new TextDecoder().decode(bytes);
            if (text) {
                try {
                    body = z.record(z.string(), z.unknown()).parse(JSON.parse(text));
                } catch {
                    return Response.json({ error: "Invalid JSON request." }, { status: 400 });
                }
            }
        }
        return Response.json(await handler(runtime, body), {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (error) {
        const result = operationError(error);
        return Response.json(result.body, {
            status: result.status,
            headers: { "Cache-Control": "no-store" },
        });
    }
}

export function runOperation(name: string, input: unknown, runtime: OperationContext) {
    const operation = getOperation(name);
    if (!operation) throw new Error(`Unknown operation: ${name}`);
    return operation.execute(input, runtime);
}

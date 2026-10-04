import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { checkRequestOrigin, MAX_OPERATION_BODY_BYTES, operationError } from "~/operations/http";
import type { OperationContext } from "~/operations/operation";
import { operations } from "~/operations/registry.server";

export function createMcpServer(context: OperationContext) {
    const server = new McpServer({ name: "poe-boats", version: "1.0.0" });
    for (const operation of operations) {
        if (operation.access === "account" && !context.caller) continue;
        server.registerTool(
            operation.name,
            {
                description: operation.description,
                inputSchema: operation.input,
                outputSchema: operation.output,
                annotations: {
                    readOnlyHint: operation.readOnly,
                    destructiveHint: !operation.readOnly,
                    openWorldHint: true,
                },
            },
            async (input) => {
                try {
                    const output = await operation.execute(input, context);
                    return {
                        content: [{ type: "text", text: JSON.stringify(output) }],
                        structuredContent: output,
                    };
                } catch (error) {
                    const result = operationError(error);
                    return {
                        isError: true,
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({ ...result.body, status: result.status }),
                            },
                        ],
                    };
                }
            },
        );
    }
    return server;
}

export async function handleMcpRequest(
    request: Request,
    runtime: () => Promise<OperationContext>,
): Promise<Response> {
    const app = new Hono();
    app.use(
        "*",
        bodyLimit({
            maxSize: MAX_OPERATION_BODY_BYTES,
            onError: (context) => context.json({ error: "Request body exceeds 1 MiB." }, 413),
        }),
    );
    app.all("*", async (context) => {
        const boundedRequest = context.req.raw;
        checkRequestOrigin(boundedRequest);
        if (boundedRequest.method !== "POST")
            return Response.json(
                { error: "Method not allowed." },
                { status: 405, headers: { allow: "POST" } },
            );
        const server = createMcpServer(await runtime());
        const transport = new WebStandardStreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
        });
        await server.connect(transport);
        try {
            return await transport.handleRequest(boundedRequest);
        } finally {
            await server.close();
        }
    });
    app.onError((error, context) => {
        const result = operationError(error);
        return context.json(result.body, result.status);
    });
    const response = await app.fetch(request);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
}

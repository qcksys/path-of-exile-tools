import { z } from "zod";
import { OperationError } from "./errors";

export const ErrorSchema = z.object({
    error: z.string(),
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export const MAX_OPERATION_BODY_BYTES = 1024 * 1024;

export async function readOperationBody(request: Request) {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > MAX_OPERATION_BODY_BYTES) {
                await reader.cancel();
                throw new OperationError("Request body exceeds 1 MiB.", 413);
            }
            chunks.push(new Uint8Array(chunk.value));
        }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

export function operationError(error: unknown) {
    if (error instanceof z.ZodError)
        return {
            status: 400 as const,
            body: {
                error: "Validation failed.",
                issues: error.issues.map((issue) => ({
                    path: issue.path.join("."),
                    message: issue.message,
                })),
            },
        };
    if (error instanceof OperationError)
        return { status: error.status, body: { error: error.message } };
    return { status: 500 as const, body: { error: "Internal server error." } };
}

export function checkRequestOrigin(request: Request) {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
        throw new OperationError("Cross-origin requests are not allowed.", 403);
}

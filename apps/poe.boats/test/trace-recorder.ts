import { AsyncLocalStorage } from "node:async_hooks";
import type { Span } from "~/services/tracing.server";

export function createTraceRecorder() {
    const activeSpan = new AsyncLocalStorage<string>();
    const spans: { name: string; parent?: string; attributes: Record<string, unknown> }[] = [];
    const tracing = {
        enterSpan<T>(name: string, callback: (span: Span) => T): T {
            const attributes = {};
            spans.push({ name, parent: activeSpan.getStore(), attributes });
            const span: Span = {
                setAttributes(values) {
                    Object.assign(attributes, values);
                    return span;
                },
            };
            return activeSpan.run(name, () => callback(span));
        },
    };
    return { tracing, spans };
}

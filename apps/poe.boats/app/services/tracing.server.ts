import * as workers from "cloudflare:workers";

type SpanAttributes = Record<string, string | number | boolean | undefined>;
export type Span = { setAttributes(attributes: SpanAttributes): Span };
type Tracing = { enterSpan<T>(name: string, callback: (span: Span) => T): T };

// The workerd bundled for `vp dev` and tests predates custom spans; deployed Workers record them.
const { tracing } = workers as typeof workers & { tracing?: Tracing };
const untracedSpan: Span = { setAttributes: () => untracedSpan };

export function traceSpan<T>(name: string, callback: (span: Span) => T): T {
    return tracing ? tracing.enterSpan(name, callback) : callback(untracedSpan);
}

export function traceQuery<T>(name: string, query: PromiseLike<T[]>, attributes?: SpanAttributes) {
    return traceSpan(name, async (span) => {
        span.setAttributes({ ...attributes });
        const rows = await query;
        span.setAttributes({ "db.rows": rows.length });
        return rows;
    });
}

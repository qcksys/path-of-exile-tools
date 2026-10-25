import { afterEach, describe, expect, it, vi } from "vite-plus/test";

afterEach(() => {
    vi.doUnmock("cloudflare:workers");
    vi.resetModules();
});

async function loadTracing(workers: Record<string, unknown>) {
    vi.resetModules();
    vi.doMock("cloudflare:workers", () => workers);
    return import("~/services/tracing.server");
}

describe("traceQuery", () => {
    it("runs the query inside a named span and records its row count", async () => {
        const events: string[] = [];
        const attributes: Record<string, unknown> = {};
        const span = {
            setAttributes: (values: Record<string, unknown>) => {
                Object.assign(attributes, values);
                return span;
            },
        };
        const { traceQuery } = await loadTracing({
            env: {},
            tracing: {
                enterSpan: (name: string, callback: (value: typeof span) => Promise<unknown>) => {
                    events.push(`enter ${name}`);
                    return callback(span).finally(() => events.push(`leave ${name}`));
                },
            },
        });
        const query: PromiseLike<number[]> = {
            // biome-ignore lint/suspicious/noThenProperty: drizzle builders are lazy thenables.
            then: (resolve, reject) => {
                events.push("query");
                return Promise.resolve([1, 2, 3]).then(resolve, reject);
            },
        };

        await expect(traceQuery("market.rows", query, { "market.page": 2 })).resolves.toEqual([
            1, 2, 3,
        ]);
        expect(events).toEqual(["enter market.rows", "query", "leave market.rows"]);
        expect(attributes).toEqual({ "market.page": 2, "db.rows": 3 });
    });

    it("runs the callback untraced when the runtime has no tracing API", async () => {
        const { traceQuery, traceSpan } = await loadTracing({ env: {}, tracing: undefined });

        expect(traceSpan("market.data", (span) => span.setAttributes({ a: 1 }) && "done")).toBe(
            "done",
        );
        await expect(traceQuery("market.seasons", Promise.resolve(["Allflame"]))).resolves.toEqual([
            "Allflame",
        ]);
    });
});

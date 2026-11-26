import type { RouterContextProvider } from "react-router";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { serverTimingContext } from "~/context";
import { createTraceRecorder } from "./trace-recorder";

const mocks = vi.hoisted(() => ({
    handle: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
}));
const recorder = createTraceRecorder();
vi.mock("cloudflare:workers", () => ({ env: { LOG_LEVEL: "silent" }, tracing: recorder.tracing }));
vi.mock("react-router", async (importOriginal) => ({
    ...(await importOriginal<typeof import("react-router")>()),
    createRequestHandler: () => mocks.handle,
}));
vi.mock("~/db/client.ts", () => ({ openWorkerDatabase: mocks.open }));
vi.mock("~/scheduled/index.ts", () => ({ handleScheduled: vi.fn() }));

const { default: worker } = await import("../workers/app");

afterEach(() => {
    recorder.spans.length = 0;
    vi.restoreAllMocks();
});

it("emits completed resource-action timings after awaiting the handler", async () => {
    let elapsed = 0;
    vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    mocks.open.mockResolvedValue({ db: {}, close: mocks.close });
    mocks.close.mockResolvedValue(undefined);
    mocks.handle.mockImplementation(async (_request: Request, context: RouterContextProvider) => {
        await Promise.resolve();
        elapsed = 25;
        context.get(serverTimingContext).add("equipment_db", 25);
        return Response.json({ candidates: [] }, { headers: { "X-Resource": "completed" } });
    });
    const response = await worker.fetch(
        new Request("https://poe.boats/api/v1/crafting/market/cohorts", {
            method: "POST",
        }) as Parameters<typeof worker.fetch>[0],
        { DATABASE_URL: "unused", DATABASE_DRIVER: "planetscale" } as CloudflareBindings,
        { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    expect(response.headers.get("Server-Timing")).toBe("total;dur=25.0, equipment_db;dur=25.0");
    expect(response.headers.get("X-Resource")).toBe("completed");
    expect(await response.json()).toEqual({ candidates: [] });
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(recorder.spans).toEqual([]);
});

it.each([
    { path: "/", page: true },
    { path: "/1/market/currency.data", page: true },
    { path: "/api/stash-ingest", page: false },
    { path: "/mcp", page: false },
])("records the expected database spans for GET $path", async ({ path, page }) => {
    mocks.open.mockResolvedValue({ db: {}, close: mocks.close });
    mocks.handle.mockResolvedValue(new Response("ok"));
    const response = await worker.fetch(
        new Request(`https://poe.boats${path}`) as Parameters<typeof worker.fetch>[0],
        { HYPERDRIVE: {} } as CloudflareBindings,
        { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    expect(response.status).toBe(200);
    expect(recorder.spans).toEqual(
        page
            ? [
                  expect.objectContaining({
                      name: "page.db.open",
                      attributes: { "db.driver": "hyperdrive" },
                  }),
              ]
            : [],
    );
});

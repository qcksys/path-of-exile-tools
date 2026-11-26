import { createRequestHandler, useLoaderData } from "react-router";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { createTraceRecorder } from "./trace-recorder";

const recorder = createTraceRecorder();
vi.mock("cloudflare:workers", () => ({ env: { LOG_LEVEL: "silent" }, tracing: recorder.tracing }));
const entry = await import("~/entry.server");
const { traceSpan } = await import("~/services/tracing.server");

const route = { id: "root", path: "/1/market/items/:item" };
const handle = createRequestHandler({
    entry: { module: entry },
    routes: {
        root: {
            ...route,
            module: {
                loader: () => traceSpan("market.data", () => "Item history"),
                default: () => useLoaderData<string>(),
            },
        },
    },
    assets: {
        entry: { imports: [], module: "" },
        url: "",
        version: "test",
        routes: {
            root: {
                ...route,
                module: "",
                hasLoader: true,
                hasAction: false,
                hasClientAction: false,
                hasClientLoader: false,
                hasClientMiddleware: false,
                hasErrorBoundary: false,
                clientActionModule: undefined,
                clientLoaderModule: undefined,
                clientMiddlewareModule: undefined,
                hydrateFallbackModule: undefined,
            },
        },
    },
    future: {},
    ssr: true,
    isSpaMode: false,
    prerender: [],
    publicPath: "/",
    assetsBuildDirectory: "",
    routeDiscovery: { mode: "initial", manifestPath: "/__manifest" },
});

beforeEach(() => {
    recorder.spans.length = 0;
});

it.each([
    {
        agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
        bot: false,
    },
    { agent: "Googlebot", bot: true },
])("traces the loader, render shell and applicable bot wait (bot=$bot)", async ({ agent, bot }) => {
    const response = await handle(
        new Request("https://poe.boats/1/market/items/Test", {
            headers: { "user-agent": agent },
        }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Item history");
    expect(recorder.spans).toEqual([
        {
            name: "page.loader",
            parent: undefined,
            attributes: { "route.id": "root", "route.outcome": "success" },
        },
        { name: "market.data", parent: "page.loader", attributes: {} },
        { name: "page.render_shell", parent: undefined, attributes: { "route.id": "root" } },
        ...(bot ? [{ name: "page.wait_all_ready", parent: undefined, attributes: {} }] : []),
    ]);
});

it("traces a client navigation loader without rendering another document", async () => {
    const response = await handle(new Request("https://poe.boats/1/market/items/Test.data"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Item history");
    expect(recorder.spans.map((span) => span.name)).toEqual(["page.loader", "market.data"]);
});

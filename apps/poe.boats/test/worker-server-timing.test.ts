import type { RouterContextProvider } from "react-router";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { serverTimingContext } from "~/context";
import worker from "../workers/app";

const mocks = vi.hoisted(() => ({
    handle: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
}));
vi.mock("react-router", async (importOriginal) => ({
    ...(await importOriginal<typeof import("react-router")>()),
    createRequestHandler: () => mocks.handle,
}));
vi.mock("~/db/client.ts", () => ({ openDatabase: mocks.open }));
vi.mock("~/scheduled/index.ts", () => ({ handleScheduled: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

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
});

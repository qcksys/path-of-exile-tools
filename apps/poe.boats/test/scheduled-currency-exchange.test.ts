// biome-ignore-all lint/style/useNamingConvention: The feed uses GGG's public field names.
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { openDatabase } from "~/db/client";
import {
    countStashCurrencyHour,
    upsertStashCurrencyHourly,
} from "~/db/queries/stash-ingest.queries";
import { handleScheduled } from "~/scheduled";
import { updateScarabPrices } from "~/scheduled/poeninja";

vi.mock("~/db/client", () => ({ openDatabase: vi.fn() }));
vi.mock("~/db/queries/stash-ingest.queries", () => ({
    countStashCurrencyHour: vi.fn(),
    upsertStashCurrencyHourly: vi.fn(),
}));
vi.mock("~/scheduled/poeninja", () => ({ updateScarabPrices: vi.fn() }));
vi.mock("~/services/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const item = "Metadata/Items/Currency/CurrencyAddModToRare";
const chaos = "Metadata/Items/Currency/CurrencyRerollRare";
const scheduledTime = Date.parse("2026-10-22T12:15:00Z");
const hour = Math.floor(scheduledTime / 3_600_000) * 3600 - 3600;
const controller: ScheduledController = {
    cron: "*/15 * * * *",
    scheduledTime,
    noRetry() {},
};
const env = { DATABASE_URL: "mysql://inert", DATABASE_DRIVER: "mysql" } as CloudflareBindings;
const close = vi.fn(async () => {});
const database = {} as Awaited<ReturnType<typeof openDatabase>>["db"];

function feed(request: string | URL | Request, overrides: Record<string, unknown> = {}) {
    const url = new URL(String(request));
    const requestedHour = Number(url.pathname.split("/").at(-1));
    return Response.json({
        next_change_id: requestedHour + 3600,
        markets: [
            {
                league: "Allflame",
                market_id: `${item}|${chaos}`,
                market_pair: [item, chaos],
                volume_traded: { [item]: 0, [chaos]: 0 },
                lowest_ratio: { [item]: 1, [chaos]: 2 },
                highest_ratio: { [item]: 1, [chaos]: 3 },
                lowest_stock: { [item]: 5, [chaos]: 10 },
                highest_stock: { [item]: 8, [chaos]: 16 },
            },
        ],
        ...overrides,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(openDatabase).mockResolvedValue({ db: database, close });
    vi.mocked(updateScarabPrices).mockResolvedValue({ successCount: 1, errorCount: 0 });
    vi.mocked(countStashCurrencyHour).mockResolvedValue(0);
    vi.mocked(upsertStashCurrencyHourly).mockImplementation(async (_, rows) => rows.length);
    vi.stubGlobal(
        "fetch",
        vi.fn(async (request: string | URL | Request) => feed(request)),
    );
});
afterEach(() => vi.unstubAllGlobals());

describe("scheduled exchange capture", () => {
    it("captures six completed hours for both games with original zero volumes and source hours", async () => {
        await handleScheduled(controller, env);
        expect(fetch).toHaveBeenCalledTimes(12);
        const rows = vi.mocked(upsertStashCurrencyHourly).mock.calls.flatMap(([, batch]) => batch);
        expect(rows).toHaveLength(12);
        for (const realm of ["pc", "poe2"])
            expect(rows.filter((row) => row.realm === realm).map((row) => row.hour)).toEqual(
                Array.from({ length: 6 }, (_, offset) => hour - offset * 3600),
            );
        expect(rows[0]).toMatchObject({
            league: "Allflame",
            marketId: `${item}|${chaos}`,
            volumeTraded: { [item]: 0, [chaos]: 0 },
        });
        expect(fetch).toHaveBeenCalledWith(
            `https://web.poecdn.com/api/currency-exchange/${hour}`,
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
        expect(fetch).toHaveBeenCalledWith(
            `https://web.poecdn.com/api/currency-exchange/poe2/${hour}`,
            expect.any(Object),
        );
        expect(close).toHaveBeenCalledOnce();
    });

    it("continues other hours and the other game after a failure, then retries the failed hour next run", async () => {
        vi.mocked(fetch).mockImplementationOnce(
            async () => new Response("Unavailable", { status: 503 }),
        );
        await expect(handleScheduled(controller, env)).rejects.toThrow(
            "Scheduled market capture failed",
        );
        expect(upsertStashCurrencyHourly).toHaveBeenCalledTimes(11);
        expect(close).toHaveBeenCalledOnce();
        await handleScheduled(controller, env);
        expect(upsertStashCurrencyHourly).toHaveBeenCalledTimes(23);
        expect(vi.mocked(upsertStashCurrencyHourly).mock.calls[11]![1][0]).toMatchObject({
            realm: "pc",
            hour,
        });
    });

    it("runs exchange capture when scarab capture rejects or reports unsuccessful leagues", async () => {
        vi.mocked(updateScarabPrices).mockRejectedValueOnce(new Error("Scarab database failure"));
        await expect(handleScheduled(controller, env)).rejects.toThrow(
            "Scheduled market capture failed",
        );
        expect(upsertStashCurrencyHourly).toHaveBeenCalledTimes(12);
        vi.mocked(updateScarabPrices).mockResolvedValueOnce({ successCount: 0, errorCount: 1 });
        await expect(handleScheduled(controller, env)).rejects.toThrow(
            "Scheduled market capture failed",
        );
        expect(upsertStashCurrencyHourly).toHaveBeenCalledTimes(24);
    });

    it("retries an hour after a partial database write without relying on the newest stored hour", async () => {
        vi.mocked(upsertStashCurrencyHourly).mockRejectedValueOnce(
            new Error("Second chunk failed"),
        );
        await expect(handleScheduled(controller, env)).rejects.toThrow(
            "Scheduled market capture failed",
        );
        expect(upsertStashCurrencyHourly).toHaveBeenCalledTimes(12);
        await handleScheduled(controller, env);
        expect(vi.mocked(upsertStashCurrencyHourly).mock.calls[12]![1]).toEqual(
            vi.mocked(upsertStashCurrencyHourly).mock.calls[0]![1],
        );
    });

    it("refuses mismatched hourly digests and malformed source rows without discarding other hours", async () => {
        vi.mocked(fetch)
            .mockImplementationOnce(async (request) =>
                feed(request, { next_change_id: hour - 3600 }),
            )
            .mockImplementationOnce(async (request) =>
                feed(request, { markets: [{ league: "Allflame" }] }),
            );
        await expect(handleScheduled(controller, env)).rejects.toThrow(
            "Scheduled market capture failed",
        );
        expect(upsertStashCurrencyHourly).toHaveBeenCalledTimes(10);
        expect(vi.mocked(upsertStashCurrencyHourly).mock.calls[0]![1][0]!.hour).toBe(
            hour - 2 * 3600,
        );
    });

    it("skips hours already stored in full and rewrites partially stored hours", async () => {
        vi.mocked(countStashCurrencyHour).mockImplementation(async (_, realm, storedHour) =>
            realm === "pc" && storedHour < hour ? 1 : 0,
        );
        await handleScheduled(controller, env);
        expect(countStashCurrencyHour).toHaveBeenCalledWith(database, "pc", hour, ["Allflame"]);
        const rows = vi.mocked(upsertStashCurrencyHourly).mock.calls.flatMap(([, batch]) => batch);
        expect(rows.filter((row) => row.realm === "pc").map((row) => row.hour)).toEqual([hour]);
        expect(rows.filter((row) => row.realm === "poe2")).toHaveLength(6);

        vi.mocked(upsertStashCurrencyHourly).mockClear();
        vi.mocked(fetch).mockImplementation(async (request) => {
            const response: { markets: Record<string, unknown>[] } = await feed(request).json();
            response.markets.push({ ...response.markets[0], market_id: `${chaos}|${item}` });
            return Response.json(response);
        });
        await handleScheduled(controller, env);
        expect(
            vi
                .mocked(upsertStashCurrencyHourly)
                .mock.calls.filter(([, batch]) => batch.every((row) => row.realm === "pc")),
        ).toHaveLength(6);
    });

    it("stores only markets with one of the game's price currencies outside Ruthless and counts stored hours by them", async () => {
        const mirror = "Metadata/Items/Currency/CurrencyDuplicate";
        const fragment = "Metadata/Items/Currency/CurrencyAfflictionShardDelirium";
        vi.mocked(fetch).mockImplementation(async (request) => {
            const response: { markets: Record<string, unknown>[] } = await feed(request).json();
            response.markets.push(
                { ...response.markets[0], market_id: `${mirror}|${fragment}` },
                { ...response.markets[0], league: "Ruthless Allflame" },
            );
            return Response.json(response);
        });
        vi.mocked(countStashCurrencyHour).mockImplementation(async (_, realm, storedHour) =>
            realm === "pc" && storedHour < hour ? 1 : 0,
        );
        await handleScheduled(controller, env);
        const rows = vi.mocked(upsertStashCurrencyHourly).mock.calls.flatMap(([, batch]) => batch);
        expect(rows.map((row) => row.marketId)).not.toContain(`${mirror}|${fragment}`);
        expect(rows.map((row) => row.league)).not.toContain("Ruthless Allflame");
        // A full stored hour of the tracked market is skipped although the feed had two markets.
        expect(rows.filter((row) => row.realm === "pc").map((row) => row.hour)).toEqual([hour]);
    });

    it("keeps an empty source hour empty instead of synthesizing observations", async () => {
        vi.mocked(fetch).mockImplementation(async (request) => feed(request, { markets: [] }));
        await handleScheduled(controller, env);
        expect(
            vi.mocked(upsertStashCurrencyHourly).mock.calls.every(([, rows]) => rows.length === 0),
        ).toBe(true);
    });

    it("cancels oversized response streams before writing their contents", async () => {
        const cancel = vi.fn();
        vi.mocked(fetch).mockResolvedValueOnce(
            new Response(
                new ReadableStream({
                    start(stream) {
                        stream.enqueue(new Uint8Array(16 * 1024 * 1024 + 1));
                    },
                    cancel,
                }),
            ),
        );
        await expect(handleScheduled(controller, env)).rejects.toThrow(
            "Scheduled market capture failed",
        );
        expect(cancel).toHaveBeenCalledOnce();
        expect(upsertStashCurrencyHourly).toHaveBeenCalledTimes(11);
    });
});

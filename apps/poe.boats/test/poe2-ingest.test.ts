// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve the upstream API field names.
import { expect, it, vi } from "vite-plus/test";
import { createClient } from "../../../packages/poe-api-client/src/client";
import { runPipeline } from "../../../packages/poe-stash-ingest/src/pipeline";
import { ingestPs } from "../../../packages/poe-stash-ingest/src/ps/ingest";
import { openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";
import { push } from "../../../packages/poe-stash-ingest/src/shared/remote/push";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth.ts", () => ({ REALM: "poe2" }));
vi.mock("../../../packages/poe-stash-ingest/src/shared/remote/push.ts", () => ({ push: vi.fn() }));

it("processes PoE 2 exchange history without calling the unavailable equipment stream", async () => {
    const db = await openDb(":memory:");
    const client = createClient({
        baseUrl: "https://example.invalid",
        userAgent: "test",
        token: "inert",
    });
    const stash = vi
        .spyOn(client.public, "stashTabs")
        .mockRejectedValue(new Error("Must not fetch PoE 2 stashes"));
    const exchange = vi
        .spyOn(client.public, "currencyExchange")
        .mockImplementation(async ({ id } = {}) => ({
            next_change_id: id!,
            markets: [
                {
                    league: "Standard",
                    market_id: "chaos|divine",
                    lowest_ratio: { chaos: 100, divine: 1 },
                    highest_ratio: { chaos: 110, divine: 1 },
                    volume_traded: { chaos: 1000, divine: 10 },
                    lowest_stock: { chaos: 100, divine: 1 },
                    highest_stock: { chaos: 1000, divine: 10 },
                },
            ],
        }));
    try {
        const result = await runPipeline(db.conn, client, { pages: 1, league: "Standard" });
        expect(result.stash).toBeNull();
        expect(result.currency).toHaveLength(1);
        expect(stash).not.toHaveBeenCalled();
        expect(exchange).toHaveBeenCalledWith({ realm: "poe2", id: expect.any(Number) });
        expect(push).toHaveBeenCalledWith(
            {
                stream: "cxapi",
                rows: [
                    expect.objectContaining({
                        realm: "poe2",
                        league: "Standard",
                        marketId: "chaos|divine",
                    }),
                ],
            },
            { dryRun: undefined },
        );
        expect(
            await queryAll(db.conn, "SELECT count(*)::INTEGER AS n FROM ps_equipment_listing"),
        ).toEqual([{ n: 0 }]);
        await expect(ingestPs(db.conn, client, { pages: 1 })).rejects.toThrow(
            "PoE 2 equipment uses manual prices",
        );
        expect(stash).not.toHaveBeenCalled();
    } finally {
        await db.close();
    }
});

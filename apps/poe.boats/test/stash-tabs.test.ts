// biome-ignore-all lint/style/useNamingConvention: Fixtures and SQL preserve upstream field names.
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createClient } from "../../../packages/poe-api-client/src/client";
import type { Item } from "../../../packages/poe-api-client/src/types";
import { ingestPs } from "../../../packages/poe-stash-ingest/src/ps/ingest";
import { rollupPs } from "../../../packages/poe-stash-ingest/src/ps/rollup";
import { openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";
import type { UniqueHourlyPayload } from "../../../packages/poe-stash-ingest/src/shared/remote/types";
import { listingTab } from "../../../packages/poe-stash-ingest/src/shared/stash-tab";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth", () => ({ REALM: undefined }));

// Synthetic API fixtures, not evidence of live asking prices.
function belt(id: string, note: string): Item {
    return {
        id,
        verified: true,
        w: 2,
        h: 1,
        icon: "https://web.poecdn.com/gen/image/Art/2DItems/Belts/Headhunter.png",
        name: "Headhunter",
        typeLine: "Leather Belt",
        baseType: "Leather Belt",
        rarity: "Unique",
        identified: true,
        frameType: 3,
        note,
    };
}

describe("listingTab", () => {
    it.each([
        ["TradeStash", "merchant"],
        ["PremiumStash", "other"],
        ["QuadStash", "other"],
        ["", "other"],
    ])("reads stash type %j as %s", (stashType, tab) => {
        expect(listingTab({ stashType })).toBe(tab);
    });
});

describe("stash tab split in ingest", () => {
    let db: Awaited<ReturnType<typeof openDb>>;
    const client = createClient({ userAgent: "stash-tabs-test", token: "inert" });
    const deliveries: UniqueHourlyPayload[] = [];
    let pageNumber = 0;

    function capture(stashes: { account: string; stashType: string; items: Item[] }[]) {
        vi.spyOn(client.public, "stashTabs").mockResolvedValueOnce({
            next_change_id: `fixture-${++pageNumber}`,
            stashes: stashes.map(({ account, stashType, items }) => ({
                id: `stash-${account}`,
                public: true,
                accountName: account,
                league: "Standard",
                stash: "1",
                stashType,
                items,
            })),
        });
        return ingestPs(db.conn, client, { pages: 1, league: "Standard" });
    }

    async function rollup() {
        const [{ hour }] = await queryAll<{ hour: number }>(
            db.conn,
            "SELECT MAX(observed_hour)::DOUBLE AS hour FROM ps_listing_hour",
        );
        await rollupPs(db.conn, { hour, league: "Standard" });
        return deliveries
            .flatMap((delivery) => delivery.rows)
            .map((row) => [row.tab, row.listingCount, row.prices.chaos?.median])
            .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    }

    beforeEach(async () => {
        pageNumber = 0;
        deliveries.length = 0;
        vi.stubEnv("POE_BOATS_INGEST_URL", "https://example.invalid/ingest");
        vi.stubEnv("POE_BOATS_INGEST_TOKEN", "inert");
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url, init) => {
                const payload = JSON.parse(String(init?.body)) as UniqueHourlyPayload;
                deliveries.push(payload);
                return Response.json({ written: payload.rows.length });
            }),
        );
        db = await openDb(":memory:");
    });
    afterEach(async () => {
        await db.close();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it("rolls up clean crafting bases as their own markets, without a rare's random name", async () => {
        const regalia = (id: string, fields: Partial<Item> = {}): Item => ({
            ...belt(id, "~b/o 5 chaos"),
            name: "Doom Shell",
            typeLine: "Twilight Regalia",
            baseType: "Twilight Regalia",
            rarity: "Rare",
            frameType: 2,
            ilvl: 86,
            ...fields,
        });
        await capture([
            {
                account: "merchant-a",
                stashType: "TradeStash",
                items: [
                    regalia("clean"),
                    regalia("unidentified", { identified: false, name: "" }),
                    regalia("corrupted", { corrupted: true }),
                    regalia("low", { ilvl: 60 }),
                    regalia("unlisted", { baseType: "Vaal Regalia", typeLine: "Vaal Regalia" }),
                ],
            },
        ]);
        expect(
            await queryAll(
                db.conn,
                "SELECT item_id, item_key, identified FROM ps_listing ORDER BY item_id",
            ),
        ).toEqual([
            { item_id: "clean", item_key: "Twilight Regalia", identified: true },
            { item_id: "unidentified", item_key: "Twilight Regalia", identified: true },
        ]);
        await rollup();
        expect(deliveries.flatMap((delivery) => delivery.rows)).toMatchObject([
            {
                itemKey: "Twilight Regalia",
                identified: true,
                name: null,
                baseType: "Twilight Regalia",
                links: 0,
                signatureKind: "base",
                signatureValue: "ilvl 86+ · 1–5 links",
                listingCount: 2,
            },
        ]);
    });

    it("compares an unidentified base's sale with identified sellers of its market", async () => {
        const regalia = (id: string, fields: Partial<Item> = {}): Item => ({
            ...belt(id, "~b/o 100 chaos"),
            name: "Doom Shell",
            typeLine: "Twilight Regalia",
            baseType: "Twilight Regalia",
            rarity: "Rare",
            frameType: 2,
            ilvl: 86,
            ...fields,
        });
        await capture([
            {
                account: "seller-a",
                stashType: "TradeStash",
                items: [regalia("sold", { identified: false, name: "" })],
            },
            { account: "seller-b", stashType: "TradeStash", items: [regalia("peer")] },
        ]);
        await capture([{ account: "seller-a", stashType: "TradeStash", items: [] }]);
        expect(
            await queryAll(
                db.conn,
                "SELECT item_id, market_price, market_sellers::INTEGER AS market_sellers FROM ps_sale",
            ),
        ).toEqual([{ item_id: "sold", market_price: 100, market_sellers: 1 }]);
    });

    it("keeps every tab's listings but delivers only merchant tabs", async () => {
        await capture([
            {
                account: "merchant-a",
                stashType: "TradeStash",
                items: [belt("a", "~b/o 100 chaos"), belt("b", "~b/o 120 chaos")],
            },
            {
                account: "other-a",
                stashType: "PremiumStash",
                items: [belt("c", "~price 60 chaos")],
            },
        ]);
        expect(
            await queryAll(db.conn, "SELECT item_id, tab FROM ps_listing ORDER BY item_id"),
        ).toEqual([
            { item_id: "a", tab: "merchant" },
            { item_id: "b", tab: "merchant" },
            { item_id: "c", tab: "other" },
        ]);
        expect(await rollup()).toEqual([["merchant", 2, 110]]);
    });

    it("marks an hour with only other tabs' listings delivered without sending it", async () => {
        await capture([
            {
                account: "other-a",
                stashType: "PremiumStash",
                items: [belt("c", "~price 60 chaos")],
            },
        ]);
        expect(await rollup()).toEqual([]);
        const delivered = () =>
            queryAll<{ row_count: number; delivered: boolean }>(
                db.conn,
                `SELECT r.row_count::INTEGER AS row_count, l.last_seen_at <= r.pushed_at AS delivered
                FROM rollup_state r JOIN ps_listing_hour l
                    ON l.league = r.league AND l.observed_hour = r.hour
                WHERE r.stream_name = 'psapi'`,
            );
        expect(await delivered()).toEqual([{ row_count: 0, delivered: true }]);
        // A later change in that tab also stays out of the app and clears the hour.
        await capture([
            {
                account: "other-a",
                stashType: "PremiumStash",
                items: [belt("c", "~price 50 chaos")],
            },
        ]);
        const [{ hour }] = await queryAll<{ hour: number }>(
            db.conn,
            "SELECT MAX(observed_hour)::DOUBLE AS hour FROM ps_listing_hour",
        );
        await rollupPs(db.conn, { hour, league: "Standard", changedOnly: true });
        expect(deliveries).toEqual([]);
        expect(await delivered()).toEqual([{ row_count: 0, delivered: true }]);
    });

    it("does not deliver listings from before tabs were recorded", async () => {
        await capture([
            {
                account: "merchant-a",
                stashType: "TradeStash",
                items: [belt("a", "~b/o 100 chaos")],
            },
        ]);
        await db.conn.run("UPDATE ps_listing_hour SET tab = NULL");
        expect(await rollup()).toEqual([]);
    });

    it("gives a removed listing from before tabs its stash's tab and prices it against that tab", async () => {
        await capture([
            {
                account: "seller-a",
                stashType: "TradeStash",
                items: [belt("sold", "~b/o 100 chaos")],
            },
            {
                account: "seller-b",
                stashType: "TradeStash",
                items: [belt("peer", "~b/o 110 chaos")],
            },
            {
                account: "seller-c",
                stashType: "PremiumStash",
                items: [belt("other", "~price 40 chaos")],
            },
        ]);
        await db.conn.run("UPDATE ps_listing SET tab = NULL WHERE item_id = 'sold'");
        await capture([{ account: "seller-a", stashType: "TradeStash", items: [] }]);
        expect(
            await queryAll(
                db.conn,
                "SELECT item_id, tab, market_price, market_sellers::INTEGER AS market_sellers FROM ps_sale",
            ),
        ).toEqual([{ item_id: "sold", tab: "merchant", market_price: 110, market_sellers: 1 }]);
    });
});

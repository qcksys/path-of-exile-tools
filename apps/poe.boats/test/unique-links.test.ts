// biome-ignore-all lint/style/useNamingConvention: Fixtures and SQL preserve upstream field names.
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createClient } from "../../../packages/poe-api-client/src/client";
import type { Item, ItemSocket } from "../../../packages/poe-api-client/src/types";
import { ingestPs } from "../../../packages/poe-stash-ingest/src/ps/ingest";
import { rollupPs } from "../../../packages/poe-stash-ingest/src/ps/rollup";
import { openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";
import { itemLinks } from "../../../packages/poe-stash-ingest/src/shared/item-key";
import type { UniqueHourlyPayload } from "../../../packages/poe-stash-ingest/src/shared/remote/types";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth", () => ({ REALM: undefined }));

/** Sockets in linked groups of the given sizes, e.g. `[4, 2]` for a 4-link with a separate 2-link. */
function sockets(...groups: number[]): ItemSocket[] {
    return groups.flatMap((size, group) =>
        Array.from({ length: size }, () => ({ group, attr: "S" as const, sColour: "R" as const })),
    );
}

// Synthetic API fixtures, not evidence of live asking prices.
function armour(id: string, groups: number[], overrides: Partial<Item> = {}): Item {
    return {
        id,
        verified: true,
        w: 2,
        h: 3,
        icon: "https://web.poecdn.com/gen/image/Art/2DItems/Armours/BodyArmours/AtzirisSplendour.png",
        name: "Atziri's Splendour",
        typeLine: "Sacrificial Garb",
        baseType: "Sacrificial Garb",
        rarity: "Unique",
        identified: true,
        frameType: 3,
        sockets: sockets(...groups),
        explicitMods: ["400% increased Armour", "+95 to maximum Life"],
        note: "~price 100 chaos",
        ...overrides,
    };
}

describe("itemLinks", () => {
    it.each([
        [[6], 6],
        [[5, 1], 5],
        [[1, 5], 5],
        [[4, 2], 0],
        [[3, 3], 0],
        [[], 0],
    ])("reads socket groups %j as %i links", (groups, links) => {
        expect(itemLinks(armour("item", groups))).toBe(links);
    });

    it("ignores missing sockets and non-unique items", () => {
        expect(itemLinks(armour("item", [6], { sockets: undefined }))).toBe(0);
        expect(itemLinks(armour("item", [6], { rarity: "Rare", frameType: 2 }))).toBe(0);
    });
});

describe("links split in ingest", () => {
    let db: Awaited<ReturnType<typeof openDb>>;
    const client = createClient({ userAgent: "unique-links-test", token: "inert" });
    const deliveries: UniqueHourlyPayload[] = [];
    let pageNumber = 0;

    function capture(stashes: { account: string; items: Item[] }[]) {
        vi.spyOn(client.public, "stashTabs").mockResolvedValueOnce({
            next_change_id: `fixture-${++pageNumber}`,
            stashes: stashes.map(({ account, items }) => ({
                id: `stash-${account}`,
                public: true,
                accountName: account,
                league: "Standard",
                stash: "",
                stashType: "PremiumStash",
                items,
            })),
        });
        return ingestPs(db.conn, client, { pages: 1, league: "Standard" });
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

    it("rolls up each link count as its own market alongside the mod split", async () => {
        await capture([
            {
                account: "seller-a",
                items: [
                    armour("six", [6], { note: "~price 300 chaos" }),
                    armour("five", [5, 1], { note: "~price 80 chaos" }),
                    armour("four", [4, 2], { note: "~price 40 chaos" }),
                    armour("es-six", [6], {
                        explicitMods: [
                            "+75 to maximum Energy Shield",
                            "285% increased Energy Shield",
                        ],
                        note: "~price 200 chaos",
                    }),
                ],
            },
        ]);
        const [{ hour }] = await queryAll<{ hour: number }>(
            db.conn,
            "SELECT MAX(observed_hour)::DOUBLE AS hour FROM ps_listing_hour",
        );
        await rollupPs(db.conn, { hour, league: "Standard" });
        const rows = deliveries.flatMap((delivery) => delivery.rows);
        expect(
            rows
                .map((row) => [row.signatureValue, row.links, row.prices.chaos?.median])
                .sort((a, b) => String(a).localeCompare(String(b))),
        ).toEqual([
            ["Armour", 0, 40],
            ["Armour", 5, 80],
            ["Armour", 6, 300],
            ["ES", 6, 200],
        ]);
        expect(rows.every((row) => row.signatureKind === "unique-mod-split")).toBe(true);
    });

    it("prices a removed listing only against peers with the same link count", async () => {
        await capture([
            { account: "seller-a", items: [armour("sold", [6], { note: "~price 300 chaos" })] },
            { account: "seller-b", items: [armour("peer-six", [6], { note: "~price 320 chaos" })] },
            { account: "seller-c", items: [armour("peer-four", [4], { note: "~price 40 chaos" })] },
        ]);
        await capture([{ account: "seller-a", items: [] }]);
        expect(
            await queryAll(
                db.conn,
                "SELECT item_id, links, market_price, market_sellers::INTEGER AS market_sellers FROM ps_sale",
            ),
        ).toEqual([{ item_id: "sold", links: 6, market_price: 320, market_sellers: 1 }]);
    });
});

// biome-ignore-all lint/style/useNamingConvention: Fixtures and SQL preserve upstream field names.
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vite-plus/test";
import { createClient } from "../../../packages/poe-api-client/src/client";
import type { Item } from "../../../packages/poe-api-client/src/types";
import { readArchivedPage } from "../../../packages/poe-stash-ingest/src/ps/archive-payload";
import { ingestPs } from "../../../packages/poe-stash-ingest/src/ps/ingest";
import { rollupPs } from "../../../packages/poe-stash-ingest/src/ps/rollup";
import { openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";
import {
    extractModSignature,
    signatureValue,
} from "../../../packages/poe-stash-ingest/src/shared/mod-extractors/index";
import type { UniqueHourlyPayload } from "../../../packages/poe-stash-ingest/src/shared/remote/types";

const auth = vi.hoisted(() => ({ realm: undefined as "poe2" | undefined }));
vi.mock("../../../packages/poe-stash-ingest/src/shared/auth", () => ({
    get REALM() {
        return auth.realm;
    },
}));

const name = "Prime Chaotic Resonator";
const signature = {
    kind: "empty-resonator-v1",
    action: "delve_currency_reroll",
    sockets: 4,
    socketedItems: 0,
};

// These are explicit-state synthetic API fixtures, not evidence of a live asking price.
function resonator(overrides: Partial<Item> = {}): Item {
    return {
        id: "resonator",
        verified: true,
        w: 2,
        h: 2,
        icon: "https://example.invalid/resonator.png",
        name: "",
        typeLine: name,
        baseType: name,
        identified: true,
        frameType: 5,
        sockets: Array.from({ length: 4 }, () => ({ group: 0, attr: "DV", sColour: "DV" })),
        socketedItems: [],
        note: "~price 12/3 chaos",
        ...overrides,
    };
}

describe("explicitly empty Prime Chaotic Resonator signature", () => {
    it.each([
        ["legacy single", {}],
        ["stack", { stackSize: 3, maxStackSize: 10 }],
        ["current currency", { frameType: undefined, rarity: "Currency" }],
        ["consistent currency representations", { rarity: "Currency" }],
    ] satisfies Array<
        [string, Partial<Item>]
    >)("accepts %s only with explicit socket proof", (_label, fields) => {
        const item = resonator(fields);
        const original = structuredClone(item);
        expect(extractModSignature(item)).toEqual(signature);
        expect(signatureValue(extractModSignature(item))).toBe("reroll:4");
        expect(item).toEqual(original);
    });

    it.each([
        ["missing contents", { socketedItems: undefined }],
        ["null contents", { socketedItems: null }],
        ["malformed contents", { socketedItems: {} }],
        ["inserted fossil", { socketedItems: [resonator({ baseType: "Dense Fossil" })] }],
        ["missing sockets", { sockets: undefined }],
        ["null sockets", { sockets: null }],
        ["malformed sockets", { sockets: {} }],
        ["missing socket", { sockets: resonator().sockets?.slice(0, 3) }],
        [
            "extra socket",
            { sockets: [...(resonator().sockets ?? []), { group: 0, attr: "DV", sColour: "DV" }] },
        ],
        ["null socket", { sockets: [null, ...(resonator().sockets?.slice(1) ?? [])] }],
        ["missing colour", { sockets: Array(4).fill({ group: 0, attr: "DV" }) }],
        ["wrong colour", { sockets: Array(4).fill({ group: 0, attr: "DV", sColour: "W" }) }],
        ["wrong attribute", { sockets: Array(4).fill({ group: 0, attr: "A", sColour: "DV" }) }],
        ["negative group", { sockets: Array(4).fill({ group: -1, attr: "DV", sColour: "DV" }) }],
        ["fractional group", { sockets: Array(4).fill({ group: 0.5, attr: "DV", sColour: "DV" }) }],
        [
            "foreign socket fields",
            { sockets: Array(4).fill({ group: 0, attr: "DV", sColour: "DV", type: "rune" }) },
        ],
        ["other base", { baseType: "Potent Chaotic Resonator" }],
        ["inconsistent type", { typeLine: "Prime Alchemical Resonator" }],
        ["named item", { name: "Unknown Name" }],
        ["unidentified", { identified: false }],
        ["unverified", { verified: false }],
        ["wrong frame", { frameType: 0 }],
        ["conflicting rarity", { rarity: "Rare" }],
        ["missing currency identity", { frameType: undefined }],
        ["corrupted", { corrupted: true }],
        ["malformed corruption", { corrupted: "false" }],
        ["account-bound", { lockedToAccount: true }],
        ["character-bound", { lockedToCharacter: true }],
        ["malformed account binding", { lockedToAccount: "false" }],
        ["malformed character binding", { lockedToCharacter: null }],
        ["foil", { foilVariation: 1 }],
        ["null foil", { foilVariation: null }],
        ["modified effects", { explicitMods: ["Reforge a Rare item, including a Life modifier"] }],
        ["malformed effects", { explicitMods: {} }],
        ["foreign item realm", { realm: "poe2" }],
    ])("leaves %s in the generic bucket", (_label, fields) => {
        const item = { ...resonator(), ...fields } as Item;
        expect(extractModSignature(item)).toBeNull();
        expect(signatureValue(extractModSignature(item))).toBe("");
    });
});

describe("empty resonator forward capture", () => {
    let db: Awaited<ReturnType<typeof openDb>>;
    const client = createClient({ userAgent: "empty-resonator-test", token: "inert" });
    let upstream: MockInstance<typeof client.public.stashTabs>;
    const deliveries: UniqueHourlyPayload[] = [];
    let pageNumber = 0;

    async function capture(items: Item[]) {
        upstream.mockResolvedValueOnce({
            next_change_id: `fixture-${++pageNumber}`,
            stashes: [
                {
                    id: "fixture-stash",
                    public: true,
                    accountName: "fixture-seller",
                    league: "Standard",
                    stash: "",
                    stashType: "TradeStash",
                    items,
                },
            ],
        });
        return ingestPs(db.conn, client, { pages: 1, league: "Standard" });
    }

    async function currentHour() {
        const [row] = await queryAll<{ hour: number }>(
            db.conn,
            "SELECT MAX(observed_hour)::DOUBLE AS hour FROM ps_listing_hour",
        );
        return row.hour;
    }

    async function rollup(hour: number) {
        deliveries.length = 0;
        await rollupPs(db.conn, { hour, league: "Standard" });
        return deliveries.flatMap((delivery) => delivery.rows);
    }

    beforeEach(async () => {
        auth.realm = undefined;
        pageNumber = 0;
        deliveries.length = 0;
        upstream = vi.spyOn(client.public, "stashTabs");
        vi.stubEnv("POE_BOATS_INGEST_URL", "https://example.invalid/ingest");
        vi.stubEnv("POE_BOATS_INGEST_TOKEN", "inert");
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url, init) => {
                expect(url).toBe("https://example.invalid/ingest");
                const payload = JSON.parse(String(init?.body)) as UniqueHourlyPayload;
                expect(payload.stream).toBe("psapi");
                deliveries.push(payload);
                return Response.json({ written: payload.rows.length });
            }),
        );
        db = await openDb(":memory:");
    });
    afterEach(async () => {
        await db.close();
        auth.realm = undefined;
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it("archives raw contents and publishes only explicitly empty unit prices in the new bucket", async () => {
        const items = [
            resonator({ stackSize: 3 }),
            resonator({
                id: "modern-empty",
                frameType: undefined,
                rarity: "Currency",
                note: "~price 8 chaos",
            }),
            resonator({
                id: "filled",
                socketedItems: [resonator({ baseType: "Dense Fossil" })],
                note: "~price 100 chaos",
            }),
            resonator({ id: "unknown", socketedItems: undefined, note: "~price 200 chaos" }),
        ];
        expect((await capture(items)).inserted).toBe(4);
        const [page] = await queryAll<{ hash: string }>(
            db.conn,
            "SELECT response_hash AS hash FROM ps_capture_page",
        );
        expect((await readArchivedPage(db.conn, page.hash)).stashes[0].items).toEqual(items);
        expect(
            await queryAll(
                db.conn,
                "SELECT item_id, frame_type FROM ps_listing WHERE signature_value = 'reroll:4' ORDER BY item_id",
            ),
        ).toEqual([
            { item_id: "modern-empty", frame_type: -1 },
            { item_id: "resonator", frame_type: 5 },
        ]);
        const hour = await currentHour();
        const rows = await rollup(hour);
        expect(rows).toHaveLength(2);
        expect(rows.find((row) => row.signatureKind === signature.kind)).toMatchObject({
            realm: "pc",
            league: "Standard",
            hour,
            itemKey: name,
            signatureValue: "reroll:4",
            signatureData: signature,
            listingCount: 2,
            uniqueSellers: 1,
            prices: { chaos: { count: 2, min: 4, median: 6, max: 8 } },
        });
        expect(rows.find((row) => row.signatureKind === "")).toMatchObject({
            signatureValue: "",
            signatureData: null,
            listingCount: 2,
            prices: { chaos: { count: 2, min: 100, median: 150, max: 200 } },
        });
    });

    it("updates same-item states without reclassifying historical generic rows or borrowing sale comparables", async () => {
        await capture([resonator({ socketedItems: undefined })]);
        const hour = await currentHour();
        const previousHour = hour - 3600;
        await db.conn.run("UPDATE ps_listing_hour SET observed_hour = $1", [previousHour]);
        const historical = await rollup(previousHour);
        const peer = resonator({
            id: "generic-peer",
            socketedItems: undefined,
            note: "~price 999 chaos",
        });
        await capture([resonator(), peer]);
        expect(
            (await rollup(hour)).find((row) => row.signatureKind === signature.kind)?.prices.chaos
                ?.median,
        ).toBe(4);
        await capture([
            resonator({ socketedItems: [resonator({ baseType: "Dense Fossil" })] }),
            peer,
        ]);
        expect((await rollup(hour)).every((row) => row.signatureKind === "")).toBe(true);
        await capture([resonator({ socketedItems: undefined }), peer]);
        expect((await rollup(hour)).every((row) => row.signatureKind === "")).toBe(true);
        await capture([resonator({ note: "~price 6 chaos" }), peer]);
        expect(
            (await rollup(hour)).find((row) => row.signatureKind === signature.kind)?.prices.chaos
                ?.median,
        ).toBe(6);
        expect(await rollup(previousHour)).toEqual(historical);
        await capture([peer]);
        expect(
            await queryAll(
                db.conn,
                "SELECT signature_value, mod_signature::VARCHAR AS signature, market_price, market_sellers::INTEGER AS market_sellers FROM ps_sale WHERE item_id = 'resonator'",
            ),
        ).toEqual([
            {
                signature_value: "reroll:4",
                signature: JSON.stringify(signature),
                market_price: null,
                market_sellers: 0,
            },
        ]);
    });

    it("refuses PoE2 at the capture boundary before inspecting or fetching any item", async () => {
        auth.realm = "poe2";
        await expect(ingestPs(db.conn, client, { pages: 1 })).rejects.toThrow(
            "public-stash capture is unavailable",
        );
        expect(upstream).not.toHaveBeenCalled();
        expect(
            await queryAll(db.conn, "SELECT COUNT(*)::INTEGER AS count FROM ps_listing"),
        ).toEqual([{ count: 0 }]);
    });
});

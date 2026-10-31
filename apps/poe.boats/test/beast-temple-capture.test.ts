// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve upstream field names.
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vite-plus/test";
import { createClient } from "../../../packages/poe-api-client/src/client";
import type { Item, ItemProperty } from "../../../packages/poe-api-client/src/types";
import { readArchivedPage } from "../../../packages/poe-stash-ingest/src/ps/archive-payload";
import { ingestPs } from "../../../packages/poe-stash-ingest/src/ps/ingest";
import { rollupPs } from "../../../packages/poe-stash-ingest/src/ps/rollup";
import { shouldCapture } from "../../../packages/poe-stash-ingest/src/shared/capture";
import { openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";
import { itemKey } from "../../../packages/poe-stash-ingest/src/shared/item-key";
import {
    extractModSignature,
    signatureValue,
} from "../../../packages/poe-stash-ingest/src/shared/mod-extractors/index";
import type { UniqueHourlyPayload } from "../../../packages/poe-stash-ingest/src/shared/remote/types";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth", () => ({ REALM: undefined }));

const BESTIARY_ICON =
    "https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQmVzdGlhcnlPcmJGdWxsIiwidyI6MSwiaCI6MSwic2NhbGUiOjF9XQ/3214b44360/BestiaryOrbFull.png";

/** A captured beast as the trade API returned one on 2026-10-29. */
function beast(overrides: Partial<Item> = {}): Item {
    return {
        id: "vulture",
        verified: true,
        w: 1,
        h: 1,
        icon: BESTIARY_ICON,
        name: "Marrowclaws",
        typeLine: "Vivid Vulture",
        baseType: "Vivid Vulture",
        rarity: "Rare",
        frameType: 2,
        identified: true,
        ilvl: 83,
        properties: [
            { name: "Genus", values: [["Vultures", 0]], displayMode: 0, type: 21 },
            { name: "Group", values: [["Avians", 0]], displayMode: 0, type: 22 },
            { name: "Family", values: [["The Sands", 0]], displayMode: 0, type: 23 },
        ],
        explicitMods: ["Putrid Flight", "Saqawine Presence"],
        note: "~price 2 chaos",
        ...overrides,
    } as Item;
}

const room = (text: string, colour = 0): ItemProperty => ({
    name: "",
    values: [[text, colour]],
    displayMode: 0,
    type: 49,
});

/** A Chronicle of Atzoatl with these open and obstructed rooms. */
function chronicle(open: string[], obstructed: string[] = [], overrides: Partial<Item> = {}) {
    return {
        id: "chronicle",
        verified: true,
        w: 1,
        h: 1,
        icon: "https://example.invalid/TempleMap.png",
        name: "",
        typeLine: "Chronicle of Atzoatl",
        baseType: "Chronicle of Atzoatl",
        frameType: 5,
        identified: true,
        ilvl: 0,
        properties: [{ name: "Area Level", values: [["83", 0]], displayMode: 0, type: 34 }],
        additionalProperties: [
            { name: "Open Rooms:", values: [], displayMode: 0 },
            ...open.map((text) => room(text)),
            { name: "Obstructed Rooms:", values: [], displayMode: 0 },
            ...obstructed.map((text) => room(text, 15)),
        ],
        note: "~price 1 chaos",
        ...overrides,
    } as Item;
}

describe("captured beasts", () => {
    it("captures rare beasts by species with a value-less beast signature", () => {
        const item = beast();
        expect(shouldCapture(item)).toBe(true);
        expect(itemKey(item)).toBe("Vivid Vulture");
        expect(extractModSignature(item)).toEqual({ kind: "beast" });
        expect(signatureValue(extractModSignature(item))).toBe("");
    });
    it("leaves other rares uncaptured and spirit beasts in their unique market", () => {
        expect(shouldCapture(beast({ properties: [] }))).toBe(false);
        const spirit = beast({
            name: "",
            typeLine: "Farrul, First of the Plains",
            baseType: "Farrul, First of the Plains",
            rarity: "Unique",
            frameType: 3,
        });
        expect(shouldCapture(spirit)).toBe(true);
        expect(extractModSignature(spirit)).toBeNull();
    });
});

describe("Chronicle of Atzoatl signature", () => {
    it.each([
        [["Locus of Corruption (Tier 3)", "Hall of Lords (Tier 2)"], [], "Locus of Corruption"],
        [
            ["Locus of Corruption (Tier 3)", "Doryani's Institute (Tier 3)"],
            [],
            "Doryani's Institute, Locus of Corruption",
        ],
        [["Locus of Corruption (Tier 2)", "Museum of Artefacts (Tier 3)"], [], ""],
        [["Apex of Atzoatl"], ["Locus of Corruption (Tier 3)"], ""],
    ])("open rooms %j and obstructed %j trade as %j", (open, obstructed, value) => {
        const item = chronicle(open, obstructed);
        expect(shouldCapture(item)).toBe(true);
        expect(itemKey(item)).toBe("Chronicle of Atzoatl");
        expect(extractModSignature(item)?.kind).toBe("temple");
        expect(signatureValue(extractModSignature(item))).toBe(value);
    });
});

describe("beast and temple rollup", () => {
    let db: Awaited<ReturnType<typeof openDb>>;
    const client = createClient({ userAgent: "beast-capture-test", token: "inert" });
    let upstream: MockInstance<typeof client.public.stashTabs>;
    const deliveries: UniqueHourlyPayload[] = [];

    beforeEach(async () => {
        deliveries.length = 0;
        upstream = vi.spyOn(client.public, "stashTabs");
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

    it("drops a rare beast's random name even after a spirit beast teaches the shared icon", async () => {
        upstream.mockResolvedValueOnce({
            next_change_id: "fixture-1",
            stashes: [
                {
                    id: "fixture-stash",
                    public: true,
                    accountName: "fixture-seller",
                    league: "Standard",
                    stash: "",
                    stashType: "TradeStash",
                    items: [
                        beast({
                            id: "spirit",
                            name: "Farrul, First of the Plains",
                            typeLine: "Farrul, First of the Plains",
                            baseType: "Farrul, First of the Plains",
                            rarity: "Unique",
                            frameType: 3,
                            note: "~price 50 chaos",
                        }),
                        beast(),
                        beast({ id: "vulture-2", name: "Gutcrusher", note: "~price 4 chaos" }),
                        chronicle(["Locus of Corruption (Tier 3)"]),
                    ],
                },
            ],
        });
        await ingestPs(db.conn, client, { pages: 1, league: "Standard" });
        const [page] = await queryAll<{ hash: string }>(
            db.conn,
            "SELECT response_hash AS hash FROM ps_capture_page",
        );
        // Replays read the archive, so it must keep every captured beast.
        expect(
            (await readArchivedPage(db.conn, page!.hash)).stashes[0]!.items.map((item) => item.id),
        ).toEqual(["spirit", "vulture", "vulture-2", "chronicle"]);
        const [{ hour }] = await queryAll<{ hour: number }>(
            db.conn,
            "SELECT MAX(observed_hour)::DOUBLE AS hour FROM ps_listing_hour",
        );
        await rollupPs(db.conn, { hour, league: "Standard" });
        const rows = deliveries.flatMap((delivery) => delivery.rows);
        expect(rows.find((row) => row.itemKey === "Vivid Vulture")).toMatchObject({
            name: null,
            signatureKind: "beast",
            signatureValue: "",
            listingCount: 2,
            prices: { chaos: { count: 2, median: 3 } },
        });
        expect(rows.find((row) => row.itemKey === "Chronicle of Atzoatl")).toMatchObject({
            signatureKind: "temple",
            signatureValue: "Locus of Corruption",
            listingCount: 1,
        });
    });
});

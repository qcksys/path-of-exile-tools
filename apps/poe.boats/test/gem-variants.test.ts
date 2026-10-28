// biome-ignore-all lint/style/useNamingConvention: Fixtures and SQL preserve upstream field names.
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createClient } from "../../../packages/poe-api-client/src/client";
import type { Item } from "../../../packages/poe-api-client/src/types";
import { ingestPs } from "../../../packages/poe-stash-ingest/src/ps/ingest";
import { rollupPs } from "../../../packages/poe-stash-ingest/src/ps/rollup";
import { shouldCapture } from "../../../packages/poe-stash-ingest/src/shared/capture";
import { openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";
import { itemKey } from "../../../packages/poe-stash-ingest/src/shared/item-key";
import {
    extractModSignature,
    signatureValue,
} from "../../../packages/poe-stash-ingest/src/shared/mod-extractors";
import type { UniqueHourlyPayload } from "../../../packages/poe-stash-ingest/src/shared/remote/types";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth", () => ({ REALM: undefined }));

// Synthetic API fixtures, not evidence of live asking prices.
function gem(
    id: string,
    typeLine: string,
    level: number,
    quality: number | null,
    overrides: Partial<Item> = {},
    tags = "Spell, AoE, Fire",
): Item {
    return {
        id,
        verified: true,
        w: 1,
        h: 1,
        icon: "https://web.poecdn.com/gen/image/Art/2DItems/Gems/Fireball.png",
        support: false,
        name: "",
        typeLine,
        baseType: typeLine,
        rarity: "Gem",
        identified: true,
        frameType: 4,
        properties: [
            { name: tags, values: [], displayMode: 0 },
            {
                name: "Level",
                values: [[`${level}${level === 20 ? " (Max)" : ""}`, 0]],
                displayMode: 0,
            },
            ...(quality === null
                ? []
                : [
                      {
                          name: "Quality",
                          values: [[`+${quality}%`, 1]] as [string, number][],
                          displayMode: 0,
                      },
                  ]),
        ],
        note: "~price 1 chaos",
        ...overrides,
    };
}

describe("gem capture", () => {
    it("captures gems and keys them by type line", () => {
        const transfigured = gem("kb", "Kinetic Bolt of Fragmentation", 20, 20, {
            baseType: "Kinetic Bolt",
        });
        expect(shouldCapture(transfigured)).toBe(true);
        expect(itemKey(transfigured)).toBe("Kinetic Bolt of Fragmentation");
        expect(shouldCapture(gem("legacy", "Fireball", 1, 0, { rarity: undefined }))).toBe(true);
    });

    it("keys a Vaal gem with a transfigured skill apart from its plain Vaal gem", () => {
        const vaal = (hybridName: string) =>
            gem("va", "Vaal Arc", 20, 20, {
                corrupted: true,
                hybrid: { isVaalGem: true, baseTypeName: hybridName },
            });
        expect(itemKey(vaal("Arc of Surging"))).toBe("Vaal Arc (Arc of Surging)");
        expect(itemKey(vaal("Arc"))).toBe("Vaal Arc");
    });

    const SPELL = "Spell, AoE, Fire";
    const EXCEPTIONAL = "Exceptional, Support";
    it.each([
        ["Fireball", SPELL, 20, 20, "Level 20 (max) · Quality 20%"],
        ["Fireball", SPELL, 21, 23, "Level 21 · Quality 21–23%"],
        ["Fireball", SPELL, 1, null, "Level 1–19 · Quality 0–19%"],
        ["Empower Support", EXCEPTIONAL, 3, 0, "Level 3 (max) · Quality 0–19%"],
        [
            "Greater Multistrike Support",
            `Exceptional, Attack, Melee, Support`,
            4,
            20,
            "Level 4 · Quality 20%",
        ],
        ["Awakened Empower Support", EXCEPTIONAL, 4, 20, "Level 4 (max) · Quality 20%"],
        ["Awakened Empower Support", EXCEPTIONAL, 5, 21, "Level 5 · Quality 21–23%"],
        [
            "Awakened Added Fire Damage Support",
            "Fire, Support",
            5,
            20,
            "Level 5 (max) · Quality 20%",
        ],
        [
            "Awakened Added Fire Damage Support",
            "Fire, Support",
            4,
            21,
            "Level 1–4 · Quality 21–23%",
        ],
    ] as const)("puts %s (%s) at level %i, quality %s in %s", (name, tags, level, quality, value) => {
        const signature = extractModSignature(gem("g", name, level, quality, {}, tags));
        expect(signature?.kind).toBe("gem");
        expect(signatureValue(signature)).toBe(value);
    });

    it("reads no tags from a gem whose first property has values", () => {
        const untagged = gem("g", "Empower Support", 3, 0);
        untagged.properties = untagged.properties!.slice(1);
        expect(signatureValue(extractModSignature(untagged))).toBe("Level 1–19 · Quality 0–19%");
    });

    it("leaves a gem without a level unsplit", () => {
        expect(extractModSignature(gem("g", "Fireball", 1, 0, { properties: [] }))).toBeNull();
    });
});

describe("gem split in ingest", () => {
    let db: Awaited<ReturnType<typeof openDb>>;
    const client = createClient({ userAgent: "gem-variants-test", token: "inert" });
    const deliveries: UniqueHourlyPayload[] = [];
    let pageNumber = 0;

    function capture(items: Item[]) {
        vi.spyOn(client.public, "stashTabs").mockResolvedValueOnce({
            next_change_id: `fixture-${++pageNumber}`,
            stashes: [
                {
                    id: "stash-gems",
                    public: true,
                    accountName: "seller-a",
                    league: "Standard",
                    stash: "",
                    stashType: "PremiumStash",
                    items,
                },
            ],
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

    it("rolls up each band and corruption state of a gem as its own market", async () => {
        await capture([
            gem("a", "Fireball", 20, 20, { note: "~price 5 chaos" }),
            gem("b", "Fireball", 20, 20, { note: "~price 7 chaos" }),
            gem("c", "Fireball", 20, 20, { corrupted: true, note: "~price 3 chaos" }),
            gem("d", "Fireball", 21, 20, { corrupted: true, note: "~price 40 chaos" }),
            gem("e", "Fireball", 12, 4, { note: "~price 1 chaos" }),
            gem("f", "Fireball of Fragmentation", 20, 20, { note: "~price 9 chaos" }),
        ]);
        const [{ hour }] = await queryAll<{ hour: number }>(
            db.conn,
            "SELECT MAX(observed_hour)::DOUBLE AS hour FROM ps_listing_hour",
        );
        await rollupPs(db.conn, { hour, league: "Standard" });
        const rows = deliveries.flatMap((delivery) => delivery.rows);
        expect(rows.every((row) => row.signatureKind === "gem")).toBe(true);
        expect(
            rows
                .map((row) => [
                    row.itemKey,
                    row.signatureValue,
                    row.corrupted,
                    row.listingCount,
                    row.prices.chaos?.median,
                ])
                .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        ).toEqual([
            ["Fireball of Fragmentation", "Level 20 (max) · Quality 20%", false, 1, 9],
            ["Fireball", "Level 1–19 · Quality 0–19%", false, 1, 1],
            ["Fireball", "Level 20 (max) · Quality 20%", false, 2, 6],
            ["Fireball", "Level 20 (max) · Quality 20%", true, 1, 3],
            ["Fireball", "Level 21 · Quality 20%", true, 1, 40],
        ]);
    });
});

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

const SIX_MODS = [
    "Players are Cursed with Vulnerability",
    "Players are Cursed with Temporal Chains",
    "Players are Cursed with Elemental Weakness",
    "92% more Monster Life",
    "Monsters have +1 to Maximum Frenzy Charges",
    "Monsters gain a Frenzy Charge on Hit",
    "Monsters have +100% chance to Suppress Spell Damage",
    "Buffs on Players expire 100% faster",
    "Players have 40% less effect of Flasks applied to them",
];
const EIGHT_MODS = [
    "Area has patches of Burning Ground",
    "Players are Cursed with Temporal Chains",
    "Rare Monsters have [PhysicalThorns|Physical Thorns] reflecting 1500 Physical Damage",
    "Rare Monsters have [ElementalThorns|Elemental Thorns] reflecting 2500 Elemental Damage",
    "+40% Monster Physical Damage Reduction",
    "Monsters have +1 to Maximum Power Charges",
    "Monsters gain a Power Charge on Hit",
    "Monsters gain 184% of their Physical Damage as Extra Damage of a random Element",
    "Players have 40% less Cooldown Recovery Rate",
    "Map Boss is accompanied by a Synthesis Boss",
];

// Synthetic API fixtures, not evidence of live asking prices.
function map(
    id: string,
    baseType: string,
    {
        quantity,
        explicitMods = [],
        delirious,
        ...overrides
    }: Partial<Item> & { quantity?: number; delirious?: number } = {},
): Item {
    return {
        id,
        verified: true,
        w: 1,
        h: 1,
        icon: "https://web.poecdn.com/gen/image/Art/2DItems/Maps/Atlas2Maps/New/Map.png",
        name: "",
        typeLine: baseType,
        baseType,
        rarity: explicitMods.length ? "Rare" : "Normal",
        identified: true,
        frameType: explicitMods.length ? 2 : 0,
        properties:
            quantity === undefined
                ? []
                : [{ name: "Item Quantity", values: [[`+${quantity}%`, 1]], displayMode: 0 }],
        explicitMods,
        ...(delirious
            ? {
                  enchantMods: [
                      "Delirium Reward Type: Currency",
                      `Players in Area are ${delirious}% Delirious`,
                  ],
              }
            : {}),
        note: "~price 1 chaos",
        ...overrides,
    };
}

describe("map capture", () => {
    it("captures tier and Nightmare maps, keyed by base type whether identified or not", () => {
        const unidentified = map("u", "Map (Tier 16)", { identified: false, rarity: "Rare" });
        expect(shouldCapture(unidentified)).toBe(true);
        expect(itemKey(unidentified, "Art/2DItems/Maps/Map")).toBe("Map (Tier 16)");
        expect(shouldCapture(map("n", "Nightmare Map"))).toBe(true);
        expect(itemKey(map("n", "Nightmare Map"))).toBe("Nightmare Map");
    });

    it("leaves blighted maps and legacy map bases uncaptured", () => {
        expect(
            shouldCapture(map("b", "Map (Tier 14)", { typeLine: "Blighted Map (Tier 14)" })),
        ).toBe(false);
        expect(shouldCapture(map("s", "Strand Map"))).toBe(false);
    });

    it("keys a unique map by its name, as other uniques", () => {
        const unique = map("o", "Map (Tier 16)", {
            name: "Olmec's Sanctum",
            rarity: "Unique",
            frameType: 3,
        });
        expect(itemKey(unique)).toBe("Olmec's Sanctum");
        expect(extractModSignature(unique)).toBeNull();
    });

    it.each([
        [
            "an 8-mod tier 16 map",
            map("a", "Map (Tier 16)", { explicitMods: EIGHT_MODS, quantity: 101, delirious: 40 }),
            "8 mods · Quantity 100–119% · Delirium 40%",
        ],
        [
            "a 6-mod Nightmare map",
            map("b", "Nightmare Map", { explicitMods: SIX_MODS, quantity: 84 }),
            "1–6 mods · Quantity 80–99% · Delirium 0%",
        ],
        [
            "a normal tier 16 map",
            map("c", "Map (Tier 16)"),
            "1–6 mods · Quantity 0–59% · Delirium 0%",
        ],
        [
            "an 8-mod tier 15 map, without a quantity band",
            map("d", "Map (Tier 15)", { explicitMods: EIGHT_MODS, quantity: 140 }),
            "8 mods · Delirium 0%",
        ],
        [
            "an unidentified delirious tier 16 map",
            map("e", "Map (Tier 16)", { identified: false, rarity: "Rare", delirious: 20 }),
            "Unidentified · Delirium 20%",
        ],
        [
            "a Memory Influenced tier 12 map",
            map("f", "Map (Tier 12)", {
                explicitMods: EIGHT_MODS,
                implicitMods: ["Area is Influenced by the Originator's Memories"],
            }),
            "8 mods · Delirium 0% · Memory",
        ],
        [
            "a Shaper influenced tier 16 map",
            map("h", "Map (Tier 16)", {
                explicitMods: EIGHT_MODS,
                quantity: 120,
                implicitMods: ["Area is influenced by The Shaper"],
            }),
            "8 mods · Quantity 120–139% · Delirium 0% · Shaper",
        ],
        [
            "an unidentified Memory Influenced map",
            map("g", "Map (Tier 16)", {
                identified: false,
                rarity: "Rare",
                implicitMods: ["Area is Influenced by the Originator's Memories"],
            }),
            "Unidentified · Delirium 0% · Memory",
        ],
    ])("bands %s", (_name, item, value) => {
        const signature = extractModSignature(item);
        expect(signature?.kind).toBe("map");
        expect(signatureValue(signature)).toBe(value);
    });
});

describe("map split in ingest", () => {
    let db: Awaited<ReturnType<typeof openDb>>;
    const client = createClient({ userAgent: "map-variants-test", token: "inert" });
    const deliveries: UniqueHourlyPayload[] = [];

    beforeEach(async () => {
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

    it("rolls up each band, corruption and identification state of a map as its own market", async () => {
        vi.spyOn(client.public, "stashTabs").mockResolvedValueOnce({
            next_change_id: "fixture-1",
            stashes: [
                {
                    id: "stash-maps",
                    public: true,
                    accountName: "seller-a",
                    league: "Standard",
                    stash: "",
                    stashType: "PremiumStash",
                    items: [
                        map("a", "Map (Tier 16)", {
                            name: "Damnation Carving",
                            explicitMods: EIGHT_MODS,
                            quantity: 105,
                            corrupted: true,
                            note: "~price 3 divine",
                        }),
                        map("b", "Map (Tier 16)", {
                            name: "Hate Carving",
                            explicitMods: EIGHT_MODS,
                            quantity: 112,
                            corrupted: true,
                            note: "~price 5 divine",
                        }),
                        map("c", "Map (Tier 16)", { note: "~price 2 chaos" }),
                        map("d", "Map (Tier 16)", {
                            identified: false,
                            rarity: "Rare",
                            note: "~price 4 chaos",
                        }),
                        map("e", "Map (Tier 3)", { note: "~price 1 chaos" }),
                        map("f", "Map (Tier 3)", {
                            implicitMods: ["Area is Influenced by the Originator's Memories"],
                            note: "~price 6 chaos",
                        }),
                        map("g", "Map (Tier 3)", {
                            implicitMods: ["Area is influenced by The Elder"],
                            note: "~price 7 chaos",
                        }),
                        map("h", "Map (Tier 3)", {
                            implicitMods: [
                                "Area is influenced by The Elder",
                                "Map is occupied by The Constrictor",
                            ],
                            note: "~price 8 chaos",
                        }),
                        map("i", "Map (Tier 3)", {
                            implicitMods: [
                                "Area is influenced by The Elder",
                                "Map is occupied by The Eradicator",
                            ],
                            note: "~price 9 chaos",
                        }),
                    ],
                },
            ],
        });
        await ingestPs(db.conn, client, { pages: 1, league: "Standard" });
        const [{ hour }] = await queryAll<{ hour: number }>(
            db.conn,
            "SELECT MAX(observed_hour)::DOUBLE AS hour FROM ps_listing_hour",
        );
        await rollupPs(db.conn, { hour, league: "Standard" });
        const rows = deliveries.flatMap((delivery) => delivery.rows);
        expect(rows.every((row) => row.signatureKind === "map")).toBe(true);
        expect(rows.every((row) => row.name === null)).toBe(true);
        expect(
            rows
                .map((row) => [
                    row.itemKey,
                    row.signatureValue,
                    row.corrupted,
                    row.identified,
                    row.listingCount,
                ])
                .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        ).toEqual([
            ["Map (Tier 16)", "1–6 mods · Quantity 0–59% · Delirium 0%", false, true, 1],
            ["Map (Tier 16)", "8 mods · Quantity 100–119% · Delirium 0%", true, true, 2],
            ["Map (Tier 16)", "Unidentified · Delirium 0%", false, false, 1],
            ["Map (Tier 3)", "1–6 mods · Delirium 0% · Elder Guardian", false, true, 2],
            ["Map (Tier 3)", "1–6 mods · Delirium 0% · Elder", false, true, 1],
            ["Map (Tier 3)", "1–6 mods · Delirium 0% · Memory", false, true, 1],
            ["Map (Tier 3)", "1–6 mods · Delirium 0%", false, true, 1],
        ]);
    });
});

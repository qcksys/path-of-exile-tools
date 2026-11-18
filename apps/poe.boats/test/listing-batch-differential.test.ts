// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve the public-stash wire format.
import { yellowBeastNames } from "@poe-tools/market";
import { describe, expect, it, vi } from "vite-plus/test";
import type { PublicStashChange } from "../../../packages/poe-api-client/src/types";
import { applyStashChanges } from "../../../packages/poe-stash-ingest/src/ps/ingest";
import { ListingBatch } from "../../../packages/poe-stash-ingest/src/ps/listing-batch";
import {
    type ListingState,
    loadListingState,
} from "../../../packages/poe-stash-ingest/src/ps/listing-state";
import {
    type DbHandle,
    openDb,
    queryAll,
    withTransaction,
} from "../../../packages/poe-stash-ingest/src/shared/db";

type DuckDBConnection = DbHandle["conn"];

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth", () => ({ REALM: undefined }));

// The batch engine must write exactly what applying each page with `applyStashChanges` writes,
// whatever the batch size: listings, hour rows, sales with their markets, and the basemap.
type Item = PublicStashChange["items"][number];

function random(seed: number) {
    let state = seed;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const icon = (asset: string) =>
    `https://web.poecdn.com/gen/image/${Buffer.from(JSON.stringify([25, 14, { f: asset }])).toString("base64url")}/x.png`;
const hex = (n: number) => n.toString(16).padStart(64, "0");
const UNIQUES = [
    { name: "Doom Shell", baseType: "Plate Vest" },
    { name: "Kaom's Heart", baseType: "Glorious Plate" },
    { name: "Headhunter", baseType: "Leather Belt" },
];
const AURAS = ["Hatred", "Wrath"];
const ACCOUNTS = ["alice", "Bob", "carol", "ÄNNA", "dave"];
const PRICES = ["~price 5 chaos", "~price 10 chaos", "~b/o 2 divine", "~price 7 chaos", ""];

interface Stash {
    id: string;
    account: string;
    league: string;
    stashType: string;
    public: boolean;
    items: Map<string, Item>;
}

/** A league of stashes changed at random, page by page: every kind of change `applyRound` handles. */
function world(seed: number) {
    const next = random(seed);
    const pick = <T>(values: readonly T[]) => values[Math.floor(next() * values.length)]!;
    let itemNumber = 0;
    const removed: { stash: Stash; item: Item }[] = [];
    const item = (): Item => {
        const id = next() < 0.8 ? hex(++itemNumber * 7919) : `item-${++itemNumber}`;
        const kind = next();
        const base = { id, verified: true, w: 1, h: 1, ilvl: 80, note: pick(PRICES) };
        if (kind < 0.3) {
            const unique = pick(UNIQUES);
            return {
                ...base,
                icon: icon(`Art/${unique.name}`),
                name: unique.name,
                typeLine: unique.baseType,
                baseType: unique.baseType,
                identified: next() < 0.85,
                rarity: "Unique",
                frameType: 3,
                corrupted: next() < 0.1,
            } as Item;
        }
        if (kind < 0.6)
            return {
                ...base,
                note: pick(["~price 5 chaos", "~price 9 chaos", "~price 12 chaos"]),
                icon: icon("Art/WatchersEye"),
                name: "Watcher's Eye",
                typeLine: "Prismatic Jewel",
                baseType: "Prismatic Jewel",
                identified: true,
                rarity: "Unique",
                frameType: 3,
                explicitMods: [
                    "+5% to maximum Energy Shield",
                    `${Math.floor(next() * 20)}% increased Damage while affected by ${pick(AURAS)}`,
                    ...(next() < 0.2
                        ? [`Gain 10% of Damage as Extra Fire while affected by ${pick(AURAS)}`]
                        : []),
                ],
            } as Item;
        if (kind < 0.75) {
            const species = pick(yellowBeastNames.slice(0, 3));
            return {
                ...base,
                icon: icon("Art/Beast"),
                name: "Random Name",
                typeLine: species,
                baseType: species,
                identified: true,
                rarity: "Rare",
                frameType: 2,
                properties: ["Genus", "Group", "Family"].map((name) => ({
                    name,
                    values: [["x", 0]],
                    displayMode: 0,
                })),
            } as Item;
        }
        return {
            ...base,
            icon: icon("Art/Chaos"),
            typeLine: pick(["Chaos Orb", "Divine Orb"]),
            baseType: "Chaos Orb",
            identified: true,
            frameType: 5,
            stackSize: 1 + Math.floor(next() * 10),
        } as Item;
    };
    const stashes: Stash[] = Array.from({ length: 14 }, (_, n) => ({
        id: n % 3 ? hex(10_000 + n) : `stash-${n}`,
        account: ACCOUNTS[n % ACCOUNTS.length]!,
        league: n === 13 ? "Hardcore" : "Standard",
        stashType: n % 4 === 0 ? "PremiumStash" : "TradeStash",
        public: true,
        items: new Map(Array.from({ length: 6 }, () => item()).map((i) => [i.id!, i])),
    }));
    const snapshot = (stash: Stash): PublicStashChange =>
        ({
            id: stash.id,
            public: stash.public,
            accountName: stash.account,
            league: stash.league,
            stash: "Sales",
            stashType: stash.stashType,
            items: stash.public
                ? [...stash.items.values()].map((i) => ({
                      ...i,
                      // Re-sent unchanged items move and change inventoryId.
                      x: Math.floor(next() * 12),
                      inventoryId: `Stash${Math.floor(next() * 3)}`,
                  }))
                : [],
        }) as PublicStashChange;
    const change = (stash: Stash) => {
        const op = next();
        const items = [...stash.items.values()];
        if (op < 0.04) stash.public = !stash.public;
        else if (op < 0.06) stash.account = pick(ACCOUNTS);
        else if (op < 0.08)
            stash.stashType = stash.stashType === "TradeStash" ? "PremiumStash" : "TradeStash";
        else if (op < 0.3) {
            const fresh = item();
            stash.items.set(fresh.id!, fresh);
        } else if (op < 0.45 && items.length) {
            const gone = pick(items);
            stash.items.delete(gone.id!);
            removed.push({ stash, item: gone });
        } else if (op < 0.55 && removed.length) {
            // Back in the stash it left, or moved to another stash of the same account.
            const back = removed.splice(Math.floor(next() * removed.length), 1)[0]!;
            const target =
                next() < 0.5
                    ? back.stash
                    : pick(stashes.filter((s) => s.account === back.stash.account));
            target.items.set(back.item.id!, back.item);
        } else if (op < 0.75 && items.length) {
            const changed = pick(items);
            stash.items.set(changed.id!, { ...changed, note: pick(PRICES) });
        } else if (op < 0.8 && items.length) {
            // Identifying an unidentified unique changes its item key.
            const changed = pick(items);
            stash.items.set(changed.id!, {
                ...changed,
                identified: true,
                corrupted: !changed.corrupted,
            });
        }
        return snapshot(stash);
    };
    return {
        page(): PublicStashChange[] {
            const changes: PublicStashChange[] = [];
            for (let n = 1 + Math.floor(next() * 5); n > 0; n--) {
                const stash = pick(stashes);
                changes.push(change(stash));
                // The same stash twice in one page: rounds apply them in order.
                if (next() < 0.15) changes.push(change(stash));
            }
            return changes;
        },
    };
}

const START = Date.UTC(2026, 10, 10, 6, 5);
/** About eight pages an hour, with a day's gap so markets lose stale listings. */
const pageTime = (page: number) => START + page * 7 * 60_000 + (page >= 40 ? 25 * 3_600_000 : 0);
const HOUR_US = 3_600_000_000;

async function tables(conn: DuckDBConnection) {
    const read = async (sql: string) => (await conn.runAndReadAll(sql)).getRowObjectsJson();
    return {
        listings: await read(
            "SELECT * EXCLUDE (listing_id) FROM ps_listing ORDER BY account_name, stash_id, item_id",
        ),
        hours: await read(
            "SELECT * FROM ps_listing_hour ORDER BY observed_hour, account_name, stash_id, item_id",
        ),
        sales: await read(
            "SELECT * EXCLUDE (updated_at) FROM ps_sale ORDER BY removed_at, stash_id, item_id, account_name",
        ),
        basemap: await read(
            "SELECT icon_asset, name, base_type, seen_count FROM icon_basemap ORDER BY icon_asset",
        ),
    };
}

async function setUp(conn: DuckDBConnection) {
    // Caught up for the first hours only, so later sales are unobserved.
    await conn.run(
        `INSERT INTO pipeline_health VALUES (1, current_timestamp, true, make_timestamp(${(START + 3 * 3_600_000) * 1000}))`,
    );
}

async function runBatches(
    conn: DuckDBConnection,
    state: ListingState,
    pages: PublicStashChange[][],
    first: number,
    size: number,
) {
    let batch: ListingBatch | undefined;
    const commit = async () => {
        await batch!.flush(conn);
        await conn.run("COMMIT");
        batch = undefined;
    };
    for (const [n, changes] of pages.entries()) {
        const at = pageTime(first + n) * 1000;
        const hour = Math.floor(at / HOUR_US) * HOUR_US;
        if (batch && (batch.pages >= size || batch.hour !== hour)) await commit();
        if (!batch) {
            await conn.run("BEGIN TRANSACTION");
            batch = await ListingBatch.open(conn, state, hour);
        }
        batch.applyPage(changes, at);
    }
    if (batch) await commit();
}

const covered = new Set<string>();

describe("listing batches write what page-by-page ingest writes", () => {
    // DIFF_SEEDS=n runs n more seeds, for a longer local search.
    const extra = Number(process.env.DIFF_SEEDS ?? 0);
    for (const [seed, size] of [
        [1, 1],
        [2, 4],
        [3, 50],
        [4, 7],
        [5, 200],
        [6, 2],
        ...Array.from({ length: extra }, (_, n) => [100 + n, [1, 3, 9, 200][n % 4]!] as const),
    ] as const) {
        it(`seed ${seed}, batches of ${size} pages`, async () => {
            const league = world(seed);
            const pages = Array.from({ length: 70 }, () => league.page());
            const reference = await openDb(":memory:");
            const batched = await openDb(":memory:");
            try {
                await setUp(reference.conn);
                await setUp(batched.conn);
                // Both start from rows the reference wrote, as the worker starts from its database.
                for (const [n, changes] of pages.slice(0, 15).entries())
                    for (const db of [reference, batched])
                        await withTransaction(db.conn, () =>
                            applyStashChanges(db.conn, changes, new Date(pageTime(n))),
                        );
                for (const [n, changes] of pages.slice(15).entries())
                    await withTransaction(reference.conn, () =>
                        applyStashChanges(reference.conn, changes, new Date(pageTime(15 + n))),
                    );
                const state = await loadListingState(batched.conn);
                await runBatches(batched.conn, state, pages.slice(15, 55), 15, size);
                // A restarted worker reads the rows the batches wrote.
                const restarted = await loadListingState(batched.conn);
                await runBatches(batched.conn, restarted, pages.slice(55), 55, size);

                const expected = await tables(reference.conn);
                const actual = await tables(batched.conn);
                expect(actual.listings).toEqual(expected.listings);
                expect(actual.hours).toEqual(expected.hours);
                expect(actual.sales).toEqual(expected.sales);
                expect(actual.basemap).toEqual(expected.basemap);
                // The sequences must exercise what they are meant to; see the last test.
                const sales = (
                    expected.sales as {
                        status: string;
                        market_price: number | null;
                        item_key: string;
                        mod_signature: string | null;
                    }[]
                ).map((sale) => ({
                    ...sale,
                    mod_signature: JSON.parse(sale.mod_signature ?? "null") as {
                        kind?: string;
                    } | null,
                }));
                expect(sales.length).toBeGreaterThan(20);
                for (const status of ["pending", "unobserved", "withdrawn"])
                    if (sales.some((sale) => sale.status === status)) covered.add(status);
                // Mod pool uniques priced by mod, and yellow beasts priced across species.
                if (
                    sales.some(
                        (s) => s.mod_signature?.kind === "watchers-eye" && s.market_price !== null,
                    )
                )
                    covered.add("mod pool market");
                if (
                    sales.some(
                        (s) => yellowBeastNames.includes(s.item_key) && s.market_price !== null,
                    )
                )
                    covered.add("yellow beast market");
                const listings = expected.listings as { item_key: string }[];
                if (listings.some((listing) => listing.item_key.startsWith("unid:")))
                    covered.add("unidentified");
                const [hours] = await queryAll<{ n: number }>(
                    reference.conn,
                    "SELECT count(DISTINCT observed_hour)::INTEGER AS n FROM ps_listing_hour",
                );
                if (hours!.n > 5) covered.add("hours");
            } finally {
                await reference.close();
                await batched.close();
            }
        }, 60_000);
    }

    // Runs after the seeds above, which record what their sequences exercised.
    it("between them, the sequences exercise every case", () => {
        expect([...covered].sort()).toEqual(
            [
                "hours",
                "mod pool market",
                "pending",
                "unidentified",
                "unobserved",
                "withdrawn",
                "yellow beast market",
            ].sort(),
        );
    });
});

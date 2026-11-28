// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve upstream field names.
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { flushRollups } from "../../../packages/poe-stash-ingest/src/pipeline";
import { applyStashChanges, ingestPs } from "../../../packages/poe-stash-ingest/src/ps/ingest";
import { listingRows } from "../../../packages/poe-stash-ingest/src/ps/listing-rows";
import { rollupPs } from "../../../packages/poe-stash-ingest/src/ps/rollup";
import { openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";
import { configureSource } from "../../../packages/poe-stash-ingest/src/shared/source";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth", () => ({ REALM: undefined }));

type Changes = Parameters<typeof applyStashChanges>[1];
const LEAGUE = "Standard";
const HOUR = Date.UTC(2026, 9, 28, 10) / 1000;
const at = (minute: number) => new Date((HOUR + minute * 60) * 1000);
const item = (name: string, baseType = "Leather Belt", icon = name) => ({
    id: `id-${name}`,
    verified: true,
    w: 2,
    h: 1,
    icon: `https://web.poecdn.com/gen/image/${Buffer.from(
        JSON.stringify([25, 14, { f: `2DItems/${icon}` }]),
    ).toString("base64url")}/x/y.png`,
    name,
    typeLine: baseType,
    baseType,
    frameType: 3,
    identified: true,
    ilvl: 86,
    note: "~price 10 divine",
});
const stash = (id: string, ...items: ReturnType<typeof item>[]) =>
    [
        {
            id,
            public: true,
            accountName: `seller-${id}`,
            league: LEAGUE,
            stashType: "TradeStash",
            items,
        },
    ] as unknown as Changes;

let pushed: { itemKey: string; hour: number }[];
beforeEach(() => {
    pushed = [];
    vi.stubEnv("POE_BOATS_INGEST_URL", "https://receiver.invalid/ingest");
    vi.stubEnv("POE_BOATS_INGEST_TOKEN", "inert");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: { body: string }) => {
            const { rows } = JSON.parse(init.body) as { rows: typeof pushed };
            pushed.push(...rows);
            return new Response(JSON.stringify({ written: rows.length }));
        }),
    );
});
afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

async function deliveredHour() {
    const db = await openDb(":memory:");
    await configureSource(db.conn, "pc", LEAGUE);
    await applyStashChanges(
        db.conn,
        stash("a", item("Headhunter"), item("Mageblood", "Heavy Belt")),
        at(5),
    );
    await applyStashChanges(db.conn, stash("b", item("Bated Breath", "Chain Belt")), at(6));
    await applyStashChanges(db.conn, stash("a", item("Mageblood", "Heavy Belt")), at(10));
    const flush = () => flushRollups(db.conn, { league: LEAGUE, stashBeforeHour: HOUR + 3600 });
    await flush();
    return { db, flush };
}

const itemKeys = () => pushed.map((row) => row.itemKey).sort();

it("delivers Standard collector art alongside a challenge league and records a subsequent removal", async () => {
    vi.stubEnv("PS_COLLECT_STANDARD", "true");
    const db = await openDb(":memory:");
    const beacon = (alternate: boolean) =>
        item(
            "Demigod's Beacon",
            "Golden Flame",
            `Armours/Shields/DemigodsShield${alternate ? "Alt" : ""}`,
        );
    const original = beacon(false);
    const alt = { ...beacon(true), id: "alternate", flavourText: ["SG Race Season Reward"] };
    const plain = item("Ordinary unique");
    const season = { ...stash("season", plain)[0]!, league: "Challenge" };
    const send = async (changes: Changes, minute: number) =>
        ingestPs(
            db.conn,
            {
                public: {
                    stashTabs: async () => ({ next_change_id: String(minute), stashes: changes }),
                },
            } as Parameters<typeof ingestPs>[1],
            {
                league: "Challenge",
                pages: 1,
                observedAt: at(minute),
                listingsObservedAt: at(minute),
            },
        );
    try {
        await send([season, ...stash("standard", original, alt, plain)], 1);
        await send(stash("standard", alt, plain), 8);
        await flushRollups(db.conn, { league: "Challenge", stashBeforeHour: HOUR + 3600 });
        const key = "collector:2DItems/Armours/Shields/DemigodsShield";
        expect(itemKeys()).toEqual([plain.name, key, `${key}Alt`].sort());
        expect(pushed).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    itemKey: key,
                    league: "Standard",
                    signatureKind: "collector-art",
                    removedCount: 1,
                }),
                expect.objectContaining({
                    itemKey: `${key}Alt`,
                    league: "Standard",
                    listingCount: 1,
                    prices: { divine: expect.objectContaining({ min: 10 }) },
                }),
                expect.objectContaining({ itemKey: plain.name, league: "Challenge" }),
            ]),
        );
    } finally {
        await db.close();
    }
});

it("separates base artworks and pools copies with the same artwork across race reward origins", () => {
    const ring = (asset: string) => ({
        ...item("Rolled name", "Coral Ring", `Rings/${asset}`),
        frameType: 2,
    });
    const first = ring("Ring2b");
    const second = ring("CoralRingAlt");
    const rows = listingRows(
        {
            ...stash("standard")[0]!,
            items: [
                first,
                { ...first, flavourText: ["TH Race Season Reward"] },
                second,
                { ...first, foilVariation: 1 },
                { ...first, frameType: 3 },
                ring("Ring2"),
            ],
        },
        "seller",
        "Standard",
        true,
    );
    expect(rows.map((row) => row.itemKey)).toEqual([
        "collector:2DItems/Rings/Ring2b",
        "collector:2DItems/Rings/Ring2b",
        "collector:2DItems/Rings/CoralRingAlt",
    ]);
});

async function rowCount(conn: Awaited<ReturnType<typeof openDb>>["conn"]) {
    const [state] = await queryAll<{ n: number }>(
        conn,
        "SELECT row_count::INT AS n FROM rollup_state WHERE stream_name = 'psapi'",
    );
    return state?.n;
}

// A sale's status changing long after its hour, such as a later relisting.
const relistSale = (conn: Awaited<ReturnType<typeof openDb>>["conn"]) =>
    conn.run("UPDATE ps_sale SET status = 'relisted', updated_at = current_timestamp::TIMESTAMP");

it("sends a whole hour first, then only the item whose sale changed", async () => {
    const { db, flush } = await deliveredHour();
    try {
        expect(itemKeys()).toEqual(["Bated Breath", "Headhunter", "Mageblood"]);
        expect(await rowCount(db.conn)).toBe(3);

        pushed.length = 0;
        expect((await flush()).hours).toBe(0);
        expect(pushed).toEqual([]);

        await new Promise((resolve) => setTimeout(resolve, 5));
        await relistSale(db.conn);
        expect(await flush()).toMatchObject({ hours: 1, rows: 1 });
        expect(pushed).toMatchObject([{ itemKey: "Headhunter", hour: HOUR, relistedCount: 1 }]);
        // The hour's size is unchanged, and it is no longer pending.
        expect(await rowCount(db.conn)).toBe(3);
        pushed.length = 0;
        expect((await flush()).hours).toBe(0);
    } finally {
        await db.close();
    }
});

it("holds a delivered hour's changes back until its last delivery is old enough", async () => {
    const { db } = await deliveredHour();
    const flush = () =>
        flushRollups(db.conn, {
            league: LEAGUE,
            stashBeforeHour: HOUR + 3600,
            redeliverAfterMinutes: 30,
        });
    try {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await relistSale(db.conn);
        pushed.length = 0;
        expect((await flush()).hours).toBe(0);
        expect(pushed).toEqual([]);

        // As if 31 minutes had passed since the delivery (and since the icons were learned).
        await db.conn.run(
            "UPDATE rollup_state SET pushed_at = pushed_at - INTERVAL 31 MINUTE WHERE stream_name = 'psapi'",
        );
        await db.conn.run(
            "UPDATE icon_basemap SET first_seen_at = first_seen_at - INTERVAL 1 HOUR",
        );
        expect(await flush()).toMatchObject({ hours: 1, rows: 1 });
        expect(pushed).toMatchObject([{ itemKey: "Headhunter", relistedCount: 1 }]);
    } finally {
        await db.close();
    }
});

it("delivers a new hour at once while an earlier hour's changes wait", async () => {
    const { db } = await deliveredHour();
    try {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await applyStashChanges(db.conn, stash("c", item("Bated Breath", "Chain Belt")), at(65));
        await relistSale(db.conn);
        pushed.length = 0;
        expect(
            await flushRollups(db.conn, {
                league: LEAGUE,
                stashBeforeHour: HOUR + 7200,
                redeliverAfterMinutes: 30,
            }),
        ).toMatchObject({ hours: 1 });
        expect(new Set(pushed.map((row) => row.hour))).toEqual(new Set([HOUR + 3600]));
    } finally {
        await db.close();
    }
});

it("matches what a whole-hour rollup sends for the changed item", async () => {
    const { db, flush } = await deliveredHour();
    try {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await relistSale(db.conn);
        pushed.length = 0;
        await flush();
        const [narrow] = pushed;
        pushed.length = 0;
        await rollupPs(db.conn, { hour: HOUR, league: LEAGUE });
        expect(pushed).toHaveLength(3);
        expect(pushed.find((row) => row.itemKey === "Headhunter")).toEqual(narrow);
    } finally {
        await db.close();
    }
});

it("resends only the markets that hold the changed sale, as a whole-hour rollup has them", async () => {
    const eye = (id: string, ...explicitMods: string[]) => ({
        ...item("Watcher's Eye", "Prismatic Jewel", "Jewels/ElderJewel"),
        id: `id-${id}`,
        explicitMods,
    });
    const anger = "+20% to Critical Strike Multiplier while affected by Anger";
    const db = await openDb(":memory:");
    try {
        await configureSource(db.conn, "pc", LEAGUE);
        await applyStashChanges(
            db.conn,
            stash(
                "a",
                eye(
                    "clarity",
                    anger,
                    "Gain 15% of Maximum Mana as Extra Energy Shield while affected by Clarity",
                ),
            ),
            at(5),
        );
        await applyStashChanges(
            db.conn,
            stash("b", eye("haste", anger, "+10% to Movement Speed while affected by Haste")),
            at(6),
        );
        await applyStashChanges(db.conn, stash("a"), at(10));
        await applyStashChanges(db.conn, stash("b"), at(11));
        await flushRollups(db.conn, { league: LEAGUE, stashBeforeHour: HOUR + 3600 });
        const markets = (rows: typeof pushed) =>
            rows.map((row) => (row as unknown as { signatureValue: string }).signatureValue);
        expect(markets(pushed)).toHaveLength(4);

        await new Promise((resolve) => setTimeout(resolve, 5));
        await db.conn.run(
            `UPDATE ps_sale SET status = 'relisted', updated_at = current_timestamp::TIMESTAMP
            WHERE item_id = 'id-clarity'`,
        );
        pushed.length = 0;
        expect(
            await flushRollups(db.conn, { league: LEAGUE, stashBeforeHour: HOUR + 3600 }),
        ).toMatchObject({ hours: 1, rows: 3 });
        const narrow = [...pushed];
        pushed.length = 0;
        await rollupPs(db.conn, { hour: HOUR, league: LEAGUE });
        const whole = pushed.filter((row) => !markets([row])[0]!.includes("Haste"));
        expect(markets(whole)).toHaveLength(3);
        expect(narrow).toEqual(whole);
    } finally {
        await db.close();
    }
});

it("prices a removal as delisted only while it is not a sale, relist or undecided", async () => {
    const { db } = await deliveredHour();
    const prices = { divine: { count: 1, min: 10, median: 10, p25: 10, p75: 10 } };
    const headhunter = async (status: string) => {
        await db.conn.run("UPDATE ps_sale SET status = $1", [status]);
        pushed.length = 0;
        await rollupPs(db.conn, { hour: HOUR, league: LEAGUE });
        return pushed.find((row) => row.itemKey === "Headhunter");
    };
    try {
        for (const status of ["withdrawn", "unobserved", "insufficient-market", "outside-market"])
            expect(await headhunter(status)).toMatchObject({
                removedCount: 1,
                salesPrices: {},
                delistedPrices: prices,
            });
        expect(await headhunter("likely-sold")).toMatchObject({
            salesPrices: prices,
            delistedPrices: {},
        });
        for (const status of ["relisted", "pending"])
            expect(await headhunter(status)).toMatchObject({
                removedCount: 1,
                salesPrices: {},
                delistedPrices: {},
            });
    } finally {
        await db.close();
    }
});

it("stops re-delivering when the changed item has no market", async () => {
    const { db, flush } = await deliveredHour();
    try {
        await new Promise((resolve) => setTimeout(resolve, 5));
        // A corrupted Watcher's Eye is left out of the rollup, so its item yields no rows.
        await db.conn.run(
            `UPDATE ps_sale SET item_key = 'Watcher''s Eye', name = 'Watcher''s Eye', corrupted = TRUE,
                updated_at = current_timestamp::TIMESTAMP`,
        );
        pushed.length = 0;
        expect(await flush()).toMatchObject({ hours: 1, rows: 0 });
        expect(pushed).toEqual([]);
        expect((await flush()).hours).toBe(0);
    } finally {
        await db.close();
    }
});

it("sends the whole hour when a newly learned icon can name its markets", async () => {
    const { db, flush } = await deliveredHour();
    try {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await db.conn.run(
            `UPDATE icon_basemap SET first_seen_at = current_timestamp::TIMESTAMP
            WHERE name = 'Mageblood'`,
        );
        pushed.length = 0;
        await flush();
        expect(itemKeys()).toEqual(["Bated Breath", "Headhunter", "Mageblood"]);
    } finally {
        await db.close();
    }
});

it("sends the whole hour when asked directly, even if nothing changed", async () => {
    const { db } = await deliveredHour();
    try {
        pushed.length = 0;
        await rollupPs(db.conn, { hour: HOUR, league: LEAGUE });
        expect(pushed).toHaveLength(3);
    } finally {
        await db.close();
    }
});

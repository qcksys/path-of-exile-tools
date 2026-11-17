// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve the public-stash wire format.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeApiItem } from "@poe-tools/item-query";
import { compileMarketCohorts, marketCohortManifestSchema } from "@poe-tools/market";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type {
    PublicStashChange,
    PublicStashPage,
} from "../../../packages/poe-api-client/src/types";
import { startClassifyPool } from "../../../packages/poe-stash-ingest/src/ps/classify-pool";
import {
    defaultEquipmentClassifier,
    type EquipmentClassifier,
} from "../../../packages/poe-stash-ingest/src/ps/equipment";
import { ingestPs } from "../../../packages/poe-stash-ingest/src/ps/ingest";
import {
    appendRawPage,
    RawPageReader,
} from "../../../packages/poe-stash-ingest/src/ps/raw-archive";
import { openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";
import { stableItemDigest } from "../../../packages/poe-stash-ingest/src/shared/item-memo";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth", () => ({ REALM: undefined }));

// Equipment classified on other threads must be what the worker would classify itself: the same
// items, the same results, under the same cache keys.
const HOUR = Date.UTC(2026, 9, 28, 10);
type Item = PublicStashChange["items"][number];
const rare = (id: string, baseType: string, explicitMods: string[], note = "~price 5 chaos") =>
    ({
        id,
        verified: true,
        w: 2,
        h: 2,
        icon: "",
        name: "Doom Shell",
        typeLine: baseType,
        baseType,
        ilvl: 84,
        identified: true,
        frameType: 2,
        explicitMods,
        note,
    }) as Item;
const items = [
    rare("vest", "Plate Vest", ["+80 to maximum Life", "+40% to Fire Resistance"]),
    rare("armour", "Necrotic Armour", ["+100 to maximum Life", "+30% to Cold Resistance"]),
    rare("belt", "Stygian Vise", ["+70 to maximum Life", "+35 to Strength"]),
    { ...rare("normal", "Necrotic Armour", []), frameType: 0, name: "" } as Item,
];
const stash = (id: string, overrides: Partial<PublicStashChange>, stashItems = items) =>
    ({
        id,
        public: true,
        accountName: "seller",
        league: "Standard",
        stash: "Sales",
        stashType: "TradeStash",
        items: stashItems,
        ...overrides,
    }) as PublicStashChange;
const page = (next: string, stashes: PublicStashChange[]) =>
    ({ next_change_id: next, stashes }) as PublicStashPage;
const firstPage = page("page-1", [
    stash("merchant", {}),
    // None of these are classified: another league, a non-merchant tab, a private stash.
    stash("elsewhere", { league: "Hardcore" }, [rare("hardcore", "Plate Vest", [])]),
    stash("premium", { stashType: "PremiumStash" }, [rare("premium", "Plate Vest", [])]),
    stash("private", { public: false }, [rare("private", "Plate Vest", [])]),
]);

let dir: string | undefined;
afterEach(async () => {
    vi.unstubAllEnvs();
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
});
beforeEach(() => {
    vi.stubEnv("PS_CLASSIFY_THREADS", "");
});

it("classifies a page's merchant equipment exactly as the worker's own classifier", async () => {
    const classifier = await defaultEquipmentClassifier();
    const pool = await startClassifyPool(2);
    expect(pool.revision).toBe(classifier.manifest.revision);

    const results = new Map(await pool.classify(JSON.stringify(firstPage), "Standard"));
    const parsed = JSON.parse(JSON.stringify(firstPage)) as PublicStashPage;
    const expected = new Map(
        parsed.stashes[0]!.items.filter((item) => classifier.acceptsBase(item.baseType)).map(
            (item) => [
                stableItemDigest(item),
                classifier.classify(normalizeApiItem("poe1", "stash", item)),
            ],
        ),
    );
    expect(results).toEqual(expected);
    expect(expected.size).toBe(items.length);
    // The fixture must exercise real cohorts, or the comparison proves little.
    expect([...expected.values()].some((c) => c.matches.length + c.unknown.length > 0)).toBe(true);
});

it("writes the same equipment rows with classification threads as without", async () => {
    dir = await mkdtemp(join(tmpdir(), "classify-pool-"));
    await appendRawPage(dir, { capturedAt: HOUR + 1000, cursor: "page-0", page: firstPage });
    await appendRawPage(dir, {
        capturedAt: HOUR + 5000,
        cursor: "page-1",
        page: page("page-2", [
            stash("merchant", {}, [
                ...items.slice(1),
                rare("ring", "Two-Stone Ring", ["+60 to maximum Life"]),
            ]),
        ]),
    });
    const rows = async (threads: string, equipment?: EquipmentClassifier) => {
        vi.stubEnv("PS_CLASSIFY_THREADS", threads);
        const db = await openDb(":memory:");
        try {
            await ingestPs(db.conn, {} as never, {
                pages: 5,
                league: "Standard",
                equipment,
                spool: new RawPageReader(dir!, {
                    hour: new Date(HOUR).toISOString().slice(0, 13),
                    offset: 0,
                    capturedAt: 0,
                }),
            });
            return {
                listings: await queryAll(
                    db.conn,
                    "SELECT * EXCLUDE (raw_item) FROM ps_equipment_listing ORDER BY item_id",
                ),
                hours: await queryAll(
                    db.conn,
                    "SELECT * FROM ps_equipment_hour ORDER BY item_id, observed_hour",
                ),
            };
        } finally {
            await db.close();
        }
    };
    // Every classification of the threaded run comes from the pool, none from this thread.
    const classifier = await defaultEquipmentClassifier();
    const classify = vi.spyOn(classifier, "classify");
    const threaded = await rows("2");
    expect(classify).not.toHaveBeenCalled();
    classify.mockRestore();
    expect(threaded.listings.length).toBeGreaterThan(0);

    // A separately compiled classifier of the same catalog, with its own cache, on this thread.
    const separate = compileMarketCohorts(
        marketCohortManifestSchema.parse(
            JSON.parse(
                await readFile(
                    new URL(import.meta.resolve("@poe-tools/market/cohorts-poe1.json")),
                    "utf8",
                ),
            ),
        ),
    );
    expect(await rows("", separate)).toEqual(threaded);
});

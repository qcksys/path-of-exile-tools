// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve upstream field names.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileMarketCohorts } from "@poe-tools/market";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { PublicStashChange } from "../../../packages/poe-api-client/src/types";
import { reclassifyArchivedEquipment } from "../../../packages/poe-stash-ingest/src/ps/equipment-reclassify";
import { equipmentHourly } from "../../../packages/poe-stash-ingest/src/ps/equipment-rollup";
import { ingestPs } from "../../../packages/poe-stash-ingest/src/ps/ingest";
import {
    appendRawPage,
    RawPageReader,
} from "../../../packages/poe-stash-ingest/src/ps/raw-archive";
import { type DbHandle, openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth", () => ({ REALM: undefined }));

// A worker reading a capture process's raw archive stores no copy of its pages, so
// reclassification replays them from that archive.
const HOUR = Math.floor(Date.now() / 3_600_000) * 3600 - 3 * 3600;
const classifier = (revision: string) =>
    compileMarketCohorts({
        format: 1,
        game: "poe1",
        revision,
        catalogHash: "a".repeat(64),
        cohorts: [
            {
                id: "preset:plate-vest",
                name: "Normal Plate Vest",
                purpose: "base",
                query: {
                    format: 1,
                    game: "poe1",
                    groups: [
                        {
                            type: "and",
                            filters: [
                                { kind: "base", field: "baseType", values: ["Plate Vest"] },
                                { kind: "rarity", values: ["Normal"] },
                            ],
                        },
                    ],
                },
            },
        ],
    });
const item = {
    id: "item-1",
    verified: true,
    w: 2,
    h: 3,
    icon: "",
    name: "",
    typeLine: "Plate Vest",
    baseType: "Plate Vest",
    identified: true,
    ilvl: 86,
    frameType: 0,
    note: "~price 10 chaos",
};
const stash = (note: string) =>
    ({
        id: "stash-1",
        public: true,
        accountName: "seller",
        league: "Standard",
        stash: "Sales",
        stashType: "TradeStash",
        items: [{ ...item, note }],
    }) as PublicStashChange;

let db: DbHandle;
let dir: string;
beforeEach(async () => {
    db = await openDb(":memory:");
    dir = await mkdtemp(join(tmpdir(), "reclassify-raw-"));
    await appendRawPage(dir, {
        capturedAt: (HOUR + 1) * 1000,
        cursor: "page-0",
        page: { next_change_id: "page-1", stashes: [stash("~price 10 chaos")] },
    });
    await appendRawPage(dir, {
        capturedAt: (HOUR + 10) * 1000,
        cursor: "page-1",
        page: { next_change_id: "page-2", stashes: [stash("~price 20 chaos")] },
    });
    await ingestPs(db.conn, {} as never, {
        pages: 5,
        league: "Standard",
        equipment: classifier("older-classifier"),
        spool: new RawPageReader(dir, {
            hour: new Date(HOUR * 1000).toISOString().slice(0, 13),
            offset: 0,
            capturedAt: 0,
        }),
    });
});
afterEach(async () => {
    await db.close();
    await rm(dir, { recursive: true, force: true });
});

const reclassify = (rawArchiveDir?: string) =>
    reclassifyArchivedEquipment(db.conn, {
        realm: "pc",
        league: "Standard",
        classifier: classifier("current-classifier"),
        completedBefore: HOUR + 2 * 3600,
        limitPages: 5,
        rawArchiveDir,
    });

it("records where the raw archive keeps each page instead of storing a copy", async () => {
    expect(
        await queryAll(
            db.conn,
            `SELECT (SELECT count(*) FROM ps_capture_payload_meta)::INT AS meta,
                (SELECT count(*) FROM ps_capture_payload_chunk)::INT AS chunks,
                (SELECT count(*) FROM ps_capture_stash)::INT AS stashes`,
        ),
    ).toEqual([{ meta: 0, chunks: 0, stashes: 0 }]);
    expect(
        await queryAll(
            db.conn,
            `SELECT response_hash AS locator, processed_at IS NOT NULL AS processed,
                equipment_revision AS revision
            FROM ps_capture_page ORDER BY captured_at`,
        ),
    ).toEqual([
        {
            locator: expect.stringMatching(/^raw:\d{4}-\d\d-\d\dT\d\d:0$/),
            processed: true,
            revision: "older-classifier",
        },
        {
            locator: expect.stringMatching(/^raw:\d{4}-\d\d-\d\dT\d\d:[1-9]\d*$/),
            processed: true,
            revision: "older-classifier",
        },
    ]);
});

it("reclassifies an hour from the raw archive", async () => {
    expect(await reclassify(dir)).toMatchObject({
        pages: 2,
        hours: 1,
        completedHours: [HOUR],
        pending: false,
    });
    const [result] = await equipmentHourly(db.conn, HOUR, "Standard");
    expect(result).toMatchObject({
        hour: HOUR,
        listingCount: 1,
        prices: { chaos: { median: 20 } },
    });
});

it("refuses to replay a raw archived page without the raw archive", async () => {
    await expect(reclassify()).rejects.toThrow("raw archive");
});

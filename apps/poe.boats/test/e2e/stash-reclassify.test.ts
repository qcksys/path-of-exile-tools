// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve upstream and database fields.
import { mkdtemp, readFile, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { normalizeApiItem } from "@poe-tools/item-query";
import {
    compileMarketCohorts,
    type MarketCohortManifest,
    marketCohortManifestSchema,
} from "@poe-tools/market";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { readArchivedPage } from "../../../../packages/poe-stash-ingest/src/ps/archive-payload.ts";
import { archivePage } from "../../../../packages/poe-stash-ingest/src/ps/capture-archive.ts";
import {
    compileCraftingCapture,
    defaultCraftingCapture,
} from "../../../../packages/poe-stash-ingest/src/ps/crafting-capture.ts";
import { captureEquipment } from "../../../../packages/poe-stash-ingest/src/ps/equipment.ts";
import { reclassifyArchivedEquipment } from "../../../../packages/poe-stash-ingest/src/ps/equipment-reclassify.ts";
import { equipmentHourly } from "../../../../packages/poe-stash-ingest/src/ps/equipment-rollup.ts";
import { getCursor, setCursor } from "../../../../packages/poe-stash-ingest/src/shared/cursor.ts";
import {
    type DbHandle,
    openDb,
    queryAll,
} from "../../../../packages/poe-stash-ingest/src/shared/db.ts";
import { configureSource } from "../../../../packages/poe-stash-ingest/src/shared/source.ts";
import { marketModifierTextModel } from "../../scripts/market-modifier-text";
import { engine } from "../crafting-fixtures";

const HOUR = Math.floor(Date.now() / 3_600_000) * 3600 - 3 * 3600;
const classifier = compileMarketCohorts({
    format: 1,
    game: "poe1",
    revision: "current-classifier",
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
const stash: Parameters<typeof captureEquipment>[1] = {
    id: "stash-1",
    public: true,
    accountName: "seller",
    league: "Standard",
    stash: "Sales",
    stashType: "PremiumStash",
    items: [item],
};
let local: DbHandle;
let directory: string | undefined;
beforeEach(async () => {
    local = await openDb(":memory:");
    await configureSource(local.conn, "pc", "Standard");
});
afterEach(async () => {
    await local.close();
    if (directory) {
        await unlink(join(directory, "capture.duckdb"));
        await rmdir(directory);
        directory = undefined;
    }
});

async function archive(
    at: number,
    stashes = [stash],
    revision: string | null = "older-classifier",
    scope = "Standard",
) {
    const id = await archivePage(
        local.conn,
        { next_change_id: `page-${at}`, stashes },
        { realm: "pc", league: scope, capturedAt: at * 1000 },
        () => true,
    );
    await local.conn.run(
        "UPDATE ps_capture_page SET processed_at = current_timestamp, equipment_revision = $2 WHERE id = $1",
        [id, revision],
    );
}
const project = (limitPages = 1, league = "Standard") =>
    reclassifyArchivedEquipment(local.conn, {
        realm: "pc",
        league,
        classifier,
        completedBefore: HOUR + 2 * 3600,
        limitPages,
    });

async function legacyBodies() {
    const rows = await queryAll<{ hash: string }>(
        local.conn,
        "SELECT response_hash AS hash FROM ps_capture_payload_meta",
    );
    for (const { hash } of rows) {
        const json = JSON.stringify(await readArchivedPage(local.conn, hash));
        await local.conn.run("INSERT INTO ps_capture_payload VALUES ($1, from_base64($2), $3)", [
            hash,
            gzipSync(json).toString("base64"),
            Buffer.byteLength(json),
        ]);
    }
    await local.conn.run("DELETE FROM ps_capture_payload_chunk");
    await local.conn.run("DELETE FROM ps_capture_payload_meta");
}

it("replays a crafted and enchanted fractured source with its preparation profile", async () => {
    const manifest = marketCohortManifestSchema.parse(
        JSON.parse(
            await readFile(
                new URL("../../../../packages/poe-market/data/cohorts-poe1.json", import.meta.url),
                "utf8",
            ),
        ),
    );
    manifest.cohorts = manifest.cohorts.filter(
        (cohort) => cohort.query.sourcePreparation?.kind === "fractured-fossil-v1",
    );
    expect(manifest.cohorts).toHaveLength(4);
    const expected = manifest.cohorts.find(
        (cohort) =>
            cohort.query.sourcePreparation?.crafted && cohort.query.sourcePreparation.enchanted,
    )!;
    const current = compileMarketCohorts(manifest);
    const accepts = await defaultCraftingCapture(manifest);
    const chest = {
        ...item,
        typeLine: "Conquest Lamellar",
        baseType: "Conquest Lamellar",
        frameType: 2,
        fractured: true,
        extended: { prefixes: 3, suffixes: 3 },
        // Disposable lines remain opaque rather than acquiring invented canonical identities.
        explicitMods: [
            { description: "Unresolved disposable prefix" },
            { description: "Unresolved disposable suffix" },
            { description: "Crafted disposable line", flags: { crafted: true } },
            {
                description:
                    "Critical Strike Chance is increased by Overcapped Lightning Resistance",
                flags: { fractured: true },
            },
        ],
        enchantMods: [
            "Quality does not increase Defences",
            "Grants +1% to Lightning Resistance per 2% Quality",
        ],
        implicitMods: [
            "While a Unique Enemy is in your Presence, Haste has 39% increased Aura Effect",
            "While a Unique Enemy is in your Presence, Gain a Frenzy Charge every 10 seconds",
        ],
        note: "~price 220 divine",
    };
    expect(accepts(chest)).toBe(true);
    expect(current.classify(normalizeApiItem("poe1", "stash", chest))).toEqual({
        matches: [expected.id],
        unknown: [],
    });
    const observedAt = HOUR + 17;
    const page = await archivePage(
        local.conn,
        { next_change_id: "fractured-source-page", stashes: [{ ...stash, items: [chest] }] },
        { realm: "pc", league: "Standard", capturedAt: observedAt * 1000 },
        accepts,
    );
    await local.conn.run(
        "UPDATE ps_capture_page SET processed_at = current_timestamp, equipment_revision = 'before-source-preparation' WHERE id = $1",
        [page],
    );
    const [saved] = await queryAll<{ hash: string }>(
        local.conn,
        "SELECT response_hash AS hash FROM ps_capture_page WHERE id = $1",
        [page],
    );
    expect((await readArchivedPage(local.conn, saved!.hash)).stashes[0]!.items[0]).toEqual(chest);
    await setCursor(local.conn, "psapi", "live-cursor");
    expect(
        await reclassifyArchivedEquipment(local.conn, {
            realm: "pc",
            league: "Standard",
            classifier: current,
            completedBefore: HOUR + 3600,
            limitPages: 1,
        }),
    ).toMatchObject({ pages: 1, completedHours: [HOUR], pending: false });
    const rows = await equipmentHourly(local.conn, HOUR, "Standard");
    expect(rows).toMatchObject([
        {
            revision: manifest.revision,
            cohortId: expected.id,
            hour: HOUR,
            listingCount: 1,
            uniqueSellers: 1,
            unknownCount: 0,
            prices: { divine: { median: 220, min: 220, max: 220, count: 1 } },
        },
    ]);
    expect(Date.parse(`${rows[0]!.firstSeenAt}Z`)).toBe(observedAt * 1000);
    expect(Date.parse(`${rows[0]!.lastSeenAt}Z`)).toBe(observedAt * 1000);
    const definitions = await queryAll<{ definition: string }>(
        local.conn,
        "SELECT definition::VARCHAR AS definition FROM ps_equipment_cohort",
    );
    expect(definitions.map((row) => JSON.parse(row.definition))).toEqual([
        current.definition(expected.id),
    ]);
    expect(await equipmentHourly(local.conn, HOUR + 3600, "Standard")).toEqual([]);
    expect(await queryAll(local.conn, "SELECT * FROM ps_equipment_listing")).toEqual([]);
    expect(await getCursor(local.conn, "psapi")).toBe("live-cursor");
});

it("replays a paid Scouring source with native implicit proof at its original priced hour", async () => {
    const manifest = marketCohortManifestSchema.parse(
        JSON.parse(
            await readFile(
                new URL("../../../../packages/poe-market/data/cohorts-poe1.json", import.meta.url),
                "utf8",
            ),
        ),
    );
    manifest.cohorts = manifest.cohorts.filter(
        (cohort) =>
            cohort.query.sourcePreparation?.kind === "scour-v1" &&
            cohort.query.groups.some((group) =>
                group.filters.some(
                    (filter) =>
                        filter.kind === "base" &&
                        filter.field === "baseType" &&
                        filter.values.includes("Pinnacle Tower Shield"),
                ),
            ),
    );
    expect(manifest.cohorts).toHaveLength(4);
    const expected = manifest.cohorts.find(
        (cohort) =>
            cohort.query.sourcePreparation?.crafted && cohort.query.sourcePreparation.enchanted,
    )!;
    expect(expected.query.sourcePreparation).toEqual({
        kind: "scour-v1",
        crafted: true,
        enchanted: true,
    });
    const current = compileMarketCohorts(manifest);
    const accepts = await defaultCraftingCapture(manifest);
    const shield = {
        ...item,
        typeLine: "Pinnacle Tower Shield",
        baseType: "Pinnacle Tower Shield",
        frameType: 2,
        influences: { shaper: true },
        extended: { prefixes: 3, suffixes: 3 },
        explicitMods: [
            { description: "Unresolved disposable affix" },
            { description: "Prefixes Cannot Be Changed", flags: { crafted: true } },
        ],
        enchantMods: ["Quality does not increase Defences"],
        implicitMods: ["+30 to maximum Life"],
        note: "~price 6 chaos",
    };
    const before = structuredClone(shield);
    expect(accepts(shield)).toBe(true);
    expect(current.classify(normalizeApiItem("poe1", "stash", shield))).toEqual({
        matches: [expected.id],
        unknown: [],
    });
    expect(
        current.classify(
            normalizeApiItem("poe1", "stash", {
                ...shield,
                implicitMods: ["+31 to maximum Life"],
            }),
        ),
    ).toEqual({ matches: [], unknown: [expected.id] });
    expect(shield).toEqual(before);
    const observedAt = HOUR + 29;
    const page = await archivePage(
        local.conn,
        { next_change_id: "scouring-source-page", stashes: [{ ...stash, items: [shield] }] },
        { realm: "pc", league: "Standard", capturedAt: observedAt * 1000 },
        accepts,
    );
    await local.conn.run(
        "UPDATE ps_capture_page SET processed_at = current_timestamp, equipment_revision = 'before-scouring-source' WHERE id = $1",
        [page],
    );
    const [saved] = await queryAll<{ hash: string }>(
        local.conn,
        "SELECT response_hash AS hash FROM ps_capture_page WHERE id = $1",
        [page],
    );
    expect((await readArchivedPage(local.conn, saved!.hash)).stashes[0]!.items[0]).toEqual(shield);
    await setCursor(local.conn, "psapi", "live-cursor");
    expect(
        await reclassifyArchivedEquipment(local.conn, {
            realm: "pc",
            league: "Standard",
            classifier: current,
            completedBefore: HOUR + 3600,
            limitPages: 1,
        }),
    ).toMatchObject({ pages: 1, completedHours: [HOUR], pending: false });
    const rows = await equipmentHourly(local.conn, HOUR, "Standard");
    expect(rows).toMatchObject([
        {
            revision: manifest.revision,
            cohortId: expected.id,
            hour: HOUR,
            listingCount: 1,
            uniqueSellers: 1,
            unknownCount: 0,
            prices: { chaos: { median: 6, min: 6, max: 6, count: 1 } },
        },
    ]);
    expect(Date.parse(`${rows[0]!.firstSeenAt}Z`)).toBe(observedAt * 1000);
    expect(Date.parse(`${rows[0]!.lastSeenAt}Z`)).toBe(observedAt * 1000);
    const definitions = await queryAll<{ definition: string }>(
        local.conn,
        "SELECT definition::VARCHAR AS definition FROM ps_equipment_cohort",
    );
    expect(definitions.map((row) => JSON.parse(row.definition))).toEqual([
        current.definition(expected.id),
    ]);
    expect(await equipmentHourly(local.conn, HOUR + 3600, "Standard")).toEqual([]);
    expect(await queryAll(local.conn, "SELECT * FROM ps_equipment_listing")).toEqual([]);
    expect(await getCursor(local.conn, "psapi")).toBe("live-cursor");
});

it.each([
    false,
    true,
])("reclassifies an archived named Magic source at its original priced hour (missing body: %s)", async (missingBody) => {
    const shield = {
        ...item,
        typeLine: "Heat-attuned Tower Shield of the Leviathan",
        baseType: "Heat-attuned Tower Shield",
        frameType: 1,
        influences: { shaper: true },
        explicitMods: [{ description: "+38 to Strength" }],
        implicitMods: [{ description: "Scorch Enemies when you Block their Damage" }],
        extended: { suffixes: 1 },
        note: "~price 4 divine",
    };
    const manifest: MarketCohortManifest = {
        format: 1,
        game: "poe1",
        revision: "magic-name-v3",
        catalogHash: "a".repeat(64),
        modifierTextModel: marketModifierTextModel(engine, new Set([shield.baseType])),
        cohorts: [
            {
                id: "preset:shaper-heat-strength",
                name: "Magic Shaper Heat-attuned Tower Shield, Strength7 only",
                purpose: "isolated-modifier",
                query: {
                    format: 1,
                    game: "poe1",
                    groups: [
                        {
                            type: "and",
                            filters: [
                                { kind: "base", field: "baseType", values: [shield.baseType] },
                                { kind: "rarity", values: ["Magic"] },
                                { kind: "range", field: "ilvl", value: { min: 86, max: 86 } },
                                { kind: "range", field: "prefixes", value: { min: 0, max: 0 } },
                                { kind: "range", field: "suffixes", value: { min: 1, max: 1 } },
                                { kind: "flag", field: "identified", value: true },
                                { kind: "flag", field: "corrupted", value: false },
                                { kind: "flag", field: "mirrored", value: false },
                                { kind: "flag", field: "fractured", value: false },
                                { kind: "flag", field: "synthesised", value: false },
                                { kind: "influence", values: ["shaper"] },
                                {
                                    kind: "mod",
                                    ids: ["Strength7"],
                                    fractured: false,
                                    crafted: false,
                                    count: { min: 1 },
                                },
                            ],
                        },
                        {
                            type: "not",
                            filters: [
                                {
                                    kind: "influence",
                                    values: ["elder", "crusader", "redeemer", "hunter", "warlord"],
                                },
                            ],
                        },
                    ],
                },
            },
        ],
    };
    const current = compileMarketCohorts(manifest);
    const older = compileMarketCohorts({
        ...manifest,
        revision: "magic-name-v2",
        modifierTextModel: { ...manifest.modifierTextModel!, format: 2 },
    });
    const accepts = compileCraftingCapture(manifest, {
        equipmentBaseTypes: [shield.baseType],
        jewelBaseTypes: [],
        specialModifiers: [],
        distinctiveModifierLines: [],
    });
    const change = { ...stash, items: [shield] };
    const observedAt = HOUR + 17;
    const record = normalizeApiItem("poe1", "stash", shield);
    expect(accepts(shield)).toBe(true);
    expect(older.classify(record)).toEqual({ matches: [], unknown: [manifest.cohorts[0]!.id] });
    expect(current.classify(record)).toEqual({ matches: [manifest.cohorts[0]!.id], unknown: [] });
    const page = await archivePage(
        local.conn,
        { next_change_id: "magic-page", stashes: [change] },
        { realm: "pc", league: "Standard", capturedAt: observedAt * 1000 },
        accepts,
    );
    await local.conn.run(
        "UPDATE ps_capture_page SET processed_at = current_timestamp, equipment_revision = $2 WHERE id = $1",
        [page, older.manifest.revision],
    );
    const [saved] = await queryAll<{ hash: string }>(
        local.conn,
        "SELECT response_hash AS hash FROM ps_capture_page WHERE id = $1",
        [page],
    );
    expect((await readArchivedPage(local.conn, saved!.hash)).stashes[0]!.items[0]).toEqual(shield);
    await captureEquipment(local.conn, change, older, new Date(observedAt * 1000));
    const before = await equipmentHourly(local.conn, HOUR, "Standard");
    expect(before).toMatchObject([
        {
            revision: older.manifest.revision,
            hour: HOUR,
            listingCount: 0,
            unknownCount: 1,
            prices: {},
        },
    ]);
    await setCursor(local.conn, "psapi", "live-cursor");
    const live = await queryAll(local.conn, "SELECT * FROM ps_equipment_listing");
    if (missingBody) {
        await local.conn.run("DELETE FROM ps_capture_payload_chunk");
        await local.conn.run("DELETE FROM ps_capture_payload_meta");
    }
    const replay = () =>
        reclassifyArchivedEquipment(local.conn, {
            realm: "pc",
            league: "Standard",
            classifier: current,
            completedBefore: HOUR + 3600,
            limitPages: 1,
        });
    if (missingBody) {
        await expect(replay()).rejects.toThrow("The archived payload is missing.");
        expect(await equipmentHourly(local.conn, HOUR, "Standard")).toEqual(before);
        expect(await queryAll(local.conn, "SELECT * FROM ps_equipment_reclassify")).toEqual([]);
    } else {
        expect(await replay()).toMatchObject({ pages: 1, completedHours: [HOUR], pending: false });
        const rows = await equipmentHourly(local.conn, HOUR, "Standard");
        const result = rows.find((row) => row.revision === current.manifest.revision);
        expect(result).toMatchObject({
            hour: HOUR,
            listingCount: 1,
            uniqueSellers: 1,
            unknownCount: 0,
            prices: { divine: { median: 4, min: 4, max: 4, count: 1 } },
        });
        expect(Date.parse(`${result!.firstSeenAt}Z`)).toBe(observedAt * 1000);
        expect(Date.parse(`${result!.lastSeenAt}Z`)).toBe(observedAt * 1000);
        expect(rows.find((row) => row.revision === older.manifest.revision)).toEqual(before[0]);
        expect(await replay()).toMatchObject({ pages: 0, hours: 0, pending: false });
    }
    expect(await equipmentHourly(local.conn, HOUR + 3600, "Standard")).toEqual([]);
    expect(await queryAll(local.conn, "SELECT * FROM ps_equipment_listing")).toEqual(live);
    expect(await getCursor(local.conn, "psapi")).toBe("live-cursor");
});

it("resumes persisted staging after the owning connection closes and reopens", async () => {
    await local.close();
    directory = await mkdtemp(join(tmpdir(), "poe-reclassify-"));
    local = await openDb(join(directory, "capture.duckdb"));
    await configureSource(local.conn, "pc", "Standard");
    await archive(HOUR + 1);
    await archive(HOUR + 2, [{ ...stash, items: [{ ...item, note: "~price 25 chaos" }] }]);
    expect(await project()).toMatchObject({ pages: 1, hours: 0, pending: true });
    await local.close();
    local = await openDb(join(directory, "capture.duckdb"));
    expect(await project()).toMatchObject({ pages: 1, hours: 1, pending: false });
    expect(await equipmentHourly(local.conn, HOUR, "Standard")).toMatchObject([
        { listingCount: 1, prices: { chaos: { median: 25 } } },
    ]);
});

it("replays a verified archived body hidden from its index without changing the live cursor", async () => {
    await archive(HOUR + 1);
    await legacyBodies();
    await setCursor(local.conn, "psapi", "live-cursor");
    const read = local.conn.runAndReadAll.bind(local.conn);
    const indexedRead = vi
        .spyOn(local.conn, "runAndReadAll")
        .mockImplementation((sql, ...args) =>
            read(
                sql.includes("FROM ps_capture_payload WHERE response_hash = $1")
                    ? sql.replace("WHERE response_hash = $1", "WHERE FALSE AND response_hash = $1")
                    : sql,
                ...args,
            ),
        );
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
        expect(await project()).toMatchObject({ pages: 1, completedHours: [HOUR], pending: false });
        expect(await equipmentHourly(local.conn, HOUR, "Standard")).toMatchObject([
            { listingCount: 1, prices: { chaos: { median: 10 } } },
        ]);
        expect(await getCursor(local.conn, "psapi")).toBe("live-cursor");
        expect(warning).toHaveBeenCalledExactlyOnceWith(
            "Archived payload found by sequential fallback.",
        );
    } finally {
        indexedRead.mockRestore();
        warning.mockRestore();
    }
});

it.each([
    "missing",
    "wrong-key-index",
    "wrong-hash",
] as const)("does not advance staged progress or publish prices when the next archived body is %s", async (failure) => {
    await archive(HOUR + 1);
    await archive(HOUR + 2, [{ ...stash, items: [{ ...item, note: "~price 25 chaos" }] }]);
    await legacyBodies();
    await setCursor(local.conn, "psapi", "live-cursor");
    expect(await project()).toMatchObject({ pages: 1, hours: 0, pending: true });
    const progress = await queryAll(local.conn, "SELECT * FROM ps_equipment_reclassify");
    const staging = await queryAll(local.conn, "SELECT * FROM ps_equipment_reclassify_hour");
    const pages = await queryAll<{ hash: string }>(
        local.conn,
        "SELECT response_hash AS hash FROM ps_capture_page ORDER BY captured_at",
    );
    if (failure !== "wrong-hash") {
        await local.conn.run("DELETE FROM ps_capture_payload WHERE response_hash=$1", [
            pages[1]!.hash,
        ]);
    } else {
        await local.conn.run(
            `UPDATE ps_capture_payload SET response_gzip =
                (SELECT response_gzip FROM ps_capture_payload WHERE response_hash=$1)
                WHERE response_hash=$2`,
            [pages[0]!.hash, pages[1]!.hash],
        );
    }
    const classify = vi.spyOn(classifier, "classify");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const read = local.conn.runAndReadAll.bind(local.conn);
    const indexedRead = vi
        .spyOn(local.conn, "runAndReadAll")
        .mockImplementation((sql, ...args) =>
            failure === "wrong-key-index" &&
            sql.includes("FROM ps_capture_payload WHERE response_hash = $1")
                ? read(sql, [pages[0]!.hash])
                : read(sql, ...args),
        );
    try {
        await expect(project()).rejects.toThrow(
            failure !== "wrong-hash"
                ? "The archived payload is missing."
                : "The archived payload does not match its recorded hash.",
        );
        expect(classify).not.toHaveBeenCalled();
        expect(warning).not.toHaveBeenCalled();
        expect(await queryAll(local.conn, "SELECT * FROM ps_equipment_reclassify")).toEqual(
            progress,
        );
        expect(await queryAll(local.conn, "SELECT * FROM ps_equipment_reclassify_hour")).toEqual(
            staging,
        );
        expect(await equipmentHourly(local.conn, HOUR, "Standard")).toEqual([]);
        expect(await queryAll(local.conn, "SELECT * FROM ps_equipment_cohort_hour")).toEqual([]);
        expect(await getCursor(local.conn, "psapi")).toBe("live-cursor");
    } finally {
        indexedRead.mockRestore();
        classify.mockRestore();
        warning.mockRestore();
    }
});

it.each([
    "missing",
    "out-of-order",
    "wrong-size",
    "wrong-hash",
] as const)("rejects %s chunk data without advancing replay or publishing a staged hour", async (failure) => {
    await archive(HOUR + 1);
    await archive(HOUR + 2, [{ ...stash, items: [{ ...item, note: "~price 25 chaos" }] }]);
    await setCursor(local.conn, "psapi", "live-cursor");
    expect(await project()).toMatchObject({ pages: 1, hours: 0, pending: true });
    const progress = await queryAll(local.conn, "SELECT * FROM ps_equipment_reclassify");
    const staging = await queryAll(local.conn, "SELECT * FROM ps_equipment_reclassify_hour");
    const pages = await queryAll<{ hash: string }>(
        local.conn,
        "SELECT response_hash AS hash FROM ps_capture_page ORDER BY captured_at",
    );
    const hash = pages[1]!.hash;
    if (failure === "missing")
        await local.conn.run("DELETE FROM ps_capture_payload_chunk WHERE response_hash=$1", [hash]);
    if (failure === "out-of-order")
        await local.conn.run(
            "UPDATE ps_capture_payload_chunk SET chunk_index=1 WHERE response_hash=$1",
            [hash],
        );
    if (failure === "wrong-size")
        await local.conn.run(
            "UPDATE ps_capture_payload_chunk SET response_gzip=response_gzip || 'x'::BLOB WHERE response_hash=$1",
            [hash],
        );
    if (failure === "wrong-hash") {
        await local.conn.run(
            `UPDATE ps_capture_payload_chunk SET response_gzip =
            (SELECT response_gzip FROM ps_capture_payload_chunk WHERE response_hash=$1)
            WHERE response_hash=$2`,
            [pages[0]!.hash, hash],
        );
        await local.conn.run(
            `UPDATE ps_capture_payload_meta SET compressed_bytes =
            (SELECT compressed_bytes FROM ps_capture_payload_meta WHERE response_hash=$1)
            WHERE response_hash=$2`,
            [pages[0]!.hash, hash],
        );
    }
    const classify = vi.spyOn(classifier, "classify");
    try {
        await expect(project()).rejects.toThrow(
            failure === "wrong-hash"
                ? "The archived payload does not match its recorded hash."
                : "The archived payload chunks are incomplete or invalid.",
        );
        expect(classify).not.toHaveBeenCalled();
        expect(await queryAll(local.conn, "SELECT * FROM ps_equipment_reclassify")).toEqual(
            progress,
        );
        expect(await queryAll(local.conn, "SELECT * FROM ps_equipment_reclassify_hour")).toEqual(
            staging,
        );
        expect(await equipmentHourly(local.conn, HOUR, "Standard")).toEqual([]);
        expect(await queryAll(local.conn, "SELECT * FROM ps_equipment_cohort_hour")).toEqual([]);
        expect(await getCursor(local.conn, "psapi")).toBe("live-cursor");
    } finally {
        classify.mockRestore();
    }
});

it("resumes bounded archived pages, publishes a complete original hour and never changes live state", async () => {
    await archive(HOUR + 1);
    await archive(HOUR + 10, [{ ...stash, items: [{ ...item, note: "~price 20 chaos" }] }]);
    await archive(HOUR + 20, [
        { id: stash.id, public: false, stashType: "PremiumStash", items: [] },
    ]);
    await captureEquipment(
        local.conn,
        { ...stash, items: [{ ...item, note: "~price 99 chaos" }] },
        classifier,
        new Date((HOUR + 3601) * 1000),
    );
    await captureEquipment(
        local.conn,
        { id: stash.id, public: false, stashType: "PremiumStash", items: [] },
        classifier,
        new Date((HOUR + 3610) * 1000),
    );
    await local.conn.run("UPDATE ps_equipment_cohort_hour SET changed_at = to_timestamp($1)", [
        HOUR,
    ]);
    await setCursor(local.conn, "psapi", "live-cursor");
    const live = await queryAll(local.conn, "SELECT * FROM ps_equipment_listing");
    const later = await equipmentHourly(local.conn, HOUR + 3600, "Standard");
    expect(await project()).toMatchObject({ pages: 1, hours: 0, pending: true });
    expect(await equipmentHourly(local.conn, HOUR, "Standard")).toEqual([]);
    expect(await project()).toMatchObject({ pages: 1, hours: 0, pending: true });
    expect(await project()).toMatchObject({
        pages: 1,
        hours: 1,
        completedHours: [HOUR],
        pending: false,
    });
    const [result] = await equipmentHourly(local.conn, HOUR, "Standard");
    expect(result).toMatchObject({
        hour: HOUR,
        listingCount: 1,
        prices: { chaos: { median: 20 } },
    });
    expect(Date.parse(`${result!.lastSeenAt}Z`)).toBe((HOUR + 10) * 1000);
    expect(await queryAll(local.conn, "SELECT * FROM ps_equipment_listing")).toEqual(live);
    expect(await equipmentHourly(local.conn, HOUR + 3600, "Standard")).toEqual(later);
    expect(
        await queryAll(
            local.conn,
            "SELECT epoch(changed_at) > $1 AS dirty FROM ps_equipment_cohort_hour WHERE hour = $2",
            [HOUR, HOUR + 3600],
        ),
    ).toEqual([{ dirty: true }]);
    expect(await equipmentHourly(local.conn, HOUR + 2 * 3600, "Standard")).toEqual([]);
    expect(await getCursor(local.conn, "psapi")).toBe("live-cursor");
    expect(await project(5)).toMatchObject({ pages: 0, hours: 0, pending: false });
    expect(await equipmentHourly(local.conn, HOUR, "Standard")).toEqual([result]);
});

it("publishes an empty correction for a later present nonmatch, even in a mixed-revision hour", async () => {
    await captureEquipment(local.conn, stash, classifier, new Date((HOUR + 1) * 1000));
    await archive(HOUR + 2);
    await legacyBodies();
    await archive(
        HOUR + 3,
        [{ ...stash, items: [{ ...item, frameType: 2 }] }],
        classifier.manifest.revision,
    );
    expect(await project(2)).toMatchObject({ pages: 2, hours: 1 });
    expect(await equipmentHourly(local.conn, HOUR, "Standard")).toMatchObject([
        { listingCount: 0, unknownCount: 0, prices: {}, firstSeenAt: null, lastSeenAt: null },
    ]);
    expect(await queryAll(local.conn, "SELECT removed_at FROM ps_equipment_listing")).toEqual([
        { removed_at: null },
    ]);
});

it("skips already-current and out-of-window pages and refuses unsafe bounds or another source", async () => {
    await archive(HOUR + 1, [stash], classifier.manifest.revision);
    await archive(HOUR - 24 * 3600, [stash]);
    await archive(HOUR + 2 * 3600, [stash]);
    expect(await project()).toMatchObject({ pages: 0, hours: 0, pending: false });
    await expect(
        reclassifyArchivedEquipment(local.conn, { realm: "xbox", league: "Standard", classifier }),
    ).rejects.toThrow(/realm/);
    await expect(project(1, "Hardcore")).rejects.toThrow(/league|season|scope/);
    for (const completedBefore of [1, -3600, Math.floor(Date.now() / 3_600_000) * 3600 + 3600])
        await expect(
            reclassifyArchivedEquipment(local.conn, {
                realm: "pc",
                league: "Standard",
                classifier,
                completedBefore,
            }),
        ).rejects.toThrow(/hour|cutoff/);
    for (const limit of [0, 11, 1.5]) await expect(project(limit)).rejects.toThrow(/limitPages/);
});

it("retains other revisions and rolls back a failed page without exposing partial prices", async () => {
    const older = compileMarketCohorts({ ...classifier.manifest, revision: "older-classifier" });
    await captureEquipment(local.conn, stash, older, new Date((HOUR + 1) * 1000));
    await captureEquipment(local.conn, stash, older, new Date((HOUR + 3601) * 1000));
    await local.conn.run("UPDATE ps_equipment_cohort_hour SET changed_at = to_timestamp($1)", [
        HOUR,
    ]);
    const oldDirtyTimes = await queryAll(
        local.conn,
        "SELECT hour, changed_at FROM ps_equipment_cohort_hour WHERE revision = 'older-classifier' ORDER BY hour",
    );
    const before = await equipmentHourly(local.conn, HOUR, "Standard");
    await archive(HOUR + 2);
    await legacyBodies();
    await local.conn.run("CREATE TEMP TABLE saved_payload AS SELECT * FROM ps_capture_payload");
    await local.conn.run("UPDATE ps_capture_payload SET response_gzip = 'invalid'::BLOB");
    await expect(project()).rejects.toThrow();
    expect(await queryAll(local.conn, "SELECT * FROM ps_equipment_reclassify")).toEqual([]);
    expect(await queryAll(local.conn, "SELECT * FROM ps_equipment_reclassify_hour")).toEqual([]);
    expect(await equipmentHourly(local.conn, HOUR, "Standard")).toEqual(before);
    await local.conn.run(
        "UPDATE ps_capture_payload SET response_gzip = saved.response_gzip FROM saved_payload saved WHERE ps_capture_payload.response_hash = saved.response_hash",
    );
    expect(await project()).toMatchObject({ pages: 1, hours: 1 });
    expect(
        (await equipmentHourly(local.conn, HOUR, "Standard")).find(
            (row) => row.revision === older.manifest.revision,
        ),
    ).toEqual(before[0]);
    expect(
        await queryAll(
            local.conn,
            "SELECT hour, changed_at FROM ps_equipment_cohort_hour WHERE revision = 'older-classifier' ORDER BY hour",
        ),
    ).toEqual(oldDirtyTimes);
});

it("prioritizes the newest pending completed hour before older archives", async () => {
    await archive(HOUR + 1);
    await archive(HOUR + 3601);
    expect(await project()).toMatchObject({
        pages: 1,
        completedHours: [HOUR + 3600],
        pending: true,
    });
    expect(await project()).toMatchObject({
        pages: 1,
        completedHours: [HOUR],
        pending: false,
    });
});

it("publishes a newer hour before refusing a missing body in an unfinished older hour", async () => {
    await archive(HOUR + 1);
    await archive(HOUR + 2);
    await setCursor(local.conn, "psapi", "live-cursor");
    expect(await project()).toMatchObject({ pages: 1, completedHours: [], pending: true });
    const [missing] = await queryAll<{ hash: string }>(
        local.conn,
        "SELECT response_hash AS hash FROM ps_capture_page WHERE captured_at = $1",
        [(HOUR + 2) * 1000],
    );
    await local.conn.run("DELETE FROM ps_capture_payload_chunk WHERE response_hash = $1", [
        missing!.hash,
    ]);
    await local.conn.run("DELETE FROM ps_capture_payload_meta WHERE response_hash = $1", [
        missing!.hash,
    ]);

    await archive(HOUR + 3601, [{ ...stash, items: [{ ...item, note: "~price 25 chaos" }] }]);
    expect(await project()).toMatchObject({
        pages: 1,
        completedHours: [HOUR + 3600],
        pending: true,
    });
    const published = await equipmentHourly(local.conn, HOUR + 3600, "Standard");
    expect(published).toMatchObject([{ listingCount: 1, prices: { chaos: { median: 25 } } }]);
    expect(await equipmentHourly(local.conn, HOUR, "Standard")).toEqual([]);
    const progress = await queryAll(
        local.conn,
        "SELECT * FROM ps_equipment_reclassify ORDER BY hour",
    );
    const staging = await queryAll(local.conn, "SELECT * FROM ps_equipment_reclassify_hour");
    await expect(project()).rejects.toThrow("The archived payload is missing.");
    expect(
        await queryAll(local.conn, "SELECT * FROM ps_equipment_reclassify ORDER BY hour"),
    ).toEqual(progress);
    expect(await queryAll(local.conn, "SELECT * FROM ps_equipment_reclassify_hour")).toEqual(
        staging,
    );
    expect(await equipmentHourly(local.conn, HOUR, "Standard")).toEqual([]);
    expect(await equipmentHourly(local.conn, HOUR + 3600, "Standard")).toEqual(published);
    expect(await getCursor(local.conn, "psapi")).toBe("live-cursor");
});

it("expires an unfinished hour before resuming newer eligible work", async () => {
    const cutoff = HOUR + 2 * 3600;
    const oldestHour = cutoff - 24 * 3600;
    await archive(oldestHour + 1);
    await archive(oldestHour + 2);
    expect(await project()).toMatchObject({ pages: 1, completedHours: [], pending: true });
    expect(
        await queryAll(
            local.conn,
            "SELECT hour::DOUBLE AS hour, completed FROM ps_equipment_reclassify",
        ),
    ).toEqual([{ hour: oldestHour, completed: false }]);
    expect(
        await queryAll(
            local.conn,
            "SELECT observed_hour::DOUBLE AS hour FROM ps_equipment_reclassify_hour",
        ),
    ).toEqual([{ hour: oldestHour }]);
    expect(await equipmentHourly(local.conn, oldestHour, "Standard")).toEqual([]);

    await archive(HOUR + 1);
    expect(
        await reclassifyArchivedEquipment(local.conn, {
            realm: "pc",
            league: "Standard",
            classifier,
            completedBefore: cutoff + 3600,
            limitPages: 1,
        }),
    ).toMatchObject({ pages: 1, completedHours: [HOUR], pending: false });
    expect(
        await queryAll(
            local.conn,
            "SELECT hour::DOUBLE AS hour, completed FROM ps_equipment_reclassify",
        ),
    ).toEqual([{ hour: HOUR, completed: true }]);
    expect(await queryAll(local.conn, "SELECT * FROM ps_equipment_reclassify_hour")).toEqual([]);
    expect(await equipmentHourly(local.conn, oldestHour, "Standard")).toEqual([]);
    expect(await equipmentHourly(local.conn, HOUR, "Standard")).toMatchObject([
        { hour: HOUR, listingCount: 1, prices: { chaos: { median: 10 } } },
    ]);
});

it("reclaims abandoned old-revision staging while preserving published history and completed progress", async () => {
    const older = compileMarketCohorts({ ...classifier.manifest, revision: "older-classifier" });
    await captureEquipment(local.conn, stash, older, new Date((HOUR + 3601) * 1000));
    await local.conn.run(
        "INSERT INTO ps_equipment_reclassify VALUES ($1, 'Standard', $2, -1, '', TRUE)",
        [older.manifest.revision, HOUR + 3600],
    );
    await archive(HOUR + 1, [stash], "original-classifier");
    await archive(HOUR + 2, [stash], "original-classifier");
    expect(
        await reclassifyArchivedEquipment(local.conn, {
            realm: "pc",
            league: "Standard",
            classifier: older,
            completedBefore: HOUR + 2 * 3600,
        }),
    ).toMatchObject({ pages: 1, hours: 0, pending: true });
    expect(
        await queryAll(
            local.conn,
            "SELECT * FROM ps_equipment_reclassify_hour WHERE revision = 'older-classifier'",
        ),
    ).toHaveLength(1);
    const history = await queryAll(local.conn, "SELECT * FROM ps_equipment_hour");
    const live = await queryAll(local.conn, "SELECT * FROM ps_equipment_listing");
    const archived = await queryAll(
        local.conn,
        "SELECT * FROM ps_capture_page ORDER BY captured_at, id",
    );
    expect(await project()).toMatchObject({ pages: 1, hours: 0, pending: true });
    expect(
        await queryAll(
            local.conn,
            "SELECT * FROM ps_equipment_reclassify_hour WHERE revision = 'older-classifier'",
        ),
    ).toEqual([]);
    expect(
        await queryAll(
            local.conn,
            "SELECT completed, hour::DOUBLE AS hour FROM ps_equipment_reclassify WHERE revision = 'older-classifier'",
        ),
    ).toEqual([{ completed: true, hour: HOUR + 3600 }]);
    expect(await queryAll(local.conn, "SELECT * FROM ps_equipment_hour")).toEqual(history);
    expect(await queryAll(local.conn, "SELECT * FROM ps_equipment_listing")).toEqual(live);
    expect(
        await queryAll(local.conn, "SELECT * FROM ps_capture_page ORDER BY captured_at, id"),
    ).toEqual(archived);
});

it("retains unknown matches as diagnostics without turning their asking amount into a price", async () => {
    const uncertain = compileMarketCohorts({
        ...classifier.manifest,
        cohorts: [
            {
                ...classifier.manifest.cohorts[0]!,
                query: {
                    format: 1,
                    game: "poe1",
                    groups: [
                        {
                            type: "and",
                            filters: [
                                { kind: "base", field: "baseType", values: ["Plate Vest"] },
                                { kind: "mod", ids: ["UnprovenModifier"], count: { min: 1 } },
                            ],
                        },
                    ],
                },
            },
        ],
    });
    await archive(HOUR + 1, [
        { ...stash, items: [{ ...item, frameType: 2, explicitMods: ["+5 to maximum Life"] }] },
    ]);
    expect(
        await reclassifyArchivedEquipment(local.conn, {
            realm: "pc",
            league: "Standard",
            classifier: uncertain,
            completedBefore: HOUR + 2 * 3600,
        }),
    ).toMatchObject({ hours: 1 });
    expect(await equipmentHourly(local.conn, HOUR, "Standard")).toMatchObject([
        { listingCount: 0, unknownCount: 1, prices: {} },
    ]);
});

it("keeps actual stash leagues separate when the archive scope is all", async () => {
    await local.conn.run("DELETE FROM pipeline_config WHERE key = 'source'");
    await configureSource(local.conn, "pc", null);
    await archive(
        HOUR + 1,
        [
            stash,
            {
                ...stash,
                id: "other-stash",
                league: "Hardcore",
                accountName: "other",
                items: [{ ...item, id: "other-item", note: "~price 100 chaos" }],
            },
        ],
        null,
        "all",
    );
    expect(await project(1, "all")).toMatchObject({ pages: 1, hours: 1 });
    expect(await equipmentHourly(local.conn, HOUR, "Standard")).toMatchObject([
        { listingCount: 1, prices: { chaos: { median: 10 } } },
    ]);
    expect(await equipmentHourly(local.conn, HOUR, "Hardcore")).toMatchObject([
        { listingCount: 1, prices: { chaos: { median: 100 } } },
    ]);
});

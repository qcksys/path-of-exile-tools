// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve public-stash wire fields.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileMarketCohorts, marketCohortManifestSchema } from "@poe-tools/market";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { createClient } from "../../../packages/poe-api-client/src/client";
import { loadEquipmentDiagnostics } from "../../../packages/poe-stash-ingest/src/ps/equipment-diagnostics-request";
import { ingestPs } from "../../../packages/poe-stash-ingest/src/ps/ingest";
import { getCursor } from "../../../packages/poe-stash-ingest/src/shared/cursor";
import { openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth.ts", () => ({ REALM: "pc" }));

const classifier = compileMarketCohorts(
    marketCohortManifestSchema.parse({
        format: 1,
        game: "poe1",
        revision: "diagnostic-test",
        catalogHash: "a".repeat(64),
        cohorts: [
            {
                id: "source",
                name: "Source with unknown preparation proof",
                purpose: "base",
                query: {
                    game: "poe1",
                    sourcePreparation: { kind: "scour-v1", crafted: false, enchanted: false },
                    groups: [
                        {
                            type: "and",
                            filters: [
                                { kind: "base", field: "baseType", values: ["Conquest Lamellar"] },
                            ],
                        },
                    ],
                },
            },
            {
                id: "prepared",
                name: "Ordinary prepared item with unknown affix counts",
                purpose: "isolated-modifier",
                query: {
                    game: "poe1",
                    groups: [
                        {
                            type: "and",
                            filters: [
                                { kind: "base", field: "baseType", values: ["Conquest Lamellar"] },
                                { kind: "range", field: "prefixes", value: { min: 1, max: 1 } },
                            ],
                        },
                    ],
                },
            },
        ],
    }),
);
const item = {
    id: "private-item",
    name: "",
    typeLine: "Conquest Lamellar",
    baseType: "Conquest Lamellar",
    ilvl: 86,
    frameType: 2,
    identified: true,
    verified: true,
    explicitMods: ["Unresolved ordinary modifier"],
    w: 2,
    h: 3,
    icon: "https://example.invalid/private-icon",
    note: "~price 220 divine",
};
const page = {
    next_change_id: "committed-next",
    stashes: [
        {
            id: "private-stash",
            accountName: "private-seller",
            public: true,
            league: "Allflame",
            stashType: "PremiumStash",
            items: [item],
        },
    ],
};
let directory: string;
beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "poe-diagnostic-request-"));
});
afterEach(async () => {
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
});
function load(overrides = {}) {
    return loadEquipmentDiagnostics({
        statusFile: join(directory, "status.json"),
        realm: "pc",
        league: "Allflame",
        classifier,
        ...overrides,
    });
}
async function request(overrides = {}) {
    await writeFile(
        join(directory, "equipment-diagnostics.request.json"),
        JSON.stringify({
            format: 1,
            realm: "pc",
            league: "Allflame",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            cohortIds: ["source"],
            ...overrides,
        }),
    );
}

it("stays disabled without a request, a status path, or a supported specific scope", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await load()).toBeUndefined();
    await request();
    expect(await load({ statusFile: undefined })).toBeUndefined();
    expect(await load({ realm: "poe2" })).toBeUndefined();
    expect(await load({ league: "all" })).toBeUndefined();
    expect(await load({ league: "" })).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
});

it.each([
    { cohortIds: ["prepared"] },
    { cohortIds: ["source", "prepared"] },
])("accepts current ordinary and mixed cohort requests: $cohortIds", async ({ cohortIds }) => {
    await request({ cohortIds });
    expect(await load()).toBeDefined();
});

it.each([
    { realm: "poe2" },
    { league: "Standard" },
    { expiresAt: "invalid" },
    { expiresAt: "2000-01-01T00:00:00Z" },
    { expiresAt: "2999-01-01T00:00:00Z" },
    { cohortIds: ["missing-cohort"] },
    { cohortIds: ["prepared", "missing-cohort"] },
    { cohortIds: Array.from({ length: 65 }, () => "source") },
])("ignores invalid diagnostic requests without exposing their contents: %j", async (value) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await request(value);
    expect(await load()).toBeUndefined();
    expect(warn).toHaveBeenCalledExactlyOnceWith(
        "Equipment diagnostic request ignored; ingestion will continue.",
    );
});

it.each([
    "source",
    "prepared",
])("saves %s observations only after the same page commits its cursor", async (cohortId) => {
    await request({ cohortIds: [cohortId] });
    const diagnostics = (await load())!;
    const db = await openDb(":memory:");
    const client = createClient({ userAgent: "diagnostic-test", token: "inert" });
    vi.spyOn(client.public, "stashTabs").mockResolvedValue(page);
    const save = diagnostics.flush.bind(diagnostics);
    const flush = vi.spyOn(diagnostics, "flush").mockImplementation(async (fixtures) => {
        expect(await getCursor(db.conn, "psapi")).toBe(page.next_change_id);
        await save(fixtures);
    });
    try {
        await ingestPs(db.conn, client, {
            pages: 1,
            league: "Allflame",
            equipment: classifier,
            equipmentDiagnostics: diagnostics,
        });
        expect(flush).toHaveBeenCalledTimes(1);
        const saved = await readFile(join(directory, "equipment-diagnostics.json"), "utf8");
        expect(
            JSON.parse(saved).fixtures[0].targets.map(
                (target: { cohortId: string }) => target.cohortId,
            ),
        ).toEqual([cohortId]);
        expect(saved).toContain("Conquest Lamellar");
        expect(saved).not.toContain("private-");
        expect(saved).not.toContain("220 divine");
    } finally {
        await db.close();
    }
});

it.each([
    "source",
    "prepared",
])("discards the page's %s samples when its transaction rolls back", async (cohortId) => {
    await request({ cohortIds: [cohortId] });
    const diagnostics = (await load())!;
    const collect = vi.spyOn(diagnostics, "collect");
    const flush = vi.spyOn(diagnostics, "flush");
    const db = await openDb(":memory:");
    const client = createClient({ userAgent: "diagnostic-rollback-test", token: "inert" });
    vi.spyOn(client.public, "stashTabs").mockResolvedValue(page);
    try {
        await db.conn.run("DROP TABLE ps_checkpoint");
        await expect(
            ingestPs(db.conn, client, {
                pages: 1,
                league: "Allflame",
                equipment: classifier,
                equipmentDiagnostics: diagnostics,
            }),
        ).rejects.toThrow("ps_checkpoint");
        expect(collect).toHaveReturnedWith(
            expect.objectContaining({
                targets: [expect.objectContaining({ cohortId })],
            }),
        );
        expect(flush).not.toHaveBeenCalled();
        expect(await getCursor(db.conn, "psapi")).toBeUndefined();
        expect(await queryAll(db.conn, "SELECT * FROM ps_equipment_listing")).toEqual([]);
        await expect(readFile(join(directory, "equipment-diagnostics.json"))).rejects.toThrow();
    } finally {
        await db.close();
    }
});

// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve public-stash wire fields.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileMarketCohorts, marketCohortManifestSchema } from "@poe-tools/market";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { createClient } from "../../../packages/poe-api-client/src/client";
import type { Item } from "../../../packages/poe-api-client/src/types";
import { ingestPs } from "../../../packages/poe-stash-ingest/src/ps/ingest";
import { loadResonatorDiagnostics } from "../../../packages/poe-stash-ingest/src/ps/resonator-diagnostics-request";
import { getCursor } from "../../../packages/poe-stash-ingest/src/shared/cursor";
import { openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth.ts", () => ({ REALM: "pc" }));

const classifier = compileMarketCohorts(
    marketCohortManifestSchema.parse({
        format: 1,
        game: "poe1",
        revision: "resonator-diagnostic-test",
        catalogHash: "a".repeat(64),
        cohorts: [],
    }),
);
const item: Item = {
    id: "private-item",
    name: "",
    typeLine: "Prime Chaotic Resonator",
    baseType: "Prime Chaotic Resonator",
    ilvl: 1,
    frameType: 5,
    identified: true,
    verified: true,
    stackSize: 1,
    maxStackSize: 10,
    sockets: Array.from({ length: 4 }, () => ({ group: 0, attr: "DV", sColour: "DV" })),
    socketedItems: [],
    w: 2,
    h: 2,
    icon: "https://example.invalid/private-icon",
    note: "~price 1234 divine",
};
const stash = {
    id: "private-stash",
    accountName: "private-seller",
    public: true,
    league: "Allflame",
    stashType: "PremiumStash",
    items: [item],
};
const page = { next_change_id: "committed-next", stashes: [stash] };
let directory: string;

beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "poe-resonator-ingest-"));
    await writeFile(
        join(directory, "resonator-diagnostics.request.json"),
        JSON.stringify({
            format: 1,
            realm: "pc",
            league: "Allflame",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        }),
    );
});

afterEach(async () => {
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
});

async function load() {
    return (await loadResonatorDiagnostics({
        statusFile: join(directory, "status.json"),
        realm: "pc",
        league: "Allflame",
    }))!;
}

it("writes one sanitized shape after committing the same page and cursor", async () => {
    const diagnostics = await load();
    const db = await openDb(":memory:");
    const client = createClient({ userAgent: "diagnostic-test", token: "inert" });
    vi.spyOn(client.public, "stashTabs").mockResolvedValue({
        ...page,
        stashes: [{ ...stash, items: [item, { ...item, id: "duplicate-shape" }] }],
    });
    const save = diagnostics.flush.bind(diagnostics);
    const flush = vi.spyOn(diagnostics, "flush").mockImplementation(async (fixtures) => {
        expect(await getCursor(db.conn, "psapi")).toBe(page.next_change_id);
        expect(fixtures).toHaveLength(1);
        await save(fixtures);
    });
    try {
        await ingestPs(db.conn, client, {
            pages: 1,
            league: "Allflame",
            equipment: classifier,
            resonatorDiagnostics: diagnostics,
        });
        expect(flush).toHaveBeenCalledTimes(1);
        const saved = await readFile(join(directory, "resonator-diagnostics.json"), "utf8");
        const fixtures = JSON.parse(saved).fixtures;
        expect(fixtures).toHaveLength(1);
        expect(fixtures[0]).toMatchObject({ origin: "live", realm: "pc", league: "Allflame" });
        expect(saved).toContain("Prime Chaotic Resonator");
        expect(saved).not.toContain("private-");
        expect(saved).not.toContain("1234 divine");
        expect(saved).not.toContain("duplicate-shape");
    } finally {
        await db.close();
    }
});

it("does not collect private or other-league stash contents", async () => {
    const diagnostics = await load();
    const collect = vi.spyOn(diagnostics, "collect");
    const flush = vi.spyOn(diagnostics, "flush");
    const db = await openDb(":memory:");
    const client = createClient({ userAgent: "diagnostic-test", token: "inert" });
    vi.spyOn(client.public, "stashTabs").mockResolvedValue({
        ...page,
        stashes: [
            { ...stash, public: false },
            { ...stash, id: "other-league-stash", league: "Standard" },
        ],
    });
    try {
        await ingestPs(db.conn, client, {
            pages: 1,
            league: "Allflame",
            equipment: classifier,
            resonatorDiagnostics: diagnostics,
        });
        expect(await getCursor(db.conn, "psapi")).toBe(page.next_change_id);
        expect(collect).not.toHaveBeenCalled();
        expect(flush).not.toHaveBeenCalled();
        await expect(readFile(join(directory, "resonator-diagnostics.json"))).rejects.toThrow();
    } finally {
        await db.close();
    }
});

it("discards diagnostic observations when the page transaction rolls back", async () => {
    const diagnostics = await load();
    const collect = vi.spyOn(diagnostics, "collect");
    const flush = vi.spyOn(diagnostics, "flush");
    const db = await openDb(":memory:");
    const client = createClient({ userAgent: "diagnostic-test", token: "inert" });
    vi.spyOn(client.public, "stashTabs").mockResolvedValue(page);
    try {
        await db.conn.run("DROP TABLE ps_checkpoint");
        await expect(
            ingestPs(db.conn, client, {
                pages: 1,
                league: "Allflame",
                equipment: classifier,
                resonatorDiagnostics: diagnostics,
            }),
        ).rejects.toThrow("ps_checkpoint");
        expect(collect).toHaveReturnedWith(expect.objectContaining({ origin: "live" }));
        expect(flush).not.toHaveBeenCalled();
        expect(await getCursor(db.conn, "psapi")).toBeUndefined();
        expect(await queryAll(db.conn, "SELECT * FROM ps_listing")).toEqual([]);
        await expect(readFile(join(directory, "resonator-diagnostics.json"))).rejects.toThrow();
    } finally {
        await db.close();
    }
});

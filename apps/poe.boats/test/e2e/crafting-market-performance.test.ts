import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { marketObservationRange } from "@poe-tools/market";
import { MySqlContainer, type StartedMySqlContainer } from "@testcontainers/mysql";
import { and, desc, eq, gte, isNull, lte, max, or, sql } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { type Connection, createConnection, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import type { TDatabase } from "~/db/client";
import { findCraftingMarketPrices } from "~/db/queries/crafting-market.queries";
import { upsertStashCohortHourly } from "~/db/queries/stash-ingest.queries";
import { tStashCohort as cohort } from "~/db/schema/stash.cohort";
import { tStashCohortHourly as hourly } from "~/db/schema/stash.cohort-hourly";
import { tStashCohortRevision as revisions } from "~/db/schema/stash.cohort-revision";
import { createCraftingItemQuery } from "~/lib/crafting-item-query";
import type { CraftingMarketInput } from "~/schemas/crafting-market";
import { baseId, engine } from "../crafting-fixtures";
import { marketCandidate } from "../crafting-market-fixtures";

const hour = 1_792_674_000;
const benchmark = process.env.CRAFTING_QUERY_BENCHMARK === "1";
const distractors = benchmark ? 8000 : 40;
const input: CraftingMarketInput = {
    item: createCraftingItemQuery(engine).record(engine.createItem(baseId, 86)),
    requirements: { format: 1, game: "poe1", groups: [] },
    realm: "pc",
    league: "Standard",
    currency: "chaos",
    at: hour,
};
let container: StartedMySqlContainer;
let connection: Connection;
let db: MySql2Database;
const statements: Array<{ sql: string; params: unknown[] }> = [];

function definition(id: string, revision = "current", baseTypes: string[] | null = ["Plate Vest"]) {
    return { ...marketCandidate.definition, id, revision, baseTypes };
}
function observation(
    cohortId: string,
    revision = "current",
    at = hour,
    prices = marketCandidate.latest.prices,
) {
    return { ...marketCandidate.latest, cohortId, revision, hour: at, prices };
}
// Observations go through the ingest writer so revisions are numbered as in production.
function observe(rows: Array<ReturnType<typeof observation>>) {
    return upsertStashCohortHourly(db as unknown as TDatabase, rows);
}
function definitionRead() {
    return statements.find(
        (entry) => entry.sql.includes("catalogHash") && !entry.sql.includes("cohort_hourly"),
    )!;
}

beforeAll(async () => {
    container = await new MySqlContainer("mysql:8.4")
        .withDatabase("crafting_query_test")
        .withResourcesQuota({ memory: 1, cpu: 2 })
        .start();
    connection = await createConnection(container.getConnectionUri());
    db = drizzle({
        client: connection,
        logger: { logQuery: (query, params) => statements.push({ sql: query, params }) },
    });
    await migrate(db, {
        migrationsFolder: fileURLToPath(new URL("../../app/db/migrations", import.meta.url)),
    });
    await db
        .insert(cohort)
        .values([
            definition("selected"),
            definition("unbounded", "current", null),
            definition("multi", "current", ["Other", "Plate Vest"]),
            definition("other-base", "current", ["Other"]),
        ]);
    // The older revision is numbered first, so the current revision's row replaces it.
    await observe([observation("selected", "old", hour - 3600)]);
    await observe([
        observation("selected", "current", hour - 3600),
        observation("selected", "current", hour, {}),
        observation("unbounded"),
        observation("multi"),
        observation("other-base"),
        { ...observation("selected", "current", hour), league: "Other" },
        { ...observation("selected", "current", hour), realm: "sony" },
        observation("selected", "current", hour + 3600),
        observation("selected", "current", hour - 86400),
    ]);
    for (let start = 0; start < distractors; start += 400) {
        const definitions = Array.from(
            { length: Math.min(400, distractors - start) },
            (_, offset) =>
                definition(`distractor:${String(start + offset).padStart(5, "0")}`, "current", [
                    "Unrelated Base",
                ]),
        );
        await db.insert(cohort).values(definitions);
        for (let age = 0; age < 24; age++)
            await observe(
                definitions.map(({ id }) => observation(id, "current", hour - age * 3600)),
            );
    }
    await db.execute(sql`ANALYZE TABLE ${cohort}, ${hourly}`);
    statements.length = 0;
});
afterAll(async () => {
    await connection?.end();
    await container?.stop();
});

// Keep the former query as a result/plan baseline, independent of the production builder.
function baseline(request = input, cohortId?: string) {
    const range = marketObservationRange(request.at);
    const scope = and(
        eq(hourly.realm, request.realm),
        eq(hourly.league, request.league),
        gte(hourly.hour, range.earliestHour),
        lte(hourly.hour, range.latestHour),
        cohortId === undefined ? undefined : eq(hourly.cohortId, cohortId),
    );
    const bases = or(
        isNull(cohort.baseTypes),
        sql`JSON_CONTAINS(${cohort.baseTypes}, ${JSON.stringify(request.item.item.baseType)})`,
    );
    const latest = db
        .select({ cohortId: hourly.cohortId, hour: max(hourly.hour).as("latest_hour") })
        .from(hourly)
        .where(scope)
        .groupBy(hourly.cohortId)
        .as("latest");
    // Fixture hours are older than the window retention, so no windows apply.
    const summary = {
        realm: hourly.realm,
        league: hourly.league,
        hour: hourly.hour,
        revision: revisions.revision,
        cohortId: hourly.cohortId,
        listingCount: hourly.listingCount,
        uniqueSellers: hourly.uniqueSellers,
        unknownCount: hourly.unknownCount,
        prices: hourly.prices,
        confidenceMethod: hourly.confidenceMethod,
        firstSeenAt: hourly.firstSeenAt,
        lastSeenAt: hourly.lastSeenAt,
    };
    return db
        .select({
            definition: {
                id: cohort.id,
                revision: cohort.revision,
                catalogHash: cohort.catalogHash,
                name: cohort.name,
                purpose: cohort.purpose,
                query: cohort.query,
            },
            latest: summary,
        })
        .from(hourly)
        .innerJoin(latest, and(eq(hourly.cohortId, latest.cohortId), eq(hourly.hour, latest.hour)))
        .innerJoin(revisions, eq(revisions.seq, hourly.revisionSeq))
        .innerJoin(cohort, eq(cohort.id, hourly.cohortId))
        .where(and(scope, bases))
        .orderBy(desc(hourly.hour), cohort.id)
        .limit(2001);
}

async function measure(query: { sql: string; params: unknown[] }) {
    const runs: number[] = [];
    let rows: unknown;
    for (let run = 0; run < 3; run++) {
        const started = performance.now();
        [rows] = await connection.query(query.sql, query.params);
        runs.push(performance.now() - started);
    }
    const [plan] = await connection.query(`EXPLAIN ANALYZE ${query.sql}`, query.params);
    return { rows, milliseconds: runs, plan, sql: query.sql, params: query.params };
}

it("preserves latest rows while reducing unrelated cohort work before aggregation", async () => {
    const actual = await findCraftingMarketPrices(db as unknown as TDatabase, input);
    expect(actual.truncated).toBe(false);
    expect(
        actual.candidates.map((entry) => [
            entry.definition.id,
            entry.definition.revision,
            entry.latest.hour,
            entry.covered,
        ]),
    ).toEqual([
        ["multi", "current", hour, true],
        ["selected", "current", hour, false],
        ["unbounded", "current", hour, true],
    ]);
    const current = statements.slice();
    expect(actual.candidates.map(({ definition, latest }) => ({ definition, latest }))).toEqual(
        await baseline(),
    );
    if (benchmark) {
        const old = await measure(baseline().toSQL());
        const oldDefinitions = await measure(
            db
                .select({
                    id: cohort.id,
                    revision: cohort.revision,
                    catalogHash: cohort.catalogHash,
                    name: cohort.name,
                    purpose: cohort.purpose,
                    query: cohort.query,
                })
                .from(cohort)
                .where(
                    or(
                        isNull(cohort.baseTypes),
                        sql`JSON_CONTAINS(${cohort.baseTypes}, ${JSON.stringify(input.item.item.baseType)})`,
                    ),
                )
                .orderBy(cohort.id)
                .limit(500)
                .toSQL(),
        );
        const production = [];
        for (const query of current) production.push(await measure(query));
        const path = fileURLToPath(
            new URL(
                "../../../../.artifacts/crafting-market-query-final-benchmark.json",
                import.meta.url,
            ),
        );
        await writeFile(
            path,
            JSON.stringify(
                {
                    distractors,
                    hourlyDistractors: distractors * 24,
                    old,
                    oldDefinitions,
                    production,
                },
                null,
                2,
            ),
        );
        console.log(
            JSON.stringify({
                path,
                old: old.milliseconds,
                oldDefinitions: oldDefinitions.milliseconds,
                production: production.map((query) => query.milliseconds),
            }),
        );
    }
}, 60_000);

it("preserves exact cohort filtering, the newest revision, historical cutoffs and latest unpriced buckets", async () => {
    for (const request of [
        input,
        { ...input, at: hour - 3600 },
        { ...input, currency: "divine" },
        { ...input, window: "adaptive-v1" as const },
    ]) {
        statements.length = 0;
        const result = await findCraftingMarketPrices(
            db as unknown as TDatabase,
            request,
            "selected",
        );
        expect(result.truncated).toBe(false);
        expect(result.candidates.map(({ definition, latest }) => ({ definition, latest }))).toEqual(
            await baseline(request, "selected"),
        );
        expect(result.candidates.map((entry) => entry.definition.id)).toEqual(["selected"]);
        if (request.at === hour && request.currency === "chaos")
            expect(result.candidates[0]).toMatchObject({
                latest: { hour, revision: "current", prices: {} },
                covered: false,
            });
        if (request.at === hour - 3600)
            expect(result.candidates[0]).toMatchObject({
                latest: { hour: hour - 3600, revision: "current" },
                covered: true,
            });
        if (request.currency === "divine")
            expect(result.candidates.every((entry) => !entry.covered)).toBe(true);
    }
});

it("seeks matching base definitions without scanning unrelated catalog rows", async () => {
    statements.length = 0;
    await findCraftingMarketPrices(db as unknown as TDatabase, input);
    const query = definitionRead();
    const [plan] = await connection.query<RowDataPacket[]>(`EXPLAIN ${query.sql}`, query.params);
    expect(plan[0]?.key).toBe("stash_cohort_base_page_idx");
    expect(String(plan[0]?.Extra)).not.toContain("filesort");
    const [before] = await connection.query<RowDataPacket[]>(
        "SHOW SESSION STATUS LIKE 'Handler_read_next'",
    );
    await connection.query(query.sql, query.params);
    const [after] = await connection.query<RowDataPacket[]>(
        "SHOW SESSION STATUS LIKE 'Handler_read_next'",
    );
    expect(Number(after[0]?.Value) - Number(before[0]?.Value)).toBeLessThan(10);
});

it("keeps ordering and the 2001-row boundary without quadratic history reads", async () => {
    for (let start = 0; start < 2002; start += 400) {
        const definitions = Array.from({ length: Math.min(400, 2002 - start) }, (_, offset) =>
            definition(`limit:${String(start + offset).padStart(4, "0")}`),
        );
        await db.insert(cohort).values(definitions);
        await observe(definitions.map(({ id }) => observation(id, "current", hour - 3600)));
    }
    await db.insert(cohort).values(definition("zz:newest"));
    await observe([observation("zz:newest")]);
    statements.length = 0;
    const [readsBefore] = await connection.query<RowDataPacket[]>(
        "SHOW SESSION STATUS LIKE 'Handler_read_next'",
    );
    const result = await findCraftingMarketPrices(db as unknown as TDatabase, input);
    const [readsAfter] = await connection.query<RowDataPacket[]>(
        "SHOW SESSION STATUS LIKE 'Handler_read_next'",
    );
    const historyReads = Number(readsAfter[0]?.Value) - Number(readsBefore[0]?.Value);
    // Allow several linear passes, but not a whole history scan for each matching definition.
    expect(historyReads).toBeLessThan((2002 + distractors * 24 + 10) * 20);
    expect(result.truncated).toBe(true);
    expect(result.candidates).toHaveLength(2000);
    expect(result.candidates.slice(0, 4).map((entry) => entry.definition.id)).toEqual([
        "multi",
        "selected",
        "unbounded",
        "zz:newest",
    ]);
    expect(result.candidates.at(-1)?.definition.id).toBe("limit:1995");
    expect(result.candidates.map(({ definition, latest }) => ({ definition, latest }))).toEqual(
        (await baseline()).slice(0, 2000),
    );
});

it("does not spend the observation cap on incompatible definitions or definitions without observations", async () => {
    const league = "Definition cap fixture";
    const incompatible = structuredClone(marketCandidate.definition.query);
    const rarity = incompatible.groups[0]!.filters.find((filter) => filter.kind === "rarity");
    if (rarity?.kind !== "rarity") throw new Error("Missing fixture rarity");
    rarity.values = ["Rare"];
    for (let start = 0; start < 2001; start += 400) {
        const definitions = Array.from({ length: Math.min(400, 2001 - start) }, (_, offset) => ({
            ...definition(`a:incompatible:${String(start + offset).padStart(4, "0")}`),
            query: incompatible,
        }));
        await db.insert(cohort).values(definitions);
        await observe(definitions.map(({ id }) => ({ ...observation(id), league })));
    }
    await db.insert(cohort).values(definition("zz:eligible"));
    await observe([
        { ...observation("zz:eligible", "current", hour - 3600), league },
        { ...observation("zz:eligible", "current", hour, {}), league },
    ]);
    const result = await findCraftingMarketPrices(db as unknown as TDatabase, { ...input, league });
    expect(result.truncated).toBe(false);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
        definition: { id: "zz:eligible" },
        latest: { hour, prices: {} },
        covered: false,
    });
});

it("retains late primary-key pages at the global tie boundary using database collation", async () => {
    const league = "Primary scan ordering";
    for (let start = 0; start < 2602; start += 400) {
        const definitions = Array.from({ length: Math.min(400, 2602 - start) }, (_, offset) =>
            definition(`Z:tie:${String(start + offset).padStart(4, "0")}`, "aa-first"),
        );
        await db.insert(cohort).values(definitions);
        await observe(
            definitions.map(({ id, revision }) => ({
                ...observation(id, revision, hour - 3600),
                league,
            })),
        );
    }
    await db
        .insert(cohort)
        .values([definition("a:late", "zz-last"), definition("Z:newest-correction", "zz-last")]);
    await observe([
        { ...observation("a:late", "zz-last", hour - 3600), league },
        { ...observation("Z:newest-correction", "zz-last", hour - 3600), league },
        { ...observation("Z:newest-correction", "zz-last", hour, {}), league },
    ]);
    statements.length = 0;
    const result = await findCraftingMarketPrices(db as unknown as TDatabase, { ...input, league });
    const production = statements.slice();
    const identityReads = production.filter(
        (query) => query.sql.includes("`id` in (") && !query.sql.includes("cohort_hourly"),
    );
    expect(Math.max(...identityReads.map((query) => query.params.length))).toBeGreaterThan(2001);
    expect(identityReads.every((query) => query.params.length <= 2502)).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.candidates).toHaveLength(2000);
    expect(result.candidates[0]).toMatchObject({
        definition: { id: "Z:newest-correction" },
        latest: { hour, revision: "zz-last", prices: {} },
        covered: false,
    });
    expect(result.candidates[1]?.definition.id).toBe("a:late");
    expect(result.candidates.map(({ definition, latest }) => ({ definition, latest }))).toEqual(
        (await baseline({ ...input, league })).slice(0, 2000),
    );
    const definitionReads = production.filter(
        (entry) => entry.sql.includes("catalogHash") && !entry.sql.includes("cohort_hourly"),
    );
    expect(definitionReads.length).toBeGreaterThan(4);
    for (const query of [definitionReads[0]!, definitionReads[1]!]) {
        const [plan] = await connection.query<RowDataPacket[]>(
            `EXPLAIN ANALYZE ${query.sql}`,
            query.params,
        );
        expect(plan[0]?.EXPLAIN).not.toContain("Sort:");
        expect(plan[0]?.EXPLAIN).toContain("stash_cohort_base_page_idx");
    }
});

it("reads no definitions when the window has no observations", async () => {
    statements.length = 0;
    const result = await findCraftingMarketPrices(db as unknown as TDatabase, {
        ...input,
        league: "Unobserved league",
    });
    expect(result).toMatchObject({ candidates: [], truncated: false });
    expect(result.message).toContain("24 completed hours");
    expect(statements).toHaveLength(1);
    expect(statements[0]?.sql).toContain("stash_poe1_cohort_hourly");
});

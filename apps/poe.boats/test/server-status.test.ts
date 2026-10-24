import { DatabaseSync } from "node:sqlite";
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { IngestStatus } from "@poe-tools/market";
import { drizzle } from "drizzle-orm/mysql-proxy";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { z } from "zod";
import { api } from "~/api/router.server";
import { DB_TABLE_PREFIX } from "~/const";
import type { TDatabase } from "~/db/client";
import { handleMcpRequest } from "~/mcp/server.server";
import type { OperationContext } from "~/operations/operation";
import { getServerStatus, serverStatusFilters } from "~/operations/server-status.server";

vi.mock("~/services/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const now = 1_000_000;
const rpcSchema = z.object({ result: z.unknown() });
let sqlite: DatabaseSync;
let db: TDatabase;
let reads: string[];
const unused = async (): Promise<never> => {
    throw new Error("Unexpected catalog access");
};
const runtime = async (): Promise<OperationContext> => ({
    db,
    caller: null,
    origin: "https://poe.boats",
    loadCatalog: unused,
    loadWorkbenchCatalog: unused,
    loadCraftingRulesets: unused,
    loadCraftingRevision: unused,
});

beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    reads = [];
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE ${DB_TABLE_PREFIX}ingest_worker (
        workerId TEXT, realm TEXT, league TEXT, receivedAt INTEGER, report TEXT
    )`);
    db = drizzle(async (sql, params) => {
        reads.push(sql);
        const statement = sqlite.prepare(sql);
        statement.setReturnArrays(true);
        return {
            rows: statement
                .all(...params)
                .map((row) =>
                    Object.values(row).map((value) =>
                        typeof value === "string" && value.startsWith("{")
                            ? JSON.parse(value)
                            : value,
                    ),
                ),
        };
    }) as unknown as TDatabase;
});
afterEach(() => {
    sqlite.close();
    vi.restoreAllMocks();
});

function worker(overrides: Partial<IngestStatus> = {}, receivedAt = now) {
    const report: IngestStatus = {
        workerId: "pc-worker",
        realm: "pc",
        league: "Allflame",
        state: "running",
        stage: "stash",
        startedAt: 0,
        reportedAt: now,
        progressAt: now,
        completedAt: now,
        lastSuccessAt: now,
        failedStages: [],
        cycles: 12,
        pages: 5,
        equipmentObserved: 800,
        stashCaughtUp: false,
        currencyNextHour: null,
        deliveredHours: 2,
        deliveredRows: 500,
        ...overrides,
    };
    sqlite
        .prepare(`INSERT INTO ${DB_TABLE_PREFIX}ingest_worker VALUES (?, ?, ?, ?, ?)`)
        .run(report.workerId, report.realm, report.league, receivedAt, JSON.stringify(report));
    return report;
}

function coverageTables() {
    for (const stream of ["currency", "unique", "cohort"])
        sqlite.exec(
            `CREATE TABLE ${DB_TABLE_PREFIX}stash_${stream}_hourly (realm TEXT, league TEXT, hour INTEGER)`,
        );
    sqlite.exec(`INSERT INTO ${DB_TABLE_PREFIX}stash_currency_hourly VALUES
        ('pc', 'Allflame', 3600), ('pc', 'Allflame', 3600), ('pc', 'Allflame', 10800),
        ('pc', 'Other', 18000), ('poe2', 'Allflame', 18000)`);
}

async function mcp(method: string, params: unknown) {
    return handleMcpRequest(
        new Request("https://poe.boats/mcp", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                accept: "application/json, text/event-stream",
            },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        }),
        runtime,
    );
}

it.each([
    { health: "running", overrides: {}, receivedAt: now },
    { health: "stale", overrides: {}, receivedAt: now - 180_001 },
    { health: "stalled", overrides: { progressAt: now - 600_001 }, receivedAt: now },
    { health: "error", overrides: { failedStages: ["stash"] }, receivedAt: now },
] satisfies Array<{
    health: string;
    overrides: Partial<IngestStatus>;
    receivedAt: number;
}>)("returns actual $health worker state without any coverage tables or reads", async ({
    health,
    overrides,
    receivedAt,
}) => {
    const report = worker(overrides, receivedAt);
    worker({ workerId: "other-league", league: "Other" });
    worker({ workerId: "other-realm", realm: "poe2" });
    const result = await getServerStatus(
        db,
        serverStatusFilters.parse({ realm: "pc", league: "Allflame", view: "workers" }),
    );
    expect(result).toEqual({
        checkedAt: now,
        workers: [{ ...report, receivedAt, health }],
        coverage: [],
    });
    expect(reads).toHaveLength(1);
    expect(reads[0]).toContain(`${DB_TABLE_PREFIX}ingest_worker`);
});

it.each([undefined, "full"])("retains full coverage when view is %s", async (view) => {
    worker();
    coverageTables();
    const result = await getServerStatus(
        db,
        serverStatusFilters.parse({ realm: "pc", league: "Allflame", view }),
    );
    expect(result.coverage).toEqual([
        {
            stream: "currency",
            realm: "pc",
            league: "Allflame",
            firstHour: 3600,
            latestHour: 10800,
            hours: 2,
            rows: 3,
        },
    ]);
    expect(reads).toHaveLength(4);
    expect(reads.filter((sql) => sql.includes("count(distinct"))).toHaveLength(3);
});

it.each([undefined, "full", "workers"])("shares view %s through HTTP and MCP", async (view) => {
    worker();
    if (view !== "workers") coverageTables();
    const input = { realm: "pc", league: "Allflame", ...(view ? { view } : {}) };
    const expected = await getServerStatus(db, serverStatusFilters.parse(input));
    reads = [];
    const http = await api.request(
        `https://poe.boats/api/v1/server/status?${new URLSearchParams(input)}`,
        undefined,
        { runtime },
    );
    expect(http.status).toBe(200);
    expect(await http.json()).toEqual(expected);
    const rpc = await mcp("tools/call", { name: "get_server_status", arguments: input });
    const result = CallToolResultSchema.parse(rpcSchema.parse(await rpc.json()).result);
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual(expected);
    expect(reads).toHaveLength(view === "workers" ? 2 : 8);
});

it("rejects unsupported views through both transports before querying", async () => {
    expect(serverStatusFilters.safeParse({ view: "fast" }).success).toBe(false);
    const http = await api.request("https://poe.boats/api/v1/server/status?view=fast", undefined, {
        runtime,
    });
    expect(http.status).toBe(400);
    const rpc = await mcp("tools/call", { name: "get_server_status", arguments: { view: "fast" } });
    const result = CallToolResultSchema.parse(rpcSchema.parse(await rpc.json()).result);
    expect(result.isError).toBe(true);
    expect(reads).toHaveLength(0);
});

it("discovers the optional view and omitted-coverage semantics in OpenAPI and MCP", async () => {
    const document = z
        .object({ paths: z.record(z.string(), z.unknown()) })
        .parse(await (await api.request("https://poe.boats/api/openapi.json")).json());
    const operation = z
        .object({
            get: z.object({
                summary: z.string(),
                parameters: z.array(
                    z.object({
                        name: z.string(),
                        required: z.boolean().optional(),
                        schema: z.unknown(),
                    }),
                ),
            }),
        })
        .parse(document.paths["/api/v1/server/status"]).get;
    expect(
        operation.parameters.find((entry: { name: string }) => entry.name === "view"),
    ).toMatchObject({
        required: false,
        schema: { enum: ["full", "workers"] },
    });
    expect(operation.summary).toContain("coverage");
    const result = ListToolsResultSchema.parse(
        rpcSchema.parse(await (await mcp("tools/list", {})).json()).result,
    );
    const tool = result.tools.find((entry) => entry.name === "get_server_status")!;
    expect(tool.inputSchema.properties?.view).toMatchObject({ enum: ["full", "workers"] });
    expect(tool.description).toContain("omitted");
    expect(reads).toHaveLength(0);
});

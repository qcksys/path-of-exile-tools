import { fileURLToPath } from "node:url";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { MySqlContainer, type StartedMySqlContainer } from "@testcontainers/mysql";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { createPool, type Pool } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, expect, it } from "vite-plus/test";
import { z } from "zod";
import { api } from "~/api/router.server";
import type { TDatabase } from "~/db/client";
import { tCraftingShare } from "~/db/schema/crafting.share";
import { tCraftingWorkspace } from "~/db/schema/crafting.workspace";
import { handleMcpRequest } from "~/mcp/server.server";
import {
    createCraftingShare,
    getCloudCraftingWorkspace,
    getCraftingShare,
    listCraftingShares,
    revokeCraftingShare,
    saveCloudCraftingWorkspace,
    setCraftingStoragePreference,
} from "~/operations/crafting-cloud.server";
import type { OperationContext } from "~/operations/operation";
import {
    craftingCloudStateSchema,
    craftingShareInfoSchema,
    sharedCraftingBundleSchema,
} from "~/schemas/crafting-cloud";
import { cloudBundle } from "../crafting-cloud-fixtures";
import {
    historyIndex,
    retainedRevision,
    retainedTransmuteGraph,
} from "../crafting-history-fixtures";

let container: StartedMySqlContainer;
let pool: Pool;
let mysql: MySql2Database;
function context(userId: string | null = "owner"): OperationContext {
    return {
        db: mysql as unknown as TDatabase,
        caller: userId
            ? { id: userId, name: "Test", email: "test@example.invalid", role: "user" }
            : null,
        origin: "https://poe.boats",
        loadCatalog: async () => {
            throw new Error("No catalog needed for draft persistence");
        },
        loadCraftingRulesets: async () => {
            throw new Error("No catalog needed for draft persistence");
        },
        loadWorkbenchCatalog: async () => {
            throw new Error("No catalog needed for draft persistence");
        },
        loadCraftingRevision: async () => {
            throw new Error("No catalog needed for draft persistence");
        },
    };
}
beforeAll(async () => {
    container = await new MySqlContainer("mysql:8.4").withDatabase("crafting_cloud_test").start();
    pool = createPool(container.getConnectionUri());
    mysql = drizzle({ client: pool });
    await migrate(mysql, {
        migrationsFolder: fileURLToPath(new URL("../../app/db/migrations", import.meta.url)),
    });
});
beforeEach(async () => {
    await mysql.delete(tCraftingShare);
    await mysql.delete(tCraftingWorkspace);
});
afterAll(async () => {
    await pool?.end();
    await container?.stop();
});

it("keeps account drafts private, validates references, and serializes concurrent writes", async () => {
    const bundle = cloudBundle();
    await expect(
        saveCloudCraftingWorkspace(context(null), { bundle, expectedRevision: 0 }),
    ).rejects.toMatchObject({ status: 401 });
    expect(await getCloudCraftingWorkspace(context())).toMatchObject({
        revision: 0,
        defaultStorage: null,
        bundle: { projects: [], builds: [] },
    });
    const saved = await saveCloudCraftingWorkspace(context(), { bundle, expectedRevision: 0 });
    expect(saved.revision).toBe(1);
    expect(saved.bundle).toEqual(bundle);
    expect((await getCloudCraftingWorkspace(context("other"))).bundle.projects).toEqual([]);
    expect((await listCraftingShares(context())).shares).toEqual([]);
    await expect(
        saveCloudCraftingWorkspace(context(), {
            bundle: { ...bundle, projects: [] },
            expectedRevision: 1,
        }),
    ).rejects.toMatchObject({ status: 400 });
    expect((await getCloudCraftingWorkspace(context())).revision).toBe(1);
    const alternatives = ["Device A", "Device B"].map((name) => ({
        ...bundle,
        projects: bundle.projects.map((project) => ({
            ...project,
            graph: { ...project.graph, name },
        })),
    }));
    const results = await Promise.allSettled(
        alternatives.map((next) =>
            saveCloudCraftingWorkspace(context(), { bundle: next, expectedRevision: 1 }),
        ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((result) => result.status === "rejected");
    expect(failed?.status === "rejected" && failed.reason).toMatchObject({ status: 409 });
    expect((await getCloudCraftingWorkspace(context())).revision).toBe(2);
    const preferred = await setCraftingStoragePreference(context(), "cloud");
    const local = await setCraftingStoragePreference(context(), "local");
    expect(local.bundle).toEqual(preferred.bundle);
    expect(local.revision).toBe(2);
    expect(local.defaultStorage).toBe("local");
    expect((await listCraftingShares(context())).shares).toEqual([]);
});

it("freezes build dependencies, limits live access to the selected target, and enforces revocation ownership", async () => {
    const bundle = cloudBundle();
    await saveCloudCraftingWorkspace(context(), { bundle, expectedRevision: 0 });
    const target = { kind: "build", id: "build" } as const;
    const frozen = await createCraftingShare(context(), {
        target,
        mode: "frozen",
        expectedRevision: 1,
    });
    const live = await createCraftingShare(context(), {
        target,
        mode: "live",
        expectedRevision: 1,
    });
    const snapshot = await getCraftingShare(context(null), frozen.id);
    expect(snapshot.bundle.projects).toEqual([]);
    expect(snapshot.bundle.builds[0]!.members.every((member) => member.kind === "value")).toBe(
        true,
    );
    expect(JSON.stringify(snapshot)).not.toContain("Private unrelated plan");
    const changed = cloudBundle();
    changed.projects[0]!.graph.name = "Changed saved axe";
    await saveCloudCraftingWorkspace(context(), { bundle: changed, expectedRevision: 1 });
    expect(await getCraftingShare(context(null), frozen.id)).toEqual(snapshot);
    const current = await getCraftingShare(context(null), live.id);
    expect(current.bundle.projects).toHaveLength(1);
    expect(current.bundle.projects[0]!.graph.name).toBe("Changed saved axe");
    expect(current.bundle.builds[0]!.members[1]).toMatchObject({
        kind: "value",
        project: { graph: { name: bundle.projects[0]!.graph.name } },
    });
    expect(current.workspaceRevision).toBe(2);
    expect(current.prices).toBe("live");
    await expect(
        createCraftingShare(context(), { target, mode: "live", expectedRevision: 1 }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
        createCraftingShare(context("other"), { target, mode: "live", expectedRevision: 0 }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(revokeCraftingShare(context("other"), frozen.id)).rejects.toMatchObject({
        status: 404,
    });
    expect((await listCraftingShares(context("other"))).shares).toEqual([]);
    expect((await listCraftingShares(context())).shares).toHaveLength(2);
    await revokeCraftingShare(context(), frozen.id);
    await expect(getCraftingShare(context(null), frozen.id)).rejects.toMatchObject({ status: 404 });
    await saveCloudCraftingWorkspace(context(), {
        bundle: { format: 1, projects: [], builds: [] },
        expectedRevision: 2,
    });
    await expect(getCraftingShare(context(null), live.id)).rejects.toMatchObject({ status: 404 });
});

it("round-trips both games together without changing a PoE 2 historical ruleset or its items", async () => {
    const ruleset = historyIndex.revisions.find(
        (entry) => entry.game === "poe2" && entry.revision === "r2",
    )!;
    const retained = await retainedRevision(ruleset);
    const graph = retainedTransmuteGraph(ruleset, retained.catalog);
    const bundle = cloudBundle();
    const project = { graph, revision: 1, updatedAt: "2026-10-07T00:00:00.000Z" };
    bundle.projects.push(project);
    const saved = await saveCloudCraftingWorkspace(context(), { bundle, expectedRevision: 0 });
    expect(saved.bundle.projects.at(-1)).toEqual(project);
    const shared = await createCraftingShare(context(), {
        target: { kind: "project", id: graph.id },
        mode: "frozen",
        expectedRevision: 1,
    });
    const publicRead = await getCraftingShare(context(null), shared.id);
    expect(publicRead.bundle.projects).toEqual([project]);
    expect(publicRead.bundle.projects[0]!.graph.ruleset).toEqual(graph.ruleset);
});

const rpcSchema = z.object({ result: z.unknown().optional(), error: z.unknown().optional() });
for (const transport of ["http", "mcp"] as const) {
    it(`${transport} uses the same saved-workspace and sharing behavior`, async () => {
        async function call(
            path: string,
            name: string,
            input: Record<string, unknown>,
            get = false,
            authenticated: boolean | string = true,
            status = 200,
        ) {
            const caller = context(
                typeof authenticated === "string" ? authenticated : authenticated ? "owner" : null,
            );
            if (transport === "http") {
                const url = new URL(`https://poe.boats/api/v1/crafting${path}`);
                if (get)
                    for (const [key, value] of Object.entries(input))
                        url.searchParams.set(key, String(value));
                const response = await api.request(
                    url.href,
                    get
                        ? undefined
                        : {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(input),
                          },
                    { runtime: async () => caller },
                );
                expect(response.status).toBe(status);
                return response.json();
            }
            const response = await handleMcpRequest(
                new Request("https://poe.boats/mcp", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        accept: "application/json, text/event-stream",
                    },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        id: 1,
                        method: "tools/call",
                        params: { name, arguments: input },
                    }),
                }),
                async () => caller,
            );
            const rpc = rpcSchema.parse(await response.json());
            expect(rpc.error).toBeUndefined();
            const result = CallToolResultSchema.parse(rpc.result);
            if (status === 200) expect(result.isError).not.toBe(true);
            else expect(result.isError).toBe(true);
            return result.structuredContent;
        }
        const bundle = cloudBundle();
        expect(
            craftingCloudStateSchema.parse(
                await call("/cloud/get", "get_saved_crafting_workspace", {}, true),
            ).revision,
        ).toBe(0);
        expect(
            craftingCloudStateSchema.parse(
                await call("/cloud/preference", "set_crafting_storage_preference", {
                    defaultStorage: "cloud",
                }),
            ).defaultStorage,
        ).toBe("cloud");
        const saved = craftingCloudStateSchema.parse(
            await call("/cloud/save", "save_crafting_workspace", { bundle, expectedRevision: 0 }),
        );
        expect(saved.bundle).toEqual(bundle);
        await call(
            "/cloud/save",
            "save_crafting_workspace",
            { bundle, expectedRevision: 0 },
            false,
            true,
            409,
        );
        const share = craftingShareInfoSchema.parse(
            await call("/shares/create", "create_crafting_share", {
                target: { kind: "project", id: "graph" },
                mode: "frozen",
                expectedRevision: 1,
            }),
        );
        const publicRead = sharedCraftingBundleSchema.parse(
            await call("/shares/get", "get_crafting_share", { id: share.id }, true, false),
        );
        expect(publicRead.bundle.projects).toEqual([bundle.projects[0]]);
        await call(
            "/shares/revoke",
            "revoke_crafting_share",
            { id: share.id },
            false,
            "other",
            404,
        );
        expect(await call("/shares/list", "list_crafting_shares", {}, true)).toMatchObject({
            shares: [expect.objectContaining({ id: share.id })],
        });
        expect(await call("/shares/revoke", "revoke_crafting_share", { id: share.id })).toEqual({
            ok: true,
        });
        expect((await listCraftingShares(context())).shares).toEqual([]);
    });
}

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { RouterContextProvider } from "react-router";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { dbContext, envContext, serverTimingContext } from "~/context";
import { createDbConnection } from "~/db/client";
import { operationContext } from "~/operations/runtime.server";
import { craftingRulesetIndexSchema } from "~/schemas/crafting-rulesets";
import { ServerTiming } from "~/services/server-timing.server";

const runtimeMocks = vi.hoisted(() => ({
    selected: vi.fn(),
    other: vi.fn(),
}));
vi.mock("~/lib/crafting-runtimes.generated", () => ({
    craftingRuntimeLoaders: {
        "crafting-graph-9": runtimeMocks.selected,
        "crafting-graph-8": runtimeMocks.other,
    },
    craftingRuntimeHashes: {
        "crafting-graph-9": "a".repeat(64),
        "crafting-graph-8": "b".repeat(64),
    },
}));

const catalogBytes = new TextEncoder().encode('{"fixture":true}');
const index = craftingRulesetIndexSchema.parse(
    JSON.parse(readFileSync("crafting-history/index.json", "utf8")),
);
const original = index.revisions.find((entry) => entry.engine === "crafting-graph-9")!;
const ruleset = {
    ...original,
    catalog: {
        sha256: createHash("sha256").update(catalogBytes).digest("hex"),
        bytes: catalogBytes.byteLength,
    },
    implementation: { sha256: "a".repeat(64), bytes: 1 },
};

beforeEach(() => {
    vi.clearAllMocks();
    runtimeMocks.selected.mockResolvedValue({
        revision: ruleset.engine,
        createSimulation: vi.fn(),
    });
    runtimeMocks.other.mockRejectedValue(new Error("Unselected runtime must remain unloaded."));
});

async function runtimeContext(timing = new ServerTiming()) {
    const context = new RouterContextProvider();
    context.set(dbContext, createDbConnection("mysql://test:test@unused.invalid"));
    context.set(serverTimingContext, timing);
    context.set(envContext, {
        ASSETS: {
            fetch: vi.fn(async () => new Response(catalogBytes)),
            connect: () => {
                throw new Error("The asset fixture does not use sockets.");
            },
        },
        ENVIRONMENT: "local",
        URL: "poe.boats",
        LOG_LEVEL: "silent",
        DATABASE_URL: "mysql://test:test@unused.invalid",
        DATABASE_DRIVER: "planetscale",
        BETTER_AUTH_SECRET: "unused",
        GOOGLE_CLIENT_ID: "unused",
        GOOGLE_CLIENT_SECRET: "unused",
        POE_CLIENT_ID: "unused",
        POE_CLIENT_SECRET: "unused",
        STASH_INGEST_TOKEN: "unused",
    });
    return operationContext(
        new Request("https://poe.boats/api/v1/crafting/market/cohorts"),
        context,
    );
}

it("passes the request's timing collector without sharing measurements between requests", async () => {
    const timing = new ServerTiming();
    const first = await runtimeContext(timing);
    const second = await runtimeContext();
    expect(first.timing).toBe(timing);
    first.timing!.add("equipment_db", 25);
    expect(timing.toString()).toBe("equipment_db;dur=25.0");
    expect(second.timing!.toString()).toBe("");
});

it("creates an ordinary operation context without loading retained engines", async () => {
    const context = await runtimeContext();
    expect(context.caller).toBeNull();
    expect(runtimeMocks.selected).not.toHaveBeenCalled();
    expect(runtimeMocks.other).not.toHaveBeenCalled();
    const loaded = await context.loadCraftingRevision(ruleset);
    expect(loaded.catalog).toEqual({ fixture: true });
    expect(loaded.runtime.revision).toBe(ruleset.engine);
    expect(runtimeMocks.selected).toHaveBeenCalledOnce();
    expect(runtimeMocks.other).not.toHaveBeenCalled();
});

it("refuses a mismatched implementation hash before loading any engine", async () => {
    const context = await runtimeContext();
    await expect(
        context.loadCraftingRevision({
            ...ruleset,
            implementation: { ...ruleset.implementation, sha256: "c".repeat(64) },
        }),
    ).rejects.toThrow("Retained crafting implementation unavailable.");
    expect(runtimeMocks.selected).not.toHaveBeenCalled();
    expect(runtimeMocks.other).not.toHaveBeenCalled();
});

it("refuses an unknown engine without loading another retained engine", async () => {
    const context = await runtimeContext();
    await expect(
        context.loadCraftingRevision({ ...ruleset, engine: "crafting-graph-unknown" }),
    ).rejects.toThrow("Retained crafting implementation unavailable.");
    expect(runtimeMocks.selected).not.toHaveBeenCalled();
    expect(runtimeMocks.other).not.toHaveBeenCalled();
});

it("still refuses a loaded module with the wrong engine revision", async () => {
    runtimeMocks.selected.mockResolvedValue({
        revision: "crafting-graph-8",
        createSimulation: vi.fn(),
    });
    const context = await runtimeContext();
    await expect(context.loadCraftingRevision(ruleset)).rejects.toThrow(
        "The retained crafting implementation does not match this revision.",
    );
    expect(runtimeMocks.selected).toHaveBeenCalledOnce();
    expect(runtimeMocks.other).not.toHaveBeenCalled();
});

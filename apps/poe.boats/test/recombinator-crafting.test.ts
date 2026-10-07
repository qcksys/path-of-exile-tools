import { readFileSync } from "node:fs";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";
import { api } from "../app/api/router.server";
import { createDbConnection } from "../app/db/client";
import { materializeRecombinatorInput } from "../app/lib/recombinator-crafting";
import { catalogExampleDraft } from "../app/lib/recombinator-plan";
import { handleMcpRequest } from "../app/mcp/server.server";
import type { OperationContext } from "../app/operations/operation";
import { recombinatorCatalogSchema } from "../app/schemas/recombinator-catalog";
import { recombinatorCraftingInputSchema } from "../app/schemas/recombinator-crafting";
import { catalog, engine } from "./crafting-fixtures";
import { historyIndex, retainedRevision } from "./crafting-history-fixtures";

afterEach(() => vi.restoreAllMocks());
vi.mock("~/services/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const recombinator = recombinatorCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/recombinator-poe1.json", "utf8")),
);
function fixture() {
    const selection = catalogExampleDraft(recombinator).items[0]!;
    const base = recombinator.bases.find(
        (base) =>
            base.itemClass === selection.catalog!.base.itemClass &&
            selection.catalog!.base.tags.every((tag) => base.tags.includes(tag)),
    )!;
    return recombinatorCraftingInputSchema.parse({
        source: {
            patch: catalog.patch,
            manifestSha256: catalog.manifestSha256,
            craftingSha256: catalog.craftingSha256,
        },
        selection,
        baseId: base.id,
        rarity: "rare",
        rolls: "minimum",
    });
}
describe("recombinator input materialization", () => {
    it.each([
        "minimum",
        "maximum",
        "stale",
        "custom",
    ] as const)("shares %s input conversion and refusals through HTTP and MCP", async (scenario) => {
        vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
        const context: OperationContext = {
            db: createDbConnection("mysql://test:test@localhost/poe_test"),
            loadCatalog: async () => recombinator,
            loadWorkbenchCatalog: async () => catalog,
            loadCraftingRulesets: async () => historyIndex,
            loadCraftingRevision: retainedRevision,
            origin: "https://poe.boats",
            caller: null,
        };
        const input = fixture();
        if (scenario === "maximum") input.rolls = "maximum";
        if (scenario === "stale") input.source.manifestSha256 = "0".repeat(64);
        if (scenario === "custom") input.selection.prefixes = "Unresolved custom modifier";
        const response = await api.request(
            "https://poe.boats/api/v1/crafting/items/from-recombinator",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
            },
            { runtime: async () => context },
        );
        const rpc = await handleMcpRequest(
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
                    params: {
                        name: "create_crafting_graph_from_recombinator_input",
                        arguments: input,
                    },
                }),
            }),
            async () => context,
        );
        const result = CallToolResultSchema.parse(
            z.object({ result: z.unknown() }).parse(await rpc.json()).result,
        );
        if (scenario === "stale" || scenario === "custom") {
            expect(response.status).toBe(400);
            expect(result.isError).toBe(true);
        } else {
            expect(response.status).toBe(200);
            expect(result.isError).not.toBe(true);
            const data = await response.json();
            expect(result.structuredContent).toEqual(data);
            expect(data).toMatchObject({
                graph: {
                    nodes: [
                        {
                            choice: { mode: "pinned" },
                            alternatives: [
                                {
                                    price: null,
                                    item: materializeRecombinatorInput(engine, recombinator, input),
                                },
                            ],
                        },
                    ],
                },
            });
        }
    });
    it("requires a concrete base and preserves canonical modifiers with explicit roll assumptions", () => {
        const input = fixture();
        const before = structuredClone(input);
        const low = materializeRecombinatorInput(engine, recombinator, input);
        const high = materializeRecombinatorInput(engine, recombinator, {
            ...input,
            rolls: "maximum",
        });
        expect(low).toMatchObject({
            baseId: input.baseId,
            level: input.selection.catalog!.level,
            rarity: "rare",
        });
        expect(low.mods.map((mod) => mod.id)).toEqual(
            [...input.selection.catalog!.prefixes, ...input.selection.catalog!.suffixes].map(
                (mod) => mod.id.slice(5),
            ),
        );
        for (const [index, rolled] of low.mods.entries()) {
            const ranges = engine.mod(rolled.id).stats;
            expect(rolled.values).toEqual(ranges.map((stat) => stat.min));
            expect(high.mods[index]!.values).toEqual(ranges.map((stat) => stat.max));
        }
        expect(input).toEqual(before);
    });
    it("refuses fabricated identities, custom flags, incompatible bases, impossible rarity and stale builds", () => {
        const input = fixture();
        expect(() =>
            materializeRecombinatorInput(engine, recombinator, {
                ...input,
                baseId: "generic:Body Armour:str_dex",
            }),
        ).toThrow("concrete base");
        expect(() =>
            materializeRecombinatorInput(engine, recombinator, { ...input, rarity: "normal" }),
        ).toThrow("Normal items");
        expect(() =>
            materializeRecombinatorInput(engine, recombinator, {
                ...input,
                selection: { ...input.selection, prefixes: "Custom life" },
            }),
        ).toThrow("custom modifier");
        expect(() =>
            materializeRecombinatorInput(engine, recombinator, {
                ...input,
                source: { ...input.source, patch: "stale" },
            }),
        ).toThrow("matching");
        input.selection.catalog!.prefixes[0]!.nonNative = true;
        expect(() => materializeRecombinatorInput(engine, recombinator, input)).toThrow(
            "probability assumptions",
        );
    });
});

import { expect, it, vi } from "vite-plus/test";
import { craftingGraphSchema } from "../app/schemas/crafting-graph";

vi.mock("~/services/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { CraftingGraphContract } = await import("../app/operations/crafting-contracts");
const { api } = await import("../app/api/router.server");

it("publishes resolvable local references for every crafting schema", async () => {
    const response = await api.request("https://poe.boats/api/openapi.json");
    const source = await response.text();
    expect(source.length).toBeLessThan(1_000_000);
    const document: unknown = JSON.parse(source);
    const references = new Set(
        [...source.matchAll(/"\$ref":"(#[^"]*)"/g)].map((match) => match[1]!),
    );
    expect(references.size).toBeGreaterThan(0);
    for (const reference of references) {
        let target = document;
        for (const segment of reference.slice(2).split("/")) {
            expect(target !== null && typeof target === "object", reference).toBe(true);
            if (target === null || typeof target !== "object") throw new Error(reference);
            target = Reflect.get(
                target,
                decodeURIComponent(segment).replaceAll("~1", "/").replaceAll("~0", "~"),
            );
        }
        expect(target, reference).toBeDefined();
    }
});

it("starts the API when browser-shared schemas have already been constructed", async () => {
    expect(craftingGraphSchema.shape.format.value).toBe(1);
    expect(CraftingGraphContract.shape.format.value).toBe(1);
    const response = await api.request("https://poe.boats/api/openapi.json");
    expect(response.status).toBe(200);
    const document = await response.text();
    expect(document).toContain('"#/components/schemas/CraftingGraph"');
    expect(document).toContain('"CraftingWorkspace"');
});

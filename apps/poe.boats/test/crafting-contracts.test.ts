import { expect, it, vi } from "vite-plus/test";
import { craftingGraphSchema } from "../app/schemas/crafting-graph";

vi.mock("~/services/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { CraftingGraphContract } = await import("../app/operations/crafting-contracts");
const { api } = await import("../app/api/router.server");

it("starts the API when browser-shared schemas have already been constructed", async () => {
    expect(craftingGraphSchema.shape.format.value).toBe(1);
    expect(CraftingGraphContract.shape.format.value).toBe(1);
    const response = await api.request("https://poe.boats/api/openapi.json");
    expect(response.status).toBe(200);
    const document = await response.text();
    expect(document).toContain('"#/components/schemas/CraftingGraph"');
    expect(document).toContain('"CraftingWorkspace"');
});

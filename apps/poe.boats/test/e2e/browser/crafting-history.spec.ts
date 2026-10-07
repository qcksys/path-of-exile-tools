import { expect, type Page, test } from "@playwright/test";
import { craftingCatalogUrl, craftingImplementationUrl } from "../../../app/lib/crafting-rulesets";
import type { CraftingGraph } from "../../../app/schemas/crafting-graph";
import { craftingGraphResultSchema } from "../../../app/schemas/crafting-graph-result";
import {
    historyIndex,
    retainedRevision,
    retainedTransmuteGraph,
} from "../../crafting-history-fixtures";

async function workerCalculation(page: Page, graph: CraftingGraph) {
    return page.evaluate(
        ({ graph }) =>
            new Promise<{ type: string; result?: unknown; error?: string }>((resolve, reject) => {
                const worker = new Worker("/game-data/history/worker.mjs", { type: "module" });
                worker.onerror = (event) => {
                    worker.terminate();
                    reject(new Error(event.message));
                };
                worker.onmessage = ({ data }) => {
                    if (data.type === "done" || data.type === "error") {
                        worker.terminate();
                        resolve(data);
                    }
                };
                worker.postMessage({
                    type: "calculate",
                    requestId: "test",
                    graph,
                    options: { estimateIterations: 2, workLimit: 1000 },
                });
            }),
        { graph },
    );
}

for (const ruleset of historyIndex.revisions) {
    test(`retained ${ruleset.game}/${ruleset.revision} worker agrees with the real HTTP operation`, async ({
        page,
        request,
    }) => {
        const loaded = await retainedRevision(ruleset);
        const graph = retainedTransmuteGraph(ruleset, loaded.catalog);
        const requested: string[] = [];
        page.on("request", (request) => requested.push(new URL(request.url()).pathname));
        await page.goto("/1");
        const message = await workerCalculation(page, graph);
        expect(message.error).toBeUndefined();
        const result = craftingGraphResultSchema.parse(message.result);
        expect(result).toMatchObject({
            complete: true,
            meanCost: 11,
            meanActions: 1,
            probability: 1,
        });
        const response = await request.post("/api/v1/crafting/graph/calculate", {
            data: { graph, options: { estimateIterations: 2, workLimit: 1000 } },
        });
        expect(response.ok(), await response.text()).toBe(true);
        expect((await response.json()).result).toEqual(result);
        expect([
            ...new Set(requested.filter((path) => path.includes("/history/catalogs/"))),
        ]).toEqual([craftingCatalogUrl(ruleset)]);
        expect(requested).toContain(craftingImplementationUrl(ruleset));
        const catalog = await request.get(craftingCatalogUrl(ruleset));
        expect(catalog.headers()["cache-control"]).toContain("immutable");
    });
}

test("replacement calculation cancels earlier work without blocking the page", async ({ page }) => {
    const ruleset = historyIndex.revisions[0]!;
    const graph = retainedTransmuteGraph(ruleset, (await retainedRevision(ruleset)).catalog);
    await page.goto("/1");
    const observed = await page.evaluate(
        ({ graph }) =>
            new Promise<{ completed: string[]; heartbeats: number }>((resolve, reject) => {
                const worker = new Worker("/game-data/history/worker.mjs", { type: "module" });
                let replaced = false;
                let heartbeats = 0;
                const completed: string[] = [];
                const timer = setInterval(() => heartbeats++, 10);
                worker.onerror = (event) => {
                    clearInterval(timer);
                    worker.terminate();
                    reject(new Error(event.message));
                };
                worker.onmessage = ({ data }) => {
                    if (data.type === "error") {
                        clearInterval(timer);
                        worker.terminate();
                        reject(new Error(data.error));
                    }
                    if (data.type === "progress" && !replaced) {
                        replaced = true;
                        worker.postMessage({ type: "cancel" });
                        worker.postMessage({
                            type: "calculate",
                            requestId: "replacement",
                            graph,
                            options: { estimateIterations: 2, workLimit: 1000 },
                        });
                    }
                    if (data.type === "done") {
                        completed.push(data.requestId);
                        if (data.requestId === "replacement") {
                            clearInterval(timer);
                            worker.terminate();
                            resolve({ completed, heartbeats });
                        }
                    }
                };
                worker.postMessage({
                    type: "calculate",
                    requestId: "original",
                    graph: { ...graph, iterations: 100_000 },
                    options: { estimateIterations: 100, workLimit: 2_000_000 },
                });
            }),
        { graph },
    );
    expect(observed.completed).toEqual(["replacement"]);
    expect(observed.heartbeats).toBeGreaterThan(0);
});

test("worker refuses corrupted retained data instead of using the current catalog", async ({
    page,
}) => {
    const ruleset = historyIndex.revisions[0]!;
    const graph = retainedTransmuteGraph(ruleset, (await retainedRevision(ruleset)).catalog);
    await page
        .context()
        .route(`**${craftingCatalogUrl(ruleset)}`, (route) =>
            route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
        );
    await page.goto("/1");
    const result = await workerCalculation(page, graph);
    expect(result.type).toBe("error");
    expect(result.error).toContain("size differs");
    expect(result.result).toBeUndefined();
});

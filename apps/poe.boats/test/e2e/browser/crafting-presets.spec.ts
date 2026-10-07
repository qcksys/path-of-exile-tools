import { expect, test } from "@playwright/test";
import { createCraftingItemQuery } from "../../../app/lib/crafting-item-query";
import { craftingPresets } from "../../../app/lib/crafting-presets";
import { craftingWorkspaceStorageKey } from "../../../app/lib/crafting-workspace-storage";
import { craftingGraphResultSchema } from "../../../app/schemas/crafting-graph-result";
import { craftingWorkspaceSchema } from "../../../app/schemas/crafting-workspace";
import { engine } from "../../crafting-fixtures";
import { select } from "./recombinator-helpers";

declare global {
    interface Window {
        presetGraphResults: unknown[];
    }
}

for (const preset of craftingPresets) {
    test(`${preset.name} preset creates, calculates and retains an editable project`, async ({
        page,
        request,
    }) => {
        await page.addInitScript(() => {
            window.presetGraphResults = [];
            const RealWorker = window.Worker;
            window.Worker = class extends RealWorker {
                constructor(url: string | URL, options?: WorkerOptions) {
                    super(url, options);
                    if (String(url).includes("/game-data/history/worker.mjs"))
                        this.addEventListener("message", ({ data }) => {
                            if (data.type === "done") window.presetGraphResults.push(data.result);
                        });
                }
            };
        });
        const stored = async () =>
            craftingWorkspaceSchema.parse(
                JSON.parse(
                    (await page.evaluate(
                        (key) => localStorage.getItem(key),
                        craftingWorkspaceStorageKey,
                    ))!,
                ),
            );
        await page.goto("/1/crafting/projects");
        await select(page, "Crafting preset", preset.name);
        await expect(page.getByText(preset.description, { exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Create from preset", exact: true }).click();
        await expect(page.getByRole("tab", { name: preset.name, exact: true })).toBeVisible();
        await page.getByRole("spinbutton", { name: "Sampled trials", exact: true }).fill("8");
        const graph = (await stored()).projects[0]!.graph;
        const created = await request.post("/api/v1/crafting/graph/from-preset", {
            data: { game: graph.game, ruleset: graph.ruleset, presetId: preset.id },
        });
        expect(created.ok(), await created.text()).toBe(true);
        expect((await created.json()).graph).toEqual({
            ...graph,
            id: expect.any(String),
            iterations: 100,
        });
        await page.getByRole("button", { name: "Calculate process", exact: true }).click();
        await expect.poll(() => page.evaluate(() => window.presetGraphResults.length)).toBe(1);
        const result = craftingGraphResultSchema.parse(
            (await page.evaluate(() => window.presetGraphResults))[0],
        );
        const calculated = await request.post("/api/v1/crafting/graph/calculate", {
            data: { graph, options: { estimateIterations: 8 } },
        });
        expect(calculated.ok(), await calculated.text()).toBe(true);
        expect((await calculated.json()).result).toEqual(result);
        expect(result.errors).toEqual({});
        expect(result.truncated).toBe(0);
        expect(result.trials).toBe(8);
        expect(result.probability).toBe(1);
        expect(result.meanCost).toBeNull();
        expect(result.missingPrices.length).toBeGreaterThan(0);
        const query = createCraftingItemQuery(engine);
        for (const sample of result.samples)
            expect(query.matches(sample.item!, graph.outcomes[0]!.query)).toBe("match");
        await expect(
            page.getByRole("region", { name: "Process estimate", exact: true }),
        ).toContainText("100.0%");
        await expect(page.getByText(/Missing prices:/)).toBeVisible();
        const name = page.getByRole("textbox", { name: "Project name", exact: true });
        await name.fill(`${preset.name} edited`);
        await name.press("Tab");
        const original = (await stored()).projects[0]!;
        await page.getByRole("button", { name: "Create from preset", exact: true }).click();
        await expect(page.getByRole("tab")).toHaveCount(2);
        expect((await stored()).projects[0]).toEqual(original);
        await page.reload();
        await expect(page.getByRole("tab")).toHaveCount(2);
        expect((await stored()).projects[0]).toEqual(original);
    });
}

test("PoE 1 presets are not offered for PoE 2 projects", async ({ page }) => {
    await page.goto("/2/crafting/projects");
    await expect(
        page.getByRole("heading", { name: "Crafting projects", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Crafting preset", exact: true })).toHaveCount(
        0,
    );
});

test("preset graph remains readable in both themes and on a narrow screen", async ({
    page,
}, testInfo) => {
    await page.goto("/1/crafting/projects");
    await select(page, "Crafting preset", "Physical bow");
    await page.getByRole("button", { name: "Create from preset", exact: true }).click();
    const graph = page.getByRole("region", { name: "Crafting project graph", exact: true });
    await expect(graph.getByRole("button", { name: "Edit Buy Merciless donor" })).toBeVisible();
    const legend = page.getByRole("group", { name: "Graph color legend" });
    for (const theme of ["light", "dark"]) {
        if (!(await page.locator("html").getAttribute("class"))?.split(" ").includes(theme))
            await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
        await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
        const colors = await legend
            .locator('[data-slot="badge"]')
            .evaluateAll((badges) => badges.map((badge) => getComputedStyle(badge).color));
        expect(new Set(colors).size).toBe(4);
        await graph.screenshot({ path: testInfo.outputPath(`graph-${theme}.png`) });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page
        .getByRole("heading", { name: "Crafting projects", exact: true })
        .scrollIntoViewIfNeeded();
    await expect(
        page.getByRole("button", { name: "Create from preset", exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
    );
    await page.screenshot({ path: testInfo.outputPath("presets-mobile.png"), fullPage: true });
});

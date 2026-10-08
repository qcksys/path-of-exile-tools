import { expect, type Page, test } from "@playwright/test";
import { cohortPriceCoverage } from "@poe-tools/market";
import { CraftingEngine } from "../../../app/lib/crafting-engine";
import { bindExchangePrice, liveExchangePrices } from "../../../app/lib/crafting-exchange";
import { projectFromItem } from "../../../app/lib/crafting-graph-authoring";
import { createCraftingItemQuery } from "../../../app/lib/crafting-item-query";
import { exportCraftingItemText } from "../../../app/lib/crafting-item-text";
import { bindCohortPurchasePrice, livePurchasePrices } from "../../../app/lib/crafting-market";
import { bindCraftingSourcePrice, liveSourcePrices } from "../../../app/lib/crafting-sources";
import { craftingWorkspaceStorageKey } from "../../../app/lib/crafting-workspace-storage";
import { craftingCatalogSchema, craftingProjectSchema } from "../../../app/schemas/crafting";
import { craftingGraphSchema } from "../../../app/schemas/crafting-graph";
import { craftingSourceQuoteSchema } from "../../../app/schemas/crafting-sources";
import { craftingWorkspaceSchema } from "../../../app/schemas/crafting-workspace";
import { conditionalTransmuteGraph } from "../../crafting-conditional-fixtures";
import {
    exchangeGraph,
    exchangeQuote,
    exchangeSnapshot,
    transmuteId,
} from "../../crafting-exchange-fixtures";
import { engine } from "../../crafting-fixtures";
import { graphFixture } from "../../crafting-graph-fixtures";
import {
    historyIndex,
    retainedRevision,
    retainedTransmuteGraph,
} from "../../crafting-history-fixtures";
import {
    adaptiveMarketCandidate,
    donorFamilyMarketFixture,
    marketCandidate,
    marketGraph,
} from "../../crafting-market-fixtures";
import { nnnGraph, rage } from "../../crafting-nnn-fixtures";
import { selectValue } from "./control-helpers";
import { choose } from "./recombinator-helpers";

async function stored(page: Page) {
    const raw = await page.evaluate(
        (key) => localStorage.getItem(key),
        craftingWorkspaceStorageKey,
    );
    return craftingWorkspaceSchema.parse(JSON.parse(raw!));
}

async function openGraphSettings(page: Page) {
    const toggle = page.getByRole("button", { name: "Prices & calculation", exact: true });
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}

async function importGraph(page: Page, graph = graphFixture()) {
    await page.goto(`/${graph.game === "poe2" ? "2" : "1"}/crafting/projects`);
    await page.getByLabel("Import crafting projects").setInputFiles({
        name: "donors.json",
        mimeType: "application/json",
        buffer: Buffer.from(
            JSON.stringify({
                format: 1,
                projects: [{ graph, revision: 1, updatedAt: "2026-10-07T00:00:00.000Z" }],
                builds: [],
            }),
        ),
    });
    await expect(page.getByRole("tab", { name: graph.name, exact: true })).toBeVisible();
    await page
        .getByRole("button", {
            name: `Edit ${graph.nodes.find((node) => node.id === graph.entry)!.name}`,
            exact: true,
        })
        .click();
}

for (const game of ["poe1", "poe2"] as const) {
    test(`${game} sampled items open new local projects with their original historical revision`, async ({
        page,
        request,
    }) => {
        const ruleset = historyIndex.revisions.find(
            (entry) => entry.game === game && entry.revision === "r4",
        )!;
        const catalog = craftingCatalogSchema.parse((await retainedRevision(ruleset)).catalog);
        const graph = retainedTransmuteGraph(ruleset, catalog);
        await importGraph(page, graph);
        const original = (await stored(page)).projects[0]!;
        const response = await request.post("/api/v1/crafting/graph/calculate", {
            data: { graph, options: { estimateIterations: Math.min(graph.iterations, 100) } },
        });
        expect(response.ok(), await response.text()).toBe(true);
        const result = (await response.json()).result;
        await page.getByRole("button", { name: "Calculate process", exact: true }).click();
        const samples = page.getByRole("region", { name: "Sampled output items", exact: true });
        await expect(samples).toBeVisible();
        await selectValue(
            samples.getByRole("combobox", { name: "Sampled trial", exact: true }),
            "1",
        );
        await expect(
            samples.getByRole("textbox", { name: "Sampled item text", exact: true }),
        ).toHaveValue(exportCraftingItemText(new CraftingEngine(catalog), result.samples[1].item));
        await expect(samples).toContainText("acquisition price is unknown");
        await samples.getByRole("button", { name: "Use item in new project", exact: true }).click();
        await expect(page.getByRole("tab")).toHaveCount(2);
        const state = await stored(page);
        expect(state.projects.find((entry) => entry.graph.id === original.graph.id)).toEqual(
            original,
        );
        const copy = state.projects.find((entry) => entry.graph.id !== original.graph.id)!;
        expect(copy.graph.ruleset).toEqual(graph.ruleset);
        expect(copy.graph.nodes).toHaveLength(1);
        expect(copy.graph.nodes[0]).toMatchObject({
            alternatives: [{ item: result.samples[1].item, price: null }],
        });
        await expect(
            page.getByRole("button", { name: "Correction available · adopt r6", exact: true }),
        ).toBeVisible();
        await page.reload();
        await expect(page.getByRole("tab")).toHaveCount(2);
        expect(
            (await stored(page)).projects.find((entry) => entry.graph.id === copy.graph.id),
        ).toEqual(copy);
        await page.getByRole("tab", { name: original.graph.name, exact: true }).click();
        await page.getByRole("button", { name: "Calculate process", exact: true }).click();
        await expect(samples).toBeVisible();
        const name = page.getByRole("textbox", { name: "Project name", exact: true });
        await name.fill("Changed process");
        await name.press("Tab");
        await expect(samples).toHaveCount(0);
    });
    test(`${game} edits full method options without changing reference items or graph routing`, async ({
        page,
    }) => {
        const graph = conditionalTransmuteGraph(game);
        await importGraph(page, graph);
        const original = (await stored(page)).projects[0]!.graph;
        const editor = page.getByRole("region", { name: "Selected step editor" });
        const open = editor.getByRole("button", { name: "Edit full method options", exact: true });
        const dialog = page.getByRole("region", { name: "Configure crafting method", exact: true });
        async function configure() {
            await open.click();
            await expect(
                dialog.getByRole("button", { name: "Apply method options", exact: true }),
            ).toBeDisabled();
            await selectValue(
                dialog.getByRole("combobox", {
                    name: "Reference item for method options",
                    exact: true,
                }),
                JSON.stringify(["buy", "base"]),
            );
            await choose(
                dialog,
                "Crafting method",
                game === "poe1" ? "Fossils" : "Generate rare",
                game === "poe1" ? "Fossils + resonator" : "Generate rare item",
            );
            if (game === "poe1")
                await selectValue(
                    dialog.getByRole("combobox", { name: "Fossil weight model", exact: true }),
                    "multiplicative",
                );
        }
        await configure();
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
        expect((await stored(page)).projects[0]!.graph).toEqual(original);
        await configure();
        await dialog.getByRole("button", { name: "Apply method options", exact: true }).click();
        await expect(dialog).toHaveCount(0);
        const saved = (await stored(page)).projects[0]!.graph;
        const node = saved.nodes.find((entry) => entry.kind === "craft")!;
        expect(node.method).toMatchObject(
            game === "poe1"
                ? { kind: "fossils", logic: "multiplicative" }
                : { kind: "generate", id: "rare" },
        );
        expect({
            ...node,
            method: original.nodes[1]!.kind === "craft" ? original.nodes[1]!.method : undefined,
        }).toEqual(original.nodes[1]);
        expect(saved.nodes[0]).toEqual(original.nodes[0]);
        expect(saved.prices).toEqual(original.prices);
        expect(saved.outcomes).toEqual(original.outcomes);
        await page.reload();
        expect((await stored(page)).projects[0]!.graph).toEqual(saved);
        await open.click();
        await expect(dialog).toContainText(game === "poe1" ? "Fossil" : "Generate rare");
    });
    test(`${game} conditional preparation skips a ready item and persists its query`, async ({
        page,
        request,
    }) => {
        const graph = conditionalTransmuteGraph(game);
        const craft = graph.nodes.find((node) => node.kind === "craft")!;
        delete craft.applyWhen;
        await importGraph(page, graph);
        const editor = page.getByRole("region", { name: "Selected step editor" });
        const toggle = editor.getByRole("checkbox", {
            name: "Only apply when the first input matches",
            exact: true,
        });
        await toggle.check();
        const query = editor.getByRole("group", { name: "Apply condition", exact: true });
        await query.getByRole("button", { name: "Add condition group", exact: true }).click();
        await selectValue(query.getByLabel("Condition type", { exact: true }), "rarity");
        await selectValue(query.getByLabel("Required rarity", { exact: true }), "Normal");
        await page.getByRole("button", { name: "Calculate process", exact: true }).click();
        await expect(page.getByRole("region", { name: "Process estimate" })).toContainText(
            "10.00 chaos",
        );
        await expect(editor).toContainText("Skipped 3 times in 3 trials.");
        const saved = (await stored(page)).projects[0]!.graph;
        expect(saved.nodes.find((node) => node.kind === "craft")!.applyWhen).toEqual(
            conditionalTransmuteGraph(game).nodes.find((node) => node.kind === "craft")!.applyWhen,
        );
        const response = await request.post("/api/v1/crafting/graph/calculate", {
            data: { graph: saved, options: { estimateIterations: 1, workLimit: 1000 } },
        });
        expect(response.ok(), await response.text()).toBe(true);
        expect((await response.json()).result).toMatchObject({
            complete: true,
            meanCost: 10,
            meanActions: 0,
            visits: { transmute: { skipped: 3 } },
        });
        await page.reload();
        await expect(toggle).toBeChecked();
        await expect(
            query.getByRole("combobox", { name: "Required rarity", exact: true }),
        ).toContainText("Normal");
        await toggle.uncheck();
        expect(
            (await stored(page)).projects[0]!.graph.nodes.find((node) => node.kind === "craft")!
                .applyWhen,
        ).toBeUndefined();
    });
    test(`${game} edits a purchased item in an isolated workbench and clears its old quote`, async ({
        page,
    }) => {
        const ruleset = historyIndex.revisions.find(
            (entry) => entry.game === game && entry.revision === "r4",
        )!;
        const data = craftingCatalogSchema.parse((await retainedRevision(ruleset)).catalog);
        const engine = new CraftingEngine(data);
        const baseId = Object.entries(data.bases).find(
            ([, base]) => base.item_class === "Body Armour" && base.drop_level === 1,
        )![0];
        const item = engine.createItem(baseId, 86);
        const graph = projectFromItem(ruleset, item, "Prepared purchase", {
            amount: 10,
            currency: "chaos",
            source: "manual",
            confidence: null,
        });
        const draft = JSON.stringify(
            craftingProjectSchema.parse({
                format: 1,
                game,
                patch: data.patch,
                item: engine.createItem(baseId, 23),
                method: {
                    kind: "currency",
                    id: data.crafting.currencies.find(
                        (entry) => entry.action === "transmute_to_rare",
                    )!.id,
                },
                target: { groups: [] },
                steps: [],
                prices: {},
                seed: 42,
                iterations: 10,
                maxActions: 100,
            }),
        );
        await importGraph(page, graph);
        const key = `poe-boats:crafting:${game}:${data.patch}:draft:v1`;
        await page.evaluate(({ key, draft }) => localStorage.setItem(key, draft), { key, draft });
        await page.getByRole("button", { name: "Edit prepared item", exact: true }).click();
        const dialog = page.getByRole("region", { name: "Prepare purchased item", exact: true });
        await expect(dialog.getByLabel("Item level", { exact: true })).toHaveValue("86");
        await dialog.getByLabel("Base quality (%)", { exact: true }).fill("20");
        await dialog.getByRole("button", { name: "Cancel item edits", exact: true }).click();
        await expect(dialog).not.toBeVisible();
        await expect(page.getByLabel("Purchase price (chaos)", { exact: false })).toHaveValue("10");
        await page.getByRole("button", { name: "Edit prepared item", exact: true }).click();
        await expect(dialog.getByLabel("Base quality (%)", { exact: true })).toHaveValue("0");
        await dialog.getByLabel("Base quality (%)", { exact: true }).fill("20");
        await dialog.getByRole("checkbox", { name: "Corrupted", exact: true }).check();
        const applied = page.waitForResponse("**/api/v1/crafting/graph/purchase-item");
        if (game === "poe1")
            await page.locator(".react-flow__pane").click({ position: { x: 10, y: 10 } });
        else
            await dialog
                .getByRole("button", { name: "Apply item to purchase", exact: true })
                .click();
        const response = await applied;
        expect(response.ok(), await response.text()).toBe(true);
        await expect(dialog).not.toBeVisible();
        if (game === "poe1") {
            await expect(page.getByRole("region", { name: "Selected step editor" })).toHaveCount(0);
            await page
                .getByRole("button", { name: `Edit ${graph.nodes[0]!.name}`, exact: true })
                .click();
        }
        await expect(page.getByLabel("Purchase price (chaos)", { exact: false })).toHaveValue("");
        const saved = (await stored(page)).projects[0]!.graph;
        expect(saved.nodes[0]).toMatchObject({
            alternatives: [{ price: null, item: { quality: 20, corrupted: true, level: 86 } }],
        });
        expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(draft);
        await page.reload();
        await page.getByRole("button", { name: "Edit prepared item", exact: true }).click();
        await expect(dialog.getByLabel("Base quality (%)", { exact: true })).toHaveValue("20");
        await expect(
            dialog.getByRole("checkbox", { name: "Corrupted", exact: true }),
        ).toBeChecked();
        await dialog.getByRole("button", { name: "Cancel item edits", exact: true }).click();
        expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(draft);
    });

    test(`${game} historical process costs run in workers and preserve the live draft`, async ({
        page,
    }, testInfo) => {
        const ruleset = historyIndex.revisions.find(
            (entry) => entry.game === game && entry.revision === "r3",
        )!;
        const retained = await retainedRevision(ruleset);
        const graph = bindExchangePrice(
            { ...retainedTransmuteGraph(ruleset, retained.catalog), league: "Standard" },
            transmuteId,
            {
                ...exchangeQuote,
                realm: game === "poe2" ? "poe2" : "pc",
                amount: 9,
            },
        );
        await page.route("**/api/v1/crafting/market/refresh", (route) =>
            route.fulfill({ json: { graph: route.request().postDataJSON().graph, issues: [] } }),
        );
        let missing = false;
        let requested: Promise<void> | undefined;
        await page.route("**/api/v1/crafting/market/snapshots", async (route) => {
            const { graph: input, hours } = route.request().postDataJSON();
            expect(hours).toEqual([1790899200, 1792713600]);
            if (requested) await requested;
            await route.fulfill({
                json: {
                    points: hours.map((at: number, index: number) => ({
                        at,
                        graph:
                            missing && index === 0
                                ? null
                                : bindExchangePrice(craftingGraphSchema.parse(input), transmuteId, {
                                      ...exchangeQuote,
                                      realm: game === "poe2" ? "poe2" : "pc",
                                      hour: at,
                                      amount: index === 0 ? 2 : 0.5,
                                  }),
                        issues:
                            missing && index === 0 ? ["No historical exchange observation."] : [],
                    })),
                },
            });
        });
        let workers = 0;
        page.on("worker", (worker) => {
            if (worker.url().includes("/history/worker.mjs")) workers++;
        });
        await importGraph(page, graph);
        const before = (await stored(page)).projects.find(
            (project) => project.graph.name === graph.name,
        )!.graph;
        await page.getByText("Process cost history", { exact: true }).click();
        await page.getByLabel("History start (UTC)").fill("2026-10-02");
        await page.getByLabel("History end (UTC)").fill("2026-10-23");
        await selectValue(page.getByLabel("History samples"), "2");
        const previousWorkers = workers;
        await page.getByRole("button", { name: "Calculate cost history", exact: true }).click();
        const history = page.getByRole("region", { name: "Historical process costs" });
        await expect(history.getByRole("cell", { name: "12.00", exact: true })).toBeVisible();
        await expect(history.getByRole("cell", { name: "10.50", exact: true })).toBeVisible();
        await expect(history.getByRole("cell", { name: "12.00–12.00", exact: true })).toBeVisible();
        await history.locator("..").screenshot({ path: testInfo.outputPath("cost-history.png") });
        expect(workers).toBeGreaterThanOrEqual(previousWorkers + 2);
        expect(
            (await stored(page)).projects.find((project) => project.graph.name === graph.name)!
                .graph,
        ).toEqual(before);
        missing = true;
        await page.getByRole("button", { name: "Calculate cost history", exact: true }).click();
        await expect(history.getByRole("cell", { name: "Unavailable", exact: true })).toHaveCount(
            2,
        );
        await expect(history).toContainText("No historical exchange observation.");
        await expect(history.getByRole("cell", { name: "10.50", exact: true })).toBeVisible();
        let release!: () => void;
        requested = new Promise<void>((resolve) => {
            release = resolve;
        });
        const request = page.waitForRequest("**/api/v1/crafting/market/snapshots");
        await page.getByRole("button", { name: "Calculate cost history", exact: true }).click();
        await request;
        await page.getByRole("button", { name: "Stop history calculation" }).click();
        release();
        await expect(history).not.toBeVisible();
        await page.getByLabel("Project name", { exact: true }).fill("Edited after history");
        await page.getByLabel("Project name", { exact: true }).blur();
        await expect(
            page.getByRole("tab", { name: "Edited after history", exact: true }),
        ).toBeVisible();
        await expect(history).not.toBeVisible();
    });

    test(`${game} exchange prices show history, refresh on reopening, and preserve manual overrides`, async ({
        page,
    }) => {
        const ruleset = historyIndex.revisions.find(
            (entry) => entry.game === game && entry.revision === "r3",
        )!;
        const retained = await retainedRevision(ruleset);
        const graph =
            game === "poe1"
                ? exchangeGraph()
                : {
                      ...retainedTransmuteGraph(ruleset, retained.catalog),
                      league: "Standard",
                      prices: {},
                  };
        const realm = game === "poe2" ? "poe2" : "pc";
        let amount = 2;
        const currentQuote = (adaptive = false) =>
            ({
                ...exchangeQuote,
                realm,
                amount,
                ...(adaptive
                    ? {
                          window: "adaptive-v1" as const,
                          estimator: "adaptive-volume-ratio-v1" as const,
                          windowStart: exchangeSnapshot.hour - 5 * 3600,
                          itemVolume: 120,
                          quoteVolume: 120 * amount,
                      }
                    : {}),
            }) as const;
        await page.route("**/api/v1/crafting/market/exchange", (route) => {
            expect(route.request().postDataJSON()).toMatchObject({
                game,
                realm,
                league: "Standard",
                currency: "chaos",
                itemIds: [transmuteId],
            });
            return route.fulfill({
                json: {
                    quotes: {
                        [transmuteId]: currentQuote(
                            route.request().postDataJSON().window === "adaptive-v1",
                        ),
                    },
                    missing: {},
                },
            });
        });
        await page.route("**/api/v1/crafting/market/exchange/history", (route) =>
            route.fulfill({
                json: {
                    history: [{ ...exchangeSnapshot, realm }],
                    nextBefore: null,
                },
            }),
        );
        await page.route("**/api/v1/crafting/market/refresh", (route) => {
            const current = craftingGraphSchema.parse(route.request().postDataJSON().graph);
            return route.fulfill({
                json: {
                    graph: bindExchangePrice(
                        current,
                        transmuteId,
                        currentQuote(
                            liveExchangePrices(current)[0]?.reference.window === "adaptive-v1",
                        ),
                    ),
                    issues: [],
                },
            });
        });
        await importGraph(page, graph);
        await openGraphSettings(page);
        const prices = page
            .locator("details")
            .filter({ has: page.locator("summary", { hasText: /^Prices & calculation$/ }) });
        await prices.getByText("Currency & essence exchange prices", { exact: true }).click();
        const price = prices.getByLabel(/^Orb of Transmutation \(chaos\)/);
        await expect(price).toHaveValue("");
        await prices.getByRole("button", { name: "Find exchange prices", exact: true }).click();
        const row = prices.getByRole("region", { name: "Exchange price for Orb of Transmutation" });
        await expect(row).toContainText("2 chaos per unit");
        await selectValue(
            prices.getByRole("combobox", { name: "Exchange estimate window", exact: true }),
            "adaptive-v1",
        );
        await expect(row).toHaveCount(0);
        await prices.getByRole("button", { name: "Find exchange prices", exact: true }).click();
        await expect(row).toContainText("Estimate window: 6 hours");
        await row.getByRole("button", { name: "View exchange history" }).click();
        await expect(prices.getByRole("region", { name: "Exchange price history" })).toContainText(
            "2.0000",
        );
        await price.fill("7");
        await expect(
            prices.getByRole("button", { name: "Use estimates for unpriced inputs" }),
        ).toBeDisabled();
        await expect(price).toHaveValue("7");
        await row.getByRole("button", { name: "Use exchange estimate" }).click();
        await expect(price).toHaveValue("2");
        expect(
            liveExchangePrices((await stored(page)).projects[0]!.graph)[0]?.reference.window,
        ).toBe("adaptive-v1");
        const status = page.getByRole("region", { name: "Live market prices" });
        await expect(status).toContainText("Market prices refreshed.");
        await page.getByLabel("Sampled trials", { exact: true }).fill("3");
        await page.getByRole("button", { name: "Calculate process", exact: true }).click();
        await expect(page.getByRole("region", { name: "Process estimate" })).toContainText(
            "12.00 chaos",
        );
        amount = 3;
        await page.reload();
        await openGraphSettings(page);
        await expect(price).toHaveValue("3");
        await expect(
            prices.getByText(
                "Adaptive exchange: 1-, 6- or 24-hour estimate. Time shown is the latest observation.",
                { exact: true },
            ),
        ).toBeVisible();
        expect(
            liveExchangePrices((await stored(page)).projects[0]!.graph)[0]?.reference.window,
        ).toBe("adaptive-v1");
        await expect(status).toContainText("Market prices refreshed.");
        await price.fill("7");
        await expect(status).toHaveCount(0);
        expect(liveExchangePrices((await stored(page)).projects[0]!.graph)).toEqual([]);
        await page.reload();
        await openGraphSettings(page);
        await expect(price).toHaveValue("7");
    });
}

test("beast prices refresh on reopening and preserve manual overrides", async ({
    page,
}, testInfo) => {
    const id = "EinharMasterCraftMorrigan7";
    const graph = exchangeGraph();
    const craft = graph.nodes[1]!;
    if (craft.kind !== "craft") throw new Error("Fixture");
    craft.method = { kind: "beast", id };
    let amount = 607;
    const currentQuote = () =>
        craftingSourceQuoteSchema.parse({
            source: "poe.ninja",
            game: "poe1",
            realm: "pc",
            league: graph.league,
            currency: "chaos",
            id,
            assumption: "rare-beast-mountain-lynx-v1",
            amount,
            fetchedAt: "2026-10-08T04:00:00.000Z",
            components: [
                { detailsId: "craicic-sand-spitter", quantity: 1, unitPrice: 1 },
                { detailsId: "black-morrigan", quantity: 1, unitPrice: amount - 7 },
                { detailsId: "mountain-lynx", quantity: 2, unitPrice: 3 },
            ].map((component) => ({
                ...component,
                name: component.detailsId,
                listingCount: 100,
                sourceUrl: "https://poe.ninja/poe1/api/economy/stash/current/item/overview",
            })),
        });
    await page.route("**/api/v1/crafting/market/sources", (route) => {
        expect(route.request().postDataJSON().assumption).toBe("rare-beast-mountain-lynx-v1");
        return route.fulfill({ json: { quotes: { [id]: currentQuote() }, missing: {} } });
    });
    await page.route("**/api/v1/crafting/market/refresh", (route) =>
        route.fulfill({
            json: {
                graph: bindCraftingSourcePrice(
                    craftingGraphSchema.parse(route.request().postDataJSON().graph),
                    engine,
                    id,
                    currentQuote(),
                ),
                issues: [],
            },
        }),
    );
    await importGraph(page, graph);
    await openGraphSettings(page);
    const prices = page
        .locator("details")
        .filter({ has: page.locator("summary", { hasText: /^Prices & calculation$/ }) });
    await prices.getByText("Beast & temple prices", { exact: true }).click();
    await prices.getByRole("checkbox", { name: /Mountain Lynx/ }).check();
    await prices.getByRole("button", { name: "Find beast & temple prices", exact: true }).click();
    await expect(prices).toContainText("2 × mountain-lynx");
    await prices.getByRole("button", { name: "Use source estimate", exact: true }).click();
    const price = prices.getByRole("spinbutton", { name: /^Beastcraft · Modify an Item/ });
    await expect(price).toHaveValue("607");
    const status = page.getByRole("region", { name: "Live market prices" });
    await expect(status).toContainText("Market prices refreshed.");
    expect(liveSourcePrices((await stored(page)).projects[0]!.graph)).toHaveLength(1);
    await page.screenshot({ path: testInfo.outputPath("beast-price-sources.png"), fullPage: true });
    amount = 617;
    await page.reload();
    await openGraphSettings(page);
    await expect(price).toHaveValue("617");
    await expect(status).toContainText("Market prices refreshed.");
    await price.fill("7");
    await expect(status).toHaveCount(0);
    expect(liveSourcePrices((await stored(page)).projects[0]!.graph)).toEqual([]);
    await page.reload();
    await openGraphSettings(page);
    await expect(price).toHaveValue("7");
});

test("full method editing refuses removal of a recovered input and keeps the draft", async ({
    page,
}) => {
    await importGraph(page);
    const original = (await stored(page)).projects[0]!.graph;
    await page.getByRole("button", { name: "Edit full method options", exact: true }).click();
    const dialog = page.getByRole("region", { name: "Configure crafting method", exact: true });
    await selectValue(
        dialog.getByRole("combobox", { name: "Reference item for method options", exact: true }),
        JSON.stringify(["a", "buy"]),
    );
    await expect(
        dialog.getByRole("combobox", { name: "Recombination donor", exact: true }),
    ).toHaveCount(0);
    await choose(dialog, "Crafting method", "Fossils", "Fossils + resonator");
    await dialog.getByRole("button", { name: "Apply method options", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Reconnect recovery routes");
    expect((await stored(page)).projects[0]!.graph).toEqual(original);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await choose(page, "Crafting method", "Orb of Scouring", "Orb of Scouring");
    await expect(page.getByRole("alert")).toContainText("Reconnect recovery routes");
    expect((await stored(page)).projects[0]!.graph).toEqual(original);
});

test("full method editing adds a separately consumed graph input without an inventory donor", async ({
    page,
}) => {
    await importGraph(page, conditionalTransmuteGraph("poe1"));
    await page.getByRole("button", { name: "Edit full method options", exact: true }).click();
    const dialog = page.getByRole("region", { name: "Configure crafting method", exact: true });
    await selectValue(
        dialog.getByRole("combobox", { name: "Reference item for method options", exact: true }),
        JSON.stringify(["buy", "base"]),
    );
    await choose(dialog, "Crafting method", "Recombine", "Recombine items");
    await expect(
        dialog.getByRole("combobox", { name: "Recombination donor", exact: true }),
    ).toHaveCount(0);
    await dialog.getByRole("button", { name: "Apply method options", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect((await stored(page)).projects[0]!.graph.nodes[1]).toMatchObject({
        method: { kind: "recombine", id: "recombine" },
        inputs: [
            { id: "base", source: "buy" },
            { id: "input-2", source: "buy" },
        ],
    });
    await expect(page.getByRole("combobox", { name: "Item source", exact: true })).toHaveCount(2);
});

test("clicking off a node commits method options and keeps invalid drafts open", async ({
    page,
}) => {
    await importGraph(page, conditionalTransmuteGraph("poe1"));
    await page.getByRole("button", { name: "Edit full method options", exact: true }).click();
    const method = page.getByRole("region", { name: "Configure crafting method", exact: true });
    await selectValue(
        method.getByRole("combobox", { name: "Reference item for method options", exact: true }),
        JSON.stringify(["buy", "base"]),
    );
    await choose(method, "Crafting method", "Recombine", "Recombine items");
    await page.locator(".react-flow__pane").click({ position: { x: 10, y: 10 } });
    await expect(method).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Selected step editor" })).toHaveCount(0);
    expect((await stored(page)).projects[0]!.graph.nodes[1]).toMatchObject({
        method: { kind: "recombine" },
    });

    await importGraph(page);
    await page.getByRole("button", { name: "Edit full method options", exact: true }).click();
    await selectValue(
        method.getByRole("combobox", { name: "Reference item for method options", exact: true }),
        JSON.stringify(["a", "buy"]),
    );
    await choose(method, "Crafting method", "Fossils", "Fossils + resonator");
    await page.locator(".react-flow__pane").click({ position: { x: 10, y: 10 } });
    await expect(method.getByRole("alert")).toContainText("Reconnect recovery routes");
    await expect(method).toBeVisible();
});

test("donor-family pricing requires a saved representative assumption", async ({ page }) => {
    const { graph, candidate } = donorFamilyMarketFixture();
    const node = graph.nodes[0]!;
    if (node.kind !== "acquire" || node.alternatives[0]?.kind !== "purchase")
        throw new Error("Fixture");
    const item = createCraftingItemQuery(engine).record(node.alternatives[0].item);
    await page.route("**/api/v1/crafting/market/cohorts", (route) => {
        const assumption = route.request().postDataJSON().assumption;
        return route.fulfill({
            json: {
                candidates: [
                    {
                        ...candidate,
                        assumption,
                        ...cohortPriceCoverage(candidate.definition, item, node.output, assumption),
                    },
                ],
                truncated: false,
                message: null,
            },
        });
    });
    await page.route("**/api/v1/crafting/market/refresh", (route) => {
        const graph = craftingGraphSchema.parse(route.request().postDataJSON().graph);
        const binding = livePurchasePrices(graph)[0]!;
        return route.fulfill({
            json: {
                graph: bindCohortPurchasePrice(
                    graph,
                    engine,
                    binding.node.id,
                    binding.alternative.id,
                    { ...candidate, assumption: binding.reference.assumption },
                ),
                issues: [],
            },
        });
    });
    await importGraph(page, graph);
    const editor = page.getByRole("region", { name: "Selected step editor" });
    await editor.getByText("Equipment market price", { exact: true }).click();
    const find = editor.getByRole("button", { name: "Find market prices", exact: true });
    const use = editor.getByRole("button", { name: "Use live median", exact: true });
    await find.click();
    await expect(use).toBeDisabled();
    await editor
        .getByRole("checkbox", {
            name: "Use donor-family prices with this item as the representative",
        })
        .check();
    await expect(use).toHaveCount(0);
    await find.click();
    await expect(use).toBeEnabled();
    await use.click();
    await expect(editor.getByText("Donor-family assumption:", { exact: false })).toBeVisible();
    expect(
        livePurchasePrices((await stored(page)).projects[0]!.graph)[0]?.reference.assumption,
    ).toBe("display-equivalent-v1");
    await page.reload();
    await expect(page.getByRole("region", { name: "Live market prices" })).toContainText(
        "Market prices refreshed.",
    );
    await expect(editor.getByText("Donor-family assumption:", { exact: false })).toBeVisible();
    await editor.getByLabel("Purchase price (chaos)", { exact: false }).fill("7");
    await expect(editor.getByText("Donor-family assumption:", { exact: false })).toHaveCount(0);
    expect(livePurchasePrices((await stored(page)).projects[0]!.graph)).toEqual([]);
});

test("equipment prices bind, refresh after reopening, and require an explicit override during an outage", async ({
    page,
}) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let median = 21;
    let unavailable = false;
    await page.route("**/api/v1/crafting/market/cohorts", (route) =>
        route.fulfill({
            json: {
                candidates: [
                    route.request().postDataJSON().window === "adaptive-v1"
                        ? adaptiveMarketCandidate()
                        : marketCandidate,
                ],
                truncated: false,
                message: null,
            },
        }),
    );
    await page.route("**/api/v1/crafting/market/history", (route) =>
        route.fulfill({ json: { history: [marketCandidate.latest], nextBefore: null } }),
    );
    await page.route("**/api/v1/crafting/market/refresh", (route) => {
        if (unavailable) return route.fulfill({ status: 503 });
        const graph = craftingGraphSchema.parse(route.request().postDataJSON().graph);
        const binding = livePurchasePrices(graph)[0]!;
        const candidate = binding.reference.window
            ? adaptiveMarketCandidate(median)
            : structuredClone(marketCandidate);
        if (!binding.reference.window) candidate.latest.prices.chaos!.median = median;
        if (median === 25) {
            candidate.definition.revision = "next-market";
            candidate.latest.revision = "next-market";
            candidate.latest.hour += 3600;
        }
        return route.fulfill({
            json: {
                graph: bindCohortPurchasePrice(
                    graph,
                    engine,
                    binding.node.id,
                    binding.alternative.id,
                    candidate,
                ),
                issues: [],
            },
        });
    });
    await importGraph(page, marketGraph());
    const editor = page.getByRole("region", { name: "Selected step editor" });
    const price = editor.getByLabel("Purchase price (chaos)", { exact: false });
    await editor.getByText("Equipment market price", { exact: true }).click();
    await editor.getByRole("button", { name: "Find market prices", exact: true }).click();
    await expect(editor.getByText("20 chaos median", { exact: false })).toBeVisible();
    await editor.getByRole("button", { name: "View price history", exact: true }).click();
    await expect(editor.getByRole("region", { name: "Equipment price history" })).toContainText(
        "20",
    );
    await selectValue(
        editor.getByRole("combobox", { name: "Equipment price window", exact: true }),
        "adaptive-v1",
    );
    await expect(editor.getByRole("button", { name: "Use live median", exact: true })).toHaveCount(
        0,
    );
    await editor.getByRole("button", { name: "Find market prices", exact: true }).click();
    await expect(editor.getByText("21 chaos median", { exact: false })).toBeVisible();
    await expect(editor.getByText("6-hour estimate", { exact: false })).toBeVisible();
    await editor.getByRole("button", { name: "Use live median", exact: true }).click();
    const status = page.getByRole("region", { name: "Live market prices" });
    await expect(status).toContainText("Market prices refreshed.");
    await expect(price).toHaveValue("21");
    expect(livePurchasePrices((await stored(page)).projects[0]!.graph)[0]?.reference).toMatchObject(
        { realm: "pc", league: "Standard", revision: "test-market", window: "adaptive-v1" },
    );
    await openGraphSettings(page);
    await page.getByLabel("Sampled trials", { exact: true }).fill("3");
    const calculate = page.getByRole("button", { name: "Calculate process", exact: true });
    await expect(calculate).toBeEnabled();
    await calculate.click();
    await expect(page.getByRole("region", { name: "Process estimate" })).toContainText(
        "21.00 chaos",
    );
    await page.screenshot({ path: "test-results/crafting-market-price.png", fullPage: true });
    median = 25;
    await page.reload();
    await expect(price).toHaveValue("25");
    await expect(editor.getByText("Adaptive equipment:", { exact: false })).toBeVisible();
    expect(livePurchasePrices((await stored(page)).projects[0]!.graph)[0]?.reference).toMatchObject(
        {
            window: "adaptive-v1",
            revision: "next-market",
        },
    );
    await expect(status).toContainText("Market prices refreshed.");
    unavailable = true;
    await status.getByRole("button", { name: "Refresh market prices" }).click();
    await expect(status).toContainText("could not be refreshed");
    await expect(calculate).toBeDisabled();
    await expect(price).toHaveValue("25");
    await price.fill("7");
    await expect(status).toHaveCount(0);
    await expect(calculate).toBeEnabled();
    await calculate.click();
    await expect(page.getByRole("region", { name: "Process estimate" })).toContainText(
        "7.00 chaos",
    );
    expect(livePurchasePrices((await stored(page)).projects[0]!.graph)).toEqual([]);
    expect(errors).toEqual([]);
});

test("equipment lookup cancels obsolete results and refuses incomplete price coverage", async ({
    page,
}) => {
    let release: (() => void) | undefined;
    let delayed = false;
    await page.route("**/api/v1/crafting/market/cohorts", async (route) => {
        if (delayed)
            await new Promise<void>((resolve) => {
                release = resolve;
            });
        await route.fulfill({
            json: {
                candidates: [
                    {
                        ...marketCandidate,
                        covered: false,
                        reasons: ["This cohort does not guarantee the required modifier."],
                    },
                ],
                truncated: false,
                message: null,
            },
        });
    });
    await importGraph(page, marketGraph());
    const editor = page.getByRole("region", { name: "Selected step editor" });
    await editor.getByText("Equipment market price", { exact: true }).click();
    const find = editor.getByRole("button", { name: "Find market prices", exact: true });
    await find.click();
    await expect(
        editor.getByRole("button", { name: "Use live median", exact: true }),
    ).toBeDisabled();
    await expect(
        editor.getByText("This cohort does not guarantee the required modifier."),
    ).toBeVisible();
    delayed = true;
    await find.click();
    await expect.poll(() => Boolean(release)).toBe(true);
    await editor.getByLabel("Purchased item level", { exact: false }).fill("85");
    release!();
    await expect(editor.getByRole("button", { name: "Use live median", exact: true })).toHaveCount(
        0,
    );
    await expect(find).toBeEnabled();
    expect(livePurchasePrices((await stored(page)).projects[0]!.graph)).toEqual([]);
});

for (const game of [1, 2]) {
    test(`PoE ${game} creates, prices, calculates and restores project tabs`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`/${game}/crafting/projects`);
        await page.getByRole("button", { name: "New project", exact: true }).click();
        await page.getByLabel("Project name", { exact: true }).fill(`Game ${game} ring`);
        const itemCatalog = craftingCatalogSchema.parse(
            await (await page.request.get(`/game-data/crafting-poe${game}.json`)).json(),
        );
        const base = Object.values(itemCatalog.bases).find(
            (base) => base.item_class === "Ring" && base.rarities.includes("normal"),
        )!;
        await choose(page, "Starting base", base.name, `${base.name} · Ring`);
        await page.getByRole("button", { name: "Create project", exact: true }).click();
        await expect(
            page.getByRole("tab", { name: `Game ${game} ring`, exact: true }),
        ).toHaveAttribute("aria-selected", "true");
        const editor = page.getByRole("region", { name: "Selected step editor" });
        await editor.getByLabel("Purchase price (chaos)", { exact: false }).fill("10");
        const tradeWorkers: string[] = [];
        page.on("worker", (worker) => tradeWorkers.push(worker.url()));
        await editor.getByText("Output requirements", { exact: true }).click();
        const requirements = editor.getByRole("group", { name: "Output item", exact: true });
        await requirements.getByText("Create requirements from item text", { exact: true }).click();
        const draft = (await stored(page)).projects[0]!.graph;
        const input = draft.nodes.find((node) => node.kind === "acquire")!;
        const purchase = input.alternatives.find((entry) => entry.kind === "purchase")!;
        const copy = exportCraftingItemText(new CraftingEngine(itemCatalog), purchase.item);
        await requirements.getByLabel("Copied item text", { exact: true }).fill(copy);
        await requirements.getByRole("checkbox", { name: "Rarity", exact: true }).uncheck();
        await requirements
            .getByRole("button", { name: "Preview item requirements", exact: true })
            .click();
        await expect(
            requirements.getByRole("region", { name: "Item requirements preview", exact: true }),
        ).toBeVisible();
        await requirements
            .getByRole("button", { name: "Replace requirements with selected item", exact: true })
            .click();
        const changed = (await stored(page)).projects[0]!.graph.nodes.find(
            (node) => node.id === input.id,
        )!;
        const conditions = changed.output.groups.flatMap((group) => group.filters);
        expect(conditions).toContainEqual({
            kind: "base",
            field: "baseId",
            values: [purchase.item.baseId],
        });
        expect(conditions.some((condition) => condition.kind === "rarity")).toBe(false);
        expect(tradeWorkers.some((url) => url.includes("crafting-item-query-text.worker"))).toBe(
            true,
        );
        await editor.getByLabel("Trade league", { exact: true }).pressSequentially("Standard Test");
        await editor.getByRole("button", { name: "Prepare trade search", exact: true }).click();
        const tradeLink = editor.getByRole("link", { name: "Open trade search", exact: true });
        await expect(tradeLink).toBeVisible();
        expect(await tradeLink.getAttribute("href")).toContain(
            game === 1 ? "/trade/search/Standard%20Test?" : "/trade2/search/poe2/Standard%20Test?",
        );
        expect(tradeWorkers.some((url) => url.includes("crafting-trade.worker"))).toBe(true);
        expect((await stored(page)).projects[0]!.graph.league).toBe("Standard Test");
        await editor.getByLabel("Trade league", { exact: true }).fill("Standard");
        await expect(tradeLink).toHaveCount(0);
        await page.getByRole("button", { name: "Add craft step", exact: true }).click();
        await openGraphSettings(page);
        await page.getByLabel("Sampled trials", { exact: true }).fill("3");
        await page.getByLabel("Orb of Transmutation (chaos)", { exact: false }).fill("1");
        await page.getByRole("button", { name: "Calculate process", exact: true }).click();
        await expect(page.getByText("Completed estimate", { exact: false })).toBeVisible({
            timeout: 60000,
        });
        await expect(page.getByRole("region", { name: "Process estimate" })).toContainText(
            "11.00 chaos",
        );
        await expect(page.getByRole("region", { name: "Process estimate" })).toContainText(
            "100.0%",
        );
        await page.getByRole("button", { name: "Duplicate project", exact: true }).click();
        await expect(page.getByRole("tab")).toHaveCount(2);
        await page.reload();
        await expect(page.getByRole("tab")).toHaveCount(2);
        await page
            .getByRole("tab", { name: `Game ${game} ring`, exact: true })
            .first()
            .click();
        await openGraphSettings(page);
        await expect(page.getByLabel("Sampled trials", { exact: true })).toHaveValue("3");
        await page
            .getByRole("button", { name: `Close Game ${game} ring`, exact: true })
            .first()
            .click();
        await expect(page.getByRole("tab")).toHaveCount(1);
        await page.screenshot({
            path: `test-results/crafting-project-poe${game}.png`,
            fullPage: true,
        });
        expect(errors).toEqual([]);
    });
}

test("ambiguous pasted requirements require an explicit interpretation and errors preserve the query", async ({
    page,
}) => {
    await importGraph(page);
    const editor = page.getByRole("region", { name: "Selected step editor" });
    await editor.getByText("Output requirements", { exact: true }).click();
    const requirements = editor.getByRole("group", { name: "Output item", exact: true });
    await requirements.getByText("Create requirements from item text", { exact: true }).click();
    const text =
        "Rarity: RARE\nTest\nPlate Vest\nItem Level: 86\nImplicits: 0\n+100 to Armour\n+35 to maximum Life";
    await requirements.getByLabel("Copied item text", { exact: true }).fill(text);
    await requirements
        .getByRole("button", { name: "Preview item requirements", exact: true })
        .click();
    const choice = requirements.getByRole("combobox", { name: /Item interpretation/ });
    await expect(choice).toBeVisible();
    const apply = requirements.getByRole("button", {
        name: "Replace requirements with selected item",
        exact: true,
    });
    await expect(apply).toHaveCount(0);
    await selectValue(choice, "0");
    await expect(apply).toBeVisible();
    await page.screenshot({ path: "test-results/pasted-item-requirements.png", fullPage: true });
    await apply.click();
    await expect(
        requirements.getByRole("combobox", { name: "Crafted modifier", exact: true }).first(),
    ).toContainText("Excluded");
    await selectValue(
        requirements.getByRole("combobox", { name: "Crafted modifier", exact: true }).first(),
        "any",
    );
    const applied = (await stored(page)).projects[0]!.graph.nodes.find(
        (node) => node.id === "combine",
    )!.output;
    expect(
        applied.groups
            .flatMap((group) => group.filters)
            .some((condition) => condition.kind === "mod"),
    ).toBe(true);
    const firstModifier = applied.groups
        .flatMap((group) => group.filters)
        .find((condition) => condition.kind === "mod")!;
    expect(firstModifier.crafted).toBeUndefined();
    await requirements.getByLabel("Copied item text", { exact: true }).fill("Not an item");
    await requirements
        .getByRole("button", { name: "Preview item requirements", exact: true })
        .click();
    await expect(requirements.getByRole("alert")).toBeVisible();
    expect(
        (await stored(page)).projects[0]!.graph.nodes.find((node) => node.id === "combine")!.output,
    ).toEqual(applied);
});

test("trade searches show modifier fidelity warnings and agree with the HTTP operation", async ({
    page,
    request,
}) => {
    await importGraph(page);
    const editor = page.getByRole("region", { name: "Selected step editor" });
    await editor.getByText("Output requirements", { exact: true }).click();
    await editor.getByLabel("Trade league", { exact: true }).fill("Standard");
    await editor.getByRole("button", { name: "Prepare trade search", exact: true }).click();
    await expect(
        editor.getByText("Approximate search — review the differences below.", { exact: true }),
    ).toBeVisible();
    const href = await editor
        .getByRole("link", { name: "Open trade search", exact: true })
        .getAttribute("href");
    const graph = (await stored(page)).projects[0]!.graph;
    const response = await request.post("/api/v1/crafting/items/trade", {
        data: {
            query: graph.nodes.find((node) => node.id === graph.entry)!.output,
            ruleset: graph.ruleset,
            league: "Standard",
        },
    });
    expect(response.ok()).toBe(true);
    expect((await response.json()).url).toBe(href);
    await page.screenshot({ path: "test-results/crafting-trade-search.png", fullPage: true });
});

test("workbench hands its item to a new saved project", async ({ page }) => {
    await page.goto("/1/crafting");
    await choose(page, "Item base", "Plate Vest", "Plate Vest · Body Armour");
    await page.getByRole("button", { name: "Use item in new project", exact: true }).click();
    await expect(page).toHaveURL(/\/1\/crafting\/projects$/);
    await expect(page.getByRole("tab")).toHaveCount(1);
    await expect(page.getByRole("region", { name: "Crafting project graph" })).toBeVisible();
    await expect(page.getByText("Saved locally in this browser", { exact: true })).toBeVisible();
});

test("prepared Temple gloves pass from the workbench into a saved current project", async ({
    page,
}) => {
    await page.goto("/1/crafting");
    await choose(page, "Item base", "Slink Gloves", "Slink Gloves · Gloves");
    await selectValue(
        page.getByRole("combobox", { name: "Modifier source", exact: true }),
        "incursion",
    );
    await page
        .locator('[data-modifier-id="ColdResistEnhancedModAilments__"]')
        .getByRole("button", { name: "Add to item", exact: true })
        .click();
    await page.getByRole("button", { name: "Use item in new project", exact: true }).click();
    await expect(page).toHaveURL(/\/1\/crafting\/projects$/);
    const project = (await stored(page)).projects[0]!;
    expect(project.graph.ruleset.revision).toBe("r6");
    const node = project.graph.nodes[0]!;
    expect(node.kind).toBe("acquire");
    if (node.kind === "acquire" && node.alternatives[0]?.kind === "purchase")
        expect(node.alternatives[0].item.mods.map((mod) => mod.id)).toEqual([
            "ColdResistEnhancedModAilments__",
        ]);
    await page.reload();
    expect((await stored(page)).projects[0]!.graph).toEqual(project.graph);
});

test("build references follow changes while value copies and exports stay independent", async ({
    page,
}) => {
    await importGraph(page);
    await page.getByText("Saved item plans & builds", { exact: true }).click();
    await page.getByLabel("Build name", { exact: true }).fill("Physical build");
    await page.getByRole("button", { name: "Create build", exact: true }).click();
    const plan = page.getByLabel("Item plan for Physical build", { exact: true });
    await selectValue(plan, { label: "Two donor recovery" });
    await page.getByRole("button", { name: "Add item to build", exact: true }).click();
    await selectValue(page.getByLabel("Save mode for Physical build", { exact: true }), "value");
    await page.getByRole("button", { name: "Add item to build", exact: true }).click();
    await page.getByLabel("Project name", { exact: true }).fill("Revised donor process");
    await page.getByLabel("Project name", { exact: true }).press("Tab");
    await expect(
        page.getByText("Revised donor process · Follows project edits", { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText("Two donor recovery · Independent copy", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Edit item", exact: true }).nth(1).click();
    await page.getByLabel("Project name", { exact: true }).fill("Independent donor process");
    await page.getByLabel("Project name", { exact: true }).press("Tab");
    await expect(
        page.getByRole("tab", { name: "Revised donor process", exact: true }),
    ).toBeVisible();
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export build", exact: true }).click();
    const file = await downloaded;
    const path = await file.path();
    await page.getByLabel("Import crafting projects").setInputFiles(path!);
    await expect(page.getByLabel("Saved build name", { exact: true })).toHaveCount(2);
    const saved = await stored(page);
    expect(saved.projects).toHaveLength(2);
    expect(new Set(saved.projects.map((entry) => entry.graph.id)).size).toBe(2);
    expect(saved.builds.map((entry) => entry.members.map((member) => member.kind))).toEqual([
        ["reference", "value"],
        ["reference", "value"],
    ]);
    const copy = saved.builds[1]!.members.find((member) => member.kind === "value")!;
    expect(copy.project.graph.name).toBe("Independent donor process");
});

test("recovery routes, input queries and manual ordering survive reload", async ({ page }) => {
    await importGraph(page);
    const editor = page.getByRole("region", { name: "Selected step editor" });
    await expect(editor.getByRole("combobox", { name: "Item source", exact: true })).toHaveCount(2);
    const requirements = editor.getByRole("group", {
        name: "First donor requirements",
        exact: true,
    });
    await requirements.getByRole("button", { name: "Add condition group", exact: true }).click();
    await selectValue(requirements.getByLabel("Condition type", { exact: true }), "range");
    await selectValue(requirements.getByLabel("Item property", { exact: true }), "openSuffixes");
    await requirements.getByLabel("openSuffixes min", { exact: true }).fill("3");
    await editor.getByText("1. Recover first", { exact: true }).click();
    await editor.getByRole("button", { name: "Move down", exact: true }).first().click();
    await expect(
        editor.getByRole("button", { name: "Restore automatic order", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(editor.getByText("1. Recover second", { exact: true })).toBeVisible();
    const graph = (await stored(page)).projects[0]!.graph;
    const craft = graph.nodes.find((node) => node.kind === "craft")!;
    expect(craft.ordering).toBe("manual");
    expect(craft.inputs[0]!.query!.groups[0]!.filters[0]).toEqual({
        kind: "range",
        field: "openSuffixes",
        value: { min: 3 },
    });
    expect(craft.branches[0]!.destination).toEqual({
        kind: "recover",
        nodeId: "combine",
        inputId: "right",
    });
    expect(craft.branches[1]!.destination).toEqual({
        kind: "recover",
        nodeId: "combine",
        inputId: "left",
    });
    await editor.getByRole("button", { name: "Restore automatic order", exact: true }).click();
    await expect(
        editor.getByRole("button", { name: "Automatic ordering", exact: true }),
    ).toBeVisible();
});

test("catalog parsing uses a worker and failed loading can be retried", async ({ page }) => {
    const workers: string[] = [];
    page.on("worker", (worker) => workers.push(worker.url()));
    await page.route("**/game-data/crafting-poe2.json", (route) =>
        route.fulfill({ status: 503, body: "Unavailable" }),
    );
    await page.goto("/2/crafting/projects");
    await expect(
        page.getByRole("heading", { name: "Crafting data unavailable", exact: true }),
    ).toBeVisible();
    await page.unroute("**/game-data/crafting-poe2.json");
    await page.getByRole("button", { name: "Retry catalog", exact: true }).click();
    await expect(page.getByRole("button", { name: "New project", exact: true })).toBeEnabled();
    expect(workers.filter((url) => url.includes("crafting-catalog.worker"))).toHaveLength(2);
});

test("historical projects retain their rules until a correction is explicitly adopted", async ({
    page,
}) => {
    await importGraph(page);
    await page.getByText("Crafting version", { exact: true }).click();
    await selectValue(
        page.getByRole("combobox", { name: "Retained era and revision", exact: true }),
        "3.29:r1",
    );
    await page.getByRole("button", { name: "Apply selected version", exact: true }).click();
    await expect(
        page.getByRole("button", { name: "Correction available · adopt r6", exact: true }),
    ).toBeVisible();
    expect((await stored(page)).projects[0]!.graph.ruleset).toMatchObject({
        era: "3.29",
        revision: "r1",
        engine: "crafting-graph-1",
    });
    await page.reload();
    await expect(
        page.getByRole("button", { name: "Correction available · adopt r6", exact: true }),
    ).toBeVisible();
    expect((await stored(page)).projects[0]!.graph.ruleset.revision).toBe("r1");
    await page
        .getByRole("button", { name: "Correction available · adopt r6", exact: true })
        .click();
    await expect(
        page.getByRole("button", { name: "Correction available · adopt r6", exact: true }),
    ).toHaveCount(0);
    expect((await stored(page)).projects[0]!.graph.ruleset).toMatchObject({
        era: "3.29",
        revision: "r6",
        engine: "crafting-graph-6",
    });
});

test("NNN recombination preserves suppression and offers eligible essence preparation", async ({
    page,
}) => {
    const graph = nnnGraph();
    graph.league = "Standard";
    const essenceQuote = { ...exchangeQuote, itemId: rage.id, amount: 0.25 };
    await page.route("**/api/v1/crafting/market/exchange", (route) =>
        route.fulfill({
            json: {
                quotes: { [rage.id]: essenceQuote },
                missing: {},
            },
        }),
    );
    await page.route("**/api/v1/crafting/market/refresh", (route) => {
        const current = craftingGraphSchema.parse(route.request().postDataJSON().graph);
        return route.fulfill({
            json: { graph: bindExchangePrice(current, rage.id, essenceQuote), issues: [] },
        });
    });
    await importGraph(page, graph);
    await page.getByRole("button", { name: "Calculate process", exact: true }).click();
    await expect(page.getByText("Completed estimate", { exact: false })).toBeVisible({
        timeout: 60000,
    });
    await expect(page.getByRole("region", { name: "Process estimate" })).toContainText(
        "31.00 chaos",
    );
    await expect(page.getByRole("region", { name: "Process estimate" })).toContainText("100.0%");
    await selectValue(page.getByRole("combobox", { name: "Focus graph step" }), {
        label: "NNN donor",
    });
    await page.getByRole("button", { name: "Edit NNN donor", exact: true }).click();
    await page.getByText(/^Non-native natural essences \(/).click();
    const editor = page.getByRole("region", { name: "Selected step editor" });
    await editor.getByText("Currency & essence exchange prices", { exact: true }).click();
    await editor.getByRole("button", { name: "Find exchange prices", exact: true }).click();
    await editor.getByRole("button", { name: "Use estimates for unpriced inputs" }).click();
    await expect(
        editor.getByRole("button", { name: /^Use .* Essence of/ }).first(),
    ).toHaveAccessibleName("Use Screaming Essence of Rage");
    expect((await stored(page)).projects[0]!.graph.prices[rage.id]?.amount).toBe(0.25);
    await expect(
        page.getByRole("button", { name: "Use Deafening Essence of Rage", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Use Screaming Essence of Rage", exact: true }).click();
    await expect(
        page.getByText("The project changed. Recalculate to update these estimates.", {
            exact: true,
        }),
    ).toBeVisible();
    const saved = (await stored(page)).projects[0]!.graph;
    expect(saved.nodes.find((node) => node.id === saved.entry)).toMatchObject({
        kind: "craft",
        method: { kind: "essence", id: rage.id },
        inputs: [{ source: "b" }],
    });
});

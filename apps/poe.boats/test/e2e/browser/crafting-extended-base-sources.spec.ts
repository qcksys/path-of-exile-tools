import { expect, type Page, test } from "@playwright/test";
import { CraftingEngine } from "../../../app/lib/crafting-engine";
import { projectFromPreset } from "../../../app/lib/crafting-presets";
import { estimateSourcePurchase } from "../../../app/lib/crafting-source-preparation";
import { craftingWorkspaceStorageKey } from "../../../app/lib/crafting-workspace-storage";
import { craftingCatalogSchema } from "../../../app/schemas/crafting";
import type { CraftingGraph } from "../../../app/schemas/crafting-graph";
import { craftingWorkspaceSchema } from "../../../app/schemas/crafting-workspace";
import { historyIndex, retainedRevision } from "../../crafting-history-fixtures";
import { selectValue } from "./control-helpers";

const scourId = "Metadata/Items/Currency/CurrencyConvertToNormal";

async function stored(page: Page) {
    const raw = await page.evaluate(
        (key) => localStorage.getItem(key),
        craftingWorkspaceStorageKey,
    );
    return craftingWorkspaceSchema.parse(JSON.parse(raw!)).projects[0]!.graph;
}

function sourcePurchase(graph: CraftingGraph, sourceId: string) {
    const source = graph.nodes.find((node) => node.id === sourceId);
    if (source?.kind !== "acquire") throw new Error("Missing extended source acquisition.");
    const purchase = source.alternatives.find(
        (entry) => entry.id === "buy-scour-crafted-enchanted",
    );
    if (purchase?.kind !== "purchase") throw new Error("Missing paid source purchase.");
    return { source, purchase };
}

for (const [presetId, sourceId] of [
    ["life-block-shield", "shield-make-heat-influence-base"],
    ["energy-shield-chest", "donor-0-make-base"],
] as const) {
    test(`r16 ${presetId}: extended source choice, ask and cleanup costs survive reload`, async ({
        page,
    }, testInfo) => {
        const ruleset = historyIndex.revisions.find(
            (entry) => entry.game === "poe1" && entry.revision === "r16",
        )!;
        const catalog = craftingCatalogSchema.parse((await retainedRevision(ruleset)).catalog);
        const engine = new CraftingEngine(catalog);
        const graph = projectFromPreset(engine, ruleset, presetId);
        const { source, purchase } = sourcePurchase(graph, sourceId);
        expect(source.choice).toEqual({ mode: "pinned", alternativeId: "buy" });
        expect(purchase.sourcePreparation).toEqual({
            kind: "scour-v1",
            crafted: true,
            enchanted: true,
        });
        expect(source.alternatives).toHaveLength(5);
        await page.goto("/1/crafting/projects");
        await page.getByLabel("Import crafting projects").setInputFiles({
            name: `r16-${presetId}.json`,
            mimeType: "application/json",
            buffer: Buffer.from(
                JSON.stringify({
                    format: 1,
                    projects: [{ graph, revision: 1, updatedAt: "2026-10-27T00:00:00.000Z" }],
                    builds: [],
                }),
            ),
        });
        await expect(page.getByRole("tab", { name: graph.name, exact: true })).toBeVisible();
        await expect.poll(() => stored(page)).toEqual({ ...graph, id: expect.any(String) });
        await selectValue(page.getByRole("combobox", { name: "Focus graph step" }), sourceId);
        const sourceNode = page.getByTestId(`rf__node-${sourceId}`);
        await sourceNode.getByRole("button", { name: `Edit ${source.name}`, exact: true }).click();
        const editor = page.getByRole("region", { name: "Selected step editor" });
        const choice = editor.getByRole("combobox", { name: "Acquisition choice", exact: true });
        await selectValue(choice, purchase.id);
        const card = editor
            .getByRole("heading", { name: purchase.name, exact: true })
            .locator("../..");
        await card.getByText("Equipment market price", { exact: true }).click();
        await expect(card).toContainText(
            "This price buys a Magic or Rare source requiring Scouring.",
        );
        await expect(card).toContainText(
            "Required craft and enchantment removal, followed by one Orb of Scouring",
        );
        await expect(card).toContainText("charged separately by the acquisition");
        await card.getByLabel(/^Purchase price \(chaos\)/).fill("123");
        await expect
            .poll(async () => sourcePurchase(await stored(page), sourceId))
            .toMatchObject({
                source: { choice: { mode: "pinned", alternativeId: purchase.id } },
                purchase: {
                    sourcePreparation: { kind: "scour-v1", crafted: true, enchanted: true },
                    price: { amount: 123, currency: "chaos", source: "manual", confidence: null },
                },
            });
        await page.getByRole("button", { name: "Prices & calculation", exact: true }).click();
        const prices = page.locator("details").filter({
            has: page.locator("summary", { hasText: /^Prices & calculation$/ }),
        });
        const scouring = prices.getByLabel(/^Orb of Scouring \(chaos\)/);
        await expect(scouring).toBeVisible();
        await scouring.fill("2");
        await expect
            .poll(async () => (await stored(page)).prices[scourId])
            .toMatchObject({
                amount: 2,
                currency: "chaos",
                source: "manual",
            });
        if (presetId === "life-block-shield") {
            for (const name of ["Orb of Transmutation", "Regal Orb", "Shaper's Exalted Orb"])
                await expect(prices.getByLabel(new RegExp(`^${name} \\(chaos\\)`))).toBeVisible();
        }
        const beforeReload = await stored(page);
        const before = sourcePurchase(beforeReload, sourceId);
        expect(
            estimateSourcePurchase(engine, beforeReload, before.source, before.purchase),
        ).toMatchObject({
            expectedCost: 133,
            expectedActions: 3,
            missingPrices: [],
        });
        await prices.screenshot({ path: testInfo.outputPath("r16-source-cleanup-cost.png") });
        await page.reload();
        await expect(page.getByRole("tab", { name: graph.name, exact: true })).toBeVisible();
        await expect.poll(() => stored(page)).toEqual(beforeReload);
        await selectValue(page.getByRole("combobox", { name: "Focus graph step" }), sourceId);
        await sourceNode.getByRole("button", { name: `Edit ${source.name}`, exact: true }).click();
        await expect(choice).toContainText(`Pin: ${purchase.name}`);
        await expect(card.getByLabel(/^Purchase price \(chaos\)/)).toHaveValue("123");
        await page.getByRole("button", { name: "Prices & calculation", exact: true }).click();
        await expect(scouring).toHaveValue("2");
        const afterReload = await stored(page);
        const after = sourcePurchase(afterReload, sourceId);
        expect(after.purchase.sourcePreparation).toEqual(purchase.sourcePreparation);
        expect(
            estimateSourcePurchase(engine, afterReload, after.source, after.purchase),
        ).toMatchObject({
            expectedCost: 133,
            expectedActions: 3,
            missingPrices: [],
        });
    });
}

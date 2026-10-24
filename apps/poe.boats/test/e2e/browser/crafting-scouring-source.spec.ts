import { expect, type Page, test } from "@playwright/test";
import { CraftingEngine } from "../../../app/lib/crafting-engine";
import { projectFromPreset } from "../../../app/lib/crafting-presets";
import { craftingWorkspaceStorageKey } from "../../../app/lib/crafting-workspace-storage";
import { craftingCatalogSchema } from "../../../app/schemas/crafting";
import { craftingWorkspaceSchema } from "../../../app/schemas/crafting-workspace";
import { historyIndex, retainedRevision } from "../../crafting-history-fixtures";
import { selectValue } from "./control-helpers";

async function stored(page: Page) {
    const raw = await page.evaluate(
        (key) => localStorage.getItem(key),
        craftingWorkspaceStorageKey,
    );
    return craftingWorkspaceSchema.parse(JSON.parse(raw!)).projects[0]!.graph;
}

test("paid Scouring source selection, cleanup policy and manual prices survive reload", async ({
    page,
}, testInfo) => {
    const ruleset = historyIndex.revisions.find(
        (entry) => entry.game === "poe1" && entry.revision === "r12",
    )!;
    const catalog = craftingCatalogSchema.parse((await retainedRevision(ruleset)).catalog);
    const graph = projectFromPreset(new CraftingEngine(catalog), ruleset, "life-block-shield");
    const source = graph.nodes.find((node) => node.id === "block-make-base")!;
    if (source.kind !== "acquire") throw new Error("Missing Normal shield acquisition.");
    const prepared = source.alternatives.find(
        (alternative) => alternative.id === "buy-scour-crafted-enchanted",
    )!;
    if (prepared.kind !== "purchase") throw new Error("Missing paid Scouring source.");
    expect(source.choice).toEqual({ mode: "pinned", alternativeId: "buy" });
    expect(prepared.sourcePreparation).toEqual({
        kind: "scour-v1",
        crafted: true,
        enchanted: true,
    });
    expect(prepared.price).toBeNull();
    await page.goto("/1/crafting/projects");
    await page.getByLabel("Import crafting projects").setInputFiles({
        name: "paid-scouring-source.json",
        mimeType: "application/json",
        buffer: Buffer.from(
            JSON.stringify({
                format: 1,
                projects: [{ graph, revision: 1, updatedAt: "2026-10-24T00:00:00.000Z" }],
                builds: [],
            }),
        ),
    });
    await expect(page.getByRole("tab", { name: graph.name, exact: true })).toBeVisible();
    await expect
        .poll(async () => (await stored(page)).nodes.find((node) => node.id === source.id))
        .toEqual(source);
    await selectValue(page.getByRole("combobox", { name: "Focus graph step" }), source.id);
    const sourceNode = page.getByTestId(`rf__node-${source.id}`);
    await sourceNode.getByRole("button", { name: `Edit ${source.name}`, exact: true }).click();
    const editor = page.getByRole("region", { name: "Selected step editor" });
    const choice = editor.getByRole("combobox", { name: "Acquisition choice", exact: true });
    await selectValue(choice, prepared.id);
    const card = editor.getByRole("heading", { name: prepared.name, exact: true }).locator("../..");
    await card.getByText("Equipment market price", { exact: true }).click();
    await expect(card).toContainText("This price buys a Magic or Rare source requiring Scouring.");
    await expect(card).toContainText(
        "Required craft and enchantment removal, followed by one Orb of Scouring",
    );
    await expect(card).not.toContainText(/fossil|Eldritch/i);
    await card.getByLabel(/^Purchase price \(chaos\)/).fill("123");
    await expect
        .poll(async () => (await stored(page)).nodes.find((node) => node.id === source.id))
        .toMatchObject({
            choice: { mode: "pinned", alternativeId: prepared.id },
            alternatives: source.alternatives.map((alternative) =>
                alternative.id === prepared.id
                    ? {
                          ...alternative,
                          price: {
                              amount: 123,
                              currency: "chaos",
                              source: "manual",
                              confidence: null,
                          },
                      }
                    : alternative,
            ),
        });
    await card.screenshot({ path: testInfo.outputPath("scouring-source-price.png") });
    await page.getByRole("button", { name: "Prices & calculation", exact: true }).click();
    const prices = page
        .locator("details")
        .filter({ has: page.locator("summary", { hasText: /^Prices & calculation$/ }) });
    const scouring = prices.getByLabel(/^Orb of Scouring \(chaos\)/);
    await expect(scouring).toBeVisible();
    await scouring.fill("2");
    await expect
        .poll(
            async () =>
                (await stored(page)).prices["Metadata/Items/Currency/CurrencyConvertToNormal"],
        )
        .toMatchObject({ amount: 2, source: "manual" });
    const beforeReload = await stored(page);
    await prices.screenshot({ path: testInfo.outputPath("scouring-source-global-cost.png") });
    await page.reload();
    await expect(page.getByRole("tab", { name: graph.name, exact: true })).toBeVisible();
    await expect.poll(() => stored(page)).toEqual(beforeReload);
    await selectValue(page.getByRole("combobox", { name: "Focus graph step" }), source.id);
    await sourceNode.getByRole("button", { name: `Edit ${source.name}`, exact: true }).click();
    await expect(choice).toContainText(`Pin: ${prepared.name}`);
    await expect(card.getByLabel(/^Purchase price \(chaos\)/)).toHaveValue("123");
});

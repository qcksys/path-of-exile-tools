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

test("mercenary source policies, separate preparation costs and manual price survive reload", async ({
    page,
}, testInfo) => {
    const ruleset = historyIndex.revisions.find(
        (entry) => entry.game === "poe1" && entry.revision === "r11",
    )!;
    const catalog = craftingCatalogSchema.parse((await retainedRevision(ruleset)).catalog);
    const graph = projectFromPreset(new CraftingEngine(catalog), ruleset, "sushi-mercenary-chest");
    const source = graph.nodes.find((node) => node.id === "fractured-base")!;
    if (source.kind !== "acquire") throw new Error("Missing mercenary source acquisition.");
    expect(source.alternatives).toHaveLength(4);
    const prepared = source.alternatives.find(
        (alternative) =>
            alternative.kind === "purchase" &&
            alternative.sourcePreparation?.kind === "fractured-fossil-v1" &&
            alternative.sourcePreparation.crafted &&
            alternative.sourcePreparation.enchanted,
    )!;
    await page.goto("/1/crafting/projects");
    await page.getByLabel("Import crafting projects").setInputFiles({
        name: "mercenary-source.json",
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
    await page.getByRole("button", { name: `Edit ${source.name}`, exact: true }).click();
    const editor = page.getByRole("region", { name: "Selected step editor" });
    const choice = editor.getByRole("combobox", { name: "Acquisition choice", exact: true });
    await selectValue(choice, prepared.id);
    const card = editor.getByRole("heading", { name: prepared.name, exact: true }).locator("../..");
    await card.getByText("Equipment market price", { exact: true }).click();
    await expect(card).toContainText("This price buys a fractured source requiring preparation.");
    await expect(card).toContainText("charged separately by the acquisition");
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
    await card.screenshot({ path: testInfo.outputPath("source-preparation-price.png") });
    const beforeReload = await stored(page);

    await page.getByRole("button", { name: "Prices & calculation", exact: true }).click();
    const prices = page.locator("details").filter({
        has: page.locator("summary", { hasText: /^Prices & calculation$/ }),
    });
    for (const name of ["Orb of Scouring", "Lesser Eldritch Ichor", "Greater Eldritch Ember"])
        await expect(prices.getByLabel(new RegExp(`^${name} \\(chaos\\)`))).toBeVisible();
    await prices.screenshot({ path: testInfo.outputPath("source-preparation-global-costs.png") });

    await page.reload();
    await expect(page.getByRole("tab", { name: graph.name, exact: true })).toBeVisible();
    await expect.poll(() => stored(page)).toEqual(beforeReload);
    await selectValue(page.getByRole("combobox", { name: "Focus graph step" }), source.id);
    await page.getByRole("button", { name: `Edit ${source.name}`, exact: true }).click();
    await expect(choice).toContainText(`Pin: ${prepared.name}`);
    await expect(card.getByLabel(/^Purchase price \(chaos\)/)).toHaveValue("123");
});

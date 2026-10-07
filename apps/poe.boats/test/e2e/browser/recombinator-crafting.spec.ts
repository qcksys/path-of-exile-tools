import { expect, test } from "@playwright/test";
import { craftingWorkspaceStorageKey } from "../../../app/lib/crafting-workspace-storage";
import { craftingWorkspaceSchema } from "../../../app/schemas/crafting-workspace";
import { engine } from "../../crafting-fixtures";
import { workbenchProject } from "../../crafting-workbench-fixtures";
import { choose } from "./recombinator-helpers";

test("a connected recombination plan previews concrete donors and restores all steps in a new tab", async ({
    page,
}) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/1/recombinator");
    await page.getByRole("button", { name: "Load example", exact: true }).click();
    await page.getByRole("button", { name: "Use plan in crafting project", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Prepare recombination plan", exact: true });
    const preview = dialog.getByRole("button", { name: "Preview crafting plan", exact: true });
    await expect(preview).toBeDisabled();
    for (const field of await dialog
        .getByRole("combobox", { name: "Concrete base", exact: true })
        .all())
        await field.selectOption({ index: 1 });
    await preview.click();
    await expect(dialog.getByRole("region", { name: "Crafting plan preview" })).toContainText(
        "4 purchased inputs · 3 craft steps",
    );
    await dialog
        .getByRole("combobox", { name: "Assumed rolls", exact: true })
        .first()
        .selectOption("maximum");
    await expect(
        dialog.getByRole("button", { name: "Create project from plan", exact: true }),
    ).toHaveCount(0);
    await preview.click();
    await dialog.getByRole("button", { name: "Create project from plan", exact: true }).click();
    await expect(page).toHaveURL(/\/1\/crafting\/projects$/);
    await expect(page.getByRole("tab", { name: "Recombination plan", exact: true })).toBeVisible();
    const workspace = craftingWorkspaceSchema.parse(
        JSON.parse(
            await page.evaluate((key) => localStorage.getItem(key)!, craftingWorkspaceStorageKey),
        ),
    );
    const graph = workspace.projects[0]!.graph;
    expect(graph.nodes).toHaveLength(7);
    expect(graph.entry).toBe("step-2");
    const final = graph.nodes.find((node) => node.id === graph.entry)!;
    expect(final).toMatchObject({ inputs: [{ source: "step-0" }, { source: "step-1" }] });
    expect(graph.outcomes[0]!.query.groups[0]!.filters.length).toBeGreaterThan(0);
    for (const node of graph.nodes)
        if (node.kind === "acquire") expect(node.alternatives[0]).toMatchObject({ price: null });
    await page.reload();
    await expect(page.getByRole("tab", { name: "Recombination plan", exact: true })).toBeVisible();
    await page.screenshot({ path: "test-results/recombinator-plan-handoff.png", fullPage: true });
    expect(errors).toEqual([]);
});

test("a recombinator input previews explicit rolls and becomes a saved crafting project", async ({
    page,
}) => {
    await page.goto("/1/recombinator");
    const existing = workbenchProject("poe1");
    const key = `poe-boats:crafting:poe1:${existing.patch}:draft:v1`;
    await page.evaluate(
        ({ key, existing }) => localStorage.setItem(key, JSON.stringify(existing)),
        { key, existing },
    );
    await choose(page, "Item 1 base", "Despot Axe", "Despot Axe · Two Hand Axe");
    await choose(page, "Item 1 add prefix (0/3)", "Merciless", /\(Merciless, ilvl 83\)$/);
    await page
        .getByRole("button", { name: "Use input in crafting project", exact: true })
        .first()
        .click();
    const dialog = page.getByRole("dialog", { name: "Prepare Item 1 for crafting", exact: true });
    await expect(dialog.getByLabel("Concrete item base")).not.toHaveValue("");
    await dialog.getByRole("button", { name: "Preview prepared input", exact: true }).click();
    await expect(dialog.getByRole("region", { name: "Prepared input preview" })).toContainText(
        "Despot Axe",
    );
    await dialog.getByLabel("Assumed modifier rolls").selectOption("maximum");
    await expect(
        dialog.getByRole("button", { name: "Create project from prepared input" }),
    ).toHaveCount(0);
    await dialog.getByRole("button", { name: "Preview prepared input", exact: true }).click();
    await dialog
        .getByRole("button", { name: "Create project from prepared input", exact: true })
        .click();
    await expect(page).toHaveURL(/\/1\/crafting\/projects$/);
    const saved = craftingWorkspaceSchema.parse(
        await page.evaluate(
            (key) => JSON.parse(localStorage.getItem(key)!),
            craftingWorkspaceStorageKey,
        ),
    );
    const graph = saved.projects[0]!.graph;
    expect(graph.nodes).toHaveLength(1);
    const node = graph.nodes[0]!;
    if (node.kind !== "acquire" || node.alternatives[0]!.kind !== "purchase")
        throw new Error("Fixture");
    expect(node.name).toContain("maximum rolls");
    expect(node.alternatives[0]!.price).toBeNull();
    const item = node.alternatives[0]!.item;
    expect(item.rarity).toBe("magic");
    expect(item.mods).toHaveLength(1);
    expect(item.mods[0]!.values).toEqual(
        engine.mod(item.mods[0]!.id).stats.map((stat) => stat.max),
    );
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key)).toEqual(
        existing,
    );
    await page.reload();
    await expect(page.getByRole("tab", { name: "Item 1 preparation", exact: true })).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Edit prepared item", exact: true }),
    ).toBeVisible();
});

test("generic inputs require a concrete base and custom text is refused without saving", async ({
    page,
}) => {
    await page.goto("/1/recombinator");
    await choose(page, "Item 1 base", "Any INT Body Armour", "Any INT Body Armour · generic");
    await page
        .getByRole("button", { name: "Use input in crafting project", exact: true })
        .first()
        .click();
    let dialog = page.getByRole("dialog", { name: "Prepare Item 1 for crafting", exact: true });
    await expect(
        dialog.getByRole("button", { name: "Preview prepared input", exact: true }),
    ).toBeDisabled();
    await dialog.getByLabel("Concrete item base").selectOption({ label: "Vaal Regalia" });
    await expect(
        dialog.getByRole("button", { name: "Preview prepared input", exact: true }),
    ).toBeEnabled();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Custom modifiers (0)", exact: true }).first().click();
    await page.getByLabel("Item 1 prefixes", { exact: true }).fill("Custom life");
    await page
        .getByRole("button", { name: "Use input in crafting project", exact: true })
        .first()
        .click();
    dialog = page.getByRole("dialog", { name: "Prepare Item 1 for crafting", exact: true });
    await dialog.getByLabel("Concrete item base").selectOption({ label: "Vaal Regalia" });
    await dialog.getByRole("button", { name: "Preview prepared input", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("custom modifier text");
    await expect(
        dialog.getByRole("button", { name: "Create project from prepared input" }),
    ).toHaveCount(0);
    const raw = await page.evaluate(
        (key) => localStorage.getItem(key),
        craftingWorkspaceStorageKey,
    );
    if (raw) expect(craftingWorkspaceSchema.parse(JSON.parse(raw)).projects).toHaveLength(0);
});

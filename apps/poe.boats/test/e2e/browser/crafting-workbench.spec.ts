import { expect, type Page, test } from "@playwright/test";
import {
    fossilOptimizationSchema,
    mergeFossilOptimizations,
} from "../../../app/lib/crafting-optimizer";
import { craftingWorkspaceStorageKey } from "../../../app/lib/crafting-workspace-storage";
import type { CraftingProject } from "../../../app/schemas/crafting";
import { craftingWorkspaceSchema } from "../../../app/schemas/crafting-workspace";
import { engine } from "../../crafting-fixtures";
import { firstItem, secondItem } from "../../crafting-graph-fixtures";
import { fossilOptimizationFixture, workbenchProject } from "../../crafting-workbench-fixtures";

declare global {
    interface Window {
        craftingResults: unknown[];
    }
}
const key = (project: CraftingProject) =>
    `poe-boats:crafting:${project.game}:${project.patch}:draft:v1`;

async function openWorkbench(page: Page, project: CraftingProject, mode: string) {
    await page.addInitScript(
        ({ project, key }) => {
            localStorage.setItem(key, JSON.stringify(project));
            const observed = window;
            observed.craftingResults = [];
            const RealWorker = window.Worker;
            window.Worker = class extends RealWorker {
                constructor(url: string | URL, options?: WorkerOptions) {
                    super(url, options);
                    if (String(url).includes("crafting.worker"))
                        this.addEventListener("message", ({ data }) => {
                            if (data.type === "done" || data.type === "emulated")
                                observed.craftingResults.push(data.result);
                        });
                }
            };
        },
        { project, key: key(project) },
    );
    await page.goto(`/${project.game === "poe1" ? 1 : 2}/crafting/${mode}`);
    await expect(
        page
            .getByRole("button", { name: "Apply craft", exact: true })
            .or(page.getByRole("button", { name: "Apply process", exact: true })),
    ).toBeVisible();
}

test("partitioned fossil workers agree with HTTP and hand the chosen recipe to a graph", async ({
    page,
    request,
}) => {
    const { project, options } = fossilOptimizationFixture();
    await openWorkbench(page, project, "calculate");
    await page.getByText("Fossil optimizer", { exact: true }).click();
    for (const fossil of engine.availableFossils(project.item)) {
        if (!options.fossils.includes(fossil.id))
            await page
                .getByRole("group", { name: "Included fossils", exact: true })
                .getByRole("checkbox", { name: fossil.name, exact: true })
                .uncheck();
    }
    await page
        .getByRole("combobox", { name: "Maximum resonator sockets", exact: true })
        .selectOption("2");
    await page.getByRole("spinbutton", { name: "Trials per combination", exact: true }).fill("100");
    await page.getByRole("combobox", { name: "Optimizer workers", exact: true }).selectOption("2");
    await page.getByRole("button", { name: "Compare fossils", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.craftingResults.length)).toBe(2);
    const partitions = (await page.evaluate(() => window.craftingResults)).map((result) =>
        fossilOptimizationSchema.parse(result),
    );
    const merged = mergeFossilOptimizations(partitions);
    const response = await request.post("/api/v1/crafting/workbench/optimize-fossils", {
        data: { project, options },
    });
    expect(response.ok(), await response.text()).toBe(true);
    expect((await response.json()).result).toEqual(JSON.parse(JSON.stringify(merged)));
    await expect(
        page.getByRole("status").filter({ hasText: "3 / 3 combinations completed" }),
    ).toBeVisible();
    expect(merged.byAttempts).toHaveLength(3);
    await page.getByRole("button", { name: "Use combination", exact: true }).first().click();
    const selected = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!),
        key(project),
    );
    expect(selected.item).toEqual(project.item);
    expect(selected.method).toEqual(JSON.parse(JSON.stringify(merged.byAttempts[0]!.method)));
    await page
        .getByRole("button", { name: "Use selected craft in new project", exact: true })
        .click();
    await expect(page).toHaveURL(/\/1\/crafting\/projects$/);
    const state = craftingWorkspaceSchema.parse(
        await page.evaluate(
            (key) => JSON.parse(localStorage.getItem(key)!),
            craftingWorkspaceStorageKey,
        ),
    );
    expect(state.projects[0]!.graph.nodes.find((node) => node.kind === "craft")?.method).toEqual(
        selected.method,
    );
});

for (const game of ["poe1", "poe2"] as const) {
    test(`${game} manual starting-item edits and text export agree with HTTP`, async ({
        page,
        request,
    }) => {
        const project = workbenchProject(game);
        await openWorkbench(page, project, "calculate");
        const settings = page.getByRole("region", { name: "Item settings", exact: true });
        let item = project.item;
        for (const flag of ["corrupted", "mirrored"] as const) {
            const response = await request.post("/api/v1/crafting/workbench/item", {
                data: {
                    game,
                    patch: project.patch,
                    command: { kind: "flag", item, flag, enabled: true },
                },
            });
            expect(response.ok(), await response.text()).toBe(true);
            item = (await response.json()).item;
            await settings
                .getByRole("checkbox", {
                    name: flag === "corrupted" ? "Corrupted" : "Mirrored",
                    exact: true,
                })
                .check();
            await expect
                .poll(() =>
                    page.evaluate(
                        (key) => JSON.parse(localStorage.getItem(key)!).item,
                        key(project),
                    ),
                )
                .toEqual(item);
        }
        await expect(
            settings.getByRole("checkbox", { name: "Corrupted", exact: true }),
        ).not.toBeChecked();
        await settings.getByRole("spinbutton", { name: "Item level", exact: true }).fill("100");
        const validation = await request.post("/api/v1/crafting/workbench/item", {
            data: {
                game,
                patch: project.patch,
                command: { kind: "validate", item: { ...item, level: 100 } },
            },
        });
        expect(validation.ok(), await validation.text()).toBe(true);
        item = (await validation.json()).item;
        await expect
            .poll(() =>
                page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).item, key(project)),
            )
            .toEqual(item);
        const exported = await request.post("/api/v1/crafting/workbench/item-text", {
            data: { game, patch: project.patch, item },
        });
        expect(exported.ok(), await exported.text()).toBe(true);
        await page.getByText("Import or export item text", { exact: true }).click();
        await page.getByRole("button", { name: "Export current item text", exact: true }).click();
        await expect(page.getByRole("textbox", { name: "Item text", exact: true })).toHaveValue(
            (await exported.json()).text,
        );
        expect(
            await page.evaluate(
                (key) => JSON.parse(localStorage.getItem(key)!).prices,
                key(project),
            ),
        ).toEqual(project.prices);
    });

    test(`${game} sends the selected craft and prices into a new persistent graph tab`, async ({
        page,
    }) => {
        const project = workbenchProject(game);
        await openWorkbench(page, project, "calculate");
        await page
            .getByRole("button", { name: "Use selected craft in new project", exact: true })
            .click();
        await expect(page).toHaveURL(new RegExp(`/${game === "poe1" ? 1 : 2}/crafting/projects$`));
        const state = craftingWorkspaceSchema.parse(
            await page.evaluate(
                (key) => JSON.parse(localStorage.getItem(key)!),
                craftingWorkspaceStorageKey,
            ),
        );
        expect(state.tabs).toHaveLength(1);
        const graph = state.projects[0]!.graph;
        expect(graph.nodes).toHaveLength(2);
        expect(graph.nodes[0]).toMatchObject({
            alternatives: [{ item: project.item, price: { amount: 10 } }],
        });
        expect(graph.nodes[1]).toMatchObject({
            method: project.method,
            inputs: [{ source: "base" }],
        });
        await page.getByRole("button", { name: "Calculate process", exact: true }).click();
        await expect(page.getByRole("region", { name: "Process estimate" })).toContainText(
            "12.00 chaos",
        );
        await page.reload();
        await expect(page.getByRole("tab")).toHaveCount(1);
        const saved = craftingWorkspaceSchema.parse(
            await page.evaluate(
                (key) => JSON.parse(localStorage.getItem(key)!),
                craftingWorkspaceStorageKey,
            ),
        );
        expect(saved.projects[0]!.graph).toEqual(graph);
    });
    test(`${game} real workbench worker calculations agree with HTTP and keep the draft`, async ({
        page,
        request,
    }) => {
        const project = workbenchProject(game);
        await openWorkbench(page, project, "calculate");
        for (const [mode, label] of [
            ["calculate", "Calculate odds"],
            ["sample", "Mass simulate"],
        ] as const) {
            await page.evaluate(() => {
                window.craftingResults = [];
            });
            await page.getByRole("button", { name: label, exact: true }).click();
            await expect.poll(() => page.evaluate(() => window.craftingResults.length)).toBe(1);
            const [result] = await page.evaluate(() => window.craftingResults);
            const response = await request.post("/api/v1/crafting/workbench/calculate", {
                data: { project, mode },
            });
            expect(response.ok(), await response.text()).toBe(true);
            expect((await response.json()).result).toEqual(result);
        }
        await expect(page.getByRole("region", { name: "Crafting results" })).toBeVisible();
        const draft = await page.evaluate(
            (key) => JSON.parse(localStorage.getItem(key)!),
            key(project),
        );
        expect(draft.item).toEqual(project.item);
    });

    test(`${game} workbench item emulation agrees with HTTP including consumed costs`, async ({
        page,
        request,
    }) => {
        const project = workbenchProject(game);
        await openWorkbench(page, project, "emulate");
        const response = await request.post("/api/v1/crafting/workbench/emulate", {
            data: {
                game,
                patch: project.patch,
                item: project.item,
                seed: project.seed,
                command: { kind: "apply", method: project.method },
            },
        });
        expect(response.ok(), await response.text()).toBe(true);
        const { result } = await response.json();
        await page.getByRole("button", { name: "Apply craft", exact: true }).click();
        await expect
            .poll(() =>
                page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).item, key(project)),
            )
            .toEqual(result.item);
        expect(result).toMatchObject({
            actions: 1,
            cost: [{ amount: 1, name: "Orb of Transmutation" }],
        });
        await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
        await page.getByRole("button", { name: "Undo", exact: true }).click();
        await expect
            .poll(() =>
                page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).item, key(project)),
            )
            .toEqual(project.item);
    });

    test(`${game} workbench process emulation agrees with HTTP and returns its item`, async ({
        page,
        request,
    }) => {
        const project = { ...workbenchProject(game), useProcess: true };
        await openWorkbench(page, project, "emulate");
        const response = await request.post("/api/v1/crafting/workbench/process", {
            data: { project },
        });
        expect(response.ok(), await response.text()).toBe(true);
        const { result } = await response.json();
        await page.getByRole("button", { name: "Apply process", exact: true }).click();
        await expect.poll(() => page.evaluate(() => window.craftingResults.length)).toBe(1);
        expect((await page.evaluate(() => window.craftingResults))[0]).toEqual(result);
        await expect
            .poll(() =>
                page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).item, key(project)),
            )
            .toEqual(result.item);
        await expect(
            page.getByText("Process finished successfully.", { exact: true }),
        ).toBeVisible();
    });
}

test("recombination handoff keeps both full donors and charges them once", async ({ page }) => {
    const project: CraftingProject = {
        ...workbenchProject("poe1"),
        item: firstItem,
        baseCost: 10,
        method: {
            kind: "recombine",
            id: "recombine",
            donor: { id: "hybrid", name: "Hybrid donor", item: secondItem },
        },
        prices: { "donor:hybrid": 15, "service:recombine": 2 },
    };
    await openWorkbench(page, project, "emulate");
    await page
        .getByRole("button", { name: "Use selected craft in new project", exact: true })
        .click();
    await expect(page).toHaveURL(/\/1\/crafting\/projects$/);
    const state = craftingWorkspaceSchema.parse(
        await page.evaluate(
            (key) => JSON.parse(localStorage.getItem(key)!),
            craftingWorkspaceStorageKey,
        ),
    );
    const graph = state.projects[0]!.graph;
    expect(graph.nodes[0]).toMatchObject({
        alternatives: [{ item: firstItem, price: { amount: 10 } }],
    });
    expect(graph.nodes[1]).toMatchObject({
        alternatives: [{ item: secondItem, price: { amount: 15 } }],
    });
    expect(graph.nodes[2]).toMatchObject({
        method: { kind: "recombine" },
        inputs: [{ source: "base" }, { source: "donor" }],
    });
    expect(graph.prices["donor:hybrid"]).toBeUndefined();
    await page.getByRole("button", { name: "Calculate process", exact: true }).click();
    await expect(page.getByRole("region", { name: "Process estimate" })).toContainText(
        "27.00 chaos",
    );
});

test("an incomplete two-item craft stays in the workbench without creating a project", async ({
    page,
}) => {
    const project: CraftingProject = {
        ...workbenchProject("poe1"),
        method: { kind: "recombine", id: "recombine" },
    };
    await openWorkbench(page, project, "emulate");
    await page
        .getByRole("button", { name: "Use selected craft in new project", exact: true })
        .click();
    await expect(page.getByRole("alert")).toContainText("Choose the second item");
    await expect(page).toHaveURL(/\/1\/crafting\/emulate$/);
    const raw = await page.evaluate(
        (key) => localStorage.getItem(key),
        craftingWorkspaceStorageKey,
    );
    if (raw) expect(craftingWorkspaceSchema.parse(JSON.parse(raw)).projects).toHaveLength(0);
});

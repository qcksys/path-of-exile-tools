import { expect, test } from "@playwright/test";
import { craftingWorkspaceStorageKey } from "../../../app/lib/crafting-workspace-storage";
import { selectValue } from "./control-helpers";
import { choose, select } from "./recombinator-helpers";

test("graph shows outcome detail, retry paths, pinnable items and measured layouts", async ({
    page,
}, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/1/crafting/projects");
    await select(page, "Crafting preset", "Physical bow");
    await page.getByRole("button", { name: "Create from preset", exact: true }).click();
    const graph = page.getByRole("region", { name: "Crafting project graph", exact: true });
    await expect(graph.locator('[data-id="finish"]')).toContainText("2p + 2p");
    await expect(graph.locator('[data-id="finish"]')).toContainText("Required output");
    await expect(graph.locator('[data-id="finish"]')).toContainText(
        "Recover Merciless into pair preparation",
    );
    await expect(graph.locator('[data-id="outcome:target"]')).toContainText("Positive outcome");
    expect(await graph.locator('.react-flow__edge[data-id*="recovery"]').count()).toBeGreaterThan(
        0,
    );
    expect(await graph.locator('.react-flow__edge[data-id*="restart"]').count()).toBeGreaterThan(0);
    const preview = graph.getByRole("button", { name: "Preview Buy Merciless donor", exact: true });
    await preview.hover();
    const card = page.getByRole("region", { name: "Buy Merciless donor", exact: true });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Spine Bow");
    await page.getByRole("button", { name: "Pin item card", exact: true }).click();
    await page.getByRole("heading", { name: "Crafting projects", exact: true }).click();
    await expect(card).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Unpin item card", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: testInfo.outputPath("pinned-item.png"), fullPage: true });
    await page.getByRole("button", { name: "Close item card", exact: true }).click();
    await expect(card).toHaveCount(0);
    await preview.focus();
    await expect(card).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card).toHaveCount(0);
    const node = graph.locator('.react-flow__node[data-id="donor-0"]');
    const box = await node.locator('[data-slot="badge"]').first().boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 40, box!.y + box!.height / 2 + 40, {
        steps: 5,
    });
    await page.mouse.up();
    const storedPositions = () =>
        page.evaluate(
            (key) =>
                JSON.parse(localStorage.getItem(key)!).projects[0].graph.nodes.map(
                    (node: { position?: unknown }) => node.position,
                ),
            craftingWorkspaceStorageKey,
        );
    await expect
        .poll(storedPositions)
        .toContainEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    await page.getByRole("button", { name: "Auto arrange", exact: true }).click();
    await expect.poll(storedPositions).toEqual(Array(6).fill(undefined));
    const bounds = await graph.locator(".react-flow__node").evaluateAll((nodes) =>
        nodes.map((node) => {
            const box = node.getBoundingClientRect();
            return { x: box.x, y: box.y, right: box.right, bottom: box.bottom };
        }),
    );
    for (let i = 0; i < bounds.length; i++)
        for (let j = i + 1; j < bounds.length; j++) {
            const a = bounds[i]!;
            const b = bounds[j]!;
            expect(
                a.right <= b.x + 1 ||
                    b.right <= a.x + 1 ||
                    a.bottom <= b.y + 1 ||
                    b.bottom <= a.y + 1,
            ).toBe(true);
        }
    await graph.getByRole("button", { name: "Prices & calculation", exact: true }).click();
    await page.getByRole("spinbutton", { name: "Sampled trials", exact: true }).fill("3");
    await page.getByRole("button", { name: "Calculate process", exact: true }).click();
    await expect(page.getByText("Completed estimate", { exact: false })).toBeVisible();
    await expect(graph.locator('[data-id="finish"]')).toContainText(/\d+\.\d%/);
    const widths = await graph
        .locator(".react-flow__edge-path")
        .evaluateAll((paths) => paths.map((path) => getComputedStyle(path).strokeWidth));
    expect(new Set(widths).size).toBeGreaterThan(1);
    await page.getByRole("button", { name: "Fullscreen graph", exact: true }).click();
    const fullscreen = page.getByRole("dialog", { name: "Crafting project graph", exact: true });
    await expect(fullscreen).toBeVisible();
    await fullscreen
        .getByRole("button", {
            name: "Preview 2p + 2p: combine all three target prefixes",
            exact: true,
        })
        .click();
    await expect(
        page.getByText("Sampled item from a trial at this step; other results can differ.", {
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Unpin item card", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: testInfo.outputPath("graph-outcomes.png") });
    await page.keyboard.press("Escape");
    await expect(fullscreen).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(fullscreen).toHaveCount(0);
    expect(errors).toEqual([]);
});

test("helical stages automatically show modifiers and odds, with inline editors and movable connections", async ({
    page,
}, testInfo) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/1/crafting/projects");
    await select(page, "Crafting preset", "Replica Alberon's strength-stacking Helical Ring");
    await page.getByRole("button", { name: "Create from preset", exact: true }).click();
    const graph = page.getByRole("region", { name: "Crafting project graph", exact: true });
    await expect(graph.getByRole("status")).toContainText("Initial sample: 8 trials", {
        timeout: 60_000,
    });
    const focus = (id: string) =>
        selectValue(graph.getByRole("combobox", { name: "Focus graph step" }), id);
    await focus("strength");
    const strength = graph.locator('.react-flow__node[data-id="strength"]');
    await expect(strength.locator("[data-stage-mods]")).toContainText("Strength");
    await expect(strength).toContainText(/100\.0%/);
    await strength
        .getByRole("button", {
            name: "Preview Essence of Rage: spend at most 10 strands",
            exact: true,
        })
        .hover();
    const card = page.getByRole("region", {
        name: "Essence of Rage: spend at most 10 strands",
        exact: true,
    });
    await expect(card).toContainText("Strength");
    await expect(card).toContainText("rare");
    await page.getByRole("button", { name: "Pin item card", exact: true }).click();
    await expect(page.getByRole("button", { name: "Unpin item card", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close item card", exact: true }).click();
    const strengthMod = strength
        .locator("[data-stage-mods] button")
        .filter({ hasText: "Strength" })
        .first();
    await strengthMod.hover();
    await expect(
        page.locator('[data-slot="tooltip-content"]').filter({ hasText: "Essence modifier" }),
    ).toBeVisible();
    await expect(strengthMod).toHaveAttribute("aria-description", /Essence modifier/);
    await strength.locator('[data-handleid="item"]').hover();
    await expect(
        page.locator('[data-slot="tooltip-content"]').filter({ hasText: "Item output: drag" }),
    ).toBeVisible();
    await strength
        .getByRole("button", {
            name: "Edit outcomes for Essence of Rage: spend at most 10 strands",
            exact: true,
        })
        .click();
    const editor = strength.getByRole("region", { name: "Selected step editor" });
    await expect(editor).toBeVisible();
    await expect(editor.getByRole("heading", { name: "Result routes" })).toBeInViewport();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await strength.getByRole("button", { name: "Close node editor" }).click();
    await focus("pre-regal-imprint");
    const checkpoint = graph.locator('.react-flow__node[data-id="pre-regal-imprint"]');
    await expect(checkpoint.locator("[data-stage-mods]")).toContainText("Attributes");
    await expect(checkpoint.locator("[data-stage-mods]")).toContainText("Strength");
    await focus("restore-regal");
    await expect(
        graph.locator('[data-edge-label="restore-regal:recovery:restored"]'),
    ).toContainText(/\d+\.\d%/);
    await focus("strength");
    const connection = graph.locator('[data-edge-label="restore-strands:input:input-0"]');
    await expect(connection).toContainText(/\d+\.\d%/);
    await connection.focus();
    await connection.press("Shift+ArrowUp");
    const lineState = () =>
        page.evaluate(() =>
            Object.entries(localStorage)
                .filter(([key]) => key.startsWith("crafting-graph-lines:"))
                .map(([, value]) => JSON.parse(value)),
        );
    await expect.poll(lineState).toEqual([
        expect.objectContaining({
            "restore-strands:input:input-0": expect.objectContaining({ y: expect.any(Number) }),
        }),
    ]);
    const before = await lineState();
    const bounds = await connection.boundingBox();
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width / 2 + 30, bounds!.y + bounds!.height / 2 - 30, {
        steps: 5,
    });
    await page.mouse.up();
    await expect.poll(lineState).not.toEqual(before);
    const saved = await lineState();
    await page.reload();
    await expect(graph).toBeVisible();
    expect(await lineState()).toEqual(saved);
    await expect(graph.getByRole("status")).toContainText("Initial sample: 8 trials", {
        timeout: 60_000,
    });
    await focus("strength");
    await page.screenshot({ path: testInfo.outputPath("helical-stage.png"), fullPage: true });
    await page.getByRole("button", { name: "Fullscreen graph", exact: true }).click();
    const fullscreen = page.getByRole("dialog", { name: "Crafting project graph", exact: true });
    await selectValue(fullscreen.getByRole("combobox", { name: "Focus graph step" }), "strength");
    await fullscreen
        .getByRole("button", {
            name: "Edit Essence of Rage: spend at most 10 strands",
            exact: true,
        })
        .click();
    await expect(fullscreen.getByRole("region", { name: "Selected step editor" })).toBeVisible();
    await expect(fullscreen).toBeVisible();
    await expect(fullscreen.getByRole("button", { name: "Close node editor" })).toBeInViewport();
    await expect(
        fullscreen.getByRole("button", { name: "Edit full method options", exact: true }),
    ).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("inline-editor.png") });
    expect(errors).toEqual([]);
});

test("terminal outcomes and required bases are edited inside their graph node", async ({
    page,
}) => {
    await page.goto("/1/crafting/projects");
    await select(page, "Crafting preset", "Physical bow");
    await page.getByRole("button", { name: "Create from preset", exact: true }).click();
    const graph = page.getByRole("region", { name: "Crafting project graph", exact: true });
    await selectValue(graph.getByRole("combobox", { name: "Focus graph step" }), "outcome:target");
    const outcome = graph.locator('.react-flow__node[data-id="outcome:target"]');
    await outcome.getByRole("button", { name: /^Edit outcome / }).click();
    const editor = outcome.getByRole("region", { name: "Outcome editor" });
    await editor.getByRole("textbox", { name: "Outcome name" }).fill("Finished bow");
    await editor.getByRole("textbox", { name: "Outcome name" }).press("Tab");
    await selectValue(
        editor.getByRole("combobox", { name: "Condition type", exact: true }).first(),
        "base",
    );
    const base = editor.getByRole("region", { name: "Choose required base" });
    await expect(base).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await choose(base, "Required base", "Spine Bow", /^Spine Bow/);
    await expect(base).toHaveCount(0);
    await editor.getByRole("checkbox", { name: "Count as a successful result" }).uncheck();
    await outcome.getByRole("button", { name: "Close node editor" }).click();
    await expect(outcome).toContainText("Finished bow");
    await expect(outcome).toContainText("Negative outcome");
    await expect(outcome).toContainText("Spine Bow");
    await page.reload();
    await expect(outcome).toContainText("Finished bow");
    await expect(outcome).toContainText("Negative outcome");
    await expect(outcome).toContainText("Spine Bow");
});

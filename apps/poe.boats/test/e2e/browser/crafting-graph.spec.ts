import { expect, test } from "@playwright/test";
import { craftingWorkspaceStorageKey } from "../../../app/lib/crafting-workspace-storage";
import { select } from "./recombinator-helpers";

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
    const box = await node.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + 5);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 40, box!.y + 45, { steps: 5 });
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

import { expect, type Page, test } from "@playwright/test";
import { craftingSyncStorageKey } from "../../../app/hooks/use-crafting-cloud";
import { craftingBundleFingerprint } from "../../../app/lib/crafting-cloud-sync";
import { bindExchangePrice } from "../../../app/lib/crafting-exchange";
import { exportCraftingBundle, freezeCraftingBuild } from "../../../app/lib/crafting-workspace";
import { craftingWorkspaceStorageKey } from "../../../app/lib/crafting-workspace-storage";
import type { CraftingCloudState } from "../../../app/schemas/crafting-cloud";
import { craftingGraphSchema } from "../../../app/schemas/crafting-graph";
import {
    type CraftingBundle,
    craftingBundleSchema,
    craftingWorkspaceSchema,
} from "../../../app/schemas/crafting-workspace";
import { exchangeQuote, transmuteId } from "../../crafting-exchange-fixtures";
import {
    historyIndex,
    retainedRevision,
    retainedTransmuteGraph,
} from "../../crafting-history-fixtures";

const stamp = "2026-10-07T00:00:00.000Z";
async function bundleFor(game: "poe1" | "poe2") {
    const ruleset = historyIndex.revisions.find(
        (entry) => entry.game === game && entry.revision === "r3",
    )!;
    const retained = await retainedRevision(ruleset);
    const graph = {
        ...retainedTransmuteGraph(ruleset, retained.catalog),
        name: `${game} saved craft`,
    };
    const project = { graph, revision: 1, updatedAt: stamp };
    return craftingBundleSchema.parse({
        format: 1,
        projects: [project],
        builds: [
            {
                id: "build",
                name: "Shared build",
                game,
                revision: 1,
                updatedAt: stamp,
                members: [
                    { id: "ref", kind: "reference", projectId: graph.id },
                    { id: "copy", kind: "value", project },
                ],
            },
        ],
    });
}
async function stored(page: Page) {
    return craftingWorkspaceSchema.parse(
        await page.evaluate(
            (key) => JSON.parse(localStorage.getItem(key)!),
            craftingWorkspaceStorageKey,
        ),
    );
}
async function fixture(page: Page, initial: CraftingBundle, remoteBundle?: CraftingBundle) {
    const state = {
        ...initial,
        tabs: initial.projects.map((project) => project.graph.id),
        activeProjectId: initial.projects[0]?.graph.id ?? null,
    };
    await page.addInitScript(
        ({ key, state }) => {
            if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state));
        },
        { key: craftingWorkspaceStorageKey, state },
    );
    const model = {
        account: "owner" as string | null,
        offline: false,
        writes: 0,
        remote: {
            bundle: remoteBundle ?? { format: 1, projects: [], builds: [] },
            revision: remoteBundle ? 1 : 0,
            defaultStorage: null,
            updatedAt: null,
        } as CraftingCloudState,
        shares: new Map<
            string,
            {
                id: string;
                target: { kind: "project" | "build"; id: string };
                mode: "frozen" | "live";
                createdAt: string;
                snapshot: CraftingBundle;
                revision: number;
            }
        >(),
    };
    await page.route("**/api/auth/get-session*", (route) =>
        route.fulfill({
            json: model.account
                ? {
                      user: {
                          id: model.account,
                          name: "Test crafter",
                          email: "test@example.invalid",
                          emailVerified: true,
                          createdAt: stamp,
                          updatedAt: stamp,
                      },
                      session: {
                          id: "inert-session",
                          userId: model.account,
                          token: "inert-browser-token",
                          expiresAt: "2030-01-01T00:00:00.000Z",
                          createdAt: stamp,
                          updatedAt: stamp,
                      },
                  }
                : null,
        }),
    );
    await page.route("**/api/v1/crafting/cloud/**", async (route) => {
        if (model.offline) return route.fulfill({ status: 503, json: {} });
        if (!model.account) return route.fulfill({ status: 401, json: {} });
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith("/preference"))
            model.remote.defaultStorage = route.request().postDataJSON().defaultStorage;
        if (path.endsWith("/save")) {
            const input = route.request().postDataJSON();
            if (input.expectedRevision !== model.remote.revision)
                return route.fulfill({ status: 409, json: {} });
            model.remote = {
                ...model.remote,
                bundle: craftingBundleSchema.parse(input.bundle),
                revision: model.remote.revision + 1,
                updatedAt: stamp,
            };
            model.writes++;
        }
        return route.fulfill({ json: model.remote });
    });
    await page.route("**/api/v1/crafting/shares/**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith("/list"))
            return route.fulfill({
                json: {
                    shares: [...model.shares.values()].map(
                        ({ snapshot: _, revision: __, ...info }) => info,
                    ),
                },
            });
        if (url.pathname.endsWith("/create")) {
            const input = route.request().postDataJSON();
            if (input.expectedRevision !== model.remote.revision)
                return route.fulfill({ status: 409, json: {} });
            const source = { ...model.remote.bundle, tabs: [], activeProjectId: null };
            const snapshot =
                input.mode === "frozen" && input.target.kind === "build"
                    ? {
                          format: 1 as const,
                          projects: [],
                          builds: [freezeCraftingBuild(source, input.target.id)],
                      }
                    : exportCraftingBundle(source, input.target);
            const info = {
                id: crypto.randomUUID(),
                target: input.target,
                mode: input.mode,
                createdAt: stamp,
            };
            model.shares.set(info.id, {
                ...info,
                snapshot: structuredClone(snapshot),
                revision: model.remote.revision,
            });
            return route.fulfill({ json: info });
        }
        if (url.pathname.endsWith("/revoke")) {
            model.shares.delete(route.request().postDataJSON().id);
            return route.fulfill({ json: { ok: true } });
        }
        const share = model.shares.get(url.searchParams.get("id") ?? "");
        if (!share) return route.fulfill({ status: 404, json: {} });
        const { snapshot, revision, ...info } = share;
        return route.fulfill({
            json: {
                ...info,
                bundle:
                    share.mode === "frozen"
                        ? snapshot
                        : exportCraftingBundle(
                              { ...model.remote.bundle, tabs: [], activeProjectId: null },
                              share.target,
                          ),
                workspaceRevision: share.mode === "frozen" ? revision : model.remote.revision,
                prices: "live",
            },
        });
    });
    return model;
}

for (const game of ["poe1", "poe2"] as const) {
    test(`${game} privately syncs drafts and publishes a frozen process without changing it during preview`, async ({
        page,
    }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const bundle = await bundleFor(game);
        const quote = {
            ...exchangeQuote,
            realm: game === "poe2" ? ("poe2" as const) : ("pc" as const),
        };
        bundle.projects[0]!.graph = bindExchangePrice(
            { ...bundle.projects[0]!.graph, league: "Standard" },
            transmuteId,
            quote,
        );
        let amount = 2;
        await page.route("**/api/v1/crafting/market/refresh", (route) => {
            const graph = craftingGraphSchema.parse(route.request().postDataJSON().graph);
            return route.fulfill({
                json: {
                    graph: bindExchangePrice(graph, transmuteId, { ...quote, amount }),
                    issues: [],
                },
            });
        });
        const model = await fixture(page, bundle);
        await page.goto(`/${game === "poe1" ? "1" : "2"}/crafting/projects`);
        const cloud = page.getByRole("region", { name: "Cloud crafting storage" });
        await expect(cloud).toContainText("Choose your default storage");
        expect(model.writes).toBe(0);
        expect(model.shares.size).toBe(0);
        await cloud.getByRole("button", { name: "Enable private cloud sync" }).click();
        await expect(cloud).toContainText("Private cloud drafts are up to date");
        expect(model.remote.bundle).toEqual(bundle);
        expect(model.shares.size).toBe(0);
        await page.getByLabel("Project name", { exact: true }).fill("Synced renamed craft");
        await page.getByLabel("Project name", { exact: true }).blur();
        await expect
            .poll(() => model.remote.bundle.projects[0]!.graph.name)
            .toBe("Synced renamed craft");
        await expect(cloud).toContainText("Private cloud drafts are up to date");
        await cloud.getByText("Share an item plan or build", { exact: true }).click();
        await cloud.getByRole("button", { name: "Publish share link" }).click();
        const link = cloud.getByRole("link", { name: /^Frozen/ });
        await expect(link).toBeVisible();
        const href = await link.getAttribute("href");
        const frozen = [...model.shares.values()][0]!;
        const snapshot = structuredClone(frozen.snapshot);
        amount = 3;
        await link.click();
        await expect(page.getByText("Frozen process snapshot", { exact: false })).toBeVisible();
        await page.getByRole("button", { name: "Calculate process", exact: true }).click();
        await expect(page.getByRole("region", { name: "Process estimate" })).toContainText(
            "13.00 chaos",
        );
        await page.getByLabel("Project name", { exact: true }).fill("Preview only");
        await page.getByLabel("Project name", { exact: true }).blur();
        expect(model.shares.get(frozen.id)!.snapshot).toEqual(snapshot);
        await page.getByRole("button", { name: "Save independent copy", exact: true }).click();
        await expect(page.getByRole("tab", { name: "Preview only", exact: true })).toBeVisible();
        expect((await stored(page)).projects).toHaveLength(2);
        await expect.poll(() => model.remote.bundle.projects.length).toBe(2);
        await page.getByText("Share an item plan or build", { exact: true }).click();
        await page.getByRole("button", { name: "Revoke", exact: true }).click();
        await expect.poll(() => model.shares.size).toBe(0);
        await page.goto(href!);
        await expect(page.getByRole("alert")).toContainText("unavailable");
        expect(errors).toEqual([]);
    });
}

test("cloud conflicts keep both versions and an outage preserves local edits", async ({ page }) => {
    const bundle = await bundleFor("poe1");
    const model = await fixture(page, bundle, bundle);
    model.remote.defaultStorage = "cloud";
    await page.addInitScript(
        ({ key, checkpoint }) => localStorage.setItem(key, JSON.stringify(checkpoint)),
        {
            key: craftingSyncStorageKey,
            checkpoint: {
                accountId: "owner",
                revision: 1,
                fingerprint: await craftingBundleFingerprint(bundle),
            },
        },
    );
    await page.goto("/1/crafting/projects");
    const cloud = page.getByRole("region", { name: "Cloud crafting storage" });
    await expect(cloud).toContainText("Private cloud drafts are up to date");
    model.offline = true;
    await page.getByLabel("Project name", { exact: true }).fill("Offline local edit");
    await page.getByLabel("Project name", { exact: true }).blur();
    await expect(cloud).toContainText("Cloud sync needs attention");
    expect((await stored(page)).projects[0]!.graph.name).toBe("Offline local edit");
    model.remote = { ...model.remote, bundle: structuredClone(bundle), revision: 2 };
    model.remote.bundle.projects[0]!.graph.name = "Remote edit";
    model.offline = false;
    await cloud.getByRole("button", { name: "Refresh cloud status" }).click();
    await expect(cloud).toContainText("Cloud and local edits need review");
    await cloud.getByRole("button", { name: "Keep both as separate drafts and sync" }).click();
    await expect(cloud).toContainText("Private cloud drafts are up to date");
    expect((await stored(page)).projects.map((entry) => entry.graph.name)).toEqual([
        "Offline local edit",
        "Remote edit",
    ]);
    expect(model.remote.bundle.projects).toHaveLength(2);
    await page.screenshot({ path: "test-results/crafting-cloud-sync.png", fullPage: true });
});

test("live build links follow referenced plans while value copies remain independent", async ({
    page,
}) => {
    const bundle = await bundleFor("poe1");
    const model = await fixture(page, bundle, bundle);
    await page.goto("/1/crafting/projects");
    const cloud = page.getByRole("region", { name: "Cloud crafting storage" });
    await expect(cloud).toContainText("Choose your default storage");
    await cloud.getByRole("button", { name: "Enable private cloud sync" }).click();
    await expect(cloud).toContainText("Private cloud drafts are up to date");
    await cloud.getByText("Share an item plan or build", { exact: true }).click();
    await cloud.getByLabel("Share target").selectOption("build:build");
    await cloud.getByLabel("Link behavior").selectOption("live");
    await cloud.getByRole("button", { name: "Publish share link" }).click();
    await cloud.getByRole("link", { name: "Live · Shared build" }).click();
    const tabs = page.getByRole("tablist", { name: "Shared build items" });
    await expect(tabs.getByRole("tab")).toHaveCount(2);
    model.remote.bundle = structuredClone(bundle);
    model.remote.bundle.projects[0]!.graph.name = "New referenced plan";
    model.remote.revision++;
    await page.getByRole("button", { name: "Reload published process" }).click();
    await expect(tabs.getByRole("tab", { name: "New referenced plan", exact: true })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: "poe1 saved craft", exact: true })).toBeVisible();
    await tabs.getByRole("tab", { name: "poe1 saved craft", exact: true }).click();
    await expect(page.getByLabel("Project name", { exact: true })).toHaveValue("poe1 saved craft");
    await page.getByRole("button", { name: "Save independent copy", exact: true }).click();
    await expect.poll(async () => (await stored(page)).builds.length).toBe(2);
    expect((await stored(page)).builds[1]!.members[1]).toMatchObject({
        kind: "value",
        project: { graph: { name: "poe1 saved craft" } },
    });
});

test("changing accounts requires connecting existing drafts and local mode stops uploads", async ({
    page,
}) => {
    const bundle = await bundleFor("poe2");
    const model = await fixture(page, bundle);
    await page.goto("/2/crafting/projects");
    const cloud = page.getByRole("region", { name: "Cloud crafting storage" });
    await expect(cloud).toContainText("Choose your default storage");
    await cloud.getByRole("button", { name: "Enable private cloud sync" }).click();
    await expect(cloud).toContainText("Private cloud drafts are up to date");
    model.account = "other-account";
    model.remote = {
        bundle: { format: 1, projects: [], builds: [] },
        revision: 0,
        defaultStorage: "cloud",
        updatedAt: null,
    };
    model.writes = 0;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(cloud).toContainText("Connect these browser drafts");
    expect(model.writes).toBe(0);
    expect((await stored(page)).projects[0]!.graph.name).toBe("poe2 saved craft");
    await cloud.getByRole("button", { name: "Use local storage" }).click();
    await expect(cloud).toContainText("Local storage selected");
    await page.getByLabel("Project name", { exact: true }).fill("Local only");
    const checked = page.waitForResponse("**/api/v1/crafting/cloud/get");
    await page.getByLabel("Project name", { exact: true }).blur();
    await checked;
    await expect(cloud).toContainText("Local storage selected");
    expect(model.writes).toBe(0);
    model.account = null;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(cloud).toContainText("Local drafts · no account required");
    await expect(cloud.getByRole("link", { name: "Sign in for sync and sharing" })).toHaveAttribute(
        "href",
        "/login?returnTo=/2/crafting/projects",
    );
    expect((await stored(page)).projects[0]!.graph.name).toBe("Local only");
});

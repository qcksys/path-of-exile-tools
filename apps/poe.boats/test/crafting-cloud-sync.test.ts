import { expect, it } from "vite-plus/test";
import {
    applyCraftingCloudBundle,
    craftingBundleFingerprint,
    keepBothCraftingCopies,
    planCraftingSync,
    workspaceBundle,
} from "../app/lib/crafting-cloud-sync";
import { emptyCraftingWorkspace } from "../app/lib/crafting-workspace";
import type { CraftingCloudState } from "../app/schemas/crafting-cloud";
import { cloudBundle } from "./crafting-cloud-fixtures";

it("distinguishes local edits, remote edits, conflicts and successful acknowledgements", async () => {
    const base = cloudBundle();
    const checkpoint = {
        accountId: "owner",
        revision: 3,
        fingerprint: await craftingBundleFingerprint(base),
    };
    const remote: CraftingCloudState = {
        bundle: base,
        revision: 3,
        defaultStorage: "cloud",
        updatedAt: null,
    };
    const local = cloudBundle();
    local.projects[0]!.graph.name = "Local edit";
    expect((await planCraftingSync("owner", base, remote, checkpoint)).action).toBe("synced");
    expect((await planCraftingSync("owner", local, remote, checkpoint)).action).toBe("push");
    const changed = cloudBundle();
    changed.projects[0]!.graph.name = "Remote edit";
    expect(
        (
            await planCraftingSync(
                "owner",
                base,
                { ...remote, bundle: changed, revision: 4 },
                checkpoint,
            )
        ).action,
    ).toBe("pull");
    expect(
        (
            await planCraftingSync(
                "owner",
                local,
                { ...remote, bundle: changed, revision: 4 },
                checkpoint,
            )
        ).action,
    ).toBe("conflict");
    const acknowledged = await planCraftingSync(
        "owner",
        local,
        { ...remote, bundle: local, revision: 4 },
        checkpoint,
    );
    expect(acknowledged.action).toBe("synced");
    expect(acknowledged.checkpoint.revision).toBe(4);
    expect(
        (await planCraftingSync("owner", base, { ...remote, revision: 1 }, checkpoint)).action,
    ).toBe("conflict");
});

it("requires a deliberate connection before uploading existing drafts to a new account", async () => {
    const bundle = cloudBundle();
    const empty = workspaceBundle(emptyCraftingWorkspace());
    const remote: CraftingCloudState = {
        bundle: empty,
        revision: 0,
        defaultStorage: "cloud",
        updatedAt: null,
    };
    expect((await planCraftingSync("owner", bundle, remote, null)).action).toBe("connect");
    const previous = {
        accountId: "previous-account",
        revision: 1,
        fingerprint: await craftingBundleFingerprint(bundle),
    };
    expect((await planCraftingSync("owner", bundle, remote, previous)).action).toBe("connect");
    expect(
        (await planCraftingSync("owner", empty, { ...remote, bundle, revision: 2 }, null)).action,
    ).toBe("pull");
});

it("preserves local tab choices during pulls and keeps conflicting drafts with independent IDs", () => {
    const bundle = cloudBundle();
    const initial = applyCraftingCloudBundle(emptyCraftingWorkspace(), bundle);
    expect(initial.tabs).toEqual(["graph", "private"]);
    const closed = { ...initial, tabs: ["graph"], activeProjectId: "graph" };
    const extra = {
        ...bundle,
        projects: [
            ...bundle.projects,
            { ...bundle.projects[0]!, graph: { ...bundle.projects[0]!.graph, id: "new" } },
        ],
    };
    expect(applyCraftingCloudBundle(closed, extra).tabs).toEqual(["graph", "new"]);
    const merged = keepBothCraftingCopies(closed, bundle);
    expect(merged.projects).toHaveLength(4);
    expect(merged.builds).toHaveLength(2);
    const reference = merged.builds[1]!.members[0]!;
    expect(reference.kind).toBe("reference");
    if (reference.kind === "reference") {
        expect(reference.projectId).not.toBe("graph");
        expect(merged.projects.some((project) => project.graph.id === reference.projectId)).toBe(
            true,
        );
    }
    expect(merged.projects[0]).toEqual(bundle.projects[0]);
});

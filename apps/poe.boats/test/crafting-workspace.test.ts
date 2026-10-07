import { describe, expect, it } from "vite-plus/test";
import {
    editCraftingWorkspace,
    emptyCraftingWorkspace,
    exportCraftingBundle,
    freezeCraftingBuild,
    parseCraftingWorkspace,
    resolveCraftingBuild,
} from "../app/lib/crafting-workspace";
import type {
    CraftingWorkspace,
    CraftingWorkspaceCommand,
} from "../app/schemas/crafting-workspace";
import { graphFixture } from "./crafting-graph-fixtures";

function fixture() {
    let state = emptyCraftingWorkspace();
    let sequence = 0;
    const edit = (command: CraftingWorkspaceCommand) => {
        const result = editCraftingWorkspace(state, command, {
            id: () => `id-${++sequence}`,
            now: () => "2026-10-07T00:00:00.000Z",
        });
        state = result.state;
        return result;
    };
    const projectId = edit({ action: "createProject", graph: graphFixture() }).ids[0]!;
    const buildId = edit({ action: "createBuild", name: "Axe build", game: "poe1" }).ids[0]!;
    return {
        edit,
        projectId,
        buildId,
        get state() {
            return state;
        },
    };
}

describe("crafting project workspace", () => {
    it("creates separate selected tabs, closes without deleting and reopens the saved draft", () => {
        const model = fixture();
        const second = model.edit({ action: "createProject", graph: graphFixture() }).ids[0]!;
        expect(model.state.tabs).toEqual([model.projectId, second]);
        expect(model.state.activeProjectId).toBe(second);
        model.edit({ action: "closeProject", projectId: second });
        expect(model.state.activeProjectId).toBe(model.projectId);
        expect(model.state.projects).toHaveLength(2);
        model.edit({ action: "openProject", projectId: second });
        model.edit({ action: "openProject", projectId: second });
        expect(model.state.tabs).toEqual([model.projectId, second]);
    });

    it("follows references while preserving value copies and frozen snapshots", () => {
        const model = fixture();
        for (const kind of ["reference", "value"] as const)
            model.edit({
                action: "addMember",
                buildId: model.buildId,
                projectId: model.projectId,
                kind,
            });
        const frozen = freezeCraftingBuild(model.state, model.buildId);
        const project = model.state.projects[0]!;
        model.edit({
            action: "updateProject",
            expectedRevision: project.revision,
            graph: { ...project.graph, name: "Updated axe" },
        });
        const resolved = resolveCraftingBuild(model.state, model.buildId);
        expect(resolved.members.map((member) => member.project.revision)).toEqual([2, 1]);
        expect(resolved.members[0]!.project.graph.name).toBe("Updated axe");
        expect(
            frozen.members.every(
                (member) => member.kind === "value" && member.project.revision === 1,
            ),
        ).toBe(true);
        expect(frozen.members[0]).not.toEqual(resolved.build.members[0]);
    });

    it("protects references from deletion until detached, then keeps their captured item plans", () => {
        const model = fixture();
        const memberId = model.edit({
            action: "addMember",
            buildId: model.buildId,
            projectId: model.projectId,
            kind: "reference",
        }).ids[0]!;
        expect(() => model.edit({ action: "deleteProject", projectId: model.projectId })).toThrow(
            "references",
        );
        model.edit({ action: "detachMember", buildId: model.buildId, memberId });
        model.edit({ action: "deleteProject", projectId: model.projectId });
        expect(model.state.projects).toEqual([]);
        expect(model.state.tabs).toEqual([]);
        expect(model.state.activeProjectId).toBeNull();
        expect(resolveCraftingBuild(model.state, model.buildId).members[0]!.project.graph.id).toBe(
            model.projectId,
        );
    });

    it("edits a build copy independently and rejects stale copies or direct reference edits", () => {
        const model = fixture();
        const memberId = model.edit({
            action: "addMember",
            buildId: model.buildId,
            projectId: model.projectId,
            kind: "value",
        }).ids[0]!;
        const graph = { ...model.state.projects[0]!.graph, name: "Independent copy" };
        const command = {
            action: "updateBuildCopy",
            buildId: model.buildId,
            memberId,
            graph,
            expectedRevision: 1,
        } as const;
        model.edit(command);
        expect(
            resolveCraftingBuild(model.state, model.buildId).members[0]!.project.graph.name,
        ).toBe("Independent copy");
        expect(model.state.projects[0]!.graph.name).not.toBe("Independent copy");
        expect(() => model.edit(command)).toThrow("newer revision");
        const referenceId = model.edit({
            action: "addMember",
            buildId: model.buildId,
            projectId: model.projectId,
            kind: "reference",
        }).ids[0]!;
        expect(() => model.edit({ ...command, memberId: referenceId })).toThrow(
            "referenced project",
        );
    });

    it("round-trips a portable build and remaps imported references away from existing drafts", () => {
        const model = fixture();
        for (const kind of ["reference", "value"] as const)
            model.edit({
                action: "addMember",
                buildId: model.buildId,
                projectId: model.projectId,
                kind,
            });
        const bundle = JSON.parse(
            JSON.stringify(exportCraftingBundle(model.state, { kind: "build", id: model.buildId })),
        );
        const imported = model.edit({ action: "import", bundle });
        expect(model.state.projects).toHaveLength(2);
        expect(model.state.builds).toHaveLength(2);
        const importedBuild = resolveCraftingBuild(model.state, imported.ids[1]!);
        expect(importedBuild.members[0]!.project.graph.id).toBe(imported.ids[0]);
        expect(importedBuild.members[0]!.project.graph.id).not.toBe(model.projectId);
        expect(importedBuild.members[1]!.kind).toBe("value");
        expect(model.state.activeProjectId).toBe(imported.ids[0]);
        expect(parseCraftingWorkspace(JSON.parse(JSON.stringify(model.state)))).toEqual(
            model.state,
        );
    });

    it("refuses stale updates without changing the caller's state or losing either graph", () => {
        const model = fixture();
        const graph = model.state.projects[0]!.graph;
        model.edit({
            action: "updateProject",
            graph: { ...graph, name: "Saved elsewhere" },
            expectedRevision: 1,
        });
        const before = structuredClone(model.state);
        const command = {
            action: "updateProject",
            graph: { ...graph, name: "Unsaved edits" },
            expectedRevision: 1,
        } as const;
        expect(() => model.edit(command)).toThrow("newer revision");
        expect(model.state).toEqual(before);
        expect(command.graph.name).toBe("Unsaved edits");
    });

    it("rejects foreign members, dangling references, duplicate IDs and incompatible games atomically", () => {
        const model = fixture();
        const before = structuredClone(model.state);
        expect(() =>
            model.edit({ action: "removeMember", buildId: model.buildId, memberId: "foreign" }),
        ).toThrow("not found");
        expect(() =>
            model.edit({
                action: "import",
                bundle: {
                    format: 1,
                    projects: [],
                    builds: [
                        {
                            ...model.state.builds[0]!,
                            members: [{ id: "missing", kind: "reference", projectId: "absent" }],
                        },
                    ],
                },
            }),
        ).toThrow("not found");
        expect(() =>
            parseCraftingWorkspace({
                ...model.state,
                projects: [...model.state.projects, ...model.state.projects],
            }),
        ).toThrow("Duplicate");
        const other: CraftingWorkspace = structuredClone(model.state);
        other.builds[0]!.game = "poe2";
        expect(() =>
            editCraftingWorkspace(other, {
                action: "addMember",
                buildId: model.buildId,
                projectId: model.projectId,
                kind: "value",
            }),
        ).toThrow("same game");
        expect(model.state).toEqual(before);
    });
});

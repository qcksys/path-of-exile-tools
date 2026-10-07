import {
    type CraftingBuild,
    type CraftingBundle,
    type CraftingDraft,
    type CraftingWorkspace,
    type CraftingWorkspaceCommand,
    craftingBundleSchema,
    craftingWorkspaceCommandSchema,
    craftingWorkspaceSchema,
} from "../schemas/crafting-workspace";

export class CraftingWorkspaceConflict extends Error {}

function unique(ids: string[], label: string) {
    if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${label} IDs.`);
}

function projectIn(state: CraftingBundle, id: string) {
    const project = state.projects.find((entry) => entry.graph.id === id);
    if (!project) throw new Error("Crafting project not found.");
    return project;
}

function buildIn(state: CraftingBundle, id: string) {
    const build = state.builds.find((entry) => entry.id === id);
    if (!build) throw new Error("Crafting build not found.");
    return build;
}

function validateBundle(state: CraftingBundle) {
    unique(
        state.projects.map((entry) => entry.graph.id),
        "project",
    );
    unique(
        state.builds.map((entry) => entry.id),
        "build",
    );
    for (const build of state.builds) {
        unique(
            build.members.map((entry) => entry.id),
            "build member",
        );
        for (const member of build.members) {
            const project =
                member.kind === "value" ? member.project : projectIn(state, member.projectId);
            if (project.graph.game !== build.game)
                throw new Error("A build and its item plans must use the same game.");
        }
    }
    return state;
}

export function parseCraftingWorkspace(input: unknown): CraftingWorkspace {
    const state = craftingWorkspaceSchema.parse(input);
    validateBundle(state);
    unique(state.tabs, "open tab");
    for (const tab of state.tabs) projectIn(state, tab);
    if (state.activeProjectId !== null && !state.tabs.includes(state.activeProjectId))
        throw new Error("The active crafting project must have an open tab.");
    if (state.tabs.length && state.activeProjectId === null)
        throw new Error("Choose an active crafting project when tabs are open.");
    return state;
}

export function emptyCraftingWorkspace(): CraftingWorkspace {
    return { format: 1, projects: [], builds: [], tabs: [], activeProjectId: null };
}

function openProject(state: CraftingWorkspace, id: string) {
    projectIn(state, id);
    if (!state.tabs.includes(id)) state.tabs.push(id);
    state.activeProjectId = id;
}

function closeProject(state: CraftingWorkspace, id: string) {
    projectIn(state, id);
    const position = state.tabs.indexOf(id);
    state.tabs = state.tabs.filter((tab) => tab !== id);
    if (state.activeProjectId === id)
        state.activeProjectId = state.tabs[Math.max(0, position - 1)] ?? null;
}

export function editCraftingWorkspace(
    input: unknown,
    commandInput: CraftingWorkspaceCommand,
    options: { id?: () => string; now?: () => string } = {},
): { state: CraftingWorkspace; ids: string[] } {
    const state = parseCraftingWorkspace(input);
    const command = craftingWorkspaceCommandSchema.parse(commandInput);
    const makeId = options.id ?? (() => crypto.randomUUID());
    const now = options.now ?? (() => new Date().toISOString());
    const ids: string[] = [];
    switch (command.action) {
        case "createProject": {
            const graph = { ...command.graph, id: makeId() };
            state.projects.push({ graph, revision: 1, updatedAt: now() });
            openProject(state, graph.id);
            ids.push(graph.id);
            break;
        }
        case "openProject":
            openProject(state, command.projectId);
            break;
        case "closeProject":
            closeProject(state, command.projectId);
            break;
        case "deleteProject":
            if (
                state.builds.some((build) =>
                    build.members.some(
                        (member) =>
                            member.kind === "reference" && member.projectId === command.projectId,
                    ),
                )
            )
                throw new CraftingWorkspaceConflict(
                    "Remove or copy build references before deleting this project.",
                );
            closeProject(state, command.projectId);
            state.projects = state.projects.filter((entry) => entry.graph.id !== command.projectId);
            break;
        case "updateProject": {
            const project = projectIn(state, command.graph.id);
            if (project.revision !== command.expectedRevision)
                throw new CraftingWorkspaceConflict(
                    "This project has a newer revision. Preserve your draft before loading it.",
                );
            if (project.graph.game !== command.graph.game)
                throw new Error("An existing project cannot change games.");
            project.graph = command.graph;
            project.revision++;
            project.updatedAt = now();
            break;
        }
        case "createBuild": {
            const id = makeId();
            state.builds.push({
                id,
                name: command.name,
                game: command.game,
                members: [],
                revision: 1,
                updatedAt: now(),
            });
            ids.push(id);
            break;
        }
        case "deleteBuild":
            buildIn(state, command.buildId);
            state.builds = state.builds.filter((entry) => entry.id !== command.buildId);
            break;
        case "renameBuild":
        case "updateBuildCopy":
        case "addMember":
        case "removeMember":
        case "detachMember": {
            const build = buildIn(state, command.buildId);
            if (command.action === "renameBuild") build.name = command.name;
            else if (command.action === "addMember") {
                const project = projectIn(state, command.projectId);
                const id = makeId();
                build.members.push(
                    command.kind === "reference"
                        ? { id, kind: "reference", projectId: command.projectId }
                        : { id, kind: "value", project: structuredClone(project) },
                );
                ids.push(id);
            } else {
                const index = build.members.findIndex((entry) => entry.id === command.memberId);
                if (index < 0) throw new Error("Build member not found.");
                const member = build.members[index]!;
                if (command.action === "updateBuildCopy") {
                    if (member.kind !== "value")
                        throw new Error(
                            "Edit the referenced project or detach it before editing a build copy.",
                        );
                    if (member.project.revision !== command.expectedRevision)
                        throw new CraftingWorkspaceConflict(
                            "This build copy has a newer revision. Preserve your draft before loading it.",
                        );
                    if (
                        member.project.graph.id !== command.graph.id ||
                        member.project.graph.game !== command.graph.game
                    )
                        throw new Error(
                            "An existing build copy cannot change its identity or game.",
                        );
                    member.project = {
                        graph: command.graph,
                        revision: member.project.revision + 1,
                        updatedAt: now(),
                    };
                } else if (command.action === "removeMember") build.members.splice(index, 1);
                else if (member.kind === "reference")
                    build.members[index] = {
                        id: member.id,
                        kind: "value",
                        project: structuredClone(projectIn(state, member.projectId)),
                    };
            }
            build.revision++;
            build.updatedAt = now();
            break;
        }
        case "import": {
            const bundle = validateBundle(craftingBundleSchema.parse(command.bundle));
            const remapped = new Map<string, string>();
            for (const project of bundle.projects) {
                const id = makeId();
                remapped.set(project.graph.id, id);
                state.projects.push({
                    graph: { ...project.graph, id },
                    revision: 1,
                    updatedAt: now(),
                });
                openProject(state, id);
                ids.push(id);
            }
            for (const build of bundle.builds) {
                const id = makeId();
                state.builds.push({
                    ...build,
                    id,
                    revision: 1,
                    updatedAt: now(),
                    members: build.members.map((member) =>
                        member.kind === "reference"
                            ? {
                                  ...member,
                                  id: makeId(),
                                  projectId: remapped.get(member.projectId)!,
                              }
                            : { ...member, id: makeId() },
                    ),
                });
                ids.push(id);
            }
            break;
        }
    }
    return { state: parseCraftingWorkspace(state), ids };
}

export function exportCraftingBundle(
    input: unknown,
    selection: { kind: "project" | "build"; id: string },
): CraftingBundle {
    const state = parseCraftingWorkspace(input);
    if (selection.kind === "project")
        return { format: 1, projects: [projectIn(state, selection.id)], builds: [] };
    const build = buildIn(state, selection.id);
    const references = new Set(
        build.members.flatMap((member) => (member.kind === "reference" ? [member.projectId] : [])),
    );
    return {
        format: 1,
        projects: state.projects.filter((entry) => references.has(entry.graph.id)),
        builds: [build],
    };
}

export function resolveCraftingBuild(
    input: unknown,
    buildId: string,
): {
    build: CraftingBuild;
    members: { id: string; kind: "reference" | "value"; project: CraftingDraft }[];
} {
    const state = parseCraftingWorkspace(input);
    const build = buildIn(state, buildId);
    return {
        build,
        members: build.members.map((member) => ({
            id: member.id,
            kind: member.kind,
            project: member.kind === "value" ? member.project : projectIn(state, member.projectId),
        })),
    };
}

export function freezeCraftingBuild(input: unknown, buildId: string): CraftingBuild {
    const resolved = resolveCraftingBuild(input, buildId);
    return {
        ...resolved.build,
        members: resolved.members.map(({ id, project }) => ({ id, kind: "value", project })),
    };
}

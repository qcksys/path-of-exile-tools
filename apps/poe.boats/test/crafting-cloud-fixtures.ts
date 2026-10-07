import { craftingBundleSchema } from "../app/schemas/crafting-workspace";
import { graphFixture } from "./crafting-graph-fixtures";

export function cloudBundle() {
    const project = { graph: graphFixture(), revision: 1, updatedAt: "2026-10-07T00:00:00.000Z" };
    return craftingBundleSchema.parse({
        format: 1,
        projects: [
            project,
            {
                ...project,
                graph: { ...project.graph, id: "private", name: "Private unrelated plan" },
            },
        ],
        builds: [
            {
                id: "build",
                name: "Axe build",
                game: "poe1",
                revision: 1,
                updatedAt: project.updatedAt,
                members: [
                    { id: "reference", kind: "reference", projectId: project.graph.id },
                    { id: "copy", kind: "value", project },
                ],
            },
        ],
    });
}

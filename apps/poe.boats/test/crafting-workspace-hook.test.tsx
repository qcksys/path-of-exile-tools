// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vite-plus/test";
import { useCraftingWorkspace } from "../app/hooks/use-crafting-workspace";
import { graphFixture } from "./crafting-graph-fixtures";

afterEach(() => {
    cleanup();
    localStorage.clear();
});

function Consumer({ name }: { name: string }) {
    const workspace = useCraftingWorkspace();
    return (
        <section aria-label={name}>
            <output>
                {workspace.state.projects.length} projects ·{" "}
                {workspace.unsaved ? "unsaved" : "saved"}
            </output>
            <button
                type="button"
                onClick={() =>
                    workspace.store.edit({ action: "createProject", graph: graphFixture() })
                }
            >
                Add project
            </button>
        </section>
    );
}

it("notifies other workspace consumers in the same page without making the writer conflict with itself", () => {
    render(
        <>
            <Consumer name="Projects" />
            <Consumer name="Item handoff" />
        </>,
    );
    fireEvent.click(
        within(screen.getByRole("region", { name: "Item handoff" })).getByRole("button"),
    );
    expect(screen.getByRole("region", { name: "Projects" }).textContent).toContain(
        "1 projects · saved",
    );
    expect(screen.getByRole("region", { name: "Item handoff" }).textContent).toContain(
        "1 projects · saved",
    );
    fireEvent.click(within(screen.getByRole("region", { name: "Projects" })).getByRole("button"));
    expect(screen.getByRole("region", { name: "Item handoff" }).textContent).toContain(
        "2 projects · saved",
    );
});

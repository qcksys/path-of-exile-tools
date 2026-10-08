// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vite-plus/test";
import { ProcessRouteResults } from "~/components/crafting/process-route-results";
import { seededRandom } from "~/lib/crafting-engine";
import { CraftingProcess } from "~/lib/crafting-simulation";
import { changeControl } from "./control-helpers";
import { button, CraftingWorker, fixture } from "./crafting-process-ui-fixtures";

it("keeps rare route probabilities visible and distinguishes missing prices from free steps", () => {
    const { engine, project } = fixture();
    const currencyId = Object.keys(project.prices)[0]!;
    project.prices = {};
    render(
        <ProcessRouteResults
            engine={engine}
            project={project}
            routes={{
                annul: {
                    visits: 0.0000004,
                    passed: 0.0000003,
                    failed: 0.0000001,
                    errors: 0,
                    spending: { [currencyId]: 0.0000004 },
                },
            }}
            attempts={1}
            label="Exact within the model"
        />,
    );
    const first = within(screen.getByRole("article", { name: "Keep life route results" }));
    expect(first.getByText("0.0000004 visits · Enter missing currency prices")).toBeDefined();
    expect(first.getByRole("row", { name: "Passed Final check 0.0000003" })).toBeDefined();
    expect(first.getByRole("row", { name: "Failed restart 0.0000001" })).toBeDefined();
    expect(
        screen.getByRole("article", { name: "Final check route results" }).textContent,
    ).toContain("0 visits · 0 chaos / attempt");
});

it.each([
    "stop",
    "error",
    "worker-error",
    "route-edit",
])("discards uncommitted routes and stale messages after %s", (reason) => {
    const { engine, project, mount } = fixture();
    mount();
    const card = screen.getByRole("region", { name: "Current item" });
    const before = card.textContent;
    fireEvent.click(button("Apply process"));
    const worker = CraftingWorker.instances[0]!;
    const process = new CraftingProcess(engine, project, seededRandom(project.seed));
    process.advance();
    act(() => worker.onmessage?.({ data: { type: "emulating", result: process.result() } }));
    expect(screen.getByRole("region", { name: "Process route results" })).toBeDefined();
    if (reason === "stop") fireEvent.click(button("Stop process"));
    else if (reason === "route-edit")
        changeControl(screen.getAllByLabelText("Condition failed")[0]!, {
            target: { value: "failure" },
        });
    else if (reason === "error")
        act(() => worker.onmessage?.({ data: { type: "error", message: "Worker failed" } }));
    else act(() => worker.onerror?.({ message: "Worker failed" }));
    expect(worker.terminate).toHaveBeenCalled();
    act(() => worker.onmessage?.({ data: { type: "emulated", result: process.result() } }));
    expect(screen.queryByRole("region", { name: "Process route results" })).toBeNull();
    expect(card.textContent).toBe(before);
    expect(screen.queryByText("Emulator spending")).toBeNull();
    expect(screen.queryByRole("button", { name: "Stop process" })).toBeNull();
});

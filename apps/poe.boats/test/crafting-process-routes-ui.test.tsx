// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { seededRandom } from "~/lib/crafting-engine";
import {
    CraftingProcess,
    CraftingSimulation,
    calculateProcessExact,
} from "~/lib/crafting-simulation";
import { craftingProjectSchema } from "~/schemas/crafting";
import { changeControl, expectControlValue } from "./control-helpers";
import {
    button,
    CraftingWorker,
    catalogs,
    fixture,
    scrollIntoView,
    selectRouteDestination,
} from "./crafting-process-ui-fixtures";

describe.each(catalogs)("$game process routes and flowchart", (data) => {
    it("copies craft and condition steps, preserves routes and saves independent editable copies", async () => {
        const { engine, project, key, mount } = fixture(data);
        mount();
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[0]!;
        const result = calculateProcessExact(engine, project);
        act(() => worker.onmessage?.({ data: { type: "done", result } }));
        const source = within(screen.getByRole("article", { name: "Keep life editor" }));
        fireEvent.click(source.getByRole("button", { name: "Copy step" }));
        expect(screen.queryByRole("region", { name: "Crafting results" })).toBeNull();
        const copy = within(screen.getByRole("article", { name: "Keep life (copy) editor" }));
        changeControl(copy.getByRole("textbox", { name: "Step name" }), {
            target: { value: "Independent copy" },
        });
        fireEvent.click(copy.getByRole("button", { name: "Always pass" }));
        fireEvent.click(
            within(screen.getByRole("article", { name: "Final check editor" })).getByRole(
                "button",
                { name: "Copy step" },
            ),
        );
        fireEvent.click(button("Save project"));
        const saved = craftingProjectSchema.parse(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"],
        );
        expect(saved.steps).toHaveLength(4);
        expect(saved.steps[0]).toEqual(project.steps[0]);
        expect(saved.steps[2]).toEqual(project.steps[1]);
        expect(saved.steps[1]).toMatchObject({
            name: "Independent copy",
            method: project.steps[0]!.method,
            condition: { groups: [] },
            onSuccess: "finish",
            onFailure: "restart",
            position: { x: 140, y: 100 },
        });
        expect(saved.steps[3]!.method).toBeUndefined();
        expect(new Set(saved.steps.map((step) => step.id)).size).toBe(4);
        expect(saved.item).toEqual(project.item);
        expect(calculateProcessExact(engine, saved).probability).toBe(result.probability);
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(screen.getByRole("article", { name: "Independent copy editor" })).toBeDefined();
        expect(screen.getByRole("article", { name: "Final check (copy) editor" })).toBeDefined();
        fireEvent.click(button("Show process flow"));
        await act(() => vi.dynamicImportSettled());
        expect(await screen.findByTestId(`rf__node-step:${saved.steps[1]!.id}`)).toBeDefined();
        expect(await screen.findByTestId(`rf__node-step:${saved.steps[3]!.id}`)).toBeDefined();
        fireEvent.click(copy.getByRole("button", { name: "Remove step" }));
        expect(screen.getByRole("article", { name: "Keep life editor" })).toBeDefined();
        expect(screen.queryByRole("article", { name: "Independent copy editor" })).toBeNull();
    });

    it("adds, orders and saves conditional routes, displaying per-route odds and dynamic flow handles", async () => {
        const { engine, key, mount } = fixture(data);
        mount();
        const editor = within(screen.getByRole("article", { name: "Keep life editor" }));
        fireEvent.click(editor.getByRole("button", { name: "Add conditional route" }));
        const route2 = within(editor.getByRole("region", { name: "Route 2" }));
        fireEvent.click(route2.getByRole("button", { name: "Always pass" }));
        await selectRouteDestination(
            route2.getByRole("combobox", { name: "Route 2 destination" }),
            "Finish as failure",
        );
        fireEvent.click(button("Show process flow"));
        const node = await screen.findByTestId("rf__node-step:annul");
        expect(within(node).getByLabelText("Keep life Route 1 output")).toBeDefined();
        expect(within(node).getByLabelText("Keep life Route 2 output")).toBeDefined();
        expect(within(node).getByLabelText("Keep life Fallback output")).toBeDefined();
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[0]!;
        const input = worker.postMessage.mock.calls[0]![0].project;
        expect(input.steps[0].branches).toHaveLength(2);
        const result = calculateProcessExact(engine, input);
        expect(result.probability).toBe(0.5);
        act(() => worker.onmessage?.({ data: { type: "done", result } }));
        const routes = within(screen.getByRole("article", { name: "Keep life route results" }));
        expect(routes.getByRole("row", { name: "Route 1 Final check 0.5" })).toBeDefined();
        expect(routes.getByRole("row", { name: "Route 2 failure 0.5" })).toBeDefined();
        fireEvent.click(editor.getByRole("button", { name: "Move route 2 up" }));
        expect(screen.queryByRole("region", { name: "Crafting results" })).toBeNull();
        fireEvent.click(button("Save project"));
        const saved = craftingProjectSchema.parse(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"],
        );
        expect(saved.steps[0]!.branches!.map((branch) => branch.id)).toEqual(
            [...input.steps[0].branches].reverse().map((branch) => branch.id),
        );
        expect(calculateProcessExact(engine, saved).probability).toBe(0);
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(editor.getByRole("combobox", { name: "Route 1 destination" }).textContent).toContain(
            "Finish as failure",
        );
        fireEvent.click(editor.getByRole("button", { name: "Remove route 1" }));
        expect(within(node).queryByLabelText("Keep life Route 2 output")).toBeNull();
        fireEvent.click(
            within(screen.getByRole("article", { name: "Final check editor" })).getByRole(
                "button",
                { name: "Remove step" },
            ),
        );
        fireEvent.click(button("Save project"));
        const remaining = craftingProjectSchema.parse(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"],
        );
        expect(remaining.steps[0]!.branches![0]!.destination).toBe("failure");
        expect(remaining.steps[0]!.branches![0]!.condition).toEqual(
            input.steps[0].branches[0].condition,
        );
        fireEvent.click(editor.getByRole("button", { name: "Remove route 1" }));
        expect(within(node).queryByLabelText("Keep life Route 1 output")).toBeNull();
        expect(within(node).getByLabelText("Keep life Fallback output")).toBeDefined();
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].steps[0].branches,
        ).toEqual([]);
    });

    it("edits later-route conditions and preserves the result and costs through emulator history", async () => {
        const { engine, key, mount } = fixture(data);
        mount();
        const editor = within(screen.getByRole("article", { name: "Keep life editor" }));
        fireEvent.click(editor.getByRole("button", { name: "Add conditional route" }));
        const second = within(editor.getByRole("region", { name: "Route 2" }));
        fireEvent.click(second.getByText("Edit route 2 condition"));
        fireEvent.click(second.getByRole("button", { name: "Always pass" }));
        fireEvent.click(second.getByText("Item conditions", { exact: true }));
        changeControl(second.getByLabelText("Required rarity"), { target: { value: "rare" } });
        await selectRouteDestination(
            editor.getByRole("combobox", { name: "No route matched" }),
            "Finish as failure",
        );
        fireEvent.click(button("Apply process"));
        const worker = CraftingWorker.instances[0]!;
        const input = worker.postMessage.mock.calls[0]![0].project;
        expect(input.steps[0].branches[1].condition.rarity).toBe("rare");
        expect(input.steps[0].onFailure).toBe("failure");
        const process = new CraftingProcess(engine, input, seededRandom(input.seed));
        while (!process.done) process.advance();
        act(() => worker.onmessage?.({ data: { type: "emulated", result: process.result() } }));
        fireEvent.click(button("Save project"));
        const crafted = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(crafted.item).toEqual(process.result().item);
        expect(crafted.steps[0].branches).toEqual(input.steps[0].branches);
        expect(screen.getByRole("region", { name: "Process route results" }).textContent).toContain(
            "Route 2",
        );
        const spending = screen.getByText("Emulator spending").closest("details")!.textContent;
        fireEvent.click(button("Undo"));
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item).toEqual(
            input.item,
        );
        fireEvent.click(button("Redo"));
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toBe(
            spending,
        );
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item).toEqual(
            crafted.item,
        );
    });

    it("saves names, descriptions and keyboard layout changes while keeping presentation edits independent of results", async () => {
        const { engine, project, key, mount } = fixture(data);
        mount();
        fireEvent.click(button("Show process flow"));
        const node = await screen.findByTestId("rf__node-step:annul");
        expect(node.textContent).toContain("Remove resistance and keep life");
        fireEvent.keyDown(node, { key: "Enter" });
        fireEvent.keyDown(node, { key: "ArrowRight" });
        fireEvent.keyDown(node, { key: "ArrowDown" });
        fireEvent.click(within(node).getByText("Edit Keep life"));
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
        expect(document.activeElement).toBe(
            screen.getByRole("article", { name: "Keep life editor" }),
        );
        const editor = within(screen.getByRole("article", { name: "Keep life editor" }));
        changeControl(editor.getByLabelText("Step description"), {
            target: { value: "Retry from the starting item if life is lost" },
        });
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[0]!;
        const input = worker.postMessage.mock.calls[0]![0].project;
        expect(input.steps[0]).toMatchObject({
            position: { x: 105, y: 65 },
            description: "Retry from the starting item if life is lost",
        });
        const result = calculateProcessExact(engine, project);
        act(() => worker.onmessage?.({ data: { type: "done", result } }));
        const routes = screen.getByRole("region", { name: "Process route results" });
        expect(routes.textContent).toContain("Exact within the model");
        const first = within(screen.getByRole("article", { name: "Keep life route results" }));
        expect(first.getByText("1.75 visits · 3.5 chaos / attempt")).toBeDefined();
        expect(first.getByRole("row", { name: "Passed Final check 0.875" })).toBeDefined();
        expect(first.getByRole("row", { name: "Failed restart 0.875" })).toBeDefined();
        expect(node.textContent).toContain("1.75 visits / attempt");
        changeControl(editor.getByLabelText("Step name"), { target: { value: "Annul safely" } });
        expect(screen.getByRole("article", { name: "Annul safely route results" })).toBeDefined();
        expect(screen.getByRole("region", { name: "Crafting results" })).toBeDefined();
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].steps[0],
        ).toMatchObject({
            name: "Annul safely",
            position: { x: 105, y: 65 },
            description: "Retry from the starting item if life is lost",
        });
        fireEvent.click(button("Reset layout"));
        expect(node.style.transform).toContain("translate(0px,0px)");
        expect(screen.getByRole("region", { name: "Process route results" })).toBeDefined();
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(node.style.transform).toContain("translate(105px,65px)");
        expectControlValue(editor.getByLabelText("Step name"), "Annul safely");
        fireEvent.click(button("Calculate odds"));
        const next = CraftingWorker.instances[1]!;
        const simulation = new CraftingSimulation(data, next.postMessage.mock.calls[0]![0].project);
        for (let index = 0; index < 10; index++) simulation.runTrial();
        const sampled = simulation.result();
        act(() => next.onmessage?.({ data: { type: "done", result: sampled } }));
        expect(screen.getByRole("region", { name: "Process route results" }).textContent).toContain(
            "10 sampled attempts",
        );
        expect(
            screen.getByRole("article", { name: "Annul safely route results" }).textContent,
        ).toContain(`${sampled.routes!.annul!.visits / 10} visits`);
        changeControl(editor.getByLabelText("Condition passed"), {
            target: { value: "success" },
        });
        expect(screen.queryByRole("region", { name: "Process route results" })).toBeNull();
        expect(screen.queryByRole("region", { name: "Crafting results" })).toBeNull();
    });
});

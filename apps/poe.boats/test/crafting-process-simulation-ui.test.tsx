// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { CraftingSimulation, calculateProcessExact } from "~/lib/crafting-simulation";
import { craftingProjectSchema } from "~/schemas/crafting";
import { changeControl, expectControlValue } from "./control-helpers";
import { button, CraftingWorker, catalogs, fixture } from "./crafting-process-ui-fixtures";

describe.each(catalogs)("$game process routes and flowchart", (data) => {
    it("omits the unused calculator trial count on the continuous simulator page", () => {
        const { project, mount } = fixture(data);
        project.simulationLimit = { kind: "manual" };
        mount("simulate");
        expect(screen.queryByText("Create process from calculator")).toBeNull();
        expect(screen.queryByText("Replace process from calculator")).toBeNull();
        expect(screen.queryByLabelText("Calculator trials")).toBeNull();
        expect(screen.queryByLabelText("Maximum trials")).toBeNull();
        fireEvent.click(button("Run simulation"));
        expect(CraftingWorker.instances[0]!.postMessage.mock.calls[0]![0]).toMatchObject({
            type: "process",
            project: { simulationLimit: { kind: "manual" }, iterations: project.iterations },
        });
        fireEvent.click(button("Stop simulation"));
        changeControl(screen.getByLabelText("Stop simulation after"), {
            target: { value: "trials" },
        });
        expectControlValue(screen.getByLabelText("Trials"), String(project.iterations));
    });

    it("persists continuous simulation and retains its last batch when stopped", () => {
        const { key, mount } = fixture(data);
        mount();
        changeControl(screen.getByLabelText("Stop simulation after"), {
            target: { value: "manual" },
        });
        expect(screen.queryByLabelText("Simulation action limit")).toBeNull();
        expect(screen.queryByLabelText("Successful item target")).toBeNull();
        changeControl(screen.getByLabelText("Calculator trials"), { target: { value: "1" } });
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].simulationLimit,
        ).toEqual({ kind: "manual" });
        expect(JSON.parse(localStorage.getItem(`${key}:draft:v1`)!).simulationLimit).toEqual({
            kind: "manual",
        });
        fireEvent.click(button("Mass simulate"));
        const worker = CraftingWorker.instances[0]!;
        const simulation = new CraftingSimulation(
            data,
            worker.postMessage.mock.calls[0]![0].project,
        );
        for (let i = 0; i < 12; i++) simulation.runTrial();
        const result = simulation.result();
        act(() => worker.onmessage?.({ data: { type: "progress", result } }));
        expect(
            screen.getByRole("progressbar", { name: "Simulation progress" }).hasAttribute("value"),
        ).toBe(false);
        expect(screen.getByText("12 completed trials · Running until stopped")).toBeDefined();
        expect(screen.getByRole("region", { name: "Crafting results" }).textContent).not.toContain(
            "95% interval",
        );
        fireEvent.click(button("Stop simulation"));
        expect(worker.terminate).toHaveBeenCalled();
        expect(screen.getByText("Stopped. Results show only completed trials.")).toBeDefined();
        simulation.runTrial();
        act(() => worker.onmessage?.({ data: { type: "progress", result: simulation.result() } }));
        expect(screen.getByRole("region", { name: "Crafting results" }).textContent).toContain(
            "12 trials",
        );
        expect(screen.getByRole("region", { name: "Crafting results" }).textContent).not.toContain(
            "13 trials",
        );
        changeControl(screen.getByLabelText("Stop simulation after"), {
            target: { value: "successes" },
        });
        expectControlValue(screen.getByLabelText("Successful item target"), "100");
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expectControlValue(screen.getByLabelText("Stop simulation after"), "manual");
        fireEvent.click(button("Mass simulate"));
        const next = CraftingWorker.instances[1]!;
        changeControl(screen.getByLabelText("Random seed"), { target: { value: "77" } });
        expect(next.terminate).toHaveBeenCalled();
        act(() => next.onmessage?.({ data: { type: "progress", result } }));
        expect(screen.queryByRole("region", { name: "Crafting results" })).toBeNull();
    });

    it("shows finite calculator progress with continuous simulation selected", () => {
        const { project, engine, mount } = fixture(data);
        project.simulationLimit = { kind: "manual" };
        mount();
        fireEvent.click(button("Calculate odds"));
        expect(
            screen.getByRole("progressbar", { name: "Simulation progress" }).getAttribute("value"),
        ).toBe("0");
        expect(screen.getByText("0 / 10 trials")).toBeDefined();
        const worker = CraftingWorker.instances[0]!;
        act(() =>
            worker.onmessage?.({
                data: { type: "done", result: calculateProcessExact(engine, project) },
            }),
        );
        expect(screen.getByText("Calculated odds")).toBeDefined();
        expect(screen.queryByText(/No fixed simulation target/)).toBeNull();
        expect(worker.terminate).toHaveBeenCalled();
    });

    it("saves fixed simulation limits, sends them to the worker and displays the reached target", () => {
        const { project, key, mount } = fixture(data);
        mount();
        expectControlValue(screen.getByLabelText("Stop simulation after"), "trials");
        changeControl(screen.getByLabelText("Stop simulation after"), {
            target: { value: "successes" },
        });
        changeControl(screen.getByLabelText("Successful item target"), {
            target: { value: "2" },
        });
        changeControl(screen.getByLabelText("Maximum trials"), { target: { value: "17" } });
        fireEvent.click(button("Mass simulate"));
        const worker = CraftingWorker.instances[0]!;
        const sent = worker.postMessage.mock.calls[0]![0];
        expect(sent.project).toMatchObject({
            simulationLimit: { kind: "successes", count: 2 },
            iterations: 17,
            item: project.item,
            useProcess: true,
        });
        const simulation = new CraftingSimulation(data, sent.project);
        while (!simulation.done) simulation.runTrial();
        act(() => worker.onmessage?.({ data: { type: "done", result: simulation.result() } }));
        const results = screen.getByRole("region", { name: "Crafting results" });
        expect(results.textContent).toContain("Successful item target reached.");
        expect(results.textContent).not.toContain("95% interval");
        expect(worker.terminate).toHaveBeenCalled();
        fireEvent.click(button("Save project"));
        const saved = craftingProjectSchema.parse(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"],
        );
        expect(saved.simulationLimit).toEqual({ kind: "successes", count: 2 });
        expect(saved.item).toEqual(project.item);
        changeControl(screen.getByLabelText("Stop simulation after"), {
            target: { value: "trials" },
        });
        expect(screen.queryByLabelText("Successful item target")).toBeNull();
        expectControlValue(screen.getByLabelText("Trials"), "17");
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expectControlValue(screen.getByLabelText("Stop simulation after"), "successes");
        expectControlValue(screen.getByLabelText("Successful item target"), "2");
    });
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vite-plus/test";
import { CraftingWorkbench } from "~/components/crafting/workbench";
import { availableOmens } from "~/lib/crafting-omens";
import { calculateProcessExact } from "~/lib/crafting-simulation";
import { craftingProjectSchema } from "~/schemas/crafting";
import { changeControl, expectControlValue } from "./control-helpers";
import { button, CraftingWorker, catalogs, fixture } from "./crafting-process-ui-fixtures";
import { chooseStartingItem } from "./starting-item-helper";

describe.each(catalogs)("$game process routes and flowchart", (data) => {
    it("creates a restart process from nested calculator requirements and preserves the setup", () => {
        const { engine, project, key, mount } = fixture(data);
        project.useProcess = false;
        project.steps = [];
        project.baseCost = 5;
        project.target = engine.validateTarget({
            groups: [],
            expression: {
                operator: "and",
                operands: [
                    project.target,
                    {
                        groups: [],
                        expression: {
                            operator: "and",
                            negated: true,
                            operands: [{ groups: [{ mods: ["ColdResist1"] }] }],
                        },
                    },
                ],
            },
        });
        mount();
        const before = screen.getByRole("region", { name: "Current item" }).textContent;
        const spendingBefore = screen
            .getByText("Emulator spending")
            .closest("details")!.textContent;
        fireEvent.click(button("Mass simulate"));
        const previous = CraftingWorker.instances[0]!;
        fireEvent.click(button("Create process from calculator"));
        expect(previous.terminate).toHaveBeenCalled();
        expect(screen.queryByText("Create process from calculator")).toBeNull();
        expectControlValue(screen.getByLabelText("Condition failed"), "restart");
        expect(
            screen
                .getByRole("checkbox", { name: "Combine crafting steps" })
                .getAttribute("aria-checked"),
        ).toBe(String(true));
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toBe(before);
        expect(screen.getByText("Emulator spending").closest("details")!.textContent).toBe(
            spendingBefore,
        );
        expect(CraftingWorker.instances).toHaveLength(1);
        act(() => previous.onmessage?.({ data: { type: "error", message: "Obsolete job" } }));
        expect(screen.queryByText("Obsolete job")).toBeNull();

        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[1]!;
        const converted = craftingProjectSchema.parse(worker.postMessage.mock.calls[0]![0].project);
        expect(converted).toEqual({
            ...project,
            useProcess: true,
            steps: [
                {
                    id: expect.any(String),
                    method: project.method,
                    condition: project.target,
                    onSuccess: "success",
                    onFailure: "restart",
                },
            ],
        });
        const result = calculateProcessExact(engine, converted);
        expect(result).toMatchObject({
            probability: 7 / 8,
            baseItems: 7 / 4,
            baseSpending: 8.75,
            meanCost: 12.25,
        });
        act(() => worker.onmessage?.({ data: { type: "done", result } }));
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"]).toEqual(converted);
        expect(JSON.parse(localStorage.getItem(`${key}:draft:v1`)!)).toEqual(converted);
        cleanup();
        render(
            <MemoryRouter>
                <CraftingWorkbench catalog={data} />
            </MemoryRouter>,
        );
        chooseStartingItem(data);
        expectControlValue(screen.getByLabelText("Condition failed"), "restart");
        expect(CraftingWorker.instances).toHaveLength(2);
    });

    it("explicitly replaces an existing process while retaining method options and item history", () => {
        const { project, key, mount } = fixture(data);
        project.useProcess = false;
        project.method = {
            ...project.method,
            ...(data.game === "poe1"
                ? { allflame: true }
                : { omens: [availableOmens(data, project.method)[0]!.id] }),
        };
        const previousSteps = structuredClone(project.steps);
        mount();
        changeControl(screen.getByLabelText("Item level"), { target: { value: "100" } });
        const before = screen.getByRole("region", { name: "Current item" }).textContent;
        expect(screen.getByText(/Replaces the existing process\./)).toBeDefined();
        fireEvent.click(button("Replace process from calculator"));
        fireEvent.click(button("Save project"));
        const saved = craftingProjectSchema.parse(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"],
        );
        expect(saved.steps).toHaveLength(1);
        expect(saved.steps[0]!.method).toEqual(project.method);
        expect(saved.steps[0]!.condition).toEqual(project.target);
        expect(saved.item).toEqual({ ...project.item, level: 100 });
        expect(project.steps).toEqual(previousSteps);
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toBe(before);
        changeControl(screen.getByLabelText("Step action"), { target: { value: "check" } });
        fireEvent.click(button("Save project"));
        const edited = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(edited.steps[0].method).toBeUndefined();
        expect(edited.method).toEqual(project.method);
        fireEvent.click(button("Undo"));
        expectControlValue(screen.getByLabelText("Item level"), String(project.item.level));
        expect(screen.queryByText("Emulator spending")).toBeNull();
    });
});

// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { seededRandom } from "~/lib/crafting-engine";
import { CraftingProcess, calculateProcessExact } from "~/lib/crafting-simulation";
import { changeControl, expectControlValue } from "./control-helpers";
import { button, CraftingWorker, catalogs, fixture } from "./crafting-process-ui-fixtures";

describe.each(catalogs)("$game process routes and flowchart", (data) => {
    it("prices starting items in process results, saves the price and excludes it when cleared", () => {
        const { engine, project, key, mount } = fixture(data);
        mount();
        fireEvent.click(screen.getByText("Custom prices in chaos"));
        changeControl(screen.getByLabelText("Starting item cost (chaos)"), {
            target: { value: "8" },
        });
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[0]!;
        const request = worker.postMessage.mock.calls[0]![0].project;
        expect(request.baseCost).toBe(8);
        const result = calculateProcessExact(engine, request);
        expect(result).toMatchObject({ baseItems: 1.75, baseSpending: 14, meanCost: 17.5 });
        act(() => worker.onmessage?.({ data: { type: "done", result } }));
        const results = within(screen.getByRole("region", { name: "Crafting results" }));
        expect(results.getByText("Starting items / attempt").nextElementSibling?.textContent).toBe(
            "1.75",
        );
        expect(
            results.getByText("Starting item cost / attempt (chaos)").nextElementSibling
                ?.textContent,
        ).toBe("14");
        expect(results.getByText("Average cost (chaos)").nextElementSibling?.textContent).toBe(
            "17.5",
        );
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].baseCost).toBe(8);
        changeControl(screen.getByLabelText("Starting item cost (chaos)"), {
            target: { value: "" },
        });
        expect(screen.queryByRole("region", { name: "Crafting results" })).toBeNull();
        fireEvent.click(button("Calculate odds"));
        const withoutPrice = CraftingWorker.instances[1]!;
        expect(withoutPrice.postMessage.mock.calls[0]![0].project.baseCost).toBeUndefined();
        act(() =>
            withoutPrice.onmessage?.({
                data: { type: "done", result: calculateProcessExact(engine, project) },
            }),
        );
        expect(screen.getByText(/Starting item costs are excluded/)).toBeDefined();
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expectControlValue(screen.getByLabelText("Starting item cost (chaos)"), "8");
        fireEvent.click(button("Calculate odds"));
        const running = CraftingWorker.instances[2]!;
        changeControl(screen.getByLabelText("Starting item cost (chaos)"), {
            target: { value: "0" },
        });
        expect(running.terminate).toHaveBeenCalled();
        act(() => running.onmessage?.({ data: { type: "done", result } }));
        expect(screen.queryByRole("region", { name: "Crafting results" })).toBeNull();
        fireEvent.click(button("Calculate odds"));
        const free = CraftingWorker.instances[3]!;
        expect(free.postMessage.mock.calls[0]![0].project.baseCost).toBe(0);
    });

    it("counts restored bases once, discards cancelled counts and restores emulator base spending with history", () => {
        const { engine, project, mount } = fixture(data);
        project.baseCost = 8;
        project.steps = [
            {
                id: "check",
                condition: engine.validateTarget({ groups: [] }),
                onSuccess: "restart",
                onFailure: "failure",
            },
        ];
        mount();
        const quantity = () =>
            screen.getByText("Starting items used").nextElementSibling?.textContent;
        const cost = () =>
            screen.getByText("Starting item spending (chaos)").nextElementSibling?.textContent;
        expect(quantity()).toBe("1");
        fireEvent.click(button("Apply process"));
        const discarded = CraftingWorker.instances[0]!;
        const process = new CraftingProcess(engine, project, seededRandom(project.seed));
        process.advance();
        process.advance();
        expect(process.result().baseItems).toBe(2);
        act(() => discarded.onmessage?.({ data: { type: "emulating", result: process.result() } }));
        expect(quantity()).toBe("1");
        fireEvent.click(button("Stop process"));
        process.advance();
        act(() => discarded.onmessage?.({ data: { type: "emulated", result: process.result() } }));
        expect(quantity()).toBe("1");
        expect(cost()).toBe("8");
        for (let run = 1; run <= 2; run++) {
            fireEvent.click(button("Apply process"));
            const worker = CraftingWorker.instances[run]!;
            act(() => worker.onmessage?.({ data: { type: "emulated", result: process.result() } }));
            expect(quantity()).toBe(String(1 + 2 * run));
            expect(cost()).toBe(String(8 * (1 + 2 * run)));
        }
        fireEvent.click(button("Undo"));
        expect(quantity()).toBe("3");
        expect(cost()).toBe("24");
        fireEvent.click(button("Redo"));
        expect(quantity()).toBe("5");
        fireEvent.click(button("Reset"));
        expect(quantity()).toBe("1");
        fireEvent.click(button("Undo"));
        expect(quantity()).toBe("5");
        fireEvent.click(button("Save project"));
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expect(quantity()).toBe("1");
        expect(cost()).toBe("8");
    });

    it("shows live route metrics and preserves completed costs and errors through the emulator", () => {
        const { engine, project, key, mount } = fixture(data);
        project.steps[0]!.condition = engine.validateTarget({ groups: [] });
        project.steps[1]!.method = {
            kind: "currency",
            id: data.crafting.currencies.find((entry) => entry.action === "transmute_to_magic")!.id,
        };
        mount();
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.click(button("Apply process"));
        const worker = CraftingWorker.instances[0]!;
        const process = new CraftingProcess(engine, project, seededRandom(project.seed));
        process.advance();
        act(() => worker.onmessage?.({ data: { type: "emulating", result: process.result() } }));
        expect(card.textContent).toBe(before);
        expect(
            screen.getByRole("article", { name: "Keep life route results" }).textContent,
        ).toContain("1 visits · 2 chaos / attempt");
        expect(
            screen.getByRole("article", { name: "Final check route results" }).textContent,
        ).toContain("0 visits · 0 chaos / attempt");
        changeControl(screen.getAllByLabelText("Step description")[0]!, {
            target: { value: "Retain the paid Annulment on a later error" },
        });
        expect(worker.terminate).not.toHaveBeenCalled();
        process.advance();
        expect(process.result().error).toBeDefined();
        act(() => worker.onmessage?.({ data: { type: "emulated", result: process.result() } }));
        expect(card.textContent).not.toBe(before);
        expect(screen.getByText("Emulator spending")).toBeDefined();
        expect(
            within(screen.getByRole("article", { name: "Final check route results" })).getByRole(
                "row",
                { name: "Step errors failure 1" },
            ),
        ).toBeDefined();
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].steps[0].description,
        ).toBe("Retain the paid Annulment on a later error");
        fireEvent.click(button("Undo"));
        expect(card.textContent).toBe(before);
        expect(screen.queryByRole("region", { name: "Process route results" })).toBeNull();
        expect(screen.queryByText("Emulator spending")).toBeNull();
        fireEvent.click(button("Redo"));
        expect(card.textContent).not.toBe(before);
        expect(screen.getByText("Emulator spending")).toBeDefined();
    });
});

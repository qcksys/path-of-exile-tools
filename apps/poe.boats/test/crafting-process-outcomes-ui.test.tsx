// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { CraftingSimulation } from "~/lib/crafting-simulation";
import { changeControl, expectControlValue } from "./control-helpers";
import { button, CraftingWorker, catalogs, fixture } from "./crafting-process-ui-fixtures";

describe.each(catalogs)("$game process routes and flowchart", (data) => {
    it("shows successful cost extremes and the quantities for each selected stored outcome", () => {
        const { project, mount } = fixture(data);
        project.baseCost = 5;
        project.sampleStorage = { mode: "all", limit: 10 };
        mount();
        fireEvent.click(button("Mass simulate"));
        const worker = CraftingWorker.instances[0]!;
        const simulation = new CraftingSimulation(
            data,
            worker.postMessage.mock.calls[0]![0].project,
        );
        while (!simulation.done) simulation.runTrial();
        const result = simulation.result();
        act(() => worker.onmessage?.({ data: { type: "done", result } }));
        const extremes = within(screen.getByRole("region", { name: "Successful trial costs" }));
        expect(extremes.getAllByRole("definition").map((entry) => entry.textContent)).toEqual([
            result.successCosts!.cheapest!.toString(),
            result.successCosts!.costliest!.toString(),
        ]);
        fireEvent.click(screen.getByText("Sample outcomes"));
        for (const index of [0, 1]) {
            if (index) fireEvent.click(screen.getByRole("button", { name: "Next outcome" }));
            const cost = result.samples[index]!.cost!;
            const costRegion = screen.getByRole("region", { name: "Stored outcome cost" });
            const displayed = within(costRegion);
            expect(costRegion.textContent).toContain(`Trial cost (chaos): ${cost.total}`);
            expect(displayed.getAllByRole("definition").map((entry) => entry.textContent)).toEqual([
                cost.baseItems!.toString(),
                cost.baseSpending!.toString(),
                ...Object.values(cost.spending).map(String),
            ]);
        }
    });

    it("retains quantities and explains unknown totals when successful crafts have missing prices", () => {
        const { project, mount } = fixture(data);
        project.prices = {};
        mount();
        fireEvent.click(button("Mass simulate"));
        const worker = CraftingWorker.instances[0]!;
        const simulation = new CraftingSimulation(
            data,
            worker.postMessage.mock.calls[0]![0].project,
        );
        while (!simulation.done) simulation.runTrial();
        act(() => worker.onmessage?.({ data: { type: "done", result: simulation.result() } }));
        const extremes = within(screen.getByRole("region", { name: "Successful trial costs" }));
        expect(extremes.getAllByRole("definition").map((entry) => entry.textContent)).toEqual([
            "—",
            "—",
        ]);
        expect(extremes.getByText(/The full cost range is unknown/)).toBeDefined();
        fireEvent.click(screen.getByText("Sample outcomes"));
        const costRegion = screen.getByRole("region", { name: "Stored outcome cost" });
        const cost = within(costRegion);
        expect(costRegion.textContent).toContain("Trial cost (chaos): —");
        expect(cost.getByText(/^Missing prices:/).textContent).toContain(
            "Missing prices: Orb of Annulment",
        );
        expect(
            cost.getAllByRole("term").some((entry) => entry.textContent === "Orb of Annulment"),
        ).toBe(true);
        expect(cost.getByText("Starting item costs are excluded.")).toBeDefined();
    });

    it("persists outcome settings, navigates retained successes and uses the selected item", () => {
        const { project, key, mount } = fixture(data);
        project.steps[0]!.onSuccess = "success";
        project.steps[0]!.onFailure = "failure";
        mount();
        changeControl(screen.getByLabelText("Store outcomes"), {
            target: { value: "successes" },
        });
        changeControl(screen.getByLabelText("Maximum stored outcomes"), {
            target: { value: "2" },
        });
        fireEvent.click(
            screen.getByRole("checkbox", { name: "Successful item affix distribution" }),
        );
        fireEvent.click(button("Mass simulate"));
        const worker = CraftingWorker.instances[0]!;
        const sent = worker.postMessage.mock.calls[0]![0];
        expect(sent.project).toMatchObject({
            sampleStorage: { mode: "successes", limit: 2 },
            successDistribution: true,
        });
        const simulation = new CraftingSimulation(data, sent.project);
        while (!simulation.done) simulation.runTrial();
        const result = simulation.result();
        expect(result.successes).toBeGreaterThan(2);
        act(() => worker.onmessage?.({ data: { type: "done", result } }));
        fireEvent.click(screen.getByText("Affix distribution on success"));
        const table = within(screen.getByRole("table", { name: "Prefixes" }));
        expect(table.getByText("100.0%")).toBeDefined();
        expect(table.getByText(result.successes.toString())).toBeDefined();
        expect(screen.queryByRole("table", { name: "Suffixes" })).toBeNull();
        fireEvent.click(screen.getByText("Sample outcomes"));
        expect(screen.getByText("Item 1 of 2")).toBeDefined();
        expect(screen.getByRole("button", { name: "Previous outcome" })).toHaveProperty(
            "disabled",
            true,
        );
        fireEvent.click(screen.getByRole("button", { name: "Next outcome" }));
        expect(screen.getByText("Item 2 of 2")).toBeDefined();
        expect(screen.getByRole("button", { name: "Next outcome" })).toHaveProperty(
            "disabled",
            true,
        );
        expect(screen.getByText(`Trial ${result.samples[1]!.trial} · Target met`)).toBeDefined();
        fireEvent.click(screen.getByRole("button", { name: "Use this item" }));
        fireEvent.click(button("Save project"));
        const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"];
        expect(saved).toMatchObject({
            item: result.samples[1]!.item,
            sampleStorage: { mode: "successes", limit: 2 },
            successDistribution: true,
        });
        fireEvent.click(button("Undo"));
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item).toEqual(
            project.item,
        );
        changeControl(screen.getByLabelText("Store outcomes"), { target: { value: "none" } });
        expect(screen.queryByLabelText("Maximum stored outcomes")).toBeNull();
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        expectControlValue(screen.getByLabelText("Store outcomes"), "successes");
        expectControlValue(screen.getByLabelText("Maximum stored outcomes"), "2");
        expect(
            screen
                .getByRole("checkbox", { name: "Successful item affix distribution" })
                .getAttribute("aria-checked"),
        ).toBe(String(true));
    });

    it("cancels an active run when retention changes and shows disabled storage independently", () => {
        const { mount } = fixture(data);
        mount();
        fireEvent.click(button("Mass simulate"));
        const active = CraftingWorker.instances[0]!;
        changeControl(screen.getByLabelText("Store outcomes"), { target: { value: "none" } });
        expect(active.terminate).toHaveBeenCalled();
        fireEvent.click(
            screen.getByRole("checkbox", { name: "Successful item affix distribution" }),
        );
        fireEvent.click(button("Mass simulate"));
        const worker = CraftingWorker.instances[1]!;
        const simulation = new CraftingSimulation(
            data,
            worker.postMessage.mock.calls[0]![0].project,
        );
        while (!simulation.done) simulation.runTrial();
        act(() => worker.onmessage?.({ data: { type: "done", result: simulation.result() } }));
        expect(screen.getByText("Outcome storage is disabled.")).toBeDefined();
        expect(screen.queryByText("Sample outcomes")).toBeNull();
        expect(screen.getByText("Affix distribution on success")).toBeDefined();
    });

    it("displays unfinished processes without invalid averages and can use their retained item", () => {
        const { project, key, mount } = fixture(data);
        mount();
        changeControl(screen.getByLabelText("Stop simulation after"), {
            target: { value: "actions" },
        });
        changeControl(screen.getByLabelText("Simulation action limit"), {
            target: { value: "1" },
        });
        fireEvent.click(button("Mass simulate"));
        const worker = CraftingWorker.instances[0]!;
        const simulation = new CraftingSimulation(
            data,
            worker.postMessage.mock.calls[0]![0].project,
        );
        while (!simulation.done) simulation.runTrial();
        const result = simulation.result();
        expect(result.trials).toBe(0);
        expect(result.unfinished!.item.mods).toHaveLength(1);
        act(() => worker.onmessage?.({ data: { type: "done", result } }));
        const results = screen.getByRole("region", { name: "Crafting results" });
        expect(results.textContent).toContain("No completed trials.");
        expect(results.textContent).toContain("Simulation action limit reached.");
        expect(results.textContent).not.toMatch(/NaN|Infinity/);
        const unfinished = within(screen.getByRole("region", { name: "Unfinished trial" }));
        expect(unfinished.getByText(/does not count as a failed trial/)).toBeDefined();
        expect(
            within(unfinished.getByLabelText("Unfinished trial spending")).getByRole("definition")
                .textContent,
        ).toBe("1");
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item).toEqual(
            project.item,
        );
        fireEvent.click(unfinished.getByText("Inspect unfinished item"));
        fireEvent.click(unfinished.getByRole("button", { name: "Use unfinished item" }));
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item).toEqual(
            result.unfinished!.item,
        );
        fireEvent.click(button("Undo"));
        fireEvent.click(button("Save project"));
        expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item).toEqual(
            project.item,
        );
    });
});

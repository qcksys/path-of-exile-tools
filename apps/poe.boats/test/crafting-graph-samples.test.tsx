// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { GraphSamples } from "../app/components/crafting/graph-samples";
import { projectFromItem } from "../app/lib/crafting-graph-authoring";
import { calculateCraftingGraph } from "../app/lib/crafting-graph-simulation";
import { validateRulesetIndex } from "../app/lib/crafting-rulesets";
import { craftingWorkspaceStorageKey } from "../app/lib/crafting-workspace-storage";
import { engine } from "./crafting-fixtures";
import { firstItem, quote } from "./crafting-graph-fixtures";

afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
});
const historyIndex = validateRulesetIndex(
    JSON.parse(readFileSync("crafting-history/index.json", "utf8")),
);
const ruleset = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r5",
)!;
const graph = { ...projectFromItem(ruleset, firstItem, "Sample output", quote(10)), iterations: 3 };
const result = calculateCraftingGraph(engine.catalog, graph, {
    estimateIterations: 1,
    workLimit: 1000,
});

it("shows missing or destroyed results without offering a new crafting input", () => {
    const samples = structuredClone(result);
    samples.samples[0]!.item!.destroyed = true;
    samples.samples[0]!.item!.corrupted = true;
    engine.validateItem(samples.samples[0]!.item);
    samples.samples[1]!.item = null;
    samples.samples[1]!.cost = null;
    render(
        <MemoryRouter>
            <GraphSamples engine={engine} graph={graph} result={samples} ruleset={ruleset} />
        </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: "Use item in new project" })).toBeNull();
    expect(screen.getByText("Destroyed items cannot become crafting inputs.")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Sampled item JSON" })).toHaveProperty(
        "value",
        JSON.stringify(samples.samples[0]!.item, null, 2),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Sampled trial" }), {
        target: { value: "1" },
    });
    expect(screen.getByText("This trial did not return a final item.")).toBeTruthy();
    expect(screen.getByText(/incomplete cost/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Use item in new project" })).toBeNull();
});

it("cancels a pending item handoff when another sampled trial is selected", async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn(
        () =>
            new Promise<Response>((done) => {
                resolve = done;
            }),
    );
    vi.stubGlobal("fetch", fetch);
    render(
        <MemoryRouter>
            <GraphSamples engine={engine} graph={graph} result={result} ruleset={ruleset} />
        </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Use item in new project" }));
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByRole("combobox", { name: "Sampled trial" }), {
        target: { value: "1" },
    });
    await act(async () => {
        resolve(Response.json(historyIndex));
    });
    expect(localStorage.getItem(craftingWorkspaceStorageKey)).toBeNull();
    expect(screen.getByRole("button", { name: "Use item in new project" })).toBeTruthy();
});

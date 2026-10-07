// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { FossilOptimizerPanel } from "~/components/crafting/fossil-optimizer";
import {
    type FossilOptimization,
    FossilOptimizer,
    type FossilOptimizerOptions,
    mergeFossilOptimizations,
} from "~/lib/crafting-optimizer";
import { type CraftingProject, craftingProjectSchema } from "~/schemas/crafting";
import { changeControl } from "./control-helpers";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

type Request = { project: CraftingProject; options: FossilOptimizerOptions };
class OptimizerWorker {
    static instances: OptimizerWorker[] = [];
    static failConstruct = false;
    static failPost = false;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: { message: string }) => void) | null = null;
    terminate = vi.fn();
    postMessage = vi.fn<(request: Request) => void>(() => {
        if (OptimizerWorker.failPost && OptimizerWorker.instances.length === 2)
            throw new Error("Could not send job");
    });
    constructor() {
        if (OptimizerWorker.failConstruct && OptimizerWorker.instances.length === 1)
            throw new Error("Could not create worker");
        OptimizerWorker.instances.push(this);
    }
}
let now = 0;
beforeEach(() => {
    OptimizerWorker.instances = [];
    OptimizerWorker.failConstruct = false;
    OptimizerWorker.failPost = false;
    vi.stubGlobal("Worker", OptimizerWorker);
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});
const project = () =>
    craftingProjectSchema.parse({
        format: 1,
        game: "poe1",
        patch: catalog.patch,
        item: engine.createItem(baseId),
        method: currency("transmute_to_rare"),
        target: { groups: [], rarity: "rare" },
        steps: [],
        prices: Object.fromEntries(catalog.crafting.currencies.map((entry) => [entry.id, 1])),
        seed: 42,
        iterations: 100,
        maxActions: 1,
    });
const button = (name: string) => screen.getByRole("button", { name });
function mount() {
    const input = project();
    const onChoose = vi.fn();
    const onPrices = vi.fn();
    const ui = (next = input) => (
        <FossilOptimizerPanel
            engine={engine}
            project={next}
            onChoose={onChoose}
            onPrices={onPrices}
        />
    );
    const view = render(ui());
    fireEvent.click(screen.getByText("Fossil optimizer"));
    for (const fossil of engine.availableFossils(input.item)) {
        if (!["Pristine Fossil", "Frigid Fossil", "Scorched Fossil"].includes(fossil.name))
            fireEvent.click(screen.getByRole("checkbox", { name: fossil.name }));
    }
    changeControl(screen.getByLabelText("Maximum resonator sockets"), {
        target: { value: "2" },
    });
    changeControl(screen.getByLabelText("Trials per combination"), { target: { value: "100" } });
    changeControl(screen.getByLabelText("Optimizer workers"), { target: { value: "2" } });
    return { ...view, input, onChoose, update: (next: CraftingProject) => view.rerender(ui(next)) };
}
function optimizer(worker: OptimizerWorker) {
    const { project, options } = worker.postMessage.mock.calls[0]![0];
    return new FossilOptimizer(
        engine,
        project.item,
        project.target,
        project.prices,
        project.seed,
        options,
    );
}
function send(worker: OptimizerWorker, result: FossilOptimization, type = "progress") {
    act(() => worker.onmessage?.({ data: { type, result } }));
}

it("merges workers finishing out of order, estimates progress and selects the ranked method", () => {
    const { input, onChoose } = mount();
    const before = structuredClone(input);
    fireEvent.click(button("Compare fossils"));
    expect(OptimizerWorker.instances).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toBe("0 / 6 combinations completed");
    expect(screen.getByText(/Estimating remaining time/)).toBeDefined();
    const [first, second] = OptimizerWorker.instances;
    for (const [index, worker] of OptimizerWorker.instances.entries())
        expect(worker.postMessage.mock.calls[0]![0]).toMatchObject({
            project: input,
            options: { partition: { index, count: 2 }, trials: 100 },
        });
    const a = optimizer(first!);
    const b = optimizer(second!);
    b.runBatch(300);
    now = 6000;
    send(second!, b.result(), "done");
    expect(second!.terminate).toHaveBeenCalledOnce();
    expect(first!.terminate).not.toHaveBeenCalled();
    expect(button("Stop optimizer")).toBeDefined();
    expect(
        screen.getByText("Elapsed 6s · 0.50 combinations/s · Estimated remaining 6s"),
    ).toBeDefined();
    now = 7000;
    act(() => vi.advanceTimersByTime(1000));
    expect(
        screen.getByText("Elapsed 7s · 0.43 combinations/s · Estimated remaining 7s"),
    ).toBeDefined();
    a.runBatch(100);
    send(first!, a.result());
    expect(screen.getByRole("status").textContent).toBe("4 / 6 combinations completed");
    send(first!, a.result());
    expect(screen.getByRole("status").textContent).toBe("4 / 6 combinations completed");
    a.runBatch(200);
    send(first!, a.result(), "done");
    expect(screen.getByRole("status").textContent).toBe("6 / 6 combinations completed");
    expect(screen.queryByRole("button", { name: "Stop optimizer" })).toBeNull();
    expect(screen.getByText(/ · Complete$/)).toBeDefined();
    expect(first!.terminate).toHaveBeenCalledOnce();
    send(second!, { ...b.result(), completed: 0 });
    expect(screen.getByRole("status").textContent).toBe("6 / 6 combinations completed");
    const merged = mergeFossilOptimizations([a.result(), b.result()]);
    expect(screen.getAllByRole("button", { name: "Use combination" })).toHaveLength(6);
    changeControl(screen.getByLabelText("Rank combinations by"), { target: { value: "cost" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Use combination" })[0]!);
    expect(onChoose).toHaveBeenCalledWith(merged.byCost[0]!.method);
    expect(input).toEqual(before);
});

it("caps active workers at the number of combinations", () => {
    mount();
    changeControl(screen.getByLabelText("Optimizer workers"), { target: { value: "8" } });
    fireEvent.click(button("Compare fossils"));
    expect(OptimizerWorker.instances).toHaveLength(6);
    for (const [index, worker] of OptimizerWorker.instances.entries())
        expect(worker.postMessage.mock.calls[0]![0].options.partition).toEqual({ index, count: 6 });
});

it("keeps only completed partial results on stop and ignores messages from a preceding run", () => {
    mount();
    fireEvent.click(button("Compare fossils"));
    const prior = [...OptimizerWorker.instances];
    const partial = optimizer(prior[0]!);
    partial.runBatch(100);
    now = 2000;
    send(prior[0]!, partial.result());
    fireEvent.click(button("Stop optimizer"));
    for (const worker of prior) expect(worker.terminate).toHaveBeenCalledOnce();
    expect(screen.getByText(/Partial results/)).toBeDefined();
    expect(screen.queryByText(/Estimated remaining/)).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("1 / 6 combinations completed");
    partial.runBatch(200);
    send(prior[0]!, partial.result(), "done");
    expect(screen.getByRole("status").textContent).toBe("1 / 6 combinations completed");
    fireEvent.click(button("Compare fossils"));
    send(prior[0]!, partial.result(), "done");
    expect(screen.getByRole("status").textContent).toBe("0 / 6 combinations completed");
    expect(button("Stop optimizer")).toBeDefined();
});

it.each([
    "workers",
    "sockets",
    "trials",
    "fossils",
    "target",
    "prices",
    "seed",
    "unmount",
])("terminates all workers when %s changes", (change) => {
    const view = mount();
    fireEvent.click(button("Compare fossils"));
    const prior = [...OptimizerWorker.instances];
    if (change === "workers")
        changeControl(screen.getByLabelText("Optimizer workers"), { target: { value: "3" } });
    if (change === "sockets")
        changeControl(screen.getByLabelText("Maximum resonator sockets"), {
            target: { value: "1" },
        });
    if (change === "trials")
        changeControl(screen.getByLabelText("Trials per combination"), {
            target: { value: "200" },
        });
    if (change === "fossils")
        fireEvent.click(screen.getByRole("checkbox", { name: "Pristine Fossil" }));
    if (change === "target")
        view.update({
            ...view.input,
            target: engine.validateTarget({ groups: [], openPrefixes: 1 }),
        });
    if (change === "prices") view.update({ ...view.input, prices: {} });
    if (change === "seed") view.update({ ...view.input, seed: 18 });
    if (change === "unmount") view.unmount();
    for (const worker of prior) {
        expect(worker.terminate).toHaveBeenCalledOnce();
        const runner = optimizer(worker);
        runner.runBatch(100);
        send(worker, runner.result());
    }
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: "Stop optimizer" })).toBeNull();
});

it.each([
    "message",
    "event",
    "constructor",
    "postMessage",
])("stops all workers and recovers from a %s error", (kind) => {
    mount();
    OptimizerWorker.failConstruct = kind === "constructor";
    OptimizerWorker.failPost = kind === "postMessage";
    fireEvent.click(button("Compare fossils"));
    const prior = [...OptimizerWorker.instances];
    if (kind === "message")
        act(() =>
            prior[0]!.onmessage?.({
                data: { type: "error", message: "Worker rejected the search" },
            }),
        );
    if (kind === "event") act(() => prior[0]!.onerror?.({ message: "Worker crashed" }));
    expect(screen.getByRole("alert").textContent).toMatch(/Could not|Worker/);
    expect(button("Compare fossils")).toHaveProperty("disabled", false);
    expect(screen.queryByRole("button", { name: "Stop optimizer" })).toBeNull();
    for (const worker of prior) expect(worker.terminate).toHaveBeenCalledOnce();
    act(() => prior[0]!.onmessage?.({ data: { type: "error", message: "stale error" } }));
    expect(screen.queryByText("stale error")).toBeNull();
    OptimizerWorker.failConstruct = false;
    OptimizerWorker.failPost = false;
    fireEvent.click(button("Compare fossils"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(button("Stop optimizer")).toBeDefined();
});

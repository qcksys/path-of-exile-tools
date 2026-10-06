import { craftingCatalogSchema } from "../schemas/crafting";
import { CraftingEngine, seededRandom } from "./crafting-engine";
import { FossilOptimizer } from "./crafting-optimizer";
import {
    CraftingProcess,
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    ExactCalculationLimit,
    probabilitySummary,
    validateProject,
} from "./crafting-simulation";

const worker = self as unknown as {
    onmessage: ((event: MessageEvent) => void) | null;
    postMessage(message: unknown): void;
};
let job = 0;
worker.onmessage = async (event: MessageEvent) => {
    const current = ++job;
    if (event.data.type === "cancel") return;
    try {
        const catalog = craftingCatalogSchema.parse(event.data.catalog);
        const project = validateProject(catalog, event.data.project);
        const engine = new CraftingEngine(catalog);
        if (event.data.type === "emulate-process") {
            const process = new CraftingProcess(engine, project, seededRandom(project.seed));
            while (!process.done && job === current) {
                for (let i = 0; i < 100 && !process.done; i++) process.advance();
                worker.postMessage({
                    type: process.done ? "emulated" : "emulating",
                    result: process.result(),
                });
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
            return;
        }
        if (event.data.type === "optimize") {
            const optimizer = new FossilOptimizer(
                engine,
                project.item,
                project.target,
                project.prices,
                project.seed,
                event.data.options,
            );
            let finished = false;
            while (!finished && job === current) {
                finished = optimizer.runBatch();
                worker.postMessage({
                    type: finished ? "done" : "progress",
                    result: optimizer.result(),
                });
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
            return;
        }
        if (event.data.type === "calculate") {
            try {
                if (project.useProcess) {
                    worker.postMessage({
                        type: "done",
                        result: calculateProcessExact(engine, project),
                    });
                    return;
                }
                const exact = calculateExact(engine, project.item, project.method, project.target);
                const spending: Record<string, number> = {};
                for (const cost of engine.costs(project.method, project.item))
                    spending[cost.id] = (spending[cost.id] ?? 0) + cost.amount;
                const unpriced = Object.keys(spending).filter(
                    (id) => project.prices[id] === undefined,
                );
                const meanCost = unpriced.length
                    ? null
                    : Object.entries(spending).reduce(
                          (sum, [id, amount]) => sum + amount * project.prices[id]!,
                          0,
                      );
                worker.postMessage({
                    type: "done",
                    result: {
                        kind: "exact",
                        trials: exact.states,
                        successes: 0,
                        probability: exact.probability,
                        interval: [exact.probability, exact.probability],
                        ...probabilitySummary(exact.probability),
                        totalActions: 1,
                        timeouts: 0,
                        errors: {},
                        spending,
                        meanCost,
                        costPerSuccess:
                            meanCost !== null && exact.probability > 0
                                ? meanCost / exact.probability
                                : null,
                        unpriced,
                        affixes: {},
                        samples: [],
                    },
                });
                return;
            } catch (error) {
                if (!(error instanceof ExactCalculationLimit)) throw error;
            }
        }
        const simulation = new CraftingSimulation(
            catalog,
            event.data.type === "calculate" ? { ...project, simulationLimit: undefined } : project,
            event.data.type === "process" || project.useProcess,
        );
        while (!simulation.done && job === current) {
            for (let i = 0; i < 100 && !simulation.done; i++) simulation.runTrial();
            worker.postMessage({
                type: simulation.done ? "done" : "progress",
                result: simulation.result(),
            });
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    } catch (error) {
        if (job === current)
            worker.postMessage({
                type: "error",
                message: error instanceof Error ? error.message : String(error),
            });
    }
};

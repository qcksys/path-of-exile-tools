import { craftingCatalogSchema } from "../schemas/crafting";
import { CraftingEngine, seededRandom } from "./crafting-engine";
import { FossilOptimizer } from "./crafting-optimizer";
import { CraftingProcess, validateProject } from "./crafting-simulation";
import { CraftingWorkbenchCalculation } from "./crafting-workbench";

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
        const simulation = new CraftingWorkbenchCalculation(catalog, project, event.data.type);
        do {
            simulation.runBatch();
            worker.postMessage({
                type: simulation.done ? "done" : "progress",
                result: simulation.result(),
            });
            if (simulation.done) break;
            await new Promise((resolve) => setTimeout(resolve, 0));
        } while (job === current);
    } catch (error) {
        if (job === current)
            worker.postMessage({
                type: "error",
                message: error instanceof Error ? error.message : String(error),
            });
    }
};

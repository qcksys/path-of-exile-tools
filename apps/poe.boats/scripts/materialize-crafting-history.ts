import { resolve } from "node:path";
import { materializeCraftingHistory, materializeCraftingWorker } from "./crafting-history";

const index = await materializeCraftingHistory(
    resolve("crafting-history"),
    resolve("public/game-data/history"),
    resolve("app/lib/crafting-runtimes.generated.ts"),
);
console.log(`Materialized ${index.revisions.length} retained crafting revisions.`);
await materializeCraftingWorker(resolve("."), resolve("public/game-data/history/worker.mjs"));

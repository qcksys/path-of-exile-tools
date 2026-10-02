import { calculateRecombinatorPlan } from "~/lib/recombinator";
import type { RecombinatorPlan } from "~/schemas/recombinator";

self.onmessage = (event: MessageEvent<RecombinatorPlan>) => {
    try {
        self.postMessage({ results: calculateRecombinatorPlan(event.data) });
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.message : "Calculation failed." });
    }
};

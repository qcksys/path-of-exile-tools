// A thread of `classify-pool.ts`: classifies its share of a page's equipment with the bundled
// cohort classifier. It loads no database code.
import { parentPort } from "node:worker_threads";
import type { PublicStashPage } from "@poe-tools/api-client";
import { normalizeApiItem } from "@poe-tools/item-query";
import { type Classification, defaultEquipmentClassifier } from "#src/ps/default-classifier.ts";
import { stableItemDigest } from "#src/shared/item-memo.ts";
import { listingTab } from "#src/shared/stash-tab.ts";

export interface ClassifyTask {
    id: number;
    pageJson: string;
    league: string | null;
    part: number;
    parts: number;
}

const port = parentPort!;
const classifier = await defaultEquipmentClassifier();
port.postMessage({ revision: classifier.manifest.revision });
port.on("message", (task: ClassifyTask) => {
    const page = JSON.parse(task.pageJson) as PublicStashPage;
    const results: [string, Classification][] = [];
    let index = 0;
    for (const stash of page.stashes) {
        // The items captureRound classifies: public merchant tabs of the worker's league.
        if (!stash.public || !stash.accountName || !stash.league) continue;
        if (task.league && stash.league !== task.league) continue;
        if (listingTab(stash) !== "merchant") continue;
        for (const item of stash.items) {
            if (!item.id || !classifier.acceptsBase(item.baseType)) continue;
            if (index++ % task.parts !== task.part) continue;
            results.push([
                stableItemDigest(item),
                classifier.classify(normalizeApiItem("poe1", "stash", item)),
            ]);
        }
    }
    port.postMessage({ id: task.id, results });
});

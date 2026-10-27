import { type ListingBatch, listingBatchSchema } from "@poe-tools/trade-bridge";

/** Batches older than this, or beyond this count, are dropped from storage. */
const MAX_AGE_MS = 7 * 24 * 3_600_000;
const MAX_BATCHES = 500;

export interface BatchStore {
    get(): Promise<unknown>;
    set(value: ListingBatch[]): Promise<void>;
}

async function read(store: BatchStore, now: number) {
    const value = await store.get();
    return (Array.isArray(value) ? value : [])
        .flatMap((entry) => {
            const parsed = listingBatchSchema.safeParse(entry);
            return parsed.success ? [parsed.data] : [];
        })
        .filter((batch) => now - Date.parse(batch.receivedAt) < MAX_AGE_MS);
}

/**
 * Listings handed to a poe.boats page are kept until the page decides on them or acknowledges
 * them, so a page that closes during a run can still apply them when it next opens.
 */
export function createStoredBatches(store: BatchStore, now: () => number = Date.now) {
    let queue = Promise.resolve();
    const edit = (change: (batches: ListingBatch[]) => ListingBatch[]) => {
        queue = queue.then(async () => {
            await store.set(change(await read(store, now())).slice(-MAX_BATCHES));
        });
        return queue;
    };
    return {
        add: (batch: ListingBatch) => edit((batches) => [...batches, batch]),
        remove: (batchIds: readonly string[]) =>
            edit((batches) => batches.filter((batch) => !batchIds.includes(batch.batchId))),
        forGraph: async (graphId: string, exceptRunId?: string) => {
            await queue;
            return (await read(store, now())).filter(
                (batch) => batch.graphId === graphId && batch.runId !== exceptRunId,
            );
        },
    };
}

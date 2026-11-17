import { Worker } from "node:worker_threads";
import type { ClassifyTask } from "#src/ps/classify-worker.ts";
import type { Classification } from "#src/ps/default-classifier.ts";

/**
 * Threads that classify a page's equipment while the main thread runs its SQL. Classification is a
 * pure function of the item, so results computed here are the ones captureRound would compute; it
 * finds them in its cache (see `primeClassifications`) and classifies only what is missing.
 */
export interface ClassifyPool {
    /** The cohort catalog revision the threads compiled. */
    revision: string;
    /** Classifications of the page's merchant equipment, keyed by `stableItemDigest`. */
    classify(pageJson: string, league: string | null): Promise<[string, Classification][]>;
}

/** `PS_CLASSIFY_THREADS`: how many classification threads to run; 0 (the default) runs none. */
export function classifyThreads(env = process.env) {
    if (!env.PS_CLASSIFY_THREADS) return 0;
    const threads = Number(env.PS_CLASSIFY_THREADS);
    if (!Number.isSafeInteger(threads) || threads < 0)
        throw new Error("PS_CLASSIFY_THREADS must be a whole number.");
    return threads;
}

type Reply = { revision: string } | { id: number; results: [string, Classification][] };

function startThread() {
    const worker = new Worker(new URL("./classify-worker.ts", import.meta.url));
    const pending = new Map<number, (results: [string, Classification][]) => void>();
    const failed = new Map<number, (error: unknown) => void>();
    let broken: unknown;
    // The thread keeps the process alive only while it is starting or has work, so an idle pool
    // never holds a finished process open.
    const idle = () => {
        if (!pending.size) worker.unref();
    };
    const ready = new Promise<string>((resolve, reject) => {
        worker.on("message", (reply: Reply) => {
            if ("revision" in reply) resolve(reply.revision);
            else {
                pending.get(reply.id)?.(reply.results);
                pending.delete(reply.id);
                failed.delete(reply.id);
            }
            idle();
        });
        const fail = (error: unknown) => {
            broken = error;
            reject(error);
            for (const reject of failed.values()) reject(error);
            pending.clear();
            failed.clear();
            idle();
        };
        worker.on("error", fail);
        worker.on("exit", (code) => fail(new Error(`A classification thread exited (${code}).`)));
    });
    let next = 0;
    return {
        ready,
        run(task: Omit<ClassifyTask, "id">) {
            if (broken) return Promise.reject(broken);
            const id = next++;
            return new Promise<[string, Classification][]>((resolve, reject) => {
                pending.set(id, resolve);
                failed.set(id, reject);
                worker.ref();
                worker.postMessage({ ...task, id });
            });
        },
    };
}

let shared: Promise<ClassifyPool | undefined> | undefined;

/**
 * The process's pool, started on first use when `PS_CLASSIFY_THREADS` asks for one, if its threads
 * compiled the catalog revision the caller classifies with. Without one, the caller classifies on
 * its own thread as before.
 */
export async function sharedClassifyPool(revision: string) {
    const threads = classifyThreads();
    if (!threads) return undefined;
    shared ??= startClassifyPool(threads).catch((error: unknown) => {
        console.error(
            `Classification threads did not start; classifying on the main thread.`,
            error,
        );
        return undefined;
    });
    const pool = await shared;
    return pool?.revision === revision ? pool : undefined;
}

export async function startClassifyPool(threads: number): Promise<ClassifyPool> {
    const workers = Array.from({ length: threads }, startThread);
    const revisions = new Set(await Promise.all(workers.map((worker) => worker.ready)));
    if (revisions.size !== 1)
        throw new Error("Classification threads compiled different catalogs.");
    return {
        revision: [...revisions][0]!,
        async classify(pageJson, league) {
            const parts = await Promise.all(
                workers.map((worker, part) =>
                    worker.run({ pageJson, league, part, parts: workers.length }),
                ),
            );
            return parts.flat();
        },
    };
}

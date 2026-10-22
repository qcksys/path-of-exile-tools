import { writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

function failureMessage(error: unknown, depth = 0): string {
    if (!(error instanceof Error)) return "Unknown error";
    const nested =
        depth >= 3
            ? []
            : error instanceof AggregateError
              ? error.errors.slice(0, 5)
              : error.cause === undefined
                ? []
                : [error.cause];
    return [error.message, ...nested.map((cause) => failureMessage(cause, depth + 1))].join("; ");
}

export async function watchCycles(
    cycle: () => Promise<void | { caughtUp: boolean }>,
    options: { signal: AbortSignal; intervalMs?: number; statusFile?: string },
) {
    while (!options.signal.aborted) {
        let ok = false;
        let intervalMs = options.intervalMs ?? 60_000;
        try {
            const result = await cycle();
            if (result?.caughtUp === false) intervalMs = 1200;
            ok = true;
        } catch (error) {
            // Error objects can retain authenticated requests and transport options.
            console.error(
                "Processing failed; saved cursors and pending deliveries will be retried.",
                failureMessage(error),
            );
        }
        if (options.statusFile)
            await writeFile(options.statusFile, JSON.stringify({ ok, completedAt: Date.now() }));
        if (options.signal.aborted) break;
        try {
            await setTimeout(intervalMs, undefined, { signal: options.signal });
        } catch (error) {
            if (!options.signal.aborted) throw error;
        }
    }
}

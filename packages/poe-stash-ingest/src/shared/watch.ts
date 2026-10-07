import { writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

export async function watchCycles(
    cycle: () => Promise<void>,
    options: { signal: AbortSignal; intervalMs?: number; statusFile?: string },
) {
    while (!options.signal.aborted) {
        let ok = false;
        try {
            await cycle();
            ok = true;
        } catch (error) {
            console.error(
                "Processing failed; saved cursors and pending deliveries will be retried.",
                error,
            );
        }
        if (options.statusFile)
            await writeFile(options.statusFile, JSON.stringify({ ok, completedAt: Date.now() }));
        if (options.signal.aborted) break;
        try {
            await setTimeout(options.intervalMs ?? 60_000, undefined, { signal: options.signal });
        } catch (error) {
            if (!options.signal.aborted) throw error;
        }
    }
}

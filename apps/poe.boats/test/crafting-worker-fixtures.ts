import { vi } from "vite-plus/test";
import { loadCraftingCatalog } from "~/lib/crafting-catalog";

export function stubCraftingWorkers(calculation = { postMessage: vi.fn(), terminate: vi.fn() }) {
    vi.stubGlobal(
        "Worker",
        class {
            onmessage?: (event: MessageEvent) => void;
            stopped = false;
            constructor(private url: URL) {}
            async postMessage(message: { game: "poe1" | "poe2"; reload: boolean }) {
                if (!this.url.href.includes("crafting-catalog.worker")) {
                    calculation.postMessage(message);
                    return;
                }
                let data: unknown;
                try {
                    data = { catalog: await loadCraftingCatalog(message.game, message.reload) };
                } catch (error) {
                    data = { error: error instanceof Error ? error.message : String(error) };
                }
                if (!this.stopped) this.onmessage?.(new MessageEvent("message", { data }));
            }
            terminate() {
                this.stopped = true;
                if (!this.url.href.includes("crafting-catalog.worker")) calculation.terminate();
            }
        },
    );
}

import { loadCraftingCatalog } from "./crafting-catalog";

const worker = self as unknown as {
    onmessage: ((event: MessageEvent<{ game: "poe1" | "poe2"; reload: boolean }>) => void) | null;
    postMessage(message: unknown): void;
};
worker.onmessage = async ({ data }: MessageEvent<{ game: "poe1" | "poe2"; reload: boolean }>) => {
    try {
        worker.postMessage({ catalog: await loadCraftingCatalog(data.game, data.reload) });
    } catch (error) {
        worker.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
};

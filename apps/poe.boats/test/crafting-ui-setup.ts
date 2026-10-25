import { expect, vi } from "vite-plus/test";

// Full workbench workflows include repeated renders, storage and history.
if (/[/\\]crafting[^/\\]*\.test\.tsx$/.test(expect.getState().testPath ?? ""))
    vi.setConfig({ testTimeout: 60_000 });

// jsdom has no ResizeObserver; ECharts charts observe their container to resize.
globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

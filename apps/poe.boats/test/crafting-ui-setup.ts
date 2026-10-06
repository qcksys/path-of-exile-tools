import { expect, vi } from "vite-plus/test";

// Full workbench workflows include repeated renders, storage and history.
if (/[/\\]crafting[^/\\]*\.test\.tsx$/.test(expect.getState().testPath ?? ""))
    vi.setConfig({ testTimeout: 60_000 });

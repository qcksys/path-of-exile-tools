import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, vi } from "vite-plus/test";
import { CraftingWorkbench } from "~/components/crafting/workbench";
import { catalog } from "./crafting-fixtures";
import { chooseStartingItem } from "./starting-item-helper";

class CraftingWorker {
    static instances: CraftingWorker[] = [];
    onmessage: ((event: { data: unknown }) => void) | null = null;
    terminate = vi.fn();
    postMessage = vi.fn();
    constructor() {
        CraftingWorker.instances.push(this);
    }
}
beforeEach(() => {
    CraftingWorker.instances = [];
    localStorage.clear();
    vi.stubGlobal("Worker", CraftingWorker);
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});
const button = (name: string) => {
    const scope = screen.queryByText(name, { selector: "button" })?.parentElement;
    return (scope ? within(scope) : screen).getByRole("button", { name });
};
function mount(mode = "emulate", data = catalog) {
    const view = render(
        <MemoryRouter>
            <CraftingWorkbench catalog={data} mode={mode} />
        </MemoryRouter>,
    );
    chooseStartingItem(data);
    return view;
}

export { button, CraftingWorker, mount };

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, vi } from "vite-plus/test";
import { CraftingWorkbench } from "~/components/crafting/workbench";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import { craftingProjectSchema } from "~/schemas/crafting";
import { changeControl } from "./control-helpers";
import { catalog, getCatalog } from "./crafting-fixtures";
import { chooseStartingItem } from "./starting-item-helper";

class CraftingWorker {
    static instances: CraftingWorker[] = [];
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: { message: string }) => void) | null = null;
    terminate = vi.fn();
    postMessage = vi.fn();
    constructor() {
        CraftingWorker.instances.push(this);
    }
}
const catalogs = [catalog, getCatalog("poe2")];
const button = (name: string) =>
    within(screen.getByText(name, { selector: "button" }).parentElement!).getByRole("button", {
        name,
    });
async function selectRouteDestination(control: HTMLElement, name: string) {
    fireEvent.click(control);
    const option = within(
        document.getElementById(control.getAttribute("aria-controls")!)!,
    ).getByRole("option", { name });
    act(() => option.focus());
    fireEvent.keyDown(option, { key: "Enter" });
}
const scrollIntoView = vi.fn();

beforeEach(() => {
    CraftingWorker.instances = [];
    localStorage.clear();
    vi.stubGlobal("Worker", CraftingWorker);
    vi.stubGlobal(
        "DOMMatrixReadOnly",
        class {
            m22 = 1;
        },
    );
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: scrollIntoView,
    });
    scrollIntoView.mockClear();
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

function fixture(data = catalog) {
    const engine = new CraftingEngine(data);
    const base = Object.entries(data.bases).find(
        ([, entry]) => entry.item_class === "Body Armour" && !entry.implicits.length,
    )![0];
    let item = engine.addStartingMod(engine.createItem(base), "IncreasedLife1", seededRandom(1));
    item = engine.addStartingMod({ ...item, rarity: "rare" }, "ColdResist1", seededRandom(1));
    const annul = data.crafting.currencies.find((entry) => entry.action === "remove_random_mod")!;
    const method = { kind: "currency", id: annul.id } as const;
    const target = engine.validateTarget({ groups: [{ mods: ["IncreasedLife1"] }] });
    const project = craftingProjectSchema.parse({
        format: 1,
        game: data.game,
        patch: data.patch,
        item,
        method,
        target,
        useProcess: true,
        steps: [
            {
                id: "annul",
                name: "Keep life",
                description: "Remove resistance and keep life",
                position: { x: 100, y: 60 },
                method,
                condition: target,
                onSuccess: "finish",
                onFailure: "restart",
            },
            { id: "finish", name: "Final check", condition: { groups: [] } },
        ],
        prices: { [annul.id]: 2 },
        seed: 42,
        iterations: 10,
        maxActions: 3,
    });
    const key = `poe-boats:crafting:${data.game}:${data.patch}`;
    function mount(mode: "calculate" | "simulate" = "calculate") {
        localStorage.setItem(key, JSON.stringify({ process: project }));
        render(
            <MemoryRouter>
                <CraftingWorkbench catalog={data} mode={mode} />
            </MemoryRouter>,
        );
        chooseStartingItem(data);
        changeControl(screen.getByLabelText("Search modifiers"), {
            target: { value: "IncreasedLife1" },
        });
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "process" } });
        fireEvent.click(button("Load project"));
    }
    return { engine, project, key, mount };
}

export { button, CraftingWorker, catalogs, fixture, scrollIntoView, selectRouteDestination };

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { CraftingWorkbench } from "../app/components/crafting/workbench";
import { seededRandom } from "../app/lib/crafting-engine";
import { craftingProjectSchema } from "../app/schemas/crafting";
import { catalog, currency, engine } from "./crafting-fixtures";

class WorkerStub {
    static instances: WorkerStub[] = [];
    onmessage = null;
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor() {
        WorkerStub.instances.push(this);
    }
}
const key = `poe-boats:crafting:poe1:${catalog.patch}`;
const draftKey = `${key}:draft:v1`;
const button = (name: string) => screen.getByRole("button", { name });
const draft = () => craftingProjectSchema.parse(JSON.parse(localStorage.getItem(draftKey)!));
const initial = () =>
    craftingProjectSchema.parse({
        format: 1,
        game: "poe1",
        patch: catalog.patch,
        item: {
            ...engine.createItem("Metadata/Items/Jewels/JewelPassiveTreeExpansionLarge"),
            cluster: { passive: "affliction_attack_damage_" },
        },
        method: currency("transmute_to_rare"),
        target: { groups: [{ mods: ["AfflictionNotableCalamitous"] }] },
        steps: [],
        prices: {},
        iterations: 1000,
        seed: 42,
        maxActions: 1,
    });
function mount(mode = "emulate") {
    return render(
        <MemoryRouter>
            <CraftingWorkbench catalog={catalog} mode={mode} />
        </MemoryRouter>,
    );
}
async function passive(name: string) {
    const picker = screen.getByRole("combobox", { name: "Cluster passive type" });
    fireEvent.change(picker, { target: { value: name } });
    fireEvent.keyDown(picker, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name }));
}
beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(draftKey, JSON.stringify(initial()));
    WorkerStub.instances = [];
    vi.stubGlobal("Worker", WorkerStub);
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

it("edits passive type and count, updates the item and pool, and restores history and saved state", async () => {
    const view = mount();
    const current = within(screen.getByRole("region", { name: "Current item" }));
    expect(current.getByText("Adds (8–12) Passive Skills")).toBeDefined();
    fireEvent.change(screen.getByRole("combobox", { name: "Cluster passive count" }), {
        target: { value: "8" },
    });
    await passive("Spell Damage");
    expect(
        current.getByText("Added Small Passive Skills grant: 10% increased Spell Damage"),
    ).toBeDefined();
    expect(draft().item.cluster).toEqual({ passive: "affliction_spell_damage", nodes: 8 });
    fireEvent.click(button("Undo"));
    expect(draft().item.cluster).toEqual({ passive: "affliction_attack_damage_", nodes: 8 });
    fireEvent.click(button("Redo"));
    fireEvent.click(button("Apply craft"));
    expect(screen.queryByRole("alert")).toBeNull();
    const crafted = draft().item;
    expect(crafted.mods.length).toBeGreaterThanOrEqual(3);
    expect(crafted.cluster).toEqual({ passive: "affliction_spell_damage", nodes: 8 });
    fireEvent.click(screen.getByText("Save, load, and export"));
    fireEvent.click(button("Save project"));
    expect(JSON.parse(localStorage.getItem(key)!)["My crafting project"].item).toEqual(crafted);
    view.unmount();
    mount();
    expect(draft().item).toEqual(crafted);
    expect(screen.getByRole("combobox", { name: "Cluster passive count" })).toHaveProperty(
        "value",
        "8",
    );
});

it("keeps the item unchanged when a new passive type would invalidate an existing notable", async () => {
    const project = initial();
    project.item = engine.addStartingMod(
        project.item,
        "AfflictionNotableCalamitous",
        seededRandom(1),
    );
    localStorage.setItem(draftKey, JSON.stringify(project));
    mount();
    await passive("Spell Damage");
    expect(screen.getByRole("alert")).toBeDefined();
    expect(draft().item).toEqual(project.item);
    expect(
        within(screen.getByRole("region", { name: "Current item" })).getByText(
            "Added Small Passive Skills grant: 10% increased Attack Damage",
        ),
    ).toBeDefined();
});

it.each([
    "advanced",
    "classic",
])("shows extracted notable effects in the pool and %s item without changing crafting state", (itemOutput) => {
    const project = initial();
    project.item = engine.addStartingMod(
        project.item,
        "AfflictionNotableCalamitous",
        seededRandom(1),
    );
    localStorage.setItem(draftKey, JSON.stringify(project));
    localStorage.setItem("poe-boats:crafting:display", JSON.stringify({ itemOutput }));
    mount();
    const current = within(screen.getByRole("region", { name: "Current item" }));
    if (itemOutput === "classic") {
        fireEvent.click(current.getByText("Individual modifiers and rolls"));
    }
    const itemSummary = current.getByText("Calamitous passive effects");
    expect(itemSummary.closest("details")).toHaveProperty("open", false);
    fireEvent.click(itemSummary);
    expect(itemSummary.closest("details")).toHaveProperty("open", true);
    const effects =
        "30% increased Elemental Damage with Attack Skills 10% chance to Freeze, Shock and Ignite 15% increased Effect of Non-Damaging Ailments";
    expect(current.getByText(effects)).toBeDefined();
    expect(current.getByText("Applies when allocated on the passive tree.")).toBeDefined();

    fireEvent.change(screen.getByLabelText("Search modifiers"), {
        target: { value: "Calamitous" },
    });
    const pool = within(screen.getByRole("region", { name: "Modifier pool" }));
    const poolSummary = pool.getByText("Calamitous passive effects");
    fireEvent.click(poolSummary);
    expect(poolSummary.closest("details")).toHaveProperty("open", true);
    expect(pool.getByText(effects)).toBeDefined();
    expect(pool.getByTitle("Modifier weight").textContent).toBe("216");
    expect(draft().item).toEqual(project.item);
    expect(draft().target).toEqual(project.target);
    fireEvent.click(pool.getByRole("button", { name: "Remove target" }));
    fireEvent.click(pool.getByRole("button", { name: "Require" }));
    expect(draft().target.groups[0]!.mods).toEqual(["AfflictionNotableCalamitous"]);
    expect(draft().item).toEqual(project.item);
});

it.each([
    "calculate",
    "simulate",
])("sends selected Cluster Jewel properties to the shared %s worker", async (mode) => {
    mount(mode);
    fireEvent.change(screen.getByRole("combobox", { name: "Cluster passive count" }), {
        target: { value: "9" },
    });
    await passive("Spell Damage");
    fireEvent.click(button(mode === "calculate" ? "Calculate odds" : "Run simulation"));
    expect(WorkerStub.instances.at(-1)!.postMessage.mock.calls[0]![0].project.item.cluster).toEqual(
        { passive: "affliction_spell_damage", nodes: 9 },
    );
});

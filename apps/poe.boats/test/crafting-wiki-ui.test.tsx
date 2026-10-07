// @vitest-environment jsdom
/** biome-ignore-all lint/style/useNamingConvention: Ring recipes retain canonical Breachlord names. */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { CraftingWorkbench } from "../app/components/crafting/workbench";
import { graspingMailBase, isBreachModifier } from "../app/lib/crafting-grasping";
import { craftingProjectSchema } from "../app/schemas/crafting";
import { changeControl, expectControlValue } from "./control-helpers";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

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
beforeEach(() => {
    localStorage.clear();
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

function button(name: string) {
    const scope = screen.getByText(name, { selector: "button" }).parentElement!;
    return within(scope).getByRole("button", { name });
}

const storage = () =>
    within(screen.getByText("Save, load, and export", { selector: "summary" }).parentElement!);

function mount(base: string) {
    const project = craftingProjectSchema.parse({
        format: 1,
        game: "poe1",
        patch: catalog.patch,
        item: engine.createItem(base),
        method:
            base === graspingMailBase
                ? { kind: "generate", id: "rare" }
                : currency("transmute_to_magic"),
        target: { groups: [], rarity: "rare" },
        steps: [],
        prices: {},
        seed: 42,
        iterations: 10,
        maxActions: 1,
    });
    localStorage.setItem(key, JSON.stringify({ setup: project }));
    render(
        <MemoryRouter>
            <CraftingWorkbench catalog={catalog} mode="calculate" />
        </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Save, load, and export"));
    changeControl(storage().getByLabelText("Saved project"), { target: { value: "setup" } });
    fireEvent.click(button("Load project"));
}
const save = () => {
    fireEvent.click(button("Save project"));
    return craftingProjectSchema.parse(
        JSON.parse(localStorage.getItem(key)!)["My crafting project"],
    );
};

it("edits the Grasping recipe, emulates with undo, saves it and sends it to the worker", () => {
    mount(graspingMailBase);
    const recipe = within(
        screen.getByLabelText("Grasping Mail recipe").parentElement!.parentElement!,
    );
    for (const lord of ["Xoph", "Tul", "Esh", "Uul-Netol", "Chayula"])
        changeControl(recipe.getByLabelText(`${lord} rings`), {
            target: { value: lord === "Xoph" ? "60" : "0" },
        });
    expectControlValue(
        screen.getByRole("combobox", { name: "Crafting method" }),
        "Generate rare item",
    );
    fireEvent.click(button("Apply craft"));
    expect(screen.queryByRole("alert")).toBeNull();
    const generated = save();
    changeControl(screen.getByRole("combobox", { name: "Modifier source" }), {
        target: { value: "breach" },
    });
    expect(screen.getByText(/PoE Wiki weights for the combined legacy Breach pool/)).toBeDefined();
    expect(
        generated.item.mods.some((mod) => isBreachModifier(catalog, generated.item, mod.id)),
    ).toBe(true);
    expect(generated.method).toMatchObject({
        kind: "generate",
        id: "rare",
        breachRings: { Xoph: 60 },
    });
    fireEvent.click(button("Undo"));
    expect(save().item.rarity).toBe("normal");
    fireEvent.click(button("Calculate odds"));
    expect(WorkerStub.instances.at(-1)!.postMessage.mock.calls[0]![0].project.method).toEqual(
        generated.method,
    );
});

it("manually selects a Heist enchantment, retains it through crafting and reloads it without a random roll", async () => {
    mount(baseId);
    fireEvent.click(screen.getByText("Heist enchantment (manual)"));
    const picker = screen.getByRole("combobox", { name: "Starting Heist enchantment" });
    changeControl(picker, {
        target: { value: "8% increased Explicit Life Modifier magnitudes" },
    });
    fireEvent.keyDown(picker, { key: "ArrowDown" });
    fireEvent.click(
        await screen.findByRole("option", {
            name: "8% increased Explicit Life Modifier magnitudes",
        }),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/Random Tempering and Tailoring odds are unknown/)).toBeDefined();
    const selected = save();
    expect(selected.item.enchantments?.[0]?.id).toBe("ArmourEnchantmentHeistLifeEffect1");
    fireEvent.click(button("Apply craft"));
    expect(save().item.enchantments).toEqual(selected.item.enchantments);
    fireEvent.click(button("Undo"));
    expect(save().item.enchantments).toEqual(selected.item.enchantments);
    fireEvent.click(button("Clear starting Heist enchantment"));
    changeControl(storage().getByLabelText("Saved project"), {
        target: { value: "My crafting project" },
    });
    fireEvent.click(button("Load project"));
    expectControlValue(
        screen.getByRole("combobox", { name: "Starting Heist enchantment" }),
        "8% increased Explicit Life Modifier magnitudes",
    );
    fireEvent.click(button("Calculate odds"));
    expect(
        WorkerStub.instances.at(-1)!.postMessage.mock.calls[0]![0].project.item.enchantments,
    ).toEqual(selected.item.enchantments);
});

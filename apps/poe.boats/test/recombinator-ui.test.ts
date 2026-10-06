// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { RecombinatorSimulator } from "~/components/recombinator/simulator";
import { calculateRecombinatorPlan } from "~/lib/recombinator";
import { catalogModLabel } from "~/lib/recombinator-catalog";
import type { RecombinatorPlan } from "~/schemas/recombinator";
import { armourMod, catalogFixture, fireMod, lifeMod } from "./fixtures/recombinator-catalog";

class CalculatorWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    terminate = vi.fn();
    postMessage(plan: RecombinatorPlan) {
        queueMicrotask(() => {
            if (this.terminate.mock.calls.length) return;
            try {
                this.onmessage?.({ data: { results: calculateRecombinatorPlan(plan) } });
            } catch (error) {
                this.onmessage?.({ data: { error: String(error) } });
            }
        });
    }
}

beforeEach(() => {
    vi.stubGlobal("Worker", CalculatorWorker);
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

describe("recombinator editor", () => {
    it("calculates two natural prefixes with exclusive crafted suffixes through the recipe controls", async () => {
        const craft = { ...fireMod, crafted: true, exclusive: true };
        render(
            createElement(RecombinatorSimulator, {
                catalog: {
                    ...catalogFixture,
                    mods: [lifeMod, armourMod, craft],
                    recipes: [
                        {
                            id: "bench-suffix",
                            name: "Exclusive suffix craft",
                            kind: "bench",
                            mod: craft.id,
                            itemClasses: ["Body Armour"],
                            cost: [{ name: "Chaos Orb", amount: 1 }],
                        },
                    ],
                },
            }),
        );
        async function choose(label: string, query: string, option: string) {
            const input = screen.getByRole("combobox", { name: label });
            act(() => input.focus());
            fireEvent.change(input, { target: { value: query } });
            fireEvent.keyDown(input, { key: "ArrowDown" });
            await screen.findByRole("option", { name: option });
            fireEvent.click(screen.getByRole("option", { name: option }));
        }
        for (const number of [1, 2]) {
            await choose(`Item ${number} base`, "vaal", "Vaal Regalia · Body Armour");
            const mod = number === 1 ? lifeMod : armourMod;
            await choose(`Item ${number} add prefix (0/3)`, mod.name, catalogModLabel(mod));
            const label = `Step 1 input ${number === 1 ? "A" : "B"} preparation`;
            const trigger = screen.getByRole("combobox", { name: label });
            fireEvent.click(trigger);
            const option = await screen.findByRole("option", {
                name: "Add an exclusive bench craft",
            });
            act(() => option.focus());
            fireEvent.keyDown(option, { key: "Enter" });
            await waitFor(() => expect(document.activeElement).toBe(trigger));
            await choose(
                `${label} recipe`,
                "exclusive",
                `Exclusive suffix craft · Suffix: ${craft.text}`,
            );
        }
        expect(
            screen
                .getByRole("checkbox", { name: "Remove crafted mods after this recombination" })
                .getAttribute("aria-checked"),
        ).toBe("true");
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Calculate plan" }));
        });
        for (const mod of [lifeMod, armourMod])
            fireEvent.click(screen.getByRole("checkbox", { name: catalogModLabel(mod) }));
        expect(screen.getByTestId("target-chance").textContent).toBe("33%");
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("prepares an essence donor at a stage and filters target odds by output base", async () => {
        const nnn = {
            ...armourMod,
            spawn: [
                ["str_armour", 1000],
                ["default", 0],
            ] as [string, number][],
        };
        render(
            createElement(RecombinatorSimulator, {
                catalog: {
                    ...catalogFixture,
                    mods: [...catalogFixture.mods.filter((mod) => mod.id !== nnn.id), nnn],
                    recipes: [
                        {
                            id: "dread",
                            name: "Whispering Essence of Dread",
                            kind: "essence",
                            mod: nnn.id,
                            itemClasses: ["Body Armour"],
                            cost: [{ name: "Essence of Dread", amount: 1 }],
                        },
                    ],
                },
            }),
        );
        async function choose(label: string, query: string, option: string) {
            const input = screen.getByRole("combobox", { name: label });
            act(() => input.focus());
            fireEvent.change(input, { target: { value: query } });
            fireEvent.keyDown(input, { key: "ArrowDown" });
            fireEvent.click(await screen.findByRole("option", { name: option }));
        }
        async function select(label: string, option: string) {
            fireEvent.click(screen.getByRole("combobox", { name: label }));
            const entry = await screen.findByRole("option", { name: option });
            act(() => entry.focus());
            fireEvent.keyDown(entry, { key: "Enter" });
        }
        await choose("Item 1 base", "vaal", "Vaal Regalia · Body Armour");
        await choose("Item 2 base", "any int", "Any INT Body Armour · generic");
        await choose("Item 1 add prefix (0/3)", "healthy", catalogModLabel(lifeMod));
        await choose("Item 2 add suffix (0/3)", "flame", catalogModLabel(fireMod));
        await select("Step 1 input B preparation", "Prepare an essence NNN donor");
        fireEvent.click(screen.getByRole("button", { name: "Calculate plan" }));
        expect(screen.getByRole("alert").textContent).toContain("Choose a preparation recipe");
        await choose(
            "Step 1 input B preparation recipe",
            "dread",
            `Whispering Essence of Dread · Prefix: ${nnn.text}`,
        );
        expect(screen.getByText(/This replaces every existing mod/)).toBeDefined();
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Calculate plan" }));
        });
        fireEvent.click(screen.getByRole("checkbox", { name: catalogModLabel(lifeMod) }));
        expect(screen.getByTestId("target-chance").textContent).toBe("100%");
        fireEvent.click(
            screen.getByRole("checkbox", { name: "Keep input modifiers in prepared donor" }),
        );
        expect(screen.queryByTestId("target-chance")).toBeNull();
        expect(screen.getByText(/Essences reroll items/)).toBeDefined();
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Calculate plan" }));
        });
        fireEvent.click(screen.getByRole("checkbox", { name: catalogModLabel(fireMod) }));
        expect(screen.getByTestId("target-chance").textContent).toBe("59%");
        fireEvent.click(
            screen.getByRole("checkbox", { name: "Keep input modifiers in prepared donor" }),
        );
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Calculate plan" }));
        });
        expect(screen.getByTestId("target-chance").textContent).toBe("0%");
        fireEvent.click(screen.getByRole("checkbox", { name: catalogModLabel(fireMod) }));
        await select("Required output base", "Vaal Regalia");
        expect(screen.getByTestId("target-chance").textContent).toBe("50%");
        expect(screen.getByRole("button", { name: /^Inspect step 1:/ }).textContent).toContain(
            "50% target",
        );
        await select("Step 1 input B preparation", "Use input as is");
        expect(screen.queryByTestId("target-chance")).toBeNull();
    });

    it("starts without placeholder mods and requires bases before calculating", () => {
        render(createElement(RecombinatorSimulator, { catalog: catalogFixture }));
        expect(screen.queryByText("T1 life")).toBeNull();
        expect(screen.queryByRole("textbox", { name: "Item 1 prefixes" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Calculate plan" }));
        expect(screen.getByRole("alert").textContent).toContain("Choose a base");
        expect(screen.queryByTestId("target-chance")).toBeNull();
    });

    it("searches generic categories, excludes conflicting tiers, and clears mods when switching to a weapon", async () => {
        render(createElement(RecombinatorSimulator, { catalog: catalogFixture }));
        async function choose(label: string, query: string, option: string) {
            const input = screen.getByRole("combobox", { name: label });
            act(() => input.focus());
            fireEvent.change(input, { target: { value: query } });
            fireEvent.keyDown(input, { key: "ArrowDown" });
            fireEvent.click(await screen.findByRole("option", { name: option }));
        }
        await choose("Item 1 base", "any int", "Any INT Body Armour · generic");
        await choose("Item 1 add prefix (0/3)", "healthy", catalogModLabel(lifeMod));
        const prefixes = screen.getByRole("combobox", { name: "Item 1 add prefix (1/3)" });
        act(() => prefixes.focus());
        fireEvent.change(prefixes, { target: { value: "Fecund" } });
        fireEvent.keyDown(prefixes, { key: "ArrowDown" });
        expect(screen.queryByRole("option", { name: /Fecund/ })).toBeNull();
        fireEvent.keyDown(prefixes, { key: "Escape" });
        await choose("Item 1 base", "any sword", "Any One Hand Sword · generic");
        expect(
            screen.queryByRole("button", { name: `Remove ${catalogModLabel(lifeMod)}` }),
        ).toBeNull();
        const weaponPrefix = screen.getByRole("combobox", { name: "Item 1 add prefix (0/3)" });
        act(() => weaponPrefix.focus());
        fireEvent.change(weaponPrefix, { target: { value: "life" } });
        fireEvent.keyDown(weaponPrefix, { key: "ArrowDown" });
        expect(screen.queryAllByRole("option")).toHaveLength(0);
        expect(await screen.findByText("No eligible matches.")).toBeDefined();
    });

    it("selects catalog bases and mods, calculates with stable IDs, and resets selections on level changes", async () => {
        render(createElement(RecombinatorSimulator, { catalog: catalogFixture }));
        const baseInput = screen.getByRole("combobox", { name: "Item 1 base" });
        act(() => baseInput.focus());
        fireEvent.change(baseInput, { target: { value: "Vaal" } });
        fireEvent.keyDown(baseInput, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Vaal Regalia · Body Armour" }));
        expect(screen.getByLabelText("Item 1 level")).toHaveProperty("value", "86");
        const prefixInput = screen.getByRole("combobox", { name: "Item 1 add prefix (0/3)" });
        act(() => prefixInput.focus());
        fireEvent.change(prefixInput, { target: { value: "Healthy" } });
        fireEvent.keyDown(prefixInput, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: catalogModLabel(lifeMod) }));
        expect(screen.getByRole("combobox", { name: "Item 1 add prefix (1/3)" })).toBeDefined();
        expect(screen.getByRole("button", { name: /Edit item 1:.*Vaal Regalia/ })).toBeDefined();
        const secondBase = screen.getByRole("combobox", { name: "Item 2 base" });
        act(() => secondBase.focus());
        fireEvent.change(secondBase, { target: { value: "Any INT" } });
        fireEvent.keyDown(secondBase, { key: "ArrowDown" });
        fireEvent.click(
            await screen.findByRole("option", { name: "Any INT Body Armour · generic" }),
        );
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Calculate plan" }));
        });
        expect(screen.getByRole("checkbox", { name: catalogModLabel(lifeMod) })).toBeDefined();
        expect(screen.getByTestId("target-chance")).toBeDefined();
        fireEvent.change(screen.getByLabelText("Item 1 level"), { target: { value: "79" } });
        expect(screen.getByRole("combobox", { name: "Item 1 add prefix (0/3)" })).toBeDefined();
        expect(screen.queryByTestId("target-chance")).toBeNull();
        const lowLevelInput = screen.getByRole("combobox", { name: "Item 1 add prefix (0/3)" });
        act(() => lowLevelInput.focus());
        fireEvent.change(lowLevelInput, { target: { value: "Fecund" } });
        fireEvent.keyDown(lowLevelInput, { key: "ArrowDown" });
        expect(screen.queryByRole("option", { name: /Fecund/ })).toBeNull();
        fireEvent.keyDown(lowLevelInput, { key: "Escape" });
        fireEvent.click(screen.getByRole("button", { name: "Load example" }));
        expect(screen.getByRole("combobox", { name: "Item 1 base" })).toHaveProperty(
            "value",
            "Vaal Regalia · Body Armour",
        );
        expect(screen.getByLabelText("Item 1 level")).toHaveProperty("value", "86");
        expect(screen.queryByRole("textbox", { name: "Item 1 prefixes" })).toBeNull();
    });

    it("selects a tree step to inspect its outcome distribution", () => {
        render(createElement(RecombinatorSimulator));
        fireEvent.click(screen.getByRole("button", { name: /^Inspect step 1:/ }));
        expect(screen.getByRole("combobox", { name: "View step results" }).textContent).toContain(
            "Build first pair",
        );
        expect(screen.getByTestId("target-chance").textContent).toBe("0%");
        expect(
            screen.getByRole("button", { name: /^Inspect step 1:/ }).getAttribute("aria-pressed"),
        ).toBe("true");
    });

    it("toggles NNN and exclusive flags and excludes NNN mods from outcomes", async () => {
        render(createElement(RecombinatorSimulator));
        fireEvent.click(screen.getAllByRole("button", { name: "NNN: T1 life" })[0]);
        expect(screen.getByLabelText("Item 1 prefixes")).toHaveProperty("value", "!T1 life");
        expect(screen.getByLabelText("Item 3 prefixes")).toHaveProperty("value", "!T1 life");
        expect(screen.getAllByRole("img", { name: "NNN modifier" })).toHaveLength(2);
        fireEvent.click(screen.getByRole("button", { name: "Exclusive: T1 armour" }));
        expect(screen.getByLabelText("Item 2 prefixes")).toHaveProperty("value", "*T1 armour");
        expect(screen.queryByTestId("target-chance")).toBeNull();
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Calculate plan" }));
        });
        expect(screen.getAllByRole("img", { name: "NNN modifier" })).toHaveLength(3);
        expect(screen.getAllByRole("img", { name: "Exclusive modifier" }).length).toBeGreaterThan(
            1,
        );
        expect(screen.getByTestId("target-chance")).toBeDefined();
    });

    it("filters outcomes without changing their odds and supports impossible exact targets", () => {
        render(createElement(RecombinatorSimulator));
        const probability = screen.getByTestId("target-chance").textContent;
        fireEvent.click(screen.getByRole("checkbox", { name: "Matching only" }));
        expect(screen.getByTestId("target-chance").textContent).toBe(probability);
        expect(screen.getAllByRole("row")).toHaveLength(8);
        fireEvent.click(
            screen.getByRole("checkbox", { name: "Exact match (no additional modifiers)" }),
        );
        expect(screen.getByTestId("target-chance").textContent).toBe("0%");
        expect(screen.getByText("No outcomes match these target modifiers.")).toBeDefined();
    });

    it("starts with a connected multi-step example and updates targets", async () => {
        render(createElement(RecombinatorSimulator));
        expect(screen.getByRole("heading", { name: "Recombinator simulator" })).toBeDefined();
        expect(screen.getByRole("combobox", { name: "Step 3 input A" }).textContent).toContain(
            "Build first pair",
        );
        expect(screen.getByRole("combobox", { name: "Step 3 input B" }).textContent).toContain(
            "Build second pair",
        );
        const original = screen.getByTestId("target-chance").textContent;
        fireEvent.click(screen.getByLabelText("T1 life"));
        expect(screen.getByTestId("target-chance").textContent).not.toBe(original);
        fireEvent.click(screen.getByRole("combobox", { name: "View step results" }));
        const firstStep = await screen.findByRole("option", { name: "Step 1: Build first pair" });
        act(() => firstStep.focus());
        fireEvent.keyDown(firstStep, { key: "Enter" });
        expect(screen.getByTestId("target-chance").textContent).toBe("0%");
    });

    it("invalidates stale results and calculates edited inputs", async () => {
        render(createElement(RecombinatorSimulator));
        fireEvent.change(screen.getByLabelText("Item 1 prefixes"), {
            target: { value: "T1 mana" },
        });
        expect(screen.queryByTestId("target-chance")).toBeNull();
        expect(screen.getByRole("status").textContent).toContain("plan has changed");
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Calculate plan" }));
        });
        expect(screen.getByLabelText("T1 mana")).toBeDefined();
        expect(screen.getByTestId("target-chance")).toBeDefined();
    });

    it("adds a step from the last result and prevents dangling references", () => {
        render(createElement(RecombinatorSimulator));
        expect(screen.getByRole("button", { name: "Remove item 1" })).toHaveProperty(
            "disabled",
            true,
        );
        expect(screen.getByRole("button", { name: "Remove step 1" })).toHaveProperty(
            "disabled",
            true,
        );
        fireEvent.click(screen.getByRole("button", { name: "Add step" }));
        expect(screen.getByRole("combobox", { name: "Step 4 input A" }).textContent).toContain(
            "Combine both results",
        );
        fireEvent.click(screen.getByRole("button", { name: "Remove step 4" }));
        expect(screen.queryByLabelText("Step 4 input A")).toBeNull();
    });

    it("shows validation errors instead of stale probabilities", () => {
        render(createElement(RecombinatorSimulator));
        fireEvent.change(screen.getByLabelText("Item 1 prefixes"), {
            target: { value: "A\nB\nC\nD" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Calculate plan" }));
        expect(screen.getByRole("alert")).toBeDefined();
        expect(screen.queryByTestId("target-chance")).toBeNull();
    });
});

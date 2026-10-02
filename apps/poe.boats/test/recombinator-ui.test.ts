// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { RecombinatorSimulator } from "~/components/recombinator/simulator";
import { calculateRecombinatorPlan } from "~/lib/recombinator";
import type { RecombinatorPlan } from "~/schemas/recombinator";

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
    it("selects a tree step to inspect its outcome distribution", () => {
        render(createElement(RecombinatorSimulator));
        fireEvent.click(screen.getByRole("button", { name: /^Inspect step 1:/ }));
        expect(screen.getByLabelText("View step results")).toHaveProperty("value", "first");
        expect(screen.getByTestId("target-chance").textContent).toBe("0%");
        expect(
            screen.getByRole("button", { name: /^Inspect step 1:/ }).getAttribute("aria-pressed"),
        ).toBe("true");
    });

    it("toggles NNN and exclusive icons and carries them into outcomes", async () => {
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
        expect(screen.getAllByRole("img", { name: "NNN modifier" }).length).toBeGreaterThan(2);
        expect(screen.getAllByRole("img", { name: "Exclusive modifier" }).length).toBeGreaterThan(
            1,
        );
        expect(screen.getByTestId("target-chance")).toBeDefined();
    });

    it("filters outcomes without changing their odds and supports impossible exact targets", () => {
        render(createElement(RecombinatorSimulator));
        const probability = screen.getByTestId("target-chance").textContent;
        fireEvent.click(screen.getByLabelText("Matching only"));
        expect(screen.getByTestId("target-chance").textContent).toBe(probability);
        expect(screen.getAllByRole("row")).toHaveLength(8);
        fireEvent.click(screen.getByLabelText("Exact match (no additional modifiers)"));
        expect(screen.getByTestId("target-chance").textContent).toBe("0%");
        expect(screen.getByText("No outcomes match these target modifiers.")).toBeDefined();
    });

    it("starts with a connected multi-step example and updates targets", () => {
        render(createElement(RecombinatorSimulator));
        expect(screen.getByRole("heading", { name: "Recombinator simulator" })).toBeDefined();
        expect(screen.getByLabelText("Step 3 input A")).toHaveProperty("value", "first");
        expect(screen.getByLabelText("Step 3 input B")).toHaveProperty("value", "second");
        const original = screen.getByTestId("target-chance").textContent;
        fireEvent.click(screen.getByLabelText("T1 life"));
        expect(screen.getByTestId("target-chance").textContent).not.toBe(original);
        fireEvent.change(screen.getByLabelText("View step results"), {
            target: { value: "first" },
        });
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
        expect(screen.getByLabelText("Step 4 input A")).toHaveProperty("value", "finish");
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

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { ManualRecipeCalculator } from "~/components/arbitrage/manual-recipe-calculator";

afterEach(cleanup);

describe("manual recipe calculator", () => {
    it("labels random outcomes and calculates from the entire batch cost", () => {
        render(createElement(ManualRecipeCalculator));
        expect(screen.getByText("Random outcome")).toBeTruthy();
        expect(screen.queryByRole("status")).toBeNull();
        fireEvent.change(screen.getByLabelText("Total cost of 5 inputs (chaos)"), {
            target: { value: "5" },
        });
        fireEvent.change(screen.getByLabelText("Estimated output sale price (chaos)"), {
            target: { value: "10" },
        });
        fireEvent.change(screen.getByLabelText("Item recipe buffer (%)"), {
            target: { value: "20" },
        });
        const result = screen.getByRole("status", { name: "Item recipe estimate" });
        expect(result.textContent).toContain("Scenario profit: 2 chaos");
        expect(result.textContent).toContain("Break-even sale price: 7.5 chaos");
    });
    it("clears prices when choosing another recipe and shows its restrictions", async () => {
        render(createElement(ManualRecipeCalculator));
        fireEvent.change(screen.getByLabelText("Total cost of 5 inputs (chaos)"), {
            target: { value: "5" },
        });
        fireEvent.change(screen.getByLabelText("Estimated output sale price (chaos)"), {
            target: { value: "10" },
        });
        fireEvent.click(screen.getByRole("combobox", { name: "Recipe to evaluate" }));
        const option = await screen.findByRole("option", { name: "3-for-1 life flasks" });
        fireEvent.focus(option);
        fireEvent.click(option);
        expect(screen.getByLabelText("Total cost of 3 inputs (chaos)")).toHaveProperty("value", "");
        expect(screen.queryByRole("status")).toBeNull();
        expect(screen.getByText(/Cannot produce Divine or Eternal/)).toBeTruthy();
        expect(screen.getByText("Check exact items")).toBeTruthy();
    });
    it("hides calculations for invalid price buffers", () => {
        render(createElement(ManualRecipeCalculator));
        fireEvent.change(screen.getByLabelText("Total cost of 5 inputs (chaos)"), {
            target: { value: "5" },
        });
        fireEvent.change(screen.getByLabelText("Estimated output sale price (chaos)"), {
            target: { value: "0" },
        });
        expect(screen.getByRole("status").textContent).toContain("-5 chaos");
        fireEvent.change(screen.getByLabelText("Item recipe buffer (%)"), {
            target: { value: "100" },
        });
        expect(screen.queryByRole("status")).toBeNull();
    });
});

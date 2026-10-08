// @vitest-environment jsdom
// biome-ignore-all lint/style/useNamingConvention: React component exports and route configuration use PascalCase.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ArbitragePage } from "~/components/arbitrage/arbitrage-page";
import { getVendorRecipes } from "~/data/vendor-recipes";
import type { ArbitrageMarketData } from "~/services/arbitrage.server";

vi.mock("~/components/app-header", () => {
    const AppHeader = () => null;
    return { AppHeader };
});
vi.mock("~/components/app-footer", () => {
    const AppFooter = () => null;
    return { AppFooter };
});
afterEach(cleanup);

const data: ArbitrageMarketData = {
    game: "1",
    league: "Standard",
    leagues: ["Standard"],
    error: null,
    recipes: getVendorRecipes("1").slice(0, 2),
    snapshot: {
        game: "1",
        league: "Standard",
        fetchedAt: "2026-10-02T00:00:00.000Z",
        quotes: {
            "clear-oil": { value: 1 },
            "sepia-oil": { value: 5 },
            "amber-oil": { value: 10 },
        },
        unavailableCategories: [],
    },
};

function showPage(market = data) {
    const Component = () => createElement(ArbitragePage, { data: market });
    const Routes = createRoutesStub([{ path: "/1/arbitrage", Component }]);
    return render(createElement(Routes, { initialEntries: ["/1/arbitrage"] }));
}

describe("arbitrage page", () => {
    it("displays recipe quantities, estimates and trade links", () => {
        showPage();
        expect(screen.getByText("1 opportunities")).toBeTruthy();
        expect(screen.getByRole("link", { name: "3 × Clear Oil → 1 × Sepia Oil" })).toBeTruthy();
        expect(screen.getByText("2 chaos")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Buy Clear Oil" }).getAttribute("href")).toContain(
            "/trade/exchange/Standard",
        );
    });

    it("recalculates when the buffer changes and can show losses", () => {
        showPage();
        fireEvent.change(screen.getByLabelText("Price buffer (%)"), { target: { value: "30" } });
        expect(screen.getByText("No recipes meet these filters")).toBeTruthy();
        fireEvent.click(
            screen.getByRole("checkbox", { name: "Show all priced recipes, including losses" }),
        );
        expect(screen.getByText("2 priced recipes")).toBeTruthy();
    });

    it("ignores a cleared minimum profit when all recipes are requested", () => {
        showPage();
        fireEvent.change(screen.getByLabelText("Minimum profit (chaos)"), {
            target: { value: "" },
        });
        fireEvent.click(
            screen.getByRole("checkbox", { name: "Show all priced recipes, including losses" }),
        );
        expect(screen.getByText("2 priced recipes")).toBeTruthy();
        expect(screen.queryByText("Check the filters")).toBeNull();
    });

    it("does not show invalid calculations", () => {
        showPage();
        fireEvent.change(screen.getByLabelText("Price buffer (%)"), { target: { value: "100" } });
        expect(screen.getByText("Check the filters")).toBeTruthy();
        expect(screen.queryByRole("table")).toBeNull();
    });

    it("makes missing prices visible without implying zero input cost", () => {
        showPage({ ...data, snapshot: { ...data.snapshot!, quotes: {} } });
        expect(screen.getByText("No fully priced recipes")).toBeTruthy();
        expect(screen.getByText("0 recipes priced · 2 missing prices")).toBeTruthy();
    });

    it("keeps the league controls available when the provider fails", () => {
        showPage({ ...data, snapshot: null, error: "Please retry shortly." });
        expect(screen.getByText("Market data unavailable")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Load prices" })).toBeTruthy();
    });
});

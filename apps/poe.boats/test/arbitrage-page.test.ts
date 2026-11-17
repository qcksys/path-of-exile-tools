// @vitest-environment jsdom
// biome-ignore-all lint/style/useNamingConvention: React component exports and route configuration use PascalCase.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { ArbitragePage } from "~/components/arbitrage/arbitrage-page";
import { getVendorRecipes } from "~/data/vendor-recipes";
import type { ArbitrageMarketData } from "~/services/arbitrage.server";
import type { ClusterRecipeMarketData } from "~/services/cluster-recipe.server";
import { byText } from "./control-helpers";

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
        expect(screen.getByText(byText("2 chaos"))).toBeTruthy();
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

describe("cluster jewel recipe calculator", () => {
    const clusterRecipe: ClusterRecipeMarketData = {
        leagues: ["Standard"],
        league: "Standard",
        itemLevel: 84,
        error: null,
        snapshot: {
            league: "Standard",
            band: { min: 84, max: 100 },
            fetchedAt: "2026-11-17T03:00:00.000Z",
            quotes: {
                "affliction_minion_damage:12": { value: 850, listingCount: 41 },
                "affliction_wand_damage:8": { value: 2, listingCount: 30 },
            },
        },
    };
    function showCluster(market = clusterRecipe) {
        const Component = () => createElement(ArbitragePage, { data, clusterRecipe: market });
        const Routes = createRoutesStub([{ path: "/1/arbitrage", Component }]);
        return render(createElement(Routes, { initialEntries: ["/1/arbitrage"] }));
    }

    it("shows each size's expected value, unpriced outcomes counting as nothing", () => {
        showCluster();
        const table = within(screen.getByRole("table", { name: "Cluster Jewel recipe estimates" }));
        const large = within(table.getByText("Large Cluster Jewel").closest("tr")!);
        // (850 + 2) / 85 outcomes, against five 2 chaos inputs.
        expect(large.getByText("2 of 85 outcomes priced")).toBeTruthy();
        expect(large.getByText(byText("10.02 chaos"))).toBeTruthy();
        expect(large.getByText(byText("10 chaos for 5 × 2 chaos"))).toBeTruthy();
        expect(
            within(table.getByText("Small Cluster Jewel").closest("tr")!).getByText(
                "0 of 28 outcomes priced",
            ),
        ).toBeTruthy();
        expect(screen.getByRole("table", { name: "Large Cluster Jewel outcomes" })).toBeTruthy();
        // Both forms carry the other's parameter, so changing one keeps the other.
        expect(document.querySelector<HTMLInputElement>('input[name="clusterIlvl"]')?.value).toBe(
            "84",
        );
    });

    it("recalculates with the buffer and refuses an invalid one", () => {
        showCluster();
        fireEvent.change(screen.getByLabelText("Cluster recipe buffer (%)"), {
            target: { value: "10" },
        });
        expect(screen.getByText(byText("9.021 chaos"))).toBeTruthy();
        fireEvent.change(screen.getByLabelText("Cluster recipe buffer (%)"), {
            target: { value: "100" },
        });
        expect(screen.queryByRole("table", { name: "Cluster Jewel recipe estimates" })).toBeNull();
    });

    it("explains when no Cluster Jewel ask was captured", () => {
        showCluster({
            ...clusterRecipe,
            snapshot: { ...clusterRecipe.snapshot!, fetchedAt: null, quotes: {} },
            error: "No Cluster Jewel asks were captured in this league within the last 24 hours.",
        });
        expect(screen.getByText("Cluster Jewel prices unavailable")).toBeTruthy();
        expect(screen.queryByRole("table", { name: "Cluster Jewel recipe estimates" })).toBeNull();
    });
});

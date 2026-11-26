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
            "clear-oil": { value: 1, units24h: 33 },
            "sepia-oil": { value: 5, units24h: 7 },
            "amber-oil": { value: 10, units24h: 1 },
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
        expect(screen.getByText("1 opportunity")).toBeTruthy();
        expect(screen.getByRole("tab", { name: "Upgrades Best ROI 66.7%" })).toBeTruthy();
        expect(screen.getByText("33 inputs traded in 24h")).toBeTruthy();
        expect(screen.getByText("7 outputs traded in 24h")).toBeTruthy();
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

    it("shows each type's best volume-backed return even when another type is selected", () => {
        const currency = getVendorRecipes("1").find(({ category }) => category === "currency")!;
        const essence = getVendorRecipes("1").find(({ category }) => category === "essences")!;
        showPage({
            ...data,
            recipes: [...data.recipes, currency, essence],
            snapshot: {
                ...data.snapshot!,
                quotes: {
                    ...data.snapshot!.quotes,
                    [currency.input.id]: { value: 1, units24h: 9 },
                    [currency.output.id]: { value: 6, units24h: 1 },
                    [essence.input.id]: { value: 1, units24h: 2 },
                    [essence.output.id]: { value: 100, units24h: 8 },
                },
            },
        });
        expect(screen.getByRole("tab", { name: "Upgrades Best ROI 66.7%" })).toBeTruthy();
        fireEvent.click(screen.getByRole("tab", { name: "Currency exchanges Best ROI 100%" }));
        expect(
            screen.getByRole("link", { name: "3 × Scroll of Wisdom → 1 × Portal Scroll" }),
        ).toBeTruthy();
        expect(screen.queryByRole("link", { name: /3 × Clear Oil/ })).toBeNull();
        fireEvent.click(screen.getByRole("tab", { name: /^Item recipes/ }));
        fireEvent.change(screen.getByLabelText("Total cost of 5 inputs (chaos)"), {
            target: { value: "5" },
        });
        fireEvent.change(screen.getByLabelText("Estimated output sale price (chaos)"), {
            target: { value: "10" },
        });
        expect(screen.getByRole("tab", { name: "Item recipes Scenario ROI 100%" })).toBeTruthy();
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
        expect(screen.getByRole("button", { name: "Filters (1)" })).toBeTruthy();
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
        expect(
            screen.getByRole("region", { name: "Arbitrage results" }).querySelector("time"),
        ).toBeNull();
    });

    it("keeps the league controls available when the provider fails", () => {
        showPage({ ...data, snapshot: null, error: "Please retry shortly." });
        expect(screen.getByText("Market data unavailable")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Load prices" })).toBeTruthy();
        fireEvent.click(screen.getByRole("tab", { name: "Item recipes Enter prices for ROI" }));
        expect(screen.getByLabelText("Recipe to evaluate")).toBeTruthy();
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
        const view = render(createElement(Routes, { initialEntries: ["/1/arbitrage"] }));
        fireEvent.click(screen.getByRole("tab", { name: /Cluster Jewel rerolls/ }));
        return view;
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
        expect(
            screen.getByRole("tab", { name: /Cluster Jewel rerolls Best expected ROI -18%/ }),
        ).toBeTruthy();
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

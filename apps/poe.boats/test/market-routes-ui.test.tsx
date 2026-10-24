// @vitest-environment jsdom
// biome-ignore-all lint/style/useNamingConvention: React Router fixture components use PascalCase.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRoutesStub, RouterContextProvider, useLoaderData, useLocation } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { dbContext } from "~/context";
import { createDbConnection } from "~/db/client";
import { getMarketData } from "~/db/queries/market.queries";
import Market from "~/routes/market";
import MarketIndex, { loader as listLoader } from "~/routes/market/index";
import MarketItem, { loader as itemLoader } from "~/routes/market/item";
import { marketFixture } from "./market-fixtures";

vi.mock("~/components/app-header", () => ({ AppHeader: () => null }));
vi.mock("~/components/app-footer", () => ({ AppFooter: () => null }));
vi.mock("~/db/queries/market.queries", () => ({ getMarketData: vi.fn() }));
const context = new RouterContextProvider();
context.set(dbContext, createDbConnection("mysql://user:pass@example.invalid/test"));

beforeEach(() => {
    vi.mocked(getMarketData).mockImplementation(async (_db, filters) => marketFixture(filters));
});
afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

function showMarket(path = "/1/market?league=Allflame&category=armour&order=name-asc&page=2") {
    const Routes = createRoutesStub([
        {
            path: "/1/market",
            Component: () => (
                <>
                    <Market />
                    <output aria-label="Current URL">
                        {useLocation().pathname}
                        {useLocation().search}
                    </output>
                </>
            ),
            children: [
                {
                    index: true,
                    loader: ({ request }) =>
                        listLoader({
                            request,
                            context,
                            params: {},
                            unstable_pattern: "/1/market",
                            unstable_url: new URL(request.url),
                        }),
                    Component: () => <MarketIndex loaderData={useLoaderData()} />,
                },
                {
                    path: "items/:item",
                    loader: ({ request, params }) =>
                        itemLoader({
                            request,
                            context,
                            params: { item: params.item! },
                            unstable_pattern: "/1/market/items/:item",
                            unstable_url: new URL(request.url),
                        }),
                    Component: () => <MarketItem loaderData={useLoaderData()} />,
                },
            ],
        },
    ]);
    return render(<Routes initialEntries={[path]} />);
}

it("renders list and detail through the layout outlet and restores browsing state", async () => {
    showMarket();
    fireEvent.click(await screen.findByRole("link", { name: "Abberath's Hooves" }));
    expect(await screen.findByRole("heading", { name: "Abberath's Hooves" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Item markets" })).toBeNull();
    expect(screen.getAllByRole("navigation", { name: "Market categories" })).toHaveLength(1);
    expect(screen.getByLabelText("Current URL").textContent).toContain(
        "/1/market/items/Abberath's%20Hooves?",
    );
    expect(getMarketData).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ item: "Abberath's Hooves", page: 2, category: "armour" }),
        "history",
    );
    fireEvent.click(screen.getByRole("link", { name: "chaos" }));
    await waitFor(() =>
        expect(screen.getByLabelText("Current URL").textContent).toContain("currency=chaos"),
    );
    fireEvent.click(screen.getByRole("link", { name: /Back to markets/ }));
    await screen.findByRole("region", { name: "Item markets" });
    expect(screen.getByLabelText("Current URL").textContent).toContain("page=2");
    expect(screen.getByLabelText("Current URL").textContent).toContain("order=name-asc");
    expect(screen.queryByRole("region", { name: "Item price history" })).toBeNull();
});

it("submits search and filters, resets pagination, and preserves them on category navigation", async () => {
    showMarket();
    const search = await screen.findByRole("searchbox", { name: "Search items" });
    fireEvent.change(search, { target: { value: "Goathide" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() =>
        expect(getMarketData).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({
                q: "Goathide",
                page: 1,
                order: "name-asc",
                category: "armour",
            }),
            "list",
        ),
    );
    await waitFor(() =>
        expect(screen.getByLabelText("Current URL").textContent).toContain("q=Goathide"),
    );
    fireEvent.click(
        within(screen.getByRole("navigation", { name: "Market categories" })).getByRole("link", {
            name: "Weapons",
        }),
    );
    await waitFor(() =>
        expect(getMarketData).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ q: "Goathide", page: 1, category: "weapons" }),
            "list",
        ),
    );
    await waitFor(() =>
        expect(screen.getByRole("link", { name: "Weapons" }).getAttribute("aria-current")).toBe(
            "page",
        ),
    );
});

it("redirects legacy query links while preserving every variant field", async () => {
    const response = await listLoader({
        request: new Request(
            "https://example.invalid/1/market?item=unid%3AArt%2FUnique&identified=false&corrupted=true&foil=3&kind=watchers-eye&value=a%2Fb&currency=alt",
        ),
        context,
        params: {},
        unstable_pattern: "/1/market",
        unstable_url: new URL("https://example.invalid/1/market"),
    });
    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) throw new Error("Expected redirect");
    expect(response.status).toBe(308);
    const url = new URL(response.headers.get("Location")!, "https://example.invalid");
    expect(decodeURIComponent(url.pathname)).toBe("/1/market/items/unid:Art/Unique");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
        identified: "false",
        corrupted: "true",
        foil: "3",
        kind: "watchers-eye",
        value: "a/b",
        currency: "alt",
    });
    expect(getMarketData).not.toHaveBeenCalled();
});

it("keeps an empty detail route navigable", async () => {
    vi.mocked(getMarketData).mockImplementation(async (_db, filters) => ({
        ...marketFixture(filters),
        history: [],
    }));
    showMarket("/1/market/items/Missing?league=Allflame");
    expect(
        await screen.findByText("No observations for this variant in the selected period."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /Back to markets/ })).toBeTruthy();
});

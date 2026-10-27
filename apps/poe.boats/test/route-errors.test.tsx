// @vitest-environment jsdom
// biome-ignore-all lint/style/useNamingConvention: Route configuration uses PascalCase components.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRoutesStub, useLoaderData } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import SiteLayout, { ErrorBoundary as SiteErrorBoundary } from "~/routes/layouts/site";
import Market from "~/routes/market";
import { ErrorBoundary as MarketItemErrorBoundary } from "~/routes/market/item";

vi.mock("~/components/app-header", () => ({ AppHeader: () => <header>Header</header> }));
vi.mock("~/components/app-footer", () => ({ AppFooter: () => <footer>Footer</footer> }));
vi.mock("~/db/queries/market.queries", () => ({ getMarketData: vi.fn() }));
beforeEach(() => {
    // React reports every caught render error to the console.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

function Broken(): never {
    throw new Error("Chart failed to render");
}

it("keeps the site header and footer when a page throws", () => {
    const Routes = createRoutesStub([
        {
            Component: SiteLayout,
            ErrorBoundary: SiteErrorBoundary,
            children: [{ path: "/changelog", Component: Broken }],
        },
    ]);
    render(<Routes initialEntries={["/changelog"]} />);

    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("contentinfo")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Chart failed to render");
});

it("keeps the market category navigation when a market page throws", () => {
    const Routes = createRoutesStub([
        {
            path: "/1/market",
            Component: Market,
            children: [
                {
                    path: "items/:item",
                    Component: Broken,
                    ErrorBoundary: MarketItemErrorBoundary,
                },
            ],
        },
    ]);
    render(<Routes initialEntries={["/1/market/items/example"]} />);

    expect(screen.getByRole("navigation", { name: "Market categories" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Chart failed to render");
});

it("shows a not-found message without a retry for 404 responses", async () => {
    const Routes = createRoutesStub([
        {
            path: "/1/market",
            Component: Market,
            children: [
                {
                    path: "items/:item",
                    loader: () => {
                        throw new Response("Unknown item", { status: 404 });
                    },
                    Component: () => null,
                    ErrorBoundary: MarketItemErrorBoundary,
                },
            ],
        },
    ]);
    render(<Routes initialEntries={["/1/market/items/example"]} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The requested page could not be found.");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
});

it("reloads the failed route when the reader tries again", async () => {
    let calls = 0;
    const Routes = createRoutesStub([
        {
            path: "/1/market/items/:item",
            loader: () => {
                calls += 1;
                if (calls === 1) throw new Error("Database timed out");
                return { name: "Abberath's Hooves" };
            },
            Component: () => <p>{useLoaderData<{ name: string }>().name}</p>,
            ErrorBoundary: MarketItemErrorBoundary,
        },
    ]);
    render(<Routes initialEntries={["/1/market/items/example"]} />);

    expect((await screen.findByRole("alert")).textContent).toContain("Database timed out");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Abberath's Hooves")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
});

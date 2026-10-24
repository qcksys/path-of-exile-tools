// @vitest-environment jsdom
// biome-ignore-all lint/style/useNamingConvention: Route configuration uses PascalCase components.
import { cleanup, render, screen, within } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, expect, it, vi } from "vite-plus/test";
import SiteLayout, { type SiteHandle } from "~/routes/layouts/site";

vi.mock("~/components/app-header", () => ({
    AppHeader: ({ section, sectionBadge }: SiteHandle) => (
        <header>
            <span>{section}</span>
            <span>{sectionBadge}</span>
        </header>
    ),
}));
vi.mock("~/components/app-footer", () => ({ AppFooter: () => <footer>Data provenance</footer> }));
afterEach(cleanup);

function showRoute(path: string) {
    const Routes = createRoutesStub([
        {
            Component: SiteLayout,
            children: [
                {
                    path: "/1/market",
                    handle: {
                        section: "Season market",
                        sectionBadge: "Estimates",
                    } satisfies SiteHandle,
                    Component: () => <main>Market</main>,
                    children: [
                        {
                            path: "items/:item",
                            handle: { section: "Item" } satisfies SiteHandle,
                            Component: () => <p>Item</p>,
                        },
                    ],
                },
                { path: "/changelog", Component: () => <main>Changelog</main> },
            ],
        },
    ]);
    return render(<Routes initialEntries={[path]} />);
}

it("renders one header and footer around the matched page", () => {
    showRoute("/changelog");
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
    expect(screen.getByRole("main").textContent).toBe("Changelog");
});

it("fills the header from the matched route's handle", () => {
    showRoute("/1/market");
    const header = within(screen.getByRole("banner"));
    expect(header.getByText("Season market")).toBeTruthy();
    expect(header.getByText("Estimates")).toBeTruthy();
});

it("uses the deepest handle when nested routes both define one", () => {
    showRoute("/1/market/items/example");
    const header = within(screen.getByRole("banner"));
    expect(header.getByText("Item")).toBeTruthy();
    expect(header.queryByText("Season market")).toBeNull();
});

// @vitest-environment jsdom
// biome-ignore-all lint/style/useNamingConvention: React Router components use PascalCase.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createRoutesStub, RouterContextProvider, useLoaderData } from "react-router";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { dbContext } from "~/context";
import { createDbConnection } from "~/db/client";
import { findBossStashQuotes } from "~/db/queries/boss-rota.queries";
import { getMarketExchangePrices, getMarketSeasons } from "~/db/queries/market.queries";
import BossRotaPage, { loader } from "~/routes/boss-rota";

vi.mock("~/components/route-error", () => ({ RouteError: () => null }));
vi.mock("~/db/queries/boss-rota.queries", () => ({ findBossStashQuotes: vi.fn() }));
vi.mock("~/db/queries/market.queries", () => ({
    getMarketSeasons: vi.fn(),
    getMarketExchangePrices: vi.fn(),
}));
afterEach(cleanup);

it("opens a boss breakdown and reprices the requested number of solo kills", async () => {
    vi.mocked(getMarketSeasons).mockResolvedValue({
        seasons: [{ league: "Standard", firstHour: 3600, latestHour: 3600 }],
        exchangeSeasons: [],
    });
    vi.mocked(getMarketExchangePrices).mockImplementation(async (_, { itemIds }) => ({
        latestHour: 3600,
        unit: "chaos",
        prices: new Map(itemIds.map((id) => [id, { price: 2, hour: 3600 }])),
    }));
    vi.mocked(findBossStashQuotes).mockResolvedValue(new Map());
    const context = new RouterContextProvider();
    context.set(dbContext, createDbConnection("mysql://user:pass@example.invalid/test"));
    const path = "/1/boss-rota/:boss?";
    const Component = () => <BossRotaPage loaderData={useLoaderData()} />;
    const Routes = createRoutesStub([
        {
            path,
            loader: ({ request, params }) =>
                loader({
                    request,
                    context,
                    params: { boss: params.boss },
                    pattern: path,
                    url: new URL(request.url),
                }),
            Component,
        },
    ]);
    render(<Routes initialEntries={["/1/boss-rota"]} />);
    fireEvent.click(await screen.findByRole("link", { name: "Shaper" }));
    expect(await screen.findByRole("heading", { name: "Shaper rota" })).toBeTruthy();
    const unknown = screen.getByRole("row", { name: /Dying Sun/ });
    expect(within(unknown).getByText("2%")).toBeTruthy();
    expect(within(unknown).getByText("Unpriced")).toBeTruthy();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Kills" }), {
        target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    expect(
        await screen.findByRole("heading", { name: "Expected return for 10 kills" }),
    ).toBeTruthy();
    const summary = screen.getByRole("row", { name: /^Shaper 80 c/ });
    expect(within(summary).getByText("≥ -57 c")).toBeTruthy();
});

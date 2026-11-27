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
vi.mock("~/db/queries/boss-rota.queries", () => ({
    findBossStashQuotes: vi.fn(),
    findBossItemArt: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("~/db/queries/market.queries", () => ({
    getMarketSeasons: vi.fn(),
    getMarketExchangePrices: vi.fn(),
}));
afterEach(() => {
    cleanup();
    localStorage.clear();
});

it("opens a boss breakdown and reprices the requested number of solo kills", async () => {
    vi.mocked(getMarketSeasons).mockResolvedValue({
        seasons: [{ league: "Standard", firstHour: 3600, latestHour: 3600 }],
        exchangeSeasons: [],
    });
    vi.mocked(getMarketExchangePrices).mockImplementation(async (_, { itemIds }) => ({
        latestHour: 3600,
        unit: "chaos",
        prices: new Map(itemIds.map((id) => [id, { price: 2, hour: 3600, units24h: 48 }])),
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
    const filter = await screen.findByRole("searchbox", { name: "Filter bosses" });
    fireEvent.change(filter, { target: { value: "Shaper" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    await vi.waitFor(() => expect(screen.queryByRole("link", { name: "Maven" })).toBeNull());
    fireEvent.click(screen.getByRole("link", { name: "Sort by Boss" }));
    await vi.waitFor(() =>
        expect(
            screen.getByRole("columnheader", { name: "Sort by Boss" }).getAttribute("aria-sort"),
        ).toBe("ascending"),
    );
    expect(screen.getByRole("link", { name: "Sort by 100 runs" })).toBeTruthy();
    fireEvent.click(await screen.findByRole("link", { name: "Shaper" }));
    expect(await screen.findByRole("heading", { name: "Shaper rota" })).toBeTruthy();
    const unknown = screen.getByRole("row", { name: /Dying Sun/ });
    expect(within(unknown).getByText("2%")).toBeTruthy();
    expect(within(unknown).getByText("Unpriced")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Unique Pool" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Guaranteed" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Additional Drops" })).toBeTruthy();
    const pool = within(screen.getByRole("table", { name: "Unique Pool" }));
    fireEvent.change(pool.getByRole("textbox", { name: "Filter Item" }), {
        target: { value: "Dying" },
    });
    expect(pool.queryByRole("link", { name: "Voidwalker" })).toBeNull();
    expect(pool.getByRole("link", { name: "Dying Sun" })).toBeTruthy();
    expect(
        screen.getByRole("link", { name: "Fragment of the Hydra" }).getAttribute("href"),
    ).toContain("/1/market/exchange/MapFragments/CurrencyShaperFragment4");
    expect(
        screen
            .getByRole("link", { name: "Fragment of the Hydra" })
            .querySelector("[data-item-art]"),
    ).toBeTruthy();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Kills" }), {
        target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    expect(
        await screen.findByRole("heading", { name: "Expected return for 10 kills" }),
    ).toBeTruthy();
    const summary = screen.getByRole("row", { name: /^Shaper / });
    expect(within(summary).getByTitle("Average net for 10 runs").textContent).toContain("≥ -28.5");
    expect(summary.querySelector('[data-currency="divine"]')).toBeTruthy();
    expect(screen.getAllByText("2 units/h · 48 traded / 24h").length).toBeGreaterThan(0);
    const seconds = screen.getByRole("spinbutton", { name: "Seconds per kill" });
    fireEvent.change(seconds, { target: { value: "90" } });
    fireEvent.blur(seconds);
    fireEvent.click(screen.getByRole("button", { name: "Track 10 kills" }));
    const add = await screen.findByRole("button", { name: "Add one Fragment of Shape" });
    fireEvent.click(add);
    fireEvent.click(add);
    const row = within(screen.getByRole("table", { name: "Recorded drops" })).getByRole("row", {
        name: /Fragment of Shape/,
    });
    expect(within(row).getByText("3 below")).toBeTruthy();
    expect(within(row).getAllByRole("cell")[1]?.textContent).toContain("2");
    expect(screen.getByText("Logged net").nextElementSibling?.textContent).toContain("-38");
    cleanup();
    render(<Routes initialEntries={["/1/boss-rota/shaper?league=Standard&runs=10&q=Shaper"]} />);
    expect(
        await screen.findByRole("button", { name: "Remove one Fragment of Shape" }),
    ).toBeTruthy();
    expect((screen.getByLabelText("Seconds per kill") as HTMLInputElement).value).toBe("90");
    expect(screen.getByText("Logged net per hour").nextElementSibling?.textContent).toContain(
        "-152",
    );
    expect(screen.getByRole("link", { name: "All bosses" }).getAttribute("href")).toContain(
        "q=Shaper",
    );
});

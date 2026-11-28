// @vitest-environment jsdom
// biome-ignore-all lint/style/useNamingConvention: React Router components use PascalCase.
import {
    act,
    cleanup,
    fireEvent,
    render,
    renderHook,
    screen,
    within,
} from "@testing-library/react";
import { createRoutesStub, RouterContextProvider, useLoaderData } from "react-router";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { useBossPace } from "~/components/boss-rota-tracker";
import { dbContext } from "~/context";
import { createDbConnection } from "~/db/client";
import { findBossStashQuotes } from "~/db/queries/boss-rota.queries";
import { getMarketExchangePrices, getMarketSeasons } from "~/db/queries/market.queries";
import BossRotaPage, { loader } from "~/routes/boss-rota";

vi.mock("~/components/route-error", () => ({ RouteError: () => null }));
vi.mock("~/db/queries/boss-rota.queries", () => ({
    findBossStashQuotes: vi.fn(),
    findBossItemArt: vi.fn().mockResolvedValue(new Map()),
    findBossLeagues: vi.fn().mockResolvedValue([]),
}));
vi.mock("~/db/queries/market.queries", () => ({
    getMarketSeasons: vi.fn(),
    getMarketExchangePrices: vi.fn(),
}));
afterEach(() => {
    cleanup();
    localStorage.clear();
});

it("inherits each boss's most recent saved time and keeps league overrides and clears after reload", () => {
    localStorage.setItem("boss-rota:pace:Standard", JSON.stringify({ atziri: 75, shaper: 150 }));
    localStorage.setItem("boss-rota:pace:Older", JSON.stringify({ shaper: 120, maven: 60 }));
    localStorage.setItem("boss-rota:pace:Previous", JSON.stringify({ shaper: 90 }));
    localStorage.setItem("boss-rota:pace:Damaged", "invalid");
    localStorage.setItem("boss-rota:pace:Current", JSON.stringify({ elder: 70 }));
    const prior = ["Damaged", "Previous", "Older", "Standard"];
    const current = renderHook(() => useBossPace("Current", prior));
    expect(current.result.current[0]).toEqual({ shaper: 90, maven: 60, atziri: 75, elder: 70 });
    act(() => current.result.current[1]("shaper", 45));
    act(() => current.result.current[1]("maven", null));
    current.unmount();
    expect(JSON.parse(localStorage.getItem("boss-rota:pace:Previous")!)).toEqual({ shaper: 90 });
    const next = renderHook(() => useBossPace("Next", ["Current", ...prior]));
    expect(next.result.current[0]).toEqual({ shaper: 45, maven: null, atziri: 75, elder: 70 });
    act(() => {
        localStorage.setItem(
            "boss-rota:pace:Current",
            JSON.stringify({ shaper: 55, maven: null, elder: 70 }),
        );
        window.dispatchEvent(new Event("storage"));
    });
    expect(next.result.current[0].shaper).toBe(55);
});

function setupRoutes() {
    vi.mocked(getMarketSeasons).mockResolvedValue({
        seasons: [
            { league: "Standard", firstHour: 3600, latestHour: 3600 },
            { league: "New season", firstHour: 7200, latestHour: 7200 },
        ],
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
    return createRoutesStub([
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
}

it("applies, shares and clears a saved invitation quantity per boss", async () => {
    const Routes = setupRoutes();
    const path = "/1/boss-rota/eater-of-worlds?league=Standard";
    render(<Routes initialEntries={[path]} />);
    const field = await screen.findByRole("spinbutton", { name: "Invitation quantity (%)" });
    expect(field.getAttribute("placeholder")).toBe("Default 70");
    fireEvent.change(field, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    await screen.findByText(/Additional drop chances use 0%/);
    expect(screen.getByRole("link", { name: "All bosses" }).getAttribute("href")).toContain(
        "eaterQuantity=0",
    );
    cleanup();
    render(<Routes initialEntries={[path]} />);
    await screen.findByText(/Additional drop chances use 0%/);
    fireEvent.change(screen.getByLabelText("Invitation quantity (%)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    await screen.findByText(/Additional drop chances use 70%/);
    expect(localStorage.getItem("boss-rota:eaterQuantity")).toBeNull();
    cleanup();
    render(<Routes initialEntries={["/1/boss-rota/uber-eater-of-worlds?league=Standard"]} />);
    await screen.findByText("Uber Eater rota");
    expect(screen.queryByLabelText("Invitation quantity (%)")).toBeNull();
});

it("opens a boss breakdown and reprices the requested number of solo kills", async () => {
    const Routes = setupRoutes();
    render(<Routes initialEntries={["/1/boss-rota"]} />);
    const filter = await screen.findByRole("searchbox", { name: "Filter bosses" });
    const shaperTime = screen.getByRole("spinbutton", { name: "Seconds per kill for Shaper" });
    fireEvent.change(shaperTime, { target: { value: "72" } });
    expect(within(screen.getByRole("row", { name: /^Shaper / })).getByText("/hour")).toBeTruthy();
    expect(
        (screen.getByLabelText("Seconds per kill for Uber Shaper") as HTMLInputElement).value,
    ).toBe("");
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
    expect((screen.getByLabelText("Seconds per kill") as HTMLInputElement).value).toBe("72");
    const unknown = screen.getByRole("row", { name: /Dying Sun/ });
    expect(within(unknown).getByText("2%").style.color).toContain("--chart-5");
    expect(within(unknown).getByText("Unpriced").style.color).toBe("");
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
    expect(within(row).getByText("3 below").style.color).toContain("--chart-5");
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
    fireEvent.click(screen.getByRole("link", { name: "All bosses" }));
    const saved = await screen.findByLabelText("Seconds per kill for Shaper");
    expect((saved as HTMLInputElement).value).toBe("90");
    fireEvent.change(saved, { target: { value: "0" } });
    fireEvent.blur(saved);
    expect((saved as HTMLInputElement).value).toBe("90");
    fireEvent.change(saved, { target: { value: "" } });
    expect(within(screen.getByRole("row", { name: /^Shaper / })).queryByText("/hour")).toBeNull();
    fireEvent.change(saved, { target: { value: "64" } });
    cleanup();
    render(<Routes initialEntries={["/1/boss-rota/shaper?league=New+season"]} />);
    expect(((await screen.findByLabelText("Seconds per kill")) as HTMLInputElement).value).toBe(
        "64",
    );
    expect(screen.queryByRole("table", { name: "Recorded drops" })).toBeNull();
});

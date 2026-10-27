// @vitest-environment jsdom
// biome-ignore-all lint/style/useNamingConvention: React Router fixture components use PascalCase.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createRoutesStub, RouterContextProvider, useLoaderData, useLocation } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { dbContext } from "~/context";
import { createDbConnection } from "~/db/client";
import { getMarketExchangeItem, getPoe2MarketExchange } from "~/db/queries/market.queries";
import type { MarketExchangeRow } from "~/lib/market-exchange";
import Poe2MarketIndex, { loader as listLoader } from "~/routes/market/poe2";
import Poe2MarketExchangeItem, { loader as exchangeLoader } from "~/routes/market/poe2-exchange";
import Poe2Market from "~/routes/market-poe2";
import type { Poe2MarketFilters } from "~/schemas/market";

vi.mock("~/components/app-header", () => ({ AppHeader: () => null }));
vi.mock("~/components/app-footer", () => ({ AppFooter: () => null }));
vi.mock("~/db/queries/market.queries", () => ({
    getMarketExchangeItem: vi.fn(),
    getPoe2MarketExchange: vi.fn(),
}));
const context = new RouterContextProvider();
context.set(dbContext, createDbConnection("mysql://user:pass@example.invalid/test"));

const hour = 1_792_836_000;
const divine = "Metadata/Items/Currency/CurrencyModValues";
const rune = "Metadata/Items/SoulCores/RuneFire";
const season = { league: "Rites", firstHour: hour - 86400, latestHour: hour };

const runeRow: MarketExchangeRow = {
    itemId: rune,
    name: "Desert Rune",
    category: "runes",
    price: 800,
    via: { itemId: divine, name: "Divine Orb" },
    hour,
    current: true,
    volume: 12_000,
    history: [600, null, null, null, null, null, 800],
    change: 1 / 3,
    pair: { quoteId: divine, name: "Divine Orb", rate: 2 },
};

function exchangeFixture(filters: Poe2MarketFilters) {
    const league = filters.league || season.league;
    return {
        filters: { ...filters, league },
        seasons: [season],
        season,
        unit: "exalted" as const,
        divine: 400,
        rows: filters.category === "runes" ? [runeRow] : [],
    };
}

beforeEach(() => {
    vi.mocked(getPoe2MarketExchange).mockImplementation(async (_db, filters) =>
        exchangeFixture(filters),
    );
    vi.mocked(getMarketExchangeItem).mockImplementation(async (_db, input) => ({
        realm: input.realm,
        league: input.league || season.league,
        latestHour: hour,
        historyStart: hour - Number(input.days) * 86400 + 3600,
        unit: "exalted",
        item: input.itemId === rune ? runeRow : null,
        divine: 400,
        history: {
            prices: [{ hour, price: 800, low: 760, high: 840, via: divine, units: 30 }],
            pairs: [
                {
                    quoteId: divine,
                    name: "Divine Orb",
                    hours: [{ hour, rate: 2, low: 1.9, high: 2.1, units: 30 }],
                },
            ],
        },
    }));
});
afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

function showMarket(path: string) {
    const Routes = createRoutesStub([
        {
            path: "/2/market",
            Component: () => (
                <>
                    <Poe2Market />
                    <output aria-label="Current URL">
                        {useLocation().pathname}
                        {useLocation().search}
                    </output>
                </>
            ),
            children: [
                {
                    path: ":category?",
                    loader: ({ request, params }) =>
                        listLoader({
                            request,
                            context,
                            params: { category: params.category },
                            unstable_pattern: "/2/market/:category?",
                            unstable_url: new URL(request.url),
                        }),
                    Component: () => <Poe2MarketIndex loaderData={useLoaderData()} />,
                },
                {
                    path: "exchange/*",
                    loader: ({ request, params }) =>
                        exchangeLoader({
                            request,
                            context,
                            params: { "*": params["*"]! },
                            unstable_pattern: "/2/market/exchange/*",
                            unstable_url: new URL(request.url),
                        }),
                    Component: () => <Poe2MarketExchangeItem loaderData={useLoaderData()} />,
                },
            ],
        },
    ]);
    return render(<Routes initialEntries={[path]} />);
}

it("lists a category's exchange items valued in exalted, with divine and exalted displays", async () => {
    showMarket("/2/market/runes?league=Rites");
    const table = await screen.findByRole("table", { name: "Runes exchange" });
    const row = within(table).getByRole("link", { name: "Desert Rune" }).closest("tr")!;
    const value = () => row.cells[1]!.querySelector("p")!.textContent;
    expect(value()).toBe("2 divine≈ 800 exalted");
    expect(row.cells[1]!.textContent).toContain("via Divine Orb");
    fireEvent.click(screen.getByRole("button", { name: "Exalted Orb" }));
    expect(value()).toBe("800 exalted");
    expect(screen.queryByRole("button", { name: "Chaos Orb" })).toBeNull();
    expect(screen.getByRole("link", { name: "Runes" }).getAttribute("aria-current")).toBe("page");
    expect(getPoe2MarketExchange).toHaveBeenLastCalledWith(expect.anything(), {
        league: "Rites",
        q: "",
        days: "7",
        category: "runes",
    });
});

it("says when a category has no exchange items", async () => {
    showMarket("/2/market/breach?league=Rites");
    const section = await screen.findByRole("region", { name: "Breach" });
    expect(within(section).getByRole("status").textContent).toContain("No exchange items match");
});

it("opens a PoE 2 exchange item's page and returns to its category", async () => {
    showMarket("/2/market/runes?league=Rites&days=30");
    const table = await screen.findByRole("table", { name: "Runes exchange" });
    fireEvent.click(within(table).getByRole("link", { name: "Desert Rune" }));
    const page = await screen.findByRole("region", { name: "Exchange item" });
    expect(screen.getByLabelText("Current URL").textContent).toMatch(
        /^\/2\/market\/exchange\/SoulCores\/RuneFire\?.*category=runes/,
    );
    expect(getMarketExchangeItem).toHaveBeenLastCalledWith(expect.anything(), {
        realm: "poe2",
        league: "Rites",
        days: "30",
        itemId: rune,
    });
    expect(page.textContent).toContain("Runes · Rites · Currency exchange");
    expect(page.textContent).toContain("Exalted value, averaged over 7 days");
    expect(within(page).getByRole("button", { name: "Exalted value" })).toBeTruthy();
    fireEvent.click(within(page).getByRole("link", { name: /Back to markets/ }));
    await screen.findByRole("table", { name: "Runes exchange" });
    expect(screen.getByLabelText("Current URL").textContent).toMatch(/^\/2\/market\/runes\?/);
});

it("redirects the bare market path and category queries to a category path", async () => {
    for (const url of [
        "https://example.invalid/2/market?league=Rites",
        "https://example.invalid/2/market?league=Rites&category=currency",
    ]) {
        const response = await listLoader({
            request: new Request(url),
            context,
            params: {},
            unstable_pattern: "/2/market/:category?",
            unstable_url: new URL(url),
        });
        if (!(response instanceof Response)) throw new Error("Expected redirect");
        expect(response.status).toBe(308);
        expect(response.headers.get("Location")).toBe("/2/market/currency?league=Rites&days=7&q=");
    }
    expect(getPoe2MarketExchange).not.toHaveBeenCalled();
});

it("rejects unknown categories and items outside the exchange catalogue", async () => {
    await expect(
        listLoader({
            request: new Request("https://example.invalid/2/market/weapons"),
            context,
            params: { category: "weapons" },
            unstable_pattern: "/2/market/:category?",
            unstable_url: new URL("https://example.invalid/2/market/weapons"),
        }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
        exchangeLoader({
            request: new Request("https://example.invalid/2/market/exchange/Unknown"),
            context,
            params: { "*": "Unknown" },
            unstable_pattern: "/2/market/exchange/*",
            unstable_url: new URL("https://example.invalid/2/market/exchange/Unknown"),
        }),
    ).rejects.toMatchObject({ status: 404 });
});

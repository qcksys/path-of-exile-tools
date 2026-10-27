// @vitest-environment jsdom
// biome-ignore-all lint/style/useNamingConvention: React Router fixture components use PascalCase.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRoutesStub, RouterContextProvider, useLoaderData, useLocation } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { dbContext } from "~/context";
import { createDbConnection } from "~/db/client";
import { getMarketData, getMarketExchangeItem } from "~/db/queries/market.queries";
import Market from "~/routes/market";
import MarketExchangeItem, { loader as exchangeLoader } from "~/routes/market/exchange";
import MarketIndex, { loader as listLoader } from "~/routes/market/index";
import MarketItem, { loader as itemLoader } from "~/routes/market/item";
import { changeControl } from "./control-helpers";
import { marketExchangeFixture, marketFixture } from "./market-fixtures";

vi.mock("~/components/app-header", () => ({ AppHeader: () => null }));
vi.mock("~/components/app-footer", () => ({ AppFooter: () => null }));
vi.mock("~/db/queries/market.queries", () => ({
    getMarketData: vi.fn(),
    getMarketExchangeItem: vi.fn(),
}));
const context = new RouterContextProvider();
context.set(dbContext, createDbConnection("mysql://user:pass@example.invalid/test"));

beforeEach(() => {
    vi.mocked(getMarketData).mockImplementation(async (_db, filters) => marketFixture(filters));
    vi.mocked(getMarketExchangeItem).mockImplementation(async (_db, input) =>
        marketExchangeFixture(input),
    );
});
afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

function showMarket(path = "/1/market/armour?league=Allflame&order=name-asc&page=2") {
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
                    path: ":category?",
                    loader: ({ request, params }) =>
                        listLoader({
                            request,
                            context,
                            params: { category: params.category },
                            unstable_pattern: "/1/market/:category?",
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
                {
                    path: "exchange/*",
                    loader: ({ request, params }) =>
                        exchangeLoader({
                            request,
                            context,
                            params: { "*": params["*"]! },
                            unstable_pattern: "/1/market/exchange/*",
                            unstable_url: new URL(request.url),
                        }),
                    Component: () => <MarketExchangeItem loaderData={useLoaderData()} />,
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
    expect(screen.getByLabelText("Current URL").textContent).toMatch(/^\/1\/market\/armour\?/);
    expect(screen.getByLabelText("Current URL").textContent).not.toContain("category=");
    expect(screen.getByLabelText("Current URL").textContent).toContain("page=2");
    expect(screen.getByLabelText("Current URL").textContent).toContain("order=name-asc");
    expect(screen.queryByRole("region", { name: "Item price history" })).toBeNull();
});

it("lists listing currencies cheapest first with their chaos or divine equivalent", async () => {
    showMarket();
    const cell = (await screen.findByText("n=4")).closest("td")!;
    expect([...cell.querySelectorAll("p")].map((price) => price.textContent)).toEqual([
        "15 chaos≈ 0.1 divinen=4",
        "2 divine≈ 300 chaosn=5",
    ]);
});

function exchangeRow(table: HTMLElement, name: string) {
    return within(table).getByRole("link", { name }).closest("tr")!;
}

it("shows exchange-traded items with their value, trend, volume and most traded pair", async () => {
    showMarket("/1/market?league=Allflame&category=armour");
    const table = await screen.findByRole("table", { name: "Unique armour exchange" });
    const row = exchangeRow(table, "Scroll of Wisdom");
    const cells = [...row.querySelectorAll("td")].map((cell) => cell.textContent);
    expect(cells).toEqual([
        "Scroll of Wisdom",
        "0.002 chaos≈ 0.00001333 divine",
        "+25%",
        "1.5K chaos",
        "1Chaos Orb⇄for500Scroll of Wisdom",
    ]);
    expect(screen.getByText("1 on the exchange · 1 variants")).toBeTruthy();
    expect(
        within(table).getByRole("link", { name: "Scroll of Wisdom" }).getAttribute("href"),
    ).toMatch(/^\/1\/market\/exchange\/Currency\/CurrencyIdentification\?.*category=armour/);
});

it("switches exchange values between adaptive, chaos and divine", async () => {
    vi.mocked(getMarketData).mockImplementation(async (_db, filters) => {
        const fixture = marketFixture(filters);
        return {
            ...fixture,
            exchange: fixture.exchange.map((row) => ({ ...row, chaos: 300 })),
        };
    });
    showMarket("/1/market?league=Allflame&category=armour");
    const table = await screen.findByRole("table", { name: "Unique armour exchange" });
    const value = () => exchangeRow(table, "Scroll of Wisdom").cells[1]!;
    expect(value().textContent).toBe("2 divine≈ 300 chaos");
    fireEvent.click(screen.getByRole("button", { name: "Chaos Orb" }));
    expect(value().textContent).toBe("300 chaos");
    fireEvent.click(screen.getByRole("button", { name: "Divine Orb" }));
    expect(value().textContent).toBe("2 divine");
    expect(screen.getByRole("button", { name: "Divine Orb" }).getAttribute("aria-pressed")).toBe(
        "true",
    );
});

it("marks an exchange price from an earlier day and names its conversion", async () => {
    vi.mocked(getMarketData).mockImplementation(async (_db, filters) => {
        const fixture = marketFixture(filters);
        return {
            ...fixture,
            exchange: fixture.exchange.map((row) => ({
                ...row,
                current: false,
                hour: 1_792_810_800,
                via: { itemId: "Metadata/Items/Currency/CurrencyModValues", name: "Divine Orb" },
            })),
        };
    });
    showMarket("/1/market?league=Allflame&category=armour");
    const table = await screen.findByRole("table", { name: "Unique armour exchange" });
    const value = exchangeRow(table, "Scroll of Wisdom").cells[1]!;
    expect(value.textContent).toContain("Last traded 2026-10-24 03:00 UTC");
    expect(value.textContent).toContain("via Divine Orb");
    expect(value.querySelector("p")!.className).toContain("text-muted-foreground");
});

it("labels exchange items without a price by whether they traded", async () => {
    vi.mocked(getMarketData).mockImplementation(async (_db, filters) => {
        const fixture = marketFixture(filters);
        const row = { ...fixture.exchange[0]!, chaos: null, current: false, volume: null };
        return {
            ...fixture,
            exchange: [
                { ...row, hour: null, history: Array(7).fill(null), change: null, pair: null },
                { ...row, itemId: "Metadata/Items/Currency/CurrencyPortal", name: "Portal Scroll" },
            ],
        };
    });
    showMarket("/1/market?league=Allflame&category=armour");
    const table = await screen.findByRole("table", { name: "Unique armour exchange" });
    expect(exchangeRow(table, "Scroll of Wisdom").cells[1]!.textContent).toBe(
        "No trades in 7 days",
    );
    expect(exchangeRow(table, "Portal Scroll").cells[1]!.textContent).toBe("No rate");
});

it("opens an exchange item's page with its history and returns to the list", async () => {
    showMarket("/1/market?league=Allflame&category=armour&order=name-asc&days=30");
    const table = await screen.findByRole("table", { name: "Unique armour exchange" });
    fireEvent.click(within(table).getByRole("link", { name: "Scroll of Wisdom" }));
    const page = await screen.findByRole("region", { name: "Exchange item" });
    expect(within(page).getByRole("heading", { level: 2 }).textContent).toBe("Scroll of Wisdom");
    // The list's period sets the hourly history's window.
    expect(getMarketExchangeItem).toHaveBeenLastCalledWith(expect.anything(), {
        realm: "pc",
        league: "Allflame",
        days: "30",
        itemId: "Metadata/Items/Currency/CurrencyIdentification",
    });
    expect(page.textContent).toContain("Traded in the latest hour");
    expect(
        within(page).getByRole("heading", { level: 3, name: /Hourly price history/ }).textContent,
    ).toContain("last 30 days");
    const pairs = within(page).getByRole("region", { name: "Exchange pairs" });
    expect(
        within(pairs)
            .getAllByRole("row")
            .map((row) => (row as HTMLTableRowElement).cells[0]!.textContent),
    ).toEqual(["Traded against", "Chaos Orb", "Divine Orb"]);
    const history = within(page).getByRole("region", { name: "Price history" });
    fireEvent.click(
        within(history).getByRole("button", { name: "Divine Orb per Scroll of Wisdom" }),
    );
    expect(
        within(history)
            .getByRole("button", { name: "Divine Orb per Scroll of Wisdom" })
            .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(within(page).getByRole("link", { name: /Back to markets/ }));
    await screen.findByRole("region", { name: "Item markets" });
    expect(screen.getByLabelText("Current URL").textContent).toMatch(/^\/1\/market\/armour\?/);
    expect(screen.getByLabelText("Current URL").textContent).toContain("order=name-asc");
});

it("answers 404 for an item outside the exchange catalogue", async () => {
    await expect(
        exchangeLoader({
            request: new Request("https://example.invalid/1/market/exchange/Unknown?league=X"),
            context,
            params: { "*": "Unknown" },
            unstable_pattern: "/1/market/exchange/*",
            unstable_url: new URL("https://example.invalid/1/market/exchange/Unknown"),
        }),
    ).rejects.toMatchObject({ status: 404 });
});

it("collapses listing currencies costing over three times the most listed one", async () => {
    vi.mocked(getMarketData).mockImplementation(async (_db, filters) => {
        const fixture = marketFixture(filters);
        return {
            ...fixture,
            rows: fixture.rows.map((row) => ({
                ...row,
                prices: {
                    chaos: { count: 32, min: 1, median: 1, max: 1 },
                    divine: { count: 1, min: 6, median: 6, max: 6 },
                },
            })),
        };
    });
    showMarket();
    const cell = (await screen.findByText("n=32")).closest("td")!;
    const details = cell.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")!.textContent).toBe("1 over 3× the most listed");
    expect(details.textContent).toContain("6 divine≈ 900 chaosn=1");
});

it("applies search and filters after a pause, resets pagination, and preserves them on category navigation", async () => {
    showMarket();
    const search = await screen.findByRole("searchbox", { name: "Search items" });
    search.focus();
    fireEvent.change(search, { target: { value: "Goat" } });
    fireEvent.change(search, { target: { value: "Goathide" } });
    expect(screen.getByLabelText("Current URL").textContent).not.toContain("q=");
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
    expect(getMarketData).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ q: "Goat" }),
        "list",
    );
    expect(document.activeElement).toBe(search);
    expect((search as HTMLInputElement).value).toBe("Goathide");

    changeControl(screen.getByRole("combobox", { name: "Identification" }), {
        target: { value: "true" },
    });
    await waitFor(() =>
        expect(getMarketData).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ q: "Goathide", identification: "true", category: "armour" }),
            "list",
        ),
    );
    fireEvent.click(
        within(screen.getByRole("navigation", { name: "Market categories" })).getByRole("link", {
            name: "Unique weapons",
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
        expect(
            screen.getByRole("link", { name: "Unique weapons" }).getAttribute("aria-current"),
        ).toBe("page"),
    );
    expect(screen.getByLabelText("Current URL").textContent).toMatch(/^\/1\/market\/weapons\?/);
});

it("redirects category query links to the category path", async () => {
    const response = await listLoader({
        request: new Request(
            "https://example.invalid/1/market?league=Allflame&category=weapons&order=listings-desc&currency=chaos",
        ),
        context,
        params: {},
        unstable_pattern: "/1/market/:category?",
        unstable_url: new URL("https://example.invalid/1/market"),
    });
    if (!(response instanceof Response)) throw new Error("Expected redirect");
    expect(response.status).toBe(308);
    const url = new URL(response.headers.get("Location")!, "https://example.invalid");
    expect(url.pathname).toBe("/1/market/weapons");
    expect(url.searchParams.has("category")).toBe(false);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
        league: "Allflame",
        order: "listings-desc",
        currency: "chaos",
    });
    expect(getMarketData).not.toHaveBeenCalled();
});

it("redirects the bare market path to the default category, keeping its filters", async () => {
    const response = await listLoader({
        request: new Request(
            "https://example.invalid/1/market?league=Allflame&order=listings-desc&priceMin=5",
        ),
        context,
        params: {},
        unstable_pattern: "/1/market/:category?",
        unstable_url: new URL("https://example.invalid/1/market"),
    });
    if (!(response instanceof Response)) throw new Error("Expected redirect");
    expect(response.status).toBe(308);
    const url = new URL(response.headers.get("Location")!, "https://example.invalid");
    expect(url.pathname).toBe("/1/market/currency");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
        league: "Allflame",
        order: "listings-desc",
        priceMin: "5",
    });
    expect(getMarketData).not.toHaveBeenCalled();
});

it("rejects unknown category paths", async () => {
    await expect(
        listLoader({
            request: new Request("https://example.invalid/1/market/nonsense"),
            context,
            params: { category: "nonsense" },
            unstable_pattern: "/1/market/:category?",
            unstable_url: new URL("https://example.invalid/1/market/nonsense"),
        }),
    ).rejects.toMatchObject({ status: 404 });
});

it("links between the variants of an item", async () => {
    showMarket("/1/market/items/Abberath's%20Hooves?league=Allflame&category=armour");
    const variants = await screen.findByRole("navigation", { name: "Item variants" });
    expect(
        within(variants)
            .getByRole("link", { name: /Standard/ })
            .getAttribute("aria-current"),
    ).toBe("page");
    fireEvent.click(within(variants).getByRole("link", { name: /Corrupted/ }));
    await waitFor(() =>
        expect(getMarketData).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({
                item: "Abberath's Hooves",
                corrupted: "true",
                category: "armour",
            }),
            "history",
        ),
    );
});

it("links an identified unique to its unidentified market", async () => {
    showMarket("/1/market/items/Abberath's%20Hooves?league=Allflame&category=armour");
    const variants = await screen.findByRole("navigation", { name: "Item variants" });
    expect(within(variants).getByRole("heading").textContent).toContain(
        "Variants of Abberath's Hooves",
    );
    const unidentified = within(variants).getByRole("link", { name: /Unidentified/ });
    expect(unidentified.getAttribute("aria-current")).toBeNull();
    fireEvent.click(unidentified);
    await waitFor(() =>
        expect(getMarketData).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({
                item: "unid:2DItems/Armours/Boots/AbberathsHooves",
                identified: "false",
            }),
            "history",
        ),
    );
});

it("values Watcher's Eye mods and narrows them to items with a required mod", async () => {
    showMarket(
        "/1/market/items/Watcher's%20Eye?league=Allflame&category=jewels&kind=watchers-eye&value=x",
    );
    const section = await screen.findByRole("region", { name: "Mod values" });
    const table = within(section).getByRole("table", { name: "Mod values" });
    expect(within(table).getByText("Haste: #% increased Movement Speed")).toBeTruthy();
    expect(within(section).getByRole("status").textContent).toContain("Cheapest item: 10");
    fireEvent.click(
        within(table).getByRole("link", { name: "Require: Haste: #% increased Movement Speed" }),
    );
    await waitFor(() =>
        expect(getMarketData).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({
                item: "Watcher's Eye",
                kind: "watchers-eye",
                value: "x",
                mods: "Haste: #% increased Movement Speed",
                anyMods: "",
            }),
            "history",
        ),
    );
    // The route re-renders after navigation; this file's default 1 s wait flakes under load.
    expect(
        await screen.findByRole(
            "link",
            { name: "Remove required mod: Haste: #% increased Movement Speed" },
            { timeout: 5000 },
        ),
    ).toBeTruthy();
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

it("sorts and filters the market list from its table headers through the URL", async () => {
    showMarket();
    const table = await screen.findByRole("table", { name: "Unique armour markets" });
    const itemHeader = within(table).getByRole("columnheader", { name: /Item \/ variant/ });
    expect(itemHeader.getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(within(table).getByRole("button", { name: "Likely sales" }));
    await waitFor(() =>
        expect(getMarketData).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ order: "sales", page: 1, category: "armour" }),
            "list",
        ),
    );
    await waitFor(() =>
        expect(
            within(screen.getByRole("table", { name: "Unique armour markets" }))
                .getByRole("columnheader", { name: /Likely sales/ })
                .getAttribute("aria-sort"),
        ).toBe("descending"),
    );

    const minimum = within(screen.getByRole("table", { name: "Unique armour markets" })).getByRole(
        "spinbutton",
        { name: "Minimum Median asking price" },
    );
    fireEvent.change(minimum, { target: { value: "1.5" } });
    expect(getMarketData).not.toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ priceMin: 1.5 }),
        "list",
    );
    fireEvent.keyDown(minimum, { key: "Enter" });
    await waitFor(() =>
        expect(screen.getByLabelText("Current URL").textContent).toContain("priceMin=1.5"),
    );

    const text = within(screen.getByRole("table", { name: "Unique armour markets" })).getByRole(
        "textbox",
        { name: "Filter Item / variant" },
    );
    fireEvent.change(text, { target: { value: "Goathide" } });
    fireEvent.blur(text);
    await waitFor(() =>
        expect(getMarketData).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ q: "Goathide", priceMin: 1.5, order: "sales", page: 1 }),
            "list",
        ),
    );
    await waitFor(() =>
        expect(
            (screen.getByRole("searchbox", { name: "Search items" }) as HTMLInputElement).value,
        ).toBe("Goathide"),
    );
});

it("keeps the column filters visible when they match nothing", async () => {
    vi.mocked(getMarketData).mockImplementation(async (_db, filters) => ({
        ...marketFixture(filters),
        rows: [],
        hasMore: false,
    }));
    showMarket("/1/market/armour?league=Allflame&priceMin=999");
    const table = await screen.findByRole("table", { name: "Item markets" });
    expect(within(table).getByRole("status").textContent).toContain(
        "No markets match these filters",
    );
    expect(
        (
            within(table).getByRole("spinbutton", {
                name: "Minimum Median asking price",
            }) as HTMLInputElement
        ).value,
    ).toBe("999");
});

it("searches, filters and sorts hourly observations in the browser", async () => {
    vi.mocked(getMarketData).mockImplementation(async (_db, filters) => {
        const fixture = marketFixture(filters);
        const [row] = fixture.history;
        return {
            ...fixture,
            history: [3, 7, 5].map((listingCount, index) => ({
                ...row!,
                hour: row!.hour + index * 3600,
                listingCount,
            })),
        };
    });
    showMarket("/1/market/items/Abberath's%20Hooves?league=Allflame");
    const table = await screen.findByRole("table", { name: "Hourly observations" });
    const listings = () =>
        within(table)
            .getAllByRole("row")
            .slice(1)
            .map((row) => within(row).getAllByRole("cell")[2]!.textContent);
    expect(listings()).toEqual(["5", "7", "3"]);

    fireEvent.click(within(table).getByRole("button", { name: "Listings observed" }));
    expect(listings()).toEqual(["7", "5", "3"]);

    fireEvent.change(within(table).getByRole("spinbutton", { name: "Minimum Listings observed" }), {
        target: { value: "4" },
    });
    expect(listings()).toEqual(["7", "5"]);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search Hourly observations" }), {
        target: { value: "12:00" },
    });
    expect(listings()).toEqual(["5"]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search Hourly observations" }), {
        target: { value: "no such hour" },
    });
    expect(within(table).getByText("No rows match these filters.")).toBeTruthy();
    expect(getMarketData).toHaveBeenCalledTimes(1);
});

it("lists crafting bases apart from uniques without unique-only filters", async () => {
    showMarket("/1/market/armour-bases?league=Allflame");
    const table = await screen.findByRole("table", { name: "Armour bases markets" });
    const row = within(table).getByText("Titan Plate").closest("tr")!;
    expect(row.textContent).toContain("ilvl 86–100 · 6 links");
    expect(row.textContent).toContain("60 chaos");
    expect(screen.queryByRole("link", { name: "Abberath's Hooves" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Identification" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Corruption" })).toBeNull();
    expect(
        within(screen.getByRole("navigation", { name: "Market categories" }))
            .getByRole("link", { name: "Armour bases" })
            .getAttribute("aria-current"),
    ).toBe("page");
    expect(getMarketData).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ category: "armour-bases" }),
        "list",
    );
});

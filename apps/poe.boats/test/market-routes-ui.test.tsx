// @vitest-environment jsdom
// biome-ignore-all lint/style/useNamingConvention: React Router fixture components use PascalCase.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRoutesStub, RouterContextProvider, useLoaderData, useLocation } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { dbContext } from "~/context";
import { createDbConnection } from "~/db/client";
import { getMarketBase, getMarketData, getMarketExchangeItem } from "~/db/queries/market.queries";
import Market from "~/routes/market";
import MarketBase, { loader as baseLoader } from "~/routes/market/base";
import MarketExchangeItem, { loader as exchangeLoader } from "~/routes/market/exchange";
import MarketIndex, { loader as listLoader } from "~/routes/market/index";
import MarketItem, { loader as itemLoader } from "~/routes/market/item";
import { changeControl, expectControlValue } from "./control-helpers";
import { marketBaseFixture, marketExchangeFixture, marketFixture } from "./market-fixtures";

vi.mock("~/components/app-header", () => ({ AppHeader: () => null }));
vi.mock("~/components/app-footer", () => ({ AppFooter: () => null }));
vi.mock("~/db/queries/market.queries", () => ({
    getMarketBase: vi.fn(),
    getMarketData: vi.fn(),
    getMarketExchangeItem: vi.fn(),
}));
vi.mock("~/hooks/use-item-presentations", () => ({
    useItemPresentations: () => ({
        "Metadata/Items/Armours/BodyArmours/BodyStr15": {
            name: "Titan Plate",
            itemClass: "Body Armour",
            art: "titan-plate.png",
            dropLevel: 68,
            requirements: null,
            implicits: [],
        },
    }),
}));
const context = new RouterContextProvider();
context.set(dbContext, createDbConnection("mysql://user:pass@example.invalid/test"));

beforeEach(() => {
    vi.mocked(getMarketData).mockImplementation(async (_db, filters) => marketFixture(filters));
    vi.mocked(getMarketExchangeItem).mockImplementation(async (_db, input) =>
        marketExchangeFixture(input),
    );
    vi.mocked(getMarketBase).mockImplementation(async (_db, input) => marketBaseFixture(input));
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
                {
                    path: "bases/:base",
                    loader: ({ request, params }) =>
                        baseLoader({
                            request,
                            context,
                            params: { base: params.base! },
                            unstable_pattern: "/1/market/bases/:base",
                            unstable_url: new URL(request.url),
                        }),
                    Component: () => <MarketBase loaderData={useLoaderData()} />,
                },
            ],
        },
    ]);
    return render(<Routes initialEntries={[path]} />);
}

it("renders list and detail through the layout outlet and restores browsing state", async () => {
    // The file's first navigations load each route cold, which can pass findBy's 1 s default.
    const cold = { timeout: 5000 };
    showMarket();
    fireEvent.click(await screen.findByRole("link", { name: "Abberath's Hooves" }, cold));
    expect(await screen.findByRole("heading", { name: "Abberath's Hooves" }, cold)).toBeTruthy();
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
    fireEvent.click(screen.getByRole("link", { name: /Back to markets/ }));
    await screen.findByRole("region", { name: "Item markets" }, cold);
    expect(screen.getByLabelText("Current URL").textContent).toMatch(/^\/1\/market\/armour\?/);
    expect(screen.getByLabelText("Current URL").textContent).not.toContain("category=");
    expect(screen.getByLabelText("Current URL").textContent).toContain("page=2");
    expect(screen.getByLabelText("Current URL").textContent).toContain("order=name-asc");
    expect(screen.queryByRole("region", { name: "Item price history" })).toBeNull();
});

it("shows the most listed currency and folds the others behind +N more", async () => {
    showMarket();
    const cell = (await screen.findByText("5 listed")).closest("td")!;
    const lines = () => [...cell.querySelectorAll("p")].map((price) => price.textContent);
    expect(lines()).toEqual(["2 divine≈ 300 chaos", "5 listed", "15 chaos 4 listed"]);
    const details = cell.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")!.textContent).toBe("+1 more");
    // Stash listings follow the same value display as exchange items, noting the listed amount.
    fireEvent.click(screen.getByRole("button", { name: "Chaos Orb" }));
    expect(lines()).toEqual(["300 chaos", "as 2 divine · 5 listed", "15 chaos 4 listed"]);
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
        "0.002 chaos≈ 0.00001333 divine+25% in 7 days",
        // Units traded in the latest 6 hours, day and 7 days, as the stash rows chart likely sales.
        "6h2K1d2K7d6K",
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
            exchange: fixture.exchange.map((row) => ({ ...row, price: 300 })),
        };
    });
    showMarket("/1/market?league=Allflame&category=armour");
    const table = await screen.findByRole("table", { name: "Unique armour exchange" });
    const value = () => exchangeRow(table, "Scroll of Wisdom").cells[1]!.querySelector("p")!;
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
        const row = { ...fixture.exchange[0]!, price: null, current: false, volume: null };
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

it("rounds prices to two places, leaving out divine equivalents under 0.01", async () => {
    vi.mocked(getMarketData).mockImplementation(async (_db, filters) => {
        const fixture = marketFixture(filters);
        return {
            ...fixture,
            chaosRates: { ...fixture.chaosRates, alch: 0.04965 },
            rows: fixture.rows.map((row) => ({
                ...row,
                prices: {
                    chaos: { count: 32, min: 1, median: 1, max: 1 },
                    alch: { count: 1, min: 1, median: 1, max: 1 },
                    divine: { count: 1, min: 6, median: 6, max: 6 },
                },
            })),
        };
    });
    showMarket();
    const cell = (await screen.findByText("32 listed")).closest("td")!;
    expect([...cell.querySelectorAll("p")].map((price) => price.textContent)).toEqual([
        "1 chaos",
        "32 listed",
        // Currencies cheaper than chaos show in chaos; fractions of a divine below 0.01 say so.
        "0.05 chaos as 1 alch · 1 listed",
        "6 divine 1 listed",
    ]);
    expect(cell.querySelector("summary")!.textContent).toBe("+2 more");
    fireEvent.click(screen.getByRole("button", { name: "Divine Orb" }));
    expect(cell.querySelector("p")!.textContent).toBe("< 0.01 divine");
});

it("applies search and filters after a pause, resets pagination, and keeps filters but not the search on category navigation", async () => {
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
    // The category links follow the URL, which commits after the loader runs.
    await waitFor(() =>
        expect(screen.getByLabelText("Current URL").textContent).toContain("identification=true"),
    );
    fireEvent.click(
        within(screen.getByRole("navigation", { name: "Market categories" })).getByRole("link", {
            name: "Unique weapons",
        }),
    );
    await waitFor(() =>
        expect(getMarketData).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({
                q: "",
                identification: "true",
                page: 1,
                category: "weapons",
            }),
            "list",
        ),
    );
    await waitFor(() =>
        expect(
            screen.getByRole("link", { name: "Unique weapons" }).getAttribute("aria-current"),
        ).toBe("page"),
    );
    expect(screen.getByLabelText("Current URL").textContent).toMatch(/^\/1\/market\/weapons\?/);
    await waitFor(() =>
        expect(
            (screen.getByRole("searchbox", { name: "Search items" }) as HTMLInputElement).value,
        ).toBe(""),
    );
});

it("searches unique equipment uncorrupted by default and carries only a changed corruption filter", async () => {
    showMarket("/1/market/armour?league=Allflame");
    const url = () => screen.getByLabelText("Current URL").textContent;
    const category = (name: string) =>
        within(screen.getByRole("navigation", { name: "Market categories" })).getByRole("link", {
            name,
        });
    const categoryHref = (name: string) => category(name).getAttribute("href");
    expectControlValue(await screen.findByRole("combobox", { name: "Corruption" }), "false");
    expect(getMarketData).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.not.objectContaining({ corruption: expect.anything() }),
        "list",
    );
    expect(categoryHref("Currency")).not.toContain("corruption=");

    changeControl(screen.getByRole("combobox", { name: "Corruption" }), {
        target: { value: "true" },
    });
    await waitFor(() => expect(url()).toContain("corruption=true"));
    expect(categoryHref("Unique weapons")).toContain("corruption=true");

    changeControl(screen.getByRole("combobox", { name: "Corruption" }), {
        target: { value: "false" },
    });
    await waitFor(() => expect(url()).toContain("corruption=false"));
    expect(categoryHref("Currency")).not.toContain("corruption=");
    fireEvent.click(category("Currency"));
    await waitFor(() => expect(url()).toMatch(/^\/1\/market\/currency\?/));
    // Currency markets do not split by identification or corruption, so neither filter shows.
    await screen.findByRole("combobox", { name: "Order by" });
    expect(screen.queryByRole("combobox", { name: "Corruption" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Identification" })).toBeNull();
});

it("shows merchant tabs by default, keeps another tab choice on item links, and hides it for crafting bases", async () => {
    showMarket("/1/market/armour?league=Allflame");
    const url = () => screen.getByLabelText("Current URL").textContent;
    const tabs = await screen.findByRole("combobox", { name: "Stash tabs" });
    expectControlValue(tabs, "merchant");
    expect(getMarketData).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ tab: "merchant" }),
        "list",
    );
    changeControl(tabs, { target: { value: "other" } });
    await waitFor(() => expect(url()).toContain("tab=other"));
    expect(getMarketData).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ tab: "other" }),
        "list",
    );
    fireEvent.click(await screen.findByRole("link", { name: "Abberath's Hooves" }));
    await screen.findByRole("heading", { name: "Abberath's Hooves" });
    expect(url()).toContain("tab=other");
    expectControlValue(screen.getByRole("combobox", { name: "Stash tabs" }), "other");

    cleanup();
    showMarket("/1/market/armour-bases?league=Allflame");
    await screen.findByRole("combobox", { name: "Period" });
    expect(screen.queryByRole("combobox", { name: "Stash tabs" })).toBeNull();
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

it("redirects PoE 2 realm links to the PoE 2 market, searching for their item", async () => {
    const list = await listLoader({
        request: new Request(
            "https://example.invalid/1/market?realm=poe2&league=Rites&q=Wisdom&item=Exalted%20Orb",
        ),
        context,
        params: {},
        unstable_pattern: "/1/market/:category?",
        unstable_url: new URL("https://example.invalid/1/market"),
    });
    if (!(list instanceof Response)) throw new Error("Expected redirect");
    expect(list.status).toBe(308);
    const url = new URL(list.headers.get("Location")!, "https://example.invalid");
    expect(url.pathname).toBe("/2/market/currency");
    expect(Object.fromEntries(url.searchParams)).toEqual({
        league: "Rites",
        days: "7",
        q: "Exalted Orb",
    });
    const item = await exchangeLoader({
        request: new Request(
            "https://example.invalid/1/market/exchange/Currency/CurrencyAddModToRare?realm=poe2&league=Rites&category=armour",
        ),
        context,
        params: { "*": "Currency/CurrencyAddModToRare" },
        unstable_pattern: "/1/market/exchange/*",
        unstable_url: new URL("https://example.invalid/1/market/exchange/x"),
    });
    if (!(item instanceof Response)) throw new Error("Expected redirect");
    expect(item.headers.get("Location")).toMatch(
        /^\/2\/market\/exchange\/Currency\/CurrencyAddModToRare\?league=Rites&.*category=all/,
    );
    expect(getMarketData).not.toHaveBeenCalled();
    expect(getMarketExchangeItem).not.toHaveBeenCalled();
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

it("links a unique's merged market to each of its link counts", async () => {
    showMarket("/1/market/items/Loreweave?league=Allflame&category=armour");
    const variants = await screen.findByRole("navigation", { name: "Item variants" });
    expect(
        within(variants)
            .getAllByRole("link")
            .map((link) => link.textContent?.split("1 sales")[0]),
    ).toEqual(["Any links", "6L", "0–4L"]);
    expect(
        within(variants)
            .getByRole("link", { name: /Any links/ })
            .getAttribute("aria-current"),
    ).toBe("page");
    fireEvent.click(within(variants).getByRole("link", { name: /6L/ }));
    await waitFor(
        () =>
            expect(getMarketData).toHaveBeenLastCalledWith(
                expect.anything(),
                expect.objectContaining({ item: "Loreweave", links: "6" }),
                "history",
            ),
        { timeout: 5000 },
    );
    expect(
        (await screen.findByText(/Identified · 6L/, undefined, { timeout: 5000 })).textContent,
    ).toBe("Identified · 6L");
    expect(
        within(screen.getByRole("navigation", { name: "Item variants" }))
            .getByRole("link", { name: /6L/ })
            .getAttribute("aria-current"),
    ).toBe("page");
});

it("folds away all but the best-selling variants and the current one", async () => {
    showMarket(
        "/1/market/items/Forbidden%20Flesh?league=Allflame&category=jewels&kind=forbidden-jewel&value=Notable%2025",
    );
    const variants = await screen.findByRole("navigation", { name: "Item variants" });
    expect(within(variants).getByRole("heading").textContent).toContain("(30)");
    const [shown, more] = within(variants).getAllByRole("list");
    const labels = (list: HTMLElement) =>
        within(list)
            .getAllByRole("link")
            .map((link) => link.firstChild?.textContent);
    expect(labels(shown!)).toEqual([
        ...Array.from({ length: 20 }, (_, index) => `Notable ${index}`),
        "Notable 25",
    ]);
    expect(
        within(shown!)
            .getByRole("link", { name: /Notable 25/ })
            .getAttribute("aria-current"),
    ).toBe("page");
    expect(within(variants).getByText("Show 9 more").tagName).toBe("SUMMARY");
    expect(labels(more!)).toEqual(
        [20, 21, 22, 23, 24, 26, 27, 28, 29].map((index) => `Notable ${index}`),
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

it("shows one merged price history in the value display at each hour's rate", async () => {
    vi.mocked(getMarketData).mockImplementation(async (_db, filters) => {
        const fixture = marketFixture(filters);
        const [row] = fixture.history;
        if (!row) return fixture;
        return {
            ...fixture,
            history: (
                [{ chaos: 1, divine: 1 / 100 }, { chaos: 1 }] as Record<string, number>[]
            ).map((priceRates, index) => ({
                ...row!,
                hour: row!.hour + index * 3600,
                priceRates,
            })),
        };
    });
    showMarket("/1/market/items/Abberath's%20Hooves?league=Allflame&currency=divine");
    const history = await screen.findByRole("region", { name: "Item price history" });
    expect(within(history).queryByRole("link", { name: "chaos" })).toBeNull();
    expect(within(history).queryByRole("link", { name: "divine" })).toBeNull();
    expect(
        within(history).getAllByRole("img", { name: /Hourly lowest asking price/ }),
    ).toHaveLength(1);
    const table = within(history).getByRole("table", { name: "Hourly observations" });
    const asks = () =>
        within(table)
            .getAllByRole("row")
            .slice(1)
            .map((tableRow) => within(tableRow).getAllByRole("cell")[1]!.textContent);
    // The newest hour has no divine rate, so it shows chaos only.
    expect(asks()).toEqual(["2 chaos", "2 chaos≈ 0.02 divine"]);
    fireEvent.click(within(history).getByRole("button", { name: "Divine Orb" }));
    expect(asks()).toEqual(["2 chaos", "0.02 divine"]);
    expect(
        within(history).getByRole("img", { name: /Hourly lowest asking price in divine/ }),
    ).toBeTruthy();

    // The value display carries from the item page back to the list.
    fireEvent.click(screen.getByRole("link", { name: /Back to markets/ }));
    await screen.findByRole("region", { name: "Item markets" });
    expect(screen.getByRole("button", { name: "Divine Orb" }).getAttribute("aria-pressed")).toBe(
        "true",
    );
});

it("opens a crafting base's history and variants and returns to the filtered list", async () => {
    showMarket("/1/market/armour-bases?league=Allflame&baseClass=Body%20Armour&ilvl=86");
    const url = () => screen.getByLabelText("Current URL").textContent;
    const table = await screen.findByRole("table", { name: "Armour bases markets" });
    expect(
        within(table).getByText("ilvl 86–100 · 6 links · Body Armour · Str · Level 73"),
    ).toBeTruthy();
    const art = (root: HTMLElement) =>
        root.querySelector('[data-item-art="Titan Plate"] img')?.getAttribute("src");
    expect(art(within(table).getByRole("link", { name: "Titan Plate" }).closest("td")!)).toBe(
        "titan-plate.png",
    );
    fireEvent.click(within(table).getByRole("link", { name: "Titan Plate" }));
    const page = await screen.findByRole("region", { name: "Crafting base" });
    expect(art(within(page).getByRole("heading", { name: "Titan Plate" }))).toBe("titan-plate.png");
    expect(url()).toMatch(/^\/1\/market\/bases\/base%3Atitan-plate%3A86-100%3A6-link\?/);
    expect(getMarketBase).toHaveBeenLastCalledWith(expect.anything(), {
        realm: "pc",
        league: "Allflame",
        days: "7",
        currency: "divine",
        baseId: "base:titan-plate:86-100:6-link",
    });
    expect(within(page).getByRole("heading", { name: "Titan Plate" })).toBeTruthy();
    expect(within(page).getByText(/11 listings from 8 sellers/)).toBeTruthy();
    const variants = within(page).getByRole("navigation", { name: "Base variants" });
    expect(
        within(variants)
            .getAllByRole("link")
            .map((link) => [link.textContent, link.getAttribute("aria-current")]),
    ).toEqual([
        ["ilvl 86–100 · 6 links60 chaos · 12 listed", "page"],
        ["ilvl 86–100 · 1–5 links5 chaos · 12 listed", null],
    ]);
    fireEvent.click(within(variants).getByRole("link", { name: /1–5 links/ }));
    await waitFor(() => expect(url()).toContain("1-5-link"));
    fireEvent.click(within(page).getByRole("link", { name: /Back to markets/ }));
    await screen.findByRole("table", { name: "Armour bases markets" });
    expect(url()).toMatch(/^\/1\/market\/armour-bases\?/);
    expect(url()).toContain("baseClass=Body+Armour");
    expect(url()).toContain("ilvl=86");
    expect(
        within(screen.getByRole("navigation", { name: "Market categories" }))
            .getByRole("link", { name: "Accessory bases" })
            .getAttribute("href"),
    ).not.toMatch(/baseClass|ilvl/);
});

it("filters Cluster Jewel bases by size and poe.ninja's item level bands", async () => {
    showMarket("/1/market/cluster-jewel-bases?league=Allflame");
    const level = await screen.findByRole("combobox", { name: "Item level" });
    expect(screen.getByRole("combobox", { name: "Type" })).toBeTruthy();
    for (const name of ["Links", "Quality", "Attributes", "Corruption"])
        expect(screen.queryByRole("combobox", { name })).toBeNull();
    fireEvent.click(level);
    expect(
        screen
            .getAllByRole("option")
            .map((option) => option.textContent)
            .slice(1),
    ).toEqual(["ilvl 1–49", "ilvl 50–67", "ilvl 68–74", "ilvl 75–83", "ilvl 84+"]);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    changeControl(level, { target: { value: "84" } });
    await waitFor(() =>
        expect(getMarketData).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ category: "cluster-jewel-bases", ilvl: "84" }),
            "list",
        ),
    );
});

it("answers 404 for an unknown crafting base", async () => {
    await expect(
        baseLoader({
            request: new Request("https://example.invalid/1/market/bases/base%3Amissing"),
            context,
            params: { base: "base:missing" },
            unstable_pattern: "/1/market/bases/:base",
            unstable_url: new URL("https://example.invalid/1/market/bases/base%3Amissing"),
        }),
    ).rejects.toMatchObject({ status: 404 });
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
    for (const name of ["Type", "Attributes", "Item level", "Links", "Quality"])
        expect(screen.getByRole("combobox", { name })).toBeTruthy();
    fireEvent.click(screen.getByRole("combobox", { name: "Attributes" }));
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
        "Any attributes",
        "Strength",
        "Dexterity",
        "Intelligence",
        "Str/Dex",
        "Str/Int",
        "Dex/Int",
        "Str/Dex/Int",
    ]);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    changeControl(screen.getByRole("combobox", { name: "Type" }), {
        target: { value: "Helmet" },
    });
    await waitFor(() =>
        expect(getMarketData).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ category: "armour-bases", baseClass: "Helmet" }),
            "list",
        ),
    );
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

it("filters unique equipment by its base's type and attributes, without base-only filters", async () => {
    showMarket("/1/market/armour?league=Allflame");
    await screen.findByRole("table", { name: "Unique armour markets" });
    for (const name of ["Type", "Attributes"])
        expect(screen.getByRole("combobox", { name })).toBeTruthy();
    for (const name of ["Item level", "Links", "Quality"])
        expect(screen.queryByRole("combobox", { name })).toBeNull();
    changeControl(screen.getByRole("combobox", { name: "Type" }), {
        target: { value: "Body Armour" },
    });
    await waitFor(() =>
        expect(getMarketData).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ category: "armour", baseClass: "Body Armour" }),
            "list",
        ),
    );
});

it("charts a market's likely sales in the latest 6 hours, day and week", async () => {
    showMarket();
    const row = (await screen.findByRole("link", { name: "Abberath's Hooves" })).closest("tr")!;
    const sales = row.querySelector("dl")!;
    expect(
        [...sales.querySelectorAll("dt")].map((term) => [
            term.textContent,
            term.nextElementSibling!.textContent,
        ]),
    ).toEqual([
        ["6h", "1"],
        ["1d", "1"],
        ["7d", "2"],
    ]);
    expect(row.textContent).toContain("2 in 7 days · 1 pending");
});

it("marks the category being loaded until its page arrives", async () => {
    showMarket();
    await screen.findByRole("table", { name: "Unique armour markets" });
    let resolve: () => void = () => {};
    vi.mocked(getMarketData).mockImplementation(
        (_db, filters) =>
            new Promise((done) => {
                resolve = () => done(marketFixture(filters));
            }),
    );
    const nav = screen.getByRole("navigation", { name: "Market categories" });
    const link = within(nav).getByRole("link", { name: "Fragments" });
    fireEvent.click(link);
    await waitFor(() => expect(link.getAttribute("aria-busy")).toBe("true"));
    expect(within(link).getByLabelText("Loading")).toBeTruthy();
    expect(link.className).toContain("text-primary");
    expect(
        within(nav).getByRole("link", { name: "Unique armour" }).getAttribute("aria-current"),
    ).toBe("page");
    resolve();
    await waitFor(() => expect(link.getAttribute("aria-current")).toBe("page"));
    expect(link.getAttribute("aria-busy")).toBeNull();
});

it("filters skill gems by tri-state level, quality and corruption toggles", async () => {
    showMarket("/1/market/gems?league=Allflame");
    const level = await screen.findByRole("group", { name: "Gem level" });
    const quality = screen.getByRole("group", { name: "Gem quality" });
    expect(screen.queryByRole("combobox", { name: "Corruption" })).toBeNull();

    fireEvent.click(within(level).getByRole("button", { name: "20: any" }));
    fireEvent.click(within(level).getByRole("button", { name: "21: any" }));
    fireEvent.click(within(level).getByRole("button", { name: "21: included" }));
    fireEvent.click(within(quality).getByRole("button", { name: "20%: any" }));
    fireEvent.click(screen.getByRole("button", { name: "Corrupted: any" }));
    fireEvent.click(screen.getByRole("button", { name: "Corrupted: included" }));
    fireEvent.click(screen.getByRole("button", { name: "Transfigured: any" }));
    fireEvent.click(screen.getByRole("button", { name: "Vaal: any" }));
    fireEvent.click(screen.getByRole("button", { name: "Vaal: included" }));
    expect(within(level).getByRole("button", { name: "21: excluded" })).toBeTruthy();
    await waitFor(() =>
        expect(getMarketData).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({
                category: "gems",
                gemLevel: "20,-21",
                gemQuality: "20",
                corruption: "false",
                gemTransfigured: "true",
                gemVaal: "false",
            }),
            "list",
        ),
    );
    await waitFor(() =>
        expect(screen.getByLabelText("Current URL").textContent).toContain("gemLevel=20%2C-21"),
    );

    fireEvent.click(within(level).getByRole("button", { name: "20: included" }));
    fireEvent.click(within(level).getByRole("button", { name: "20: excluded" }));
    await waitFor(() =>
        expect(getMarketData).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ gemLevel: "-21" }),
            "list",
        ),
    );

    fireEvent.click(
        within(screen.getByRole("navigation", { name: "Market categories" })).getByRole("link", {
            name: "Currency",
        }),
    );
    await waitFor(() =>
        expect(getMarketData).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({
                category: "currency",
                gemLevel: "",
                gemQuality: "",
                gemTransfigured: "all",
                gemVaal: "all",
            }),
            "list",
        ),
    );
    await waitFor(() =>
        expect(screen.getByLabelText("Current URL").textContent).toMatch(
            /^\/1\/market\/currency\?/,
        ),
    );
    expect(screen.getByLabelText("Current URL").textContent).not.toContain("gemLevel");
});

it("filters maps by tri-state mod count, quantity, delirium and influence toggles", async () => {
    showMarket("/1/market/maps?league=Allflame");
    const mods = await screen.findByRole("group", { name: "Mods" });
    const quantity = screen.getByRole("group", { name: "Item quantity" });
    const delirium = screen.getByRole("group", { name: "Delirium" });
    const influence = screen.getByRole("group", { name: "Influence" });
    expect(screen.getByRole("combobox", { name: "Corruption" })).toBeTruthy();

    fireEvent.click(within(mods).getByRole("button", { name: "8 mods: any" }));
    fireEvent.click(within(quantity).getByRole("button", { name: "100–119%: any" }));
    fireEvent.click(within(quantity).getByRole("button", { name: "120–139%: any" }));
    fireEvent.click(within(delirium).getByRole("button", { name: "0%: any" }));
    fireEvent.click(within(delirium).getByRole("button", { name: "0%: included" }));
    fireEvent.click(within(influence).getByRole("button", { name: "Elder Guardian: any" }));
    await waitFor(() =>
        expect(getMarketData).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({
                category: "maps",
                mapMods: "8",
                mapQuantity: "100-119,120-139",
                mapDelirium: "-0",
                mapInfluence: "elder-guardian",
            }),
            "list",
        ),
    );
    await waitFor(() =>
        expect(screen.getByLabelText("Current URL").textContent).toContain("mapMods=8"),
    );

    fireEvent.click(
        within(screen.getByRole("navigation", { name: "Market categories" })).getByRole("link", {
            name: "Currency",
        }),
    );
    await waitFor(() =>
        expect(getMarketData).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({
                category: "currency",
                mapMods: "",
                mapQuantity: "",
                mapInfluence: "",
            }),
            "list",
        ),
    );
    await waitFor(() =>
        expect(screen.getByLabelText("Current URL").textContent).toMatch(
            /^\/1\/market\/currency\?/,
        ),
    );
    expect(screen.getByLabelText("Current URL").textContent).not.toContain("mapMods");
    expect(screen.getByLabelText("Current URL").textContent).not.toContain("mapInfluence");
});

it("keeps the filters usable while an earlier filter change loads", async () => {
    showMarket("/1/market/maps?league=Allflame");
    const mods = await screen.findByRole("group", { name: "Mods" });
    const influence = screen.getByRole("group", { name: "Influence" });
    const form = mods.closest("form")!;
    const pending: (() => void)[] = [];
    vi.mocked(getMarketData).mockImplementation(
        (_db, filters) =>
            new Promise((done) => {
                pending.push(() => done(marketFixture(filters)));
            }),
    );

    fireEvent.click(within(mods).getByRole("button", { name: "8 mods: any" }));
    await waitFor(() => expect(within(form).getByRole("status").textContent).toBe("Loading…"));
    const content = form.closest("[aria-busy='true']")!;
    // The busy content dims its direct children other than the form.
    expect(form.parentElement).toBe(content);
    for (let node: Element | null = form; node; node = node.parentElement)
        expect(node.classList.contains("pointer-events-none")).toBe(false);

    fireEvent.click(within(influence).getByRole("button", { name: "None: any" }));
    await waitFor(() =>
        expect(getMarketData).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ mapMods: "8", mapInfluence: "none" }),
            "list",
        ),
    );
    for (const resolve of pending) resolve();
    await waitFor(() =>
        expect(screen.getByLabelText("Current URL").textContent).toContain("mapInfluence=none"),
    );
    expect(screen.getByLabelText("Current URL").textContent).toContain("mapMods=8");
});

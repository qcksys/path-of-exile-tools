// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { CraftingWorkbench } from "../app/components/crafting/workbench";
import { WorkbenchMarketPrices } from "../app/components/crafting/workbench-market-prices";
import { CraftingEngine } from "../app/lib/crafting-engine";
import { validateRulesetIndex } from "../app/lib/crafting-rulesets";
import { craftingProjectSchema } from "../app/schemas/crafting";
import index from "../crafting-history/index.json";
import { changeControl } from "./control-helpers";
import { commodityQuote, convertedCommodityQuote, essenceId } from "./crafting-commodity-fixtures";
import { exchangeQuote, transmuteId } from "./crafting-exchange-fixtures";
import { baseId, catalog, engine, getCatalog } from "./crafting-fixtures";
import { vendorInputId, vendorOutputId, vendorQuote } from "./crafting-vendor-upgrade-fixtures";
import { chooseStartingItem } from "./starting-item-helper";

const historyIndex = validateRulesetIndex(index);

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});
function mount(game: "poe1" | "poe2" = "poe1", priceId = transmuteId) {
    const copied = vi.fn();
    const current = game === "poe1" ? engine : new CraftingEngine(getCatalog(game));
    const base = game === "poe1" ? baseId : Object.keys(current.catalog.bases)[0]!;
    const project = craftingProjectSchema.parse({
        format: 1,
        game,
        patch: current.catalog.patch,
        item: current.createItem(base),
        method: { kind: "currency", id: transmuteId },
        target: { groups: [] },
        prices: { [priceId]: 123 },
        steps: [],
        seed: 1,
        iterations: 1,
        maxActions: 1,
    });
    function Harness() {
        const [value, setValue] = useState(project);
        return (
            <>
                <input
                    aria-label="Manual input price"
                    value={value.prices[priceId] ?? ""}
                    onChange={(event) =>
                        setValue({ ...value, prices: { [priceId]: Number(event.target.value) } })
                    }
                />
                <WorkbenchMarketPrices
                    engine={current}
                    project={value}
                    entries={[[priceId, current.costName(priceId)]]}
                    onChange={(prices) => {
                        copied(prices);
                        setValue({ ...value, prices });
                    }}
                />
            </>
        );
    }
    return { view: render(<Harness />), copied };
}
function mockPrices(realm = "pc") {
    const fetcher = vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
            new Response(
                JSON.stringify(
                    url.includes("index.json")
                        ? historyIndex
                        : {
                              quotes: { [transmuteId]: { ...exchangeQuote, realm } },
                              missing: {},
                          },
                ),
            ),
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    return fetcher;
}
async function lookup() {
    fireEvent.click(screen.getByRole("button", { name: "Find market prices" }));
    fireEvent.change(await screen.findByLabelText("Price lookup league"), {
        target: { value: "Standard" },
    });
    fireEvent.click(screen.getByText("Currency & essence exchange prices"));
    fireEvent.click(screen.getByRole("button", { name: "Find exchange prices" }));
    await screen.findByRole("button", { name: "Use exchange estimate" });
}

it.each([
    "poe1",
    "poe2",
] as const)("copies %s quotes only on explicit selection and keeps subsequent manual edits", async (game) => {
    const fetcher = mockPrices(game === "poe2" ? "poe2" : "pc");
    mount(game);
    await lookup();
    expect((screen.getByLabelText("Manual input price") as HTMLInputElement).value).toBe("123");
    expect(
        screen
            .getByRole("button", { name: "Use estimates for unpriced inputs" })
            .hasAttribute("disabled"),
    ).toBe(true);
    const request = JSON.parse(
        fetcher.mock.calls.find(([url]) => url === "/api/v1/crafting/market/exchange")![1].body,
    );
    expect(request).toMatchObject({
        game,
        realm: game === "poe2" ? "poe2" : "pc",
        currency: "chaos",
        league: "Standard",
    });
    fireEvent.click(screen.getByRole("button", { name: "Use exchange estimate" }));
    expect((screen.getByLabelText("Manual input price") as HTMLInputElement).value).toBe("2");
    fireEvent.change(screen.getByLabelText("Manual input price"), { target: { value: "7" } });
    expect((screen.getByLabelText("Manual input price") as HTMLInputElement).value).toBe("7");
    expect(screen.queryByText(/Selecting a price enables refresh/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Price lookup league"), { target: { value: "Other" } });
    await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Use exchange estimate" })).toBeNull(),
    );
    expect((screen.getByLabelText("Manual input price") as HTMLInputElement).value).toBe("7");
});

it("copies a full beast recipe through the same source picker", async () => {
    const id = "EinharMasterCraftMorrigan7";
    const quote = {
        source: "poe.ninja",
        game: "poe1",
        realm: "pc",
        league: "Standard",
        currency: "chaos",
        id,
        assumption: "rare-beast-mountain-lynx-v1",
        amount: 607,
        fetchedAt: "2026-10-08T04:00:00.000Z",
        components: [
            { detailsId: "craicic-sand-spitter", quantity: 1, unitPrice: 1 },
            { detailsId: "black-morrigan", quantity: 1, unitPrice: 600 },
            { detailsId: "mountain-lynx", quantity: 2, unitPrice: 3 },
        ].map((component) => ({
            ...component,
            name: component.detailsId,
            listingCount: 100,
            sourceUrl: "https://poe.ninja/poe1/api/economy/stash/current/item/overview",
        })),
    };
    const fetcher = vi
        .fn()
        .mockImplementation((url: string) =>
            Promise.resolve(
                new Response(
                    JSON.stringify(
                        url.includes("index.json")
                            ? historyIndex
                            : { quotes: { [id]: quote }, missing: {} },
                    ),
                ),
            ),
        );
    vi.stubGlobal("fetch", fetcher);
    mount("poe1", id);
    fireEvent.click(screen.getByRole("button", { name: "Find market prices" }));
    fireEvent.change(await screen.findByLabelText("Price lookup league"), {
        target: { value: "Standard" },
    });
    fireEvent.click(screen.getByText("Beast & temple prices"));
    fireEvent.click(screen.getByRole("checkbox", { name: /Mountain Lynx/ }));
    fireEvent.click(screen.getByRole("button", { name: "Find beast & temple prices" }));
    await screen.findByRole("button", { name: "Use source estimate" });
    expect((screen.getByLabelText("Manual input price") as HTMLInputElement).value).toBe("123");
    expect(screen.getByText(/2 × mountain-lynx/)).toBeTruthy();
    const request = JSON.parse(
        fetcher.mock.calls.find(([url]) => url === "/api/v1/crafting/market/sources")![1].body,
    );
    expect(request).toMatchObject({
        graph: { game: "poe1", league: "Standard", currency: "chaos" },
        assumption: "rare-beast-mountain-lynx-v1",
        ids: [id],
    });
    fireEvent.click(screen.getByRole("button", { name: "Use source estimate" }));
    expect((screen.getByLabelText("Manual input price") as HTMLInputElement).value).toBe("607");
});

it.each([
    commodityQuote,
    convertedCommodityQuote,
])("copies captured essence asks at $amount only after selection and preserves subsequent manual edits", async (quote) => {
    vi.stubGlobal(
        "fetch",
        vi
            .fn()
            .mockImplementation((url: string) =>
                Promise.resolve(
                    new Response(
                        JSON.stringify(
                            url.includes("index.json")
                                ? historyIndex
                                : { quotes: { [essenceId]: quote }, missing: {} },
                        ),
                    ),
                ),
            ),
    );
    mount("poe1", essenceId);
    fireEvent.click(screen.getByRole("button", { name: "Find market prices" }));
    fireEvent.change(await screen.findByLabelText("Price lookup league"), {
        target: { value: "Standard" },
    });
    fireEvent.click(screen.getByText("Currency asking prices"));
    if (quote.conversion)
        fireEvent.click(
            screen.getByRole("checkbox", {
                name: "Convert currency asks using matching-hour exchange rates",
            }),
        );
    fireEvent.click(screen.getByRole("button", { name: "Find asking prices" }));
    await screen.findByText(new RegExp(`${quote.amount} chaos per item`));
    const amount = screen.getByLabelText("Manual input price") as HTMLInputElement;
    expect(amount.value).toBe("123");
    expect(
        screen
            .getByRole("button", { name: "Use source estimates for unpriced inputs" })
            .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Use source estimate" }));
    expect(amount.value).toBe(String(quote.amount));
    fireEvent.change(amount, { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Price lookup league"), { target: { value: "Other" } });
    await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Use source estimate" })).toBeNull(),
    );
    expect(amount.value).toBe("7");
});

it("synchronizes both league controls without copying or changing prices", async () => {
    mockPrices();
    const { copied } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Find market prices" }));
    await screen.findByLabelText("Price lookup league");
    fireEvent.click(screen.getByText("Currency & essence exchange prices"));
    fireEvent.change(screen.getByLabelText("Exchange league"), { target: { value: "Standard" } });
    expect((screen.getByLabelText("Price lookup league") as HTMLInputElement).value).toBe(
        "Standard",
    );
    fireEvent.change(screen.getByLabelText("Price lookup league"), { target: { value: "Other" } });
    expect((screen.getByLabelText("Exchange league") as HTMLInputElement).value).toBe("Other");
    fireEvent.change(screen.getByLabelText("Exchange league"), { target: { value: "" } });
    expect((screen.getByLabelText("Price lookup league") as HTMLInputElement).value).toBe("");
    expect(
        screen.getByRole("button", { name: "Find exchange prices" }).hasAttribute("disabled"),
    ).toBe(true);
    expect((screen.getByLabelText("Manual input price") as HTMLInputElement).value).toBe("123");
    expect(copied).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
});

it("copies the explicit vendor ingredient estimate without overwriting prior or subsequent manual prices", async () => {
    vi.stubGlobal(
        "fetch",
        vi
            .fn()
            .mockImplementation((url: string) =>
                Promise.resolve(
                    new Response(
                        JSON.stringify(
                            url.includes("index.json")
                                ? historyIndex
                                : { quotes: { [vendorOutputId]: vendorQuote }, missing: {} },
                        ),
                    ),
                ),
            ),
    );
    const { copied } = mount("poe1", vendorOutputId);
    fireEvent.click(screen.getByRole("button", { name: "Find market prices" }));
    fireEvent.change(await screen.findByLabelText("Price lookup league"), {
        target: { value: "Standard" },
    });
    fireEvent.click(screen.getByText("Currency asking prices"));
    fireEvent.click(screen.getByText("Vendor-upgrade ingredient estimates"));
    changeControl(screen.getByLabelText(`Vendor ingredient for ${vendorQuote.path.outputName}`), {
        target: { value: vendorInputId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Find vendor-upgrade estimate" }));
    await screen.findByRole("button", { name: "Use vendor-upgrade estimate" });
    const amount = screen.getByLabelText("Manual input price") as HTMLInputElement;
    expect(amount.value).toBe("123");
    expect(copied).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use vendor-upgrade estimate" }));
    expect(copied).toHaveBeenCalledWith({ [vendorOutputId]: 18 });
    expect(amount.value).toBe("18");
    fireEvent.change(amount, { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Price lookup league"), { target: { value: "Other" } });
    await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Use vendor-upgrade estimate" })).toBeNull(),
    );
    expect(amount.value).toBe("7");
});

it.each([
    "Price lookup league",
    "Exchange league",
])("discards an exchange lookup still pending when %s changes", async (control) => {
    let resolve: (response: Response) => void = () => {};
    const fetcher = vi.fn().mockImplementation((url: string) =>
        url.includes("index.json")
            ? Promise.resolve(new Response(JSON.stringify(historyIndex)))
            : new Promise<Response>((done) => {
                  resolve = done;
              }),
    );
    vi.stubGlobal("fetch", fetcher);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Find market prices" }));
    fireEvent.change(await screen.findByLabelText("Price lookup league"), {
        target: { value: "Standard" },
    });
    fireEvent.click(screen.getByText("Currency & essence exchange prices"));
    fireEvent.click(screen.getByRole("button", { name: "Find exchange prices" }));
    const request = fetcher.mock.calls.find(([url]) => url === "/api/v1/crafting/market/exchange")!;
    fireEvent.change(screen.getByLabelText(control), { target: { value: "Other" } });
    expect(request[1].signal.aborted).toBe(true);
    resolve(
        new Response(JSON.stringify({ quotes: { [transmuteId]: exchangeQuote }, missing: {} })),
    );
    await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Use exchange estimate" })).toBeNull(),
    );
    expect((screen.getByLabelText("Manual input price") as HTMLInputElement).value).toBe("123");
});

it("cancels a pending beast lookup when the exchange league control changes", async () => {
    let resolve: (response: Response) => void = () => {};
    const fetcher = vi.fn().mockImplementation((url: string) =>
        url.includes("index.json")
            ? Promise.resolve(new Response(JSON.stringify(historyIndex)))
            : new Promise<Response>((done) => {
                  resolve = done;
              }),
    );
    vi.stubGlobal("fetch", fetcher);
    const { copied } = mount("poe1", "EinharMasterCraftMorrigan7");
    fireEvent.click(screen.getByRole("button", { name: "Find market prices" }));
    fireEvent.change(await screen.findByLabelText("Price lookup league"), {
        target: { value: "Standard" },
    });
    fireEvent.click(screen.getByText("Beast & temple prices"));
    fireEvent.click(screen.getByRole("button", { name: "Find beast & temple prices" }));
    const request = fetcher.mock.calls.find(([url]) => url === "/api/v1/crafting/market/sources")!;
    fireEvent.click(screen.getByText("Currency & essence exchange prices"));
    fireEvent.change(screen.getByLabelText("Exchange league"), { target: { value: "Other" } });
    expect(request[1].signal.aborted).toBe(true);
    resolve(new Response(JSON.stringify({ quotes: {}, missing: {} })));
    await waitFor(() => expect(screen.queryByText("0 of 1 inputs priced.")).toBeNull());
    expect((screen.getByLabelText("Price lookup league") as HTMLInputElement).value).toBe("Other");
    expect((screen.getByLabelText("Manual input price") as HTMLInputElement).value).toBe("123");
    expect(copied).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
});

it("updates the standalone workbench's editable price after explicit quote selection", async () => {
    localStorage.clear();
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    const currency = catalog.crafting.currencies.find(
        (entry) => entry.action === "transmute_to_rare",
    )!;
    vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) =>
            Promise.resolve(
                new Response(
                    JSON.stringify(
                        url.includes("index.json")
                            ? historyIndex
                            : {
                                  quotes: {
                                      [currency.id]: { ...exchangeQuote, itemId: currency.id },
                                  },
                                  missing: {},
                              },
                    ),
                ),
            ),
        ),
    );
    render(
        <MemoryRouter>
            <CraftingWorkbench catalog={catalog} mode="emulate" />
        </MemoryRouter>,
    );
    chooseStartingItem(catalog);
    fireEvent.click(screen.getByText("Custom prices in chaos"));
    const price = screen.getByRole("spinbutton", { name: currency.name }) as HTMLInputElement;
    fireEvent.change(price, { target: { value: "123" } });
    await lookup();
    expect(price.value).toBe("123");
    fireEvent.click(screen.getByRole("button", { name: "Use exchange estimate" }));
    expect(price.value).toBe("2");
    fireEvent.change(price, { target: { value: "7" } });
    expect(price.value).toBe("7");
});

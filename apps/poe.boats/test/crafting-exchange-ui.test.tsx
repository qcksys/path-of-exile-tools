// @vitest-environment jsdom

import { exchangeUnitQuote } from "@poe-tools/market";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { ExchangePricePicker } from "~/components/crafting/exchange-price-picker";
import { bindExchangePrice } from "~/lib/crafting-exchange";
import {
    chaosId,
    exchangeGraph,
    exchangeQuote,
    exchangeSnapshot,
    transmuteId,
} from "./crafting-exchange-fixtures";

vi.mock("~/components/item-art", () => ({
    ItemName: ({ name }: { name: string }) => <span>{name}</span>,
}));
vi.mock("~/components/currency-label", () => ({
    CurrencyLabel: ({ currency, label }: { currency: string; label?: string }) => (
        <>{label ?? currency}</>
    ),
}));

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

it("rejects a response containing a quote from an older exchange hour", async () => {
    vi.spyOn(Date, "now").mockReturnValue((exchangeQuote.hour! + 7200) * 1000 + 60_000);
    vi.stubGlobal(
        "fetch",
        vi
            .fn()
            .mockResolvedValue(
                new Response(
                    JSON.stringify({ quotes: { [transmuteId]: exchangeQuote }, missing: {} }),
                ),
            ),
    );
    const onChange = vi.fn();
    render(
        <ExchangePricePicker
            graph={exchangeGraph()}
            entries={[[transmuteId, "Orb of Transmutation"]]}
            onChange={onChange}
        />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Find exchange prices" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
        "not from the latest completed hour",
    );
    expect(screen.queryByRole("button", { name: "Use exchange estimate" })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
});

it("accepts a null-hour accounting currency unit", async () => {
    const quote = exchangeUnitQuote({
        realm: "pc",
        league: "Standard",
        itemId: chaosId,
        quoteId: chaosId,
    });
    vi.stubGlobal(
        "fetch",
        vi
            .fn()
            .mockResolvedValue(
                new Response(JSON.stringify({ quotes: { [chaosId]: quote }, missing: {} })),
            ),
    );
    const onChange = vi.fn();
    render(
        <ExchangePricePicker
            graph={exchangeGraph()}
            entries={[[chaosId, "Chaos Orb"]]}
            onChange={onChange}
        />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Find exchange prices" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use exchange estimate" }));
    expect(onChange.mock.calls[0]![0].prices[chaosId].amount).toBe(1);
});

it.each([
    false,
    true,
])("discards picker results on an hour change (copy only: %s)", async (copyOnly) => {
    const now = vi.spyOn(Date, "now").mockReturnValue((exchangeQuote.hour! + 3600) * 1000 + 60_000);
    vi.stubGlobal(
        "fetch",
        vi
            .fn()
            .mockResolvedValue(
                new Response(
                    JSON.stringify({ quotes: { [transmuteId]: exchangeQuote }, missing: {} }),
                ),
            ),
    );
    const onChange = vi.fn();
    render(
        <ExchangePricePicker
            graph={exchangeGraph()}
            entries={[[transmuteId, "Orb of Transmutation"]]}
            onChange={onChange}
            copyOnly={copyOnly}
        />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Find exchange prices" }));
    await screen.findByRole("button", { name: "Use exchange estimate" });
    now.mockReturnValue((exchangeQuote.hour! + 7200) * 1000 + 60_000);
    fireEvent.focus(globalThis.window);
    expect(screen.queryByRole("button", { name: "Use exchange estimate" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Look up prices again");
    expect(onChange).not.toHaveBeenCalled();
});

it("refuses a stale bulk selection even before an hour-change event", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue((exchangeQuote.hour! + 3600) * 1000 + 60_000);
    vi.stubGlobal(
        "fetch",
        vi
            .fn()
            .mockResolvedValue(
                new Response(
                    JSON.stringify({ quotes: { [transmuteId]: exchangeQuote }, missing: {} }),
                ),
            ),
    );
    const onChange = vi.fn();
    render(
        <ExchangePricePicker
            graph={exchangeGraph()}
            entries={[[transmuteId, "Orb of Transmutation"]]}
            onChange={onChange}
        />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Find exchange prices" }));
    const apply = await screen.findByRole("button", {
        name: "Use exchange estimates for automatic prices",
    });
    now.mockReturnValue((exchangeQuote.hour! + 7200) * 1000 + 60_000);
    fireEvent.click(apply);
    expect(screen.getByRole("alert").textContent).toContain("Look up prices again");
    expect(onChange).not.toHaveBeenCalled();
});

it("does not offer a lookup response that arrives after its requested hour", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue((exchangeQuote.hour! + 3600) * 1000 + 60_000);
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
        "fetch",
        vi.fn().mockReturnValue(new Promise<Response>((done) => (resolve = done))),
    );
    render(
        <ExchangePricePicker
            graph={exchangeGraph()}
            entries={[[transmuteId, "Orb of Transmutation"]]}
            onChange={vi.fn()}
        />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Find exchange prices" }));
    now.mockReturnValue((exchangeQuote.hour! + 7200) * 1000 + 60_000);
    resolve(
        new Response(JSON.stringify({ quotes: { [transmuteId]: exchangeQuote }, missing: {} })),
    );
    expect((await screen.findByRole("alert")).textContent).toContain("Look up prices again");
    expect(screen.queryByRole("button", { name: "Use exchange estimate" })).toBeNull();
});

it("removes prior picker results when a retry fails", async () => {
    vi.spyOn(Date, "now").mockReturnValue((exchangeQuote.hour! + 3600) * 1000 + 60_000);
    const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
            new Response(JSON.stringify({ quotes: { [transmuteId]: exchangeQuote }, missing: {} })),
        )
        .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    const onChange = vi.fn();
    render(
        <ExchangePricePicker
            graph={exchangeGraph()}
            entries={[[transmuteId, "Orb of Transmutation"]]}
            onChange={onChange}
        />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Find exchange prices" }));
    await screen.findByRole("button", { name: "Use exchange estimate" });
    fireEvent.click(screen.getByRole("button", { name: "Find exchange prices" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Use exchange estimate" })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
});

it("uses exchange estimates for automatic prices while preserving manual amounts", async () => {
    vi.spyOn(Date, "now").mockReturnValue((exchangeQuote.hour! + 3600) * 1000 + 60_000);
    const manualId = "Metadata/Items/Currency/ManualInput";
    const missingId = "Metadata/Items/Currency/UnpricedInput";
    const quotes = {
        [transmuteId]: exchangeQuote,
        [manualId]: { ...exchangeQuote, itemId: manualId },
        [missingId]: { ...exchangeQuote, itemId: missingId },
    };
    const fetcher = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ quotes, missing: {} })));
    vi.stubGlobal("fetch", fetcher);
    const graph = exchangeGraph();
    graph.prices[transmuteId] = {
        amount: 10,
        currency: "chaos",
        source: "market",
        confidence: null,
        cohortId: "stash-commodity:v1:previous",
    };
    graph.prices[manualId] = {
        amount: 9,
        currency: "chaos",
        source: "manual",
        confidence: null,
    };
    const onChange = vi.fn();
    render(
        <ExchangePricePicker
            graph={graph}
            entries={[
                [transmuteId, "Orb of Transmutation"],
                [manualId, "Manual input"],
                [missingId, "Unpriced input"],
            ]}
            onChange={onChange}
        />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Find exchange prices" }));
    const apply = await screen.findByRole("button", {
        name: "Use exchange estimates for automatic prices",
    });
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).conversion).toBe("two-leg-exchange-v1");
    fireEvent.click(apply);
    const updated = onChange.mock.calls[0]![0];
    expect(updated.prices[transmuteId]).toEqual(
        bindExchangePrice(graph, transmuteId, exchangeQuote).prices[transmuteId],
    );
    expect(updated.prices[manualId]).toEqual(graph.prices[manualId]);
    expect(updated.prices[missingId]).toEqual(
        bindExchangePrice(graph, missingId, quotes[missingId]).prices[missingId],
    );
    expect(graph.prices[transmuteId]!.amount).toBe(10);
});

it("allows a direct-only exchange lookup", async () => {
    const fetcher = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ quotes: {}, missing: {} })));
    vi.stubGlobal("fetch", fetcher);
    render(
        <ExchangePricePicker
            graph={exchangeGraph()}
            entries={[[transmuteId, "Orb of Transmutation"]]}
            onChange={vi.fn()}
        />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Convert missing direct pairs/ }));
    fireEvent.click(screen.getByRole("button", { name: "Find exchange prices" }));
    await screen.findByText("0 of 1 inputs priced. Missing inputs remain unknown.");
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).conversion).toBeUndefined();
});

it.each([
    { bound: false, absent: false },
    { bound: true, absent: false },
    { bound: false, absent: true },
    { bound: true, absent: true },
])("shows history when a current quote is missing (saved binding: $bound, absent hour: $absent)", async ({
    bound,
    absent,
}) => {
    const latest = {
        ...exchangeSnapshot,
        hour: exchangeSnapshot.hour + 3600,
        volumeTraded: { [transmuteId]: 0, [chaosId]: 0 },
    };
    const message = absent
        ? "No captured exchange observation is available at the selected completed hour."
        : "No positive traded volume in the latest hour.";
    const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    quotes: {},
                    missing: { [transmuteId]: message },
                }),
            ),
        )
        .mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    history: absent ? [exchangeSnapshot] : [latest, exchangeSnapshot],
                    nextBefore: null,
                }),
            ),
        );
    vi.stubGlobal("fetch", fetcher);
    const onChange = vi.fn();
    const original = exchangeGraph();
    const graph = bound ? bindExchangePrice(original, transmuteId, exchangeQuote) : original;
    const before = structuredClone(graph);
    render(
        <ExchangePricePicker
            graph={graph}
            entries={[[transmuteId, "Orb of Transmutation"]]}
            onChange={onChange}
        />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Find exchange prices" }));
    await screen.findByText(message);
    expect(
        screen.getByRole("combobox", { name: "Exchange estimate window" }).textContent,
    ).toContain("Latest completed hour");
    const missing = screen.getByRole("region", { name: "Exchange price for Orb of Transmutation" });
    fireEvent.click(within(missing).getByRole("button", { name: "View exchange history" }));
    const history = await screen.findByRole("region", { name: "Exchange price history" });
    if (!absent) {
        expect(within(history).getAllByRole("row")[1]?.textContent).toContain("Unknown");
        expect(
            within(within(history).getAllByRole("row")[1]!).getAllByRole("cell")[2]?.textContent,
        ).toBe("0");
    }
    expect(within(history).getAllByRole("row").at(-1)?.textContent).toContain("2.0000");
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({
        realm: "pc",
        league: "Standard",
        itemId: transmuteId,
        quoteId: chaosId,
        limit: 168,
    });
    expect(screen.queryByRole("button", { name: "Use exchange estimate" })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(graph).toEqual(before);
});

it.each([
    "manual",
    "market",
] as const)("keeps history available after a failed lookup and preserves a %s amount", async (source) => {
    const fetcher = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ history: [], nextBefore: null })));
    vi.stubGlobal("fetch", fetcher);
    const original = exchangeGraph();
    const graph =
        source === "market"
            ? bindExchangePrice(original, transmuteId, exchangeQuote)
            : {
                  ...original,
                  prices: {
                      [transmuteId]: { amount: 0, currency: "chaos", source, confidence: null },
                  },
              };
    const before = structuredClone(graph);
    const onChange = vi.fn();
    render(
        <ExchangePricePicker
            graph={graph}
            entries={[
                [transmuteId, "Orb of Transmutation"],
                ["service:recombine", "Recombination"],
            ]}
            onChange={onChange}
        />,
    );
    expect(screen.getAllByRole("button", { name: "View exchange history" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Find exchange prices" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View exchange history" }));
    expect(await screen.findByText("No captured history for this pair.")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    expect(graph).toEqual(before);
});

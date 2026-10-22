// @vitest-environment jsdom
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

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

it.each([
    false,
    true,
])("shows history when a current quote is missing (saved binding: %s)", async (bound) => {
    const latest = {
        ...exchangeSnapshot,
        hour: exchangeSnapshot.hour + 3600,
        volumeTraded: { [transmuteId]: 0, [chaosId]: 0 },
    };
    const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    quotes: {},
                    missing: { [transmuteId]: "No positive traded volume in the latest hour." },
                }),
            ),
        )
        .mockResolvedValueOnce(
            new Response(JSON.stringify({ history: [latest, exchangeSnapshot], nextBefore: null })),
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
    await screen.findByText("No positive traded volume in the latest hour.");
    const missing = screen.getByRole("region", { name: "Exchange price for Orb of Transmutation" });
    fireEvent.click(within(missing).getByRole("button", { name: "View exchange history" }));
    const history = await screen.findByRole("region", { name: "Exchange price history" });
    expect(within(history).getAllByRole("row")[1]?.textContent).toContain("Unknown");
    expect(
        within(within(history).getAllByRole("row")[1]!).getAllByRole("cell")[2]?.textContent,
    ).toBe("0");
    expect(within(history).getAllByRole("row")[2]?.textContent).toContain("2.0000");
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

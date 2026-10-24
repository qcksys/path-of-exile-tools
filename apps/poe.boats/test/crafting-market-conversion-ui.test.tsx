// @vitest-environment jsdom
import { exchangeCurrencyId } from "@poe-tools/market";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { MarketPricePicker } from "../app/components/crafting/market-price-picker";
import { baseId, engine } from "./crafting-fixtures";
import { marketCandidate } from "./crafting-market-fixtures";

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

it("sends the preparation policy and clears quotes when required cleanup changes", async () => {
    const sourcePreparation = {
        kind: "fractured-fossil-v1" as const,
        fractureId: "fracture",
        crafted: true,
        enchanted: true,
    };
    const fetcher = vi.fn().mockResolvedValue(
        new Response(
            JSON.stringify({
                candidates: [marketCandidate],
                truncated: false,
                message: null,
            }),
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    const props = {
        engine,
        item: engine.createItem(baseId, 86),
        requirements: { format: 1 as const, game: "poe1" as const, groups: [] },
        league: "Standard",
        currency: "chaos",
        price: null,
        onLeagueChange: vi.fn(),
        onSelect: vi.fn(),
    };
    const { rerender } = render(
        <MarketPricePicker {...props} sourcePreparation={sourcePreparation} />,
    );
    fireEvent.click(screen.getByText("Equipment market price"));
    expect(
        screen.getByText(
            /Cleanup, the first fossil roll and Eldritch currencies are charged separately/,
        ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Find market prices" }));
    await screen.findByRole("button", { name: "Use live median" });
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).sourcePreparation).toEqual(sourcePreparation);
    rerender(
        <MarketPricePicker
            {...props}
            sourcePreparation={{ ...sourcePreparation, enchanted: false }}
        />,
    );
    await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Use live median" })).toBeNull(),
    );
});
it.each([
    "divine",
    "chrome",
])("requires conversion consent for %s, shows its sources, keeps history in the original currency and invalidates results", async (currency) => {
    const candidate = {
        ...marketCandidate,
        latest: {
            ...marketCandidate.latest,
            prices: { [currency]: marketCandidate.latest.prices.chaos },
        },
        conversion: "exchange-v1",
        exchange: {
            currency,
            quote: {
                realm: "pc",
                league: "Standard",
                itemId: exchangeCurrencyId(currency),
                quoteId: exchangeCurrencyId("chaos"),
                amount: 100,
                hour: marketCandidate.latest.hour,
                marketId: `${exchangeCurrencyId(currency)}|${exchangeCurrencyId("chaos")}`,
                low: null,
                high: null,
                itemVolume: 10,
                quoteVolume: 1000,
                estimator: "traded-volume-ratio-v1",
            },
        },
    };
    const fetcher = vi
        .fn()
        .mockImplementation((url: string) =>
            Promise.resolve(
                new Response(
                    JSON.stringify(
                        url.endsWith("history")
                            ? { history: [candidate.latest], nextBefore: null }
                            : { candidates: [candidate], truncated: false, message: null },
                    ),
                ),
            ),
        );
    vi.stubGlobal("fetch", fetcher);
    const select = vi.fn();
    render(
        <MarketPricePicker
            engine={engine}
            item={engine.createItem(baseId, 86)}
            requirements={{ format: 1, game: "poe1", groups: [] }}
            league="Standard"
            currency="chaos"
            price={null}
            onLeagueChange={vi.fn()}
            onSelect={select}
        />,
    );
    fireEvent.click(screen.getByText("Equipment market price"));
    const consent = screen.getByRole("checkbox", {
        name: "Convert other listing currencies using the exchange",
    });
    expect(consent.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(consent);
    fireEvent.click(screen.getByRole("button", { name: "Find market prices" }));
    const bind = await screen.findByRole("button", { name: "Use live median" });
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).conversion).toBe("exchange-v1");
    expect(screen.getByText(/2000 chaos median/)).toBeTruthy();
    expect(
        screen.getByText(new RegExp(`Converted from 20 ${currency} at 100 chaos per ${currency}`)),
    ).toBeTruthy();
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(bind);
    expect(select).toHaveBeenCalledWith(candidate);
    fireEvent.click(screen.getByRole("button", { name: "View price history" }));
    expect(await screen.findByRole("columnheader", { name: `Median (${currency})` })).toBeTruthy();
    fireEvent.click(consent);
    await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Use live median" })).toBeNull(),
    );
});

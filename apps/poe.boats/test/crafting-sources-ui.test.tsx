// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { SourcePricePicker } from "~/components/crafting/source-price-picker";
import { decodeCraftingSourceReference } from "~/lib/crafting-sources";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import { changeControl } from "./control-helpers";
import {
    commodityQuote,
    convertedCommodityQuote,
    essenceId,
    essenceName,
    unravellingId,
    unravellingName,
    unravellingQuote,
} from "./crafting-commodity-fixtures";
import { exchangeGraph } from "./crafting-exchange-fixtures";
import { engine } from "./crafting-fixtures";
import {
    vendorCurrencyInputId,
    vendorCurrencyOutputId,
    vendorCurrencyQuote,
    vendorInputId,
    vendorMiddleId,
    vendorOutputId,
    vendorQuote,
} from "./crafting-vendor-upgrade-fixtures";

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});
const id = "EinharMasterCraftMorrigan7";

it("offers captured currency asks without a beast assumption and only replaces a manual amount explicitly", async () => {
    const fetcher = vi.fn().mockResolvedValue(
        new Response(
            JSON.stringify({
                quotes: { [unravellingId]: unravellingQuote },
                missing: {},
            }),
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    const onChange = vi.fn();
    render(
        <SourcePricePicker
            graph={{
                ...exchangeGraph(),
                prices: {
                    [unravellingId]: {
                        amount: 123,
                        currency: "chaos",
                        source: "manual",
                        confidence: null,
                    },
                },
            }}
            engine={engine}
            entries={[[unravellingId, unravellingName]]}
            onChange={onChange}
        />,
    );
    fireEvent.click(screen.getByText("Currency asking prices"));
    expect(screen.queryByRole("checkbox", { name: /Mountain Lynx/ })).toBeNull();
    expect(screen.getByText(/not completed exchange trades/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Find asking prices" }));
    await screen.findByText(/200 chaos per item/);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({
        ids: [unravellingId],
        realm: "pc",
    });
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).not.toHaveProperty("assumption");
    expect(
        screen.getByText(/1 priced samples · 12 total listings · 11 total sellers/),
    ).toBeTruthy();
    expect(
        screen
            .getByRole("button", { name: "Use source estimates for unpriced inputs" })
            .hasAttribute("disabled"),
    ).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use source estimate" }));
    expect(onChange.mock.calls[0]![0].prices[unravellingId].amount).toBe(200);
    expect(
        decodeCraftingSourceReference(onChange.mock.calls[0]![0].prices[unravellingId].cohortId),
    ).toMatchObject({
        source: "stash-commodity",
        id: unravellingId,
        baseType: unravellingName,
    });
});
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
        ["craicic-sand-spitter", 1, 1],
        ["black-morrigan", 1, 600],
        ["mountain-lynx", 2, 3],
    ].map(([detailsId, quantity, unitPrice]) => ({
        detailsId,
        name: detailsId,
        quantity,
        unitPrice,
        listingCount: 100,
        sourceUrl: "https://poe.ninja/poe1/api/economy/stash/current/item/overview",
    })),
};

it("requires the rare-beast choice and preserves manual prices until explicitly replaced", async () => {
    const fetcher = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ quotes: { [id]: quote }, missing: {} })));
    vi.stubGlobal("fetch", fetcher);
    let saved: CraftingGraph | undefined;
    function Harness() {
        const [graph, setGraph] = useState({
            ...exchangeGraph(),
            prices: {
                [id]: {
                    amount: 123,
                    currency: "chaos",
                    source: "manual" as const,
                    confidence: null,
                },
            },
        } as CraftingGraph);
        return (
            <SourcePricePicker
                graph={graph}
                engine={engine}
                entries={[[id, "Six links"]]}
                onChange={(next) => {
                    saved = next;
                    setGraph(next);
                }}
            />
        );
    }
    render(<Harness />);
    fireEvent.click(screen.getByText("Beast & temple prices"));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Find beast & temple prices" }));
    await screen.findByText("1 of 1 inputs priced.");
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).assumption).toBe(
        "rare-beast-mountain-lynx-v1",
    );
    expect(
        screen
            .getByRole("button", { name: "Use source estimates for unpriced inputs" })
            .hasAttribute("disabled"),
    ).toBe(true);
    expect(saved).toBeUndefined();
    expect(screen.getByText(/2 × mountain-lynx/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use source estimate" }));
    expect(saved?.prices[id]?.amount).toBe(607);
    expect(decodeCraftingSourceReference(saved?.prices[id]?.cohortId)).toMatchObject({
        assumption: "rare-beast-mountain-lynx-v1",
    });
});

it("shows captured per-item asks and fills only unpriced inputs until explicitly selected", async () => {
    const otherId = "Metadata/Items/Currency/CurrencyEssenceRage4";
    const otherName = engine.costName(otherId);
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    quotes: {
                        [essenceId]: commodityQuote,
                        [otherId]: {
                            ...commodityQuote,
                            id: otherId,
                            baseType: otherName,
                            amount: 20,
                        },
                    },
                    missing: {},
                }),
            ),
        ),
    );
    let saved: CraftingGraph | undefined;
    function Harness() {
        const [graph, setGraph] = useState<CraftingGraph>({
            ...exchangeGraph(),
            prices: {
                [essenceId]: { amount: 123, currency: "chaos", source: "manual", confidence: null },
            },
        });
        return (
            <SourcePricePicker
                graph={graph}
                engine={engine}
                entries={[
                    [essenceId, essenceName],
                    [otherId, otherName],
                ]}
                onChange={(next) => {
                    saved = next;
                    setGraph(next);
                }}
            />
        );
    }
    render(<Harness />);
    fireEvent.click(screen.getByText("Currency asking prices"));
    expect(screen.queryByRole("checkbox", { name: /Mountain Lynx/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Find asking prices" }));
    await screen.findByText("2 of 2 inputs priced.");
    const result = within(screen.getByRole("region", { name: `Source price for ${essenceName}` }));
    expect(result.getByText(/16.5 chaos per item/)).toBeTruthy();
    expect(
        result.getByText(/2 priced samples · 25 total listings · 24 total sellers/),
    ).toBeTruthy();
    expect(
        result.getByRole("link", { name: "Captured asking-price history" }).getAttribute("href"),
    ).toBe(
        `/1/market?realm=pc&league=Standard&q=${encodeURIComponent(essenceName).replaceAll("%20", "+")}&item=${encodeURIComponent(essenceName).replaceAll("%20", "+")}&currency=chaos`,
    );
    expect(saved).toBeUndefined();
    fireEvent.click(
        screen.getByRole("button", { name: "Use source estimates for unpriced inputs" }),
    );
    expect(saved?.prices[essenceId]?.amount).toBe(123);
    expect(saved?.prices[otherId]?.amount).toBe(20);
    fireEvent.click(result.getByRole("button", { name: "Use source estimate" }));
    expect(saved?.prices[essenceId]?.amount).toBe(16.5);
    expect(decodeCraftingSourceReference(saved?.prices[essenceId]?.cohortId)?.source).toBe(
        "stash-commodity",
    );
});

it("makes conversion explicit, shows the original ask and keeps manual prices until selection", async () => {
    const fetcher = vi
        .fn()
        .mockImplementation((_url, init) =>
            Promise.resolve(
                new Response(
                    JSON.stringify(
                        JSON.parse(init.body).conversion
                            ? { quotes: { [essenceId]: convertedCommodityQuote }, missing: {} }
                            : { quotes: {}, missing: { [essenceId]: "No chaos asks" } },
                    ),
                ),
            ),
        );
    vi.stubGlobal("fetch", fetcher);
    const graph = {
        ...exchangeGraph(),
        prices: {
            [essenceId]: {
                amount: 123,
                currency: "chaos",
                source: "manual" as const,
                confidence: null,
            },
        },
    };
    const onChange = vi.fn();
    render(
        <SourcePricePicker
            graph={graph}
            engine={engine}
            entries={[[essenceId, essenceName]]}
            onChange={onChange}
        />,
    );
    fireEvent.click(screen.getByText("Currency asking prices"));
    const choice = screen.getByRole("checkbox", {
        name: "Convert currency asks using matching-hour exchange rates",
    });
    expect(choice.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Find asking prices" }));
    await screen.findByText("No chaos asks");
    fireEvent.click(choice);
    expect(screen.queryByText("No chaos asks")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Find asking prices" }));
    await screen.findByText(/600 chaos per item · converted asking median/);
    expect(screen.getByText(/Original ask: 2 divine per item/).textContent).toContain(
        "Matching-hour exchange: 1 divine = 300 chaos",
    );
    expect(
        screen.getByRole("link", { name: "Captured asking-price history" }).getAttribute("href"),
    ).toContain("currency=divine");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use source estimate" }));
    expect(onChange.mock.calls[0]![0].prices[essenceId].amount).toBe(600);
    expect(
        decodeCraftingSourceReference(onChange.mock.calls[0]![0].prices[essenceId].cohortId),
    ).toMatchObject({ conversion: "exchange-v1", exchange: convertedCommodityQuote.exchange });
});

it("cancels a pending essence lookup when conversion policy changes", async () => {
    let resolve: (response: Response) => void = () => {};
    const fetcher = vi.fn().mockReturnValue(
        new Promise<Response>((done) => {
            resolve = done;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const onChange = vi.fn();
    render(
        <SourcePricePicker
            graph={exchangeGraph()}
            engine={engine}
            entries={[[essenceId, essenceName]]}
            onChange={onChange}
        />,
    );
    fireEvent.click(screen.getByText("Currency asking prices"));
    fireEvent.click(screen.getByRole("button", { name: "Find asking prices" }));
    fireEvent.click(
        screen.getByRole("checkbox", {
            name: "Convert currency asks using matching-hour exchange rates",
        }),
    );
    expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
    resolve(new Response(JSON.stringify({ quotes: { [essenceId]: commodityQuote }, missing: {} })));
    await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Use source estimate" })).toBeNull(),
    );
    expect(onChange).not.toHaveBeenCalled();
});

it("discards a pending quote when the project league changes", async () => {
    let resolve: (response: Response) => void = () => {};
    const fetcher = vi.fn().mockReturnValue(
        new Promise<Response>((done) => {
            resolve = done;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const graph = exchangeGraph();
    const onChange = vi.fn();
    const view = render(
        <SourcePricePicker
            graph={graph}
            engine={engine}
            entries={[[id, "Six links"]]}
            onChange={onChange}
        />,
    );
    fireEvent.click(screen.getByText("Beast & temple prices"));
    fireEvent.click(screen.getByRole("button", { name: "Find beast & temple prices" }));
    view.rerender(
        <SourcePricePicker
            graph={{ ...graph, league: "Other" }}
            engine={engine}
            entries={[[id, "Six links"]]}
            onChange={onChange}
        />,
    );
    expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
    resolve(new Response(JSON.stringify({ quotes: { [id]: quote }, missing: {} })));
    await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Use source estimate" })).toBeNull(),
    );
    expect(onChange).not.toHaveBeenCalled();
});

it("keeps direct asking prices separate from an explicitly selected vendor ingredient estimate", async () => {
    const fetcher = vi.fn().mockImplementation((_url, init) =>
        Promise.resolve(
            new Response(
                JSON.stringify(
                    JSON.parse(init.body).vendorUpgrade
                        ? { quotes: { [vendorOutputId]: vendorQuote }, missing: {} }
                        : {
                              quotes: {},
                              missing: { [vendorOutputId]: "No current output asks" },
                          },
                ),
            ),
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    const onChange = vi.fn();
    render(
        <SourcePricePicker
            graph={{
                ...exchangeGraph(),
                prices: {
                    [vendorOutputId]: {
                        amount: 123,
                        currency: "chaos",
                        source: "manual",
                        confidence: null,
                    },
                },
            }}
            engine={engine}
            entries={[[vendorOutputId, vendorQuote.path.outputName]]}
            onChange={onChange}
        />,
    );
    fireEvent.click(screen.getByText("Currency asking prices"));
    fireEvent.click(screen.getByRole("button", { name: "Find asking prices" }));
    await screen.findByText("No current output asks");
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).not.toHaveProperty("vendorUpgrade");
    fireEvent.click(screen.getByText("Vendor-upgrade ingredient estimates"));
    changeControl(screen.getByLabelText(`Vendor ingredient for ${vendorQuote.path.outputName}`), {
        target: { value: vendorInputId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Find vendor-upgrade estimate" }));
    await screen.findByText("18 chaos per output · vendor-upgrade ingredient estimate");
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toMatchObject({
        ids: [vendorOutputId],
        vendorUpgrade: { inputId: vendorInputId },
    });
    expect(screen.getByText(/9 × Weeping Essence of Rage at 2 chaos each/)).toBeTruthy();
    expect(screen.getByText(/3 ingredient units traded/)).toBeTruthy();
    expect(screen.getByText(/Confidence is unknown/)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use vendor-upgrade estimate" }));
    expect(onChange.mock.calls[0]![0].prices[vendorOutputId].amount).toBe(18);
    expect(
        decodeCraftingSourceReference(onChange.mock.calls[0]![0].prices[vendorOutputId].cohortId),
    ).toMatchObject({
        source: "vendor-upgrade",
        path: vendorQuote.path,
        ingredient: vendorQuote.ingredient,
    });
});

it.each([
    false,
    true,
])("offers an explicit NPC purchase without changing its manual price (service input: %s)", async (includeService) => {
    const fetcher = vi.fn().mockResolvedValue(
        new Response(
            JSON.stringify({
                quotes: { [vendorCurrencyOutputId]: vendorCurrencyQuote },
                missing: {},
            }),
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    const onChange = vi.fn();
    render(
        <SourcePricePicker
            graph={{
                ...exchangeGraph(),
                prices: {
                    [vendorCurrencyOutputId]: {
                        amount: 123,
                        currency: "chaos",
                        source: "manual",
                        confidence: null,
                    },
                },
            }}
            engine={engine}
            entries={[
                [vendorCurrencyOutputId, "Orb of Augmentation"],
                ...(includeService
                    ? [["service:recombine", "Recombination"] as [string, string]]
                    : []),
            ]}
            onChange={onChange}
        />,
    );
    fireEvent.click(
        screen.getByText(
            includeService ? "Currency, beast & temple asking prices" : "Currency asking prices",
        ),
    );
    if (!includeService)
        expect(screen.queryByRole("button", { name: "Find beast & temple prices" })).toBeNull();
    expect(screen.getByRole("button", { name: "Find asking prices" })).toBeTruthy();
    fireEvent.click(screen.getByText("Vendor-upgrade ingredient estimates"));
    expect(screen.getByText(/Purchase Items at Nessa/)).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Find vendor-upgrade estimate" }));
    await screen.findByText(/4 × Orb of Transmutation at/);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({
        ids: [vendorCurrencyOutputId],
        vendorUpgrade: { inputId: vendorCurrencyInputId },
    });
    expect(screen.getByRole("link", { name: "Recipe" }).getAttribute("href")).toBe(
        vendorCurrencyQuote.path.steps[0]!.sourceUrl,
    );
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use vendor-upgrade estimate" }));
    const price = onChange.mock.calls[0]![0].prices[vendorCurrencyOutputId];
    expect(price.amount).toBeCloseTo((4 * 7) / 3150);
    expect(decodeCraftingSourceReference(price.cohortId)).toMatchObject({
        source: "vendor-upgrade",
        path: vendorCurrencyQuote.path,
        ingredient: vendorCurrencyQuote.ingredient,
    });
});

it("discards a vendor quote pending when its exact ingredient changes", async () => {
    let resolve: (response: Response) => void = () => {};
    const fetcher = vi.fn().mockReturnValue(
        new Promise<Response>((done) => {
            resolve = done;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const onChange = vi.fn();
    render(
        <SourcePricePicker
            graph={exchangeGraph()}
            engine={engine}
            entries={[[vendorOutputId, vendorQuote.path.outputName]]}
            onChange={onChange}
        />,
    );
    fireEvent.click(screen.getByText("Currency asking prices"));
    fireEvent.click(screen.getByText("Vendor-upgrade ingredient estimates"));
    const choice = screen.getByLabelText(`Vendor ingredient for ${vendorQuote.path.outputName}`);
    changeControl(choice, { target: { value: vendorInputId } });
    fireEvent.click(screen.getByRole("button", { name: "Find vendor-upgrade estimate" }));
    changeControl(choice, { target: { value: vendorMiddleId } });
    expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
    resolve(
        new Response(JSON.stringify({ quotes: { [vendorOutputId]: vendorQuote }, missing: {} })),
    );
    await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Use vendor-upgrade estimate" })).toBeNull(),
    );
    expect(onChange).not.toHaveBeenCalled();
});

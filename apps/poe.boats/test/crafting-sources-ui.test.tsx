// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { SourcePricePicker } from "~/components/crafting/source-price-picker";
import { decodeCraftingSourceReference } from "~/lib/crafting-sources";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import { exchangeGraph } from "./crafting-exchange-fixtures";
import { engine } from "./crafting-fixtures";

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});
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
    expect(decodeCraftingSourceReference(saved?.prices[id]?.cohortId)?.assumption).toBe(
        "rare-beast-mountain-lynx-v1",
    );
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

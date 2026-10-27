// @vitest-environment jsdom

import { extensionEnvelope, type PageMessage, pageEnvelopeSchema } from "@poe-tools/trade-bridge";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { GraphBuyIn } from "~/components/crafting/graph-buy-in";
import { recordBuyInStage } from "~/lib/crafting-buy-in";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import { catalog } from "./crafting-fixtures";
import { firstItem, graphFixture } from "./crafting-graph-fixtures";

vi.mock("~/components/currency-label", () => ({
    CurrencyLabel: ({ currency }: { currency: string }) => <>{currency}</>,
}));

const removers: (() => void)[] = [];
afterEach(() => {
    cleanup();
    for (const remove of removers.splice(0)) remove();
    vi.restoreAllMocks();
});

/** jsdom's postMessage omits the source and origin a browser sets. */
function deliver(message: Parameters<typeof extensionEnvelope>[0]) {
    window.dispatchEvent(
        new MessageEvent("message", {
            data: extensionEnvelope(message),
            source: window,
            origin: window.location.origin,
        }),
    );
}

/** Answers the page like the extension's content script would, and records page messages. */
function fakeExtension() {
    const received: PageMessage[] = [];
    const listener = (event: MessageEvent) => {
        const envelope = pageEnvelopeSchema.safeParse(event.data);
        if (!envelope.success) return;
        received.push(envelope.data.message);
        if (envelope.data.message.kind === "hello")
            deliver({ kind: "ready", version: "0.1.0", bridge: 1 });
    };
    window.addEventListener("message", listener);
    removers.push(() => window.removeEventListener("message", listener));
    return received;
}

function renderPanel(graph: CraftingGraph, onChange = vi.fn()) {
    render(
        <MemoryRouter>
            <GraphBuyIn graph={graph} catalog={catalog} onChange={onChange} />
        </MemoryRouter>,
    );
    return onChange;
}

const graph = () => ({ ...graphFixture(), league: "Standard" });

it("points to the extension page when the extension is not installed", async () => {
    renderPanel(graph());
    const link = await screen.findByRole("link", { name: /How it works/ }, { timeout: 3000 });
    expect(link.getAttribute("href")).toBe("/extension");
    expect(screen.getByRole("button", { name: /Price steps/ }).hasAttribute("disabled")).toBe(true);
});

it("starts a run with each step's instant-buyout search and shows why it stopped", async () => {
    const received = fakeExtension();
    renderPanel(graph());
    const price = await screen.findByRole("button", { name: "Price steps (1)" });
    await vi.waitFor(() => expect(price.hasAttribute("disabled")).toBe(false));
    expect(received).toContainEqual({ kind: "collect", graphId: "graph" });
    fireEvent.click(price);
    const start = await vi.waitFor(() => {
        const found = received.find((message) => message.kind === "startRun");
        if (!found) throw new Error("No run started yet");
        return found;
    });
    expect(start).toMatchObject({
        game: "poe1",
        league: "Standard",
        stages: [{ stageId: "combine", name: "Combine donors" }],
    });
    if (start?.kind !== "startRun") throw new Error("No run started");
    expect(start.stages[0]?.instant).toMatchObject({ query: { status: { option: "securable" } } });
    deliver({
        kind: "runFinished",
        runId: start.runId,
        graphId: "graph",
        outcome: "stopped",
        reason: "Sign in on pathofexile.com in this browser, then try again.",
        signIn: true,
    });
    expect((await screen.findByRole("status")).textContent).toContain("Sign in on pathofexile.com");
    expect(screen.getByText(/^Failed: Sign in/)).toBeTruthy();
});

it("shows a saved instant-buyout price with its details", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-27T13:00:00.000Z"));
    const priced = recordBuyInStage(
        graph(),
        "combine",
        {
            status: "priced",
            price: { amount: 42, currency: "chaos" },
            sale: "instant",
            confidence: "high",
            counts: {
                results: 12,
                fetched: 10,
                matching: 4,
                nearPrice: 2,
                notMatching: 5,
                unreadable: 1,
                unconverted: 0,
                bait: 0,
            },
            item: firstItem,
        },
        "2026-10-27T10:00:00.000Z",
    );
    renderPanel(priced);
    expect(await screen.findByText(/Instant buyout/)).toBeTruthy();
    expect(screen.getByText("3 h ago")).toBeTruthy();
    expect(
        screen.getByText("4 matching of 10 checked, 2 within 20%, 5 not matching, 1 unreadable"),
    ).toBeTruthy();
    expect(document.body.textContent).toContain("42chaos");
});

it("saves the in-person setting and the league on the project", async () => {
    const onChange = renderPanel(graph());
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ buyIn: { includeInPerson: true, stages: {} } }),
    );
    const league = screen.getByPlaceholderText("Enter the league name");
    fireEvent.change(league, { target: { value: "Hardcore" } });
    fireEvent.blur(league);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ league: "Hardcore" }));
});

// @vitest-environment jsdom
/** biome-ignore-all lint/style/useNamingConvention: React component exports use PascalCase. */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import RecombinatorPage from "~/routes/recombinator";
import type { RecombinatorCatalog } from "~/schemas/recombinator-catalog";
import { catalogFixture } from "./fixtures/recombinator-catalog";

vi.mock("~/components/app-header", () => ({ AppHeader: () => null }));
vi.mock("~/components/app-footer", () => ({ AppFooter: () => null }));
vi.mock("~/components/recombinator/simulator", () => ({
    RecombinatorSimulator: ({ catalog }: { catalog?: RecombinatorCatalog }) =>
        createElement("div", { "data-testid": "catalog" }, catalog?.patch ?? "custom inputs"),
}));

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("recombinator catalog loading", () => {
    it.each([
        "http",
        "schema",
    ])("reports a %s failure and loads the catalog on retry", async (failure) => {
        const fetch = vi
            .fn()
            .mockResolvedValueOnce(
                failure === "http"
                    ? new Response("unavailable", { status: 503 })
                    : Response.json({ game: "poe2" }),
            )
            .mockResolvedValueOnce(Response.json(catalogFixture));
        vi.stubGlobal("fetch", fetch);
        render(createElement(MemoryRouter, {}, createElement(RecombinatorPage)));
        expect(await screen.findByRole("alert")).toBeDefined();
        expect(screen.queryByTestId("catalog")).toBeNull();
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Retry catalog" }));
        });
        expect(screen.getByTestId("catalog").textContent).toBe("fixture");
        expect(screen.queryByRole("alert")).toBeNull();
        expect(fetch).toHaveBeenLastCalledWith(
            "/game-data/recombinator-poe1.json",
            expect.objectContaining({ cache: "reload" }),
        );
    });
});

// @vitest-environment jsdom
/** biome-ignore-all lint/style/useNamingConvention: Mocked React exports use PascalCase. */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { CraftingPage } from "~/routes/crafting/page";
import type { CraftingCatalog } from "~/schemas/crafting";
import { catalog } from "./crafting-fixtures";
import { stubCraftingWorkers } from "./crafting-worker-fixtures";

vi.mock("~/components/app-header", () => ({ AppHeader: () => null }));
vi.mock("~/components/app-footer", () => ({
    AppFooter: ({ source }: { source: string }) => <footer>{source}</footer>,
}));
vi.mock("~/components/crafting/workbench", () => ({
    CraftingWorkbench: ({ catalog }: { catalog: CraftingCatalog }) => (
        <div data-testid="catalog">
            {catalog.game} {catalog.patch}
        </div>
    ),
}));
beforeEach(() => stubCraftingWorkers());
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

it.each([
    "http",
    "schema",
    "wrong game",
])("reports %s catalog failures and retries", async (failure) => {
    const fetch = vi
        .fn()
        .mockResolvedValueOnce(
            failure === "http"
                ? new Response("unavailable", { status: 503 })
                : Response.json(failure === "schema" ? {} : { ...catalog, game: "poe2" }),
        )
        .mockResolvedValueOnce(Response.json(catalog));
    vi.stubGlobal("fetch", fetch);
    render(
        <MemoryRouter>
            <CraftingPage game="poe1" />
        </MemoryRouter>,
    );
    expect(await screen.findByRole("alert")).toBeDefined();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry catalog" })));
    expect(screen.getByTestId("catalog").textContent).toContain(catalog.patch);
    expect(screen.getByRole("contentinfo").textContent).toContain("Game data extracted");
    expect(fetch).toHaveBeenLastCalledWith(
        "/game-data/crafting-poe1.json",
        expect.objectContaining({ cache: "reload" }),
    );
});

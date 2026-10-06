// @vitest-environment jsdom
/** biome-ignore-all lint/style/useNamingConvention: Mocked React exports use PascalCase. */
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { CraftingPage } from "~/routes/crafting/page";
import { craftingCatalogSchema } from "~/schemas/crafting";
import { catalog } from "./crafting-fixtures";

vi.mock("~/components/app-header", () => ({ AppHeader: () => <header>App navigation</header> }));
vi.mock("~/components/app-footer", () => ({ AppFooter: () => <footer>Data provenance</footer> }));

const catalogs = [
    catalog,
    craftingCatalogSchema.parse(
        JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
    ),
];
const storageKey = "poe-boats:crafting:fullscreen";
const toggle = () => screen.getByRole("button", { name: "Fullscreen crafting" });
function page(game: "poe1" | "poe2", mode = "calculate") {
    return (
        <MemoryRouter initialEntries={[`/${game}/crafting/${mode}`]}>
            <Routes>
                <Route path="/:game/crafting/:mode" element={<CraftingPage game={game} />} />
            </Routes>
        </MemoryRouter>
    );
}
beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe.each(catalogs)("$game fullscreen crafting", (data) => {
    it("keeps an active calculation running until the user stops it", async () => {
        const terminate = vi.fn();
        const postMessage = vi.fn();
        vi.stubGlobal(
            "Worker",
            class {
                terminate = terminate;
                postMessage = postMessage;
            },
        );
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
        render(page(data.game));
        await screen.findByRole("heading", { name: "Crafting workbench" });
        fireEvent.change(screen.getByLabelText("Required rarity"), {
            target: { value: "rare" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Calculate odds" }));
        expect(postMessage).toHaveBeenCalledTimes(1);
        fireEvent.click(toggle());
        fireEvent.click(toggle());
        expect(postMessage).toHaveBeenCalledTimes(1);
        expect(terminate).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Stop simulation" }));
        expect(terminate).toHaveBeenCalledTimes(1);
    });

    it.each([
        "calculate",
        "simulate",
        "emulate",
    ])("preserves the %s item, history and mounted controls while changing layout", async (mode) => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
        render(page(data.game, mode));
        await screen.findByRole("heading", { name: "Crafting workbench" });
        const item = screen.getByRole("region", { name: "Current item" });
        const initial = item.textContent;
        if (mode === "simulate") fireEvent.click(screen.getByRole("link", { name: "Emulate" }));
        fireEvent.click(screen.getByRole("button", { name: "Apply craft" }));
        if (mode === "simulate") fireEvent.click(screen.getByRole("link", { name: "Simulate" }));
        const crafted = item.textContent;
        expect(crafted).not.toBe(initial);
        const method = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.click(toggle());
        expect(toggle().getAttribute("aria-pressed")).toBe("true");
        expect(screen.queryByRole("banner")).toBeNull();
        expect(screen.queryByRole("contentinfo")).toBeNull();
        expect(screen.getByRole("main").className).toContain("max-w-none");
        expect(screen.getByRole("region", { name: "Current item" })).toBe(item);
        expect(screen.getByRole("combobox", { name: "Crafting method" })).toBe(method);
        expect(localStorage.getItem(storageKey)).toBe("true");
        fireEvent.click(toggle());
        expect(item.textContent).toBe(crafted);
        expect(screen.getByRole("banner")).toBeDefined();
        expect(screen.getByRole("contentinfo")).toBeDefined();
        expect(screen.getByRole("main").className).toContain("max-w-[1600px]");
        if (mode === "simulate") fireEvent.click(screen.getByRole("link", { name: "Emulate" }));
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
        expect(item.textContent).toBe(initial);
        expect(localStorage.getItem(storageKey)).toBe("false");
    });

    it("keeps searchable picker portals usable and lets them handle Escape before leaving fullscreen", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
        render(page(data.game));
        await screen.findByRole("heading", { name: "Crafting workbench" });
        fireEvent.click(toggle());
        const currency = data.crafting.currencies.find(
            (entry) => entry.action === "transmute_to_magic",
        )!;
        const input = screen.getByRole("combobox", { name: "Crafting method" });
        fireEvent.change(input, { target: { value: currency.name } });
        fireEvent.keyDown(input, { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: currency.name }));
        expect(input).toHaveProperty("value", currency.name);
        fireEvent.keyDown(input, { key: "ArrowDown" });
        await screen.findByRole("listbox");
        fireEvent.keyDown(input, { key: "Escape" });
        expect(toggle().getAttribute("aria-pressed")).toBe("true");
        fireEvent.keyDown(toggle(), { key: "Escape" });
        expect(toggle().getAttribute("aria-pressed")).toBe("false");
        expect(document.activeElement).toBe(toggle());
    });
});

it("restores the fullscreen preference in either game after remounting", async () => {
    vi.stubGlobal(
        "fetch",
        vi
            .fn()
            .mockImplementation((url: string) =>
                Promise.resolve(Response.json(catalogs.find((data) => url.includes(data.game))!)),
            ),
    );
    const first = render(page("poe1"));
    await screen.findByRole("heading", { name: "Crafting workbench" });
    fireEvent.click(toggle());
    first.unmount();
    render(page("poe2", "simulate"));
    await screen.findByRole("heading", { name: "Crafting workbench" });
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("banner")).toBeNull();
});

it("can leave a saved fullscreen layout while the catalog request fails", async () => {
    localStorage.setItem(storageKey, "true");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    render(page("poe1"));
    await screen.findByRole("alert");
    fireEvent.keyDown(screen.getByRole("button", { name: "Retry catalog" }), { key: "Escape" });
    expect(screen.getByRole("banner")).toBeDefined();
    expect(document.activeElement).toBe(toggle());
    expect(screen.getByRole("button", { name: "Retry catalog" })).toBeDefined();
});

it("supports the current layout when browser storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("Unavailable");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("Unavailable");
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(catalog)));
    render(page("poe1"));
    await screen.findByRole("heading", { name: "Crafting workbench" });
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
});

it("does not read browser storage or fetch catalogs during server rendering", () => {
    const read = vi.spyOn(Storage.prototype, "getItem");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(renderToString(page("poe1"))).toContain("Loading build-extracted crafting data");
    expect(read).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
});

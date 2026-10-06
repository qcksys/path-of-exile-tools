// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { MethodPicker } from "~/components/crafting/method-picker";
import { methodPinKey, PinnedMethods } from "~/components/crafting/pinned-methods";
import { CraftingWorkbench } from "~/components/crafting/workbench";
import { CraftingEngine } from "~/lib/crafting-engine";
import { type CraftingMethod, craftingCatalogSchema } from "~/schemas/crafting";

const catalogs = Object.fromEntries(
    ["poe1", "poe2"].map((game) => [
        game,
        craftingCatalogSchema.parse(
            JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
        ),
    ]),
);
const storageKey = (game = "poe1") => `poe-boats:crafting:pinned-methods:${game}`;
const pinButton = () => screen.getByRole("button", { name: "Pin current crafting method" });
async function choose(label: string, name: string) {
    fireEvent.change(screen.getByRole("combobox", { name: label }), { target: { value: name } });
    fireEvent.keyDown(screen.getByRole("combobox", { name: label }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name }));
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

describe.each(["poe1", "poe2"] as const)("%s pinned crafting methods", (game) => {
    const catalog = catalogs[game]!;
    const engine = new CraftingEngine(catalog);
    const base = Object.entries(catalog.bases).find(
        ([, base]) => base.item_class === "Body Armour" && base.drop_level === 1,
    )![0];
    const alchemy = catalog.crafting.currencies.find(
        (entry) => entry.action === "transmute_to_rare",
    )!;
    const transmutation = catalog.crafting.currencies.find(
        (entry) => entry.action === "transmute_to_magic",
    )!;
    const initial: CraftingMethod = { kind: "currency", id: alchemy.id };
    function Picker({
        baseId = base,
        value = initial,
    }: {
        baseId?: string;
        value?: CraftingMethod;
    }) {
        const [method, setMethod] = useState(value);
        return (
            <MethodPicker
                engine={engine}
                item={engine.createItem(baseId)}
                value={method}
                onChange={setMethod}
            />
        );
    }

    it("pins catalog identities, selects them through the normal chooser and persists across remounts", async () => {
        const view = render(<Picker />);
        expect(pinButton().getAttribute("aria-pressed")).toBe("false");
        fireEvent.click(pinButton());
        expect(JSON.parse(localStorage.getItem(storageKey(game))!)).toEqual([
            `currency:${alchemy.id}`,
        ]);
        expect(pinButton().getAttribute("aria-pressed")).toBe("true");
        await choose("Crafting method", transmutation.name);
        fireEvent.click(pinButton());
        await choose("Pinned crafting methods", alchemy.name);
        expect(screen.getByRole("combobox", { name: "Crafting method" })).toHaveProperty(
            "value",
            alchemy.name,
        );
        view.unmount();
        render(<Picker value={{ kind: "currency", id: transmutation.id }} />);
        await choose("Pinned crafting methods", alchemy.name);
        fireEvent.click(pinButton());
        expect(JSON.parse(localStorage.getItem(storageKey(game))!)).toEqual([
            `currency:${transmutation.id}`,
        ]);
    });

    it("shares pin changes with other open method pickers and keeps games separate", () => {
        render(
            <>
                <section aria-label="Main picker">
                    <Picker />
                </section>
                <section aria-label="Step picker">
                    <Picker />
                </section>
            </>,
        );
        const main = within(screen.getByRole("region", { name: "Main picker" }));
        const step = within(screen.getByRole("region", { name: "Step picker" }));
        fireEvent.click(main.getByRole("button", { name: "Pin current crafting method" }));
        expect(
            step
                .getByRole("button", { name: "Pin current crafting method" })
                .getAttribute("aria-pressed"),
        ).toBe("true");
        expect(step.getByRole("combobox", { name: "Pinned crafting methods" })).toHaveProperty(
            "value",
            alchemy.name,
        );
        expect(localStorage.getItem(storageKey(game === "poe1" ? "poe2" : "poe1"))).toBeNull();
        act(() => {
            localStorage.setItem(storageKey(game), "[]");
            window.dispatchEvent(new StorageEvent("storage", { key: storageKey(game) }));
        });
        expect(main.queryByRole("combobox", { name: "Pinned crafting methods" })).toBeNull();
        expect(step.queryByRole("combobox", { name: "Pinned crafting methods" })).toBeNull();
    });

    it("uses pins in calculator, emulator and simulator steps without changing crafting history", async () => {
        const mount = (mode: string) =>
            render(
                <MemoryRouter>
                    <CraftingWorkbench catalog={catalog} mode={mode} />
                </MemoryRouter>,
            );
        let view = mount("calculate");
        fireEvent.click(pinButton());
        view.unmount();
        view = mount("emulate");
        await choose("Crafting method", transmutation.name);
        await choose("Pinned crafting methods", alchemy.name);
        const card = screen.getByRole("region", { name: "Current item" });
        const before = card.textContent;
        fireEvent.click(screen.getByRole("button", { name: "Apply craft" }));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(card.textContent).not.toBe(before);
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
        expect(card.textContent).toBe(before);
        expect(pinButton().getAttribute("aria-pressed")).toBe("true");
        view.unmount();
        mount("simulate");
        fireEvent.click(screen.getByRole("button", { name: "Add crafting step" }));
        expect(screen.getAllByRole("combobox", { name: "Pinned crafting methods" })).toHaveLength(
            2,
        );
        const buttons = screen.getAllByRole("button", { name: "Pin current crafting method" });
        fireEvent.click(buttons[1]!);
        expect(screen.queryByRole("combobox", { name: "Pinned crafting methods" })).toBeNull();
        expect(buttons[0]!.getAttribute("aria-pressed")).toBe("false");
    });
});

describe("pinned method storage and applicability", () => {
    const catalog = catalogs.poe1!;
    const engine = new CraftingEngine(catalog);
    const currency = catalog.crafting.currencies.find(
        (entry) => entry.action === "transmute_to_rare",
    )!;
    const option = { id: "current", label: currency.name, pin: `currency:${currency.id}` };
    const props = {
        game: "poe1" as const,
        options: [option],
        current: option.pin,
        onSelect: vi.fn(),
    };

    it("hides inapplicable or stale pins without deleting them and resolves current catalog labels", () => {
        localStorage.setItem(
            storageKey(),
            JSON.stringify([option.pin, option.pin, "currency:removed"]),
        );
        const view = render(<PinnedMethods {...props} />);
        expect(screen.getByRole("combobox", { name: "Pinned crafting methods" })).toHaveProperty(
            "value",
            currency.name,
        );
        view.rerender(<PinnedMethods {...props} options={[]} />);
        expect(screen.queryByRole("combobox", { name: "Pinned crafting methods" })).toBeNull();
        expect(pinButton()).toHaveProperty("disabled", true);
        expect(JSON.parse(localStorage.getItem(storageKey())!)).toHaveLength(3);
        view.rerender(
            <PinnedMethods {...props} options={[{ ...option, label: "Updated catalog label" }]} />,
        );
        expect(screen.getByRole("combobox", { name: "Pinned crafting methods" })).toHaveProperty(
            "value",
            "Updated catalog label",
        );
    });

    it.each([
        "not json",
        "{}",
        '[1,"currency:removed"]',
    ])("ignores invalid stored preferences %s and repairs them on pin", (raw) => {
        localStorage.setItem(storageKey(), raw);
        render(<PinnedMethods {...props} />);
        expect(screen.queryByRole("combobox", { name: "Pinned crafting methods" })).toBeNull();
        fireEvent.click(pinButton());
        expect(JSON.parse(localStorage.getItem(storageKey())!)).toEqual([option.pin]);
    });

    it("reports failed writes without claiming the pin was saved and allows retry", () => {
        render(<PinnedMethods {...props} />);
        const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("Storage full");
        });
        fireEvent.click(pinButton());
        expect(screen.getByRole("alert").textContent).toContain("Could not save pinned methods");
        expect(pinButton().getAttribute("aria-pressed")).toBe("false");
        write.mockRestore();
        fireEvent.click(pinButton());
        expect(screen.queryByRole("alert")).toBeNull();
        expect(pinButton().getAttribute("aria-pressed")).toBe("true");
    });

    it("renders the server snapshot without reading browser storage", () => {
        const read = vi.spyOn(Storage.prototype, "getItem");
        const html = renderToString(<PinnedMethods {...props} />);
        expect(read).not.toHaveBeenCalled();
        expect(html).toContain("Pin method");
    });

    it("keeps pins independent of method parameters and uses current beast defaults when selecting", async () => {
        const beast = catalog.crafting.beasts.find((entry) => engine.beastRequiresLevel(entry.id))!;
        const base = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "LifeFlask",
        )![0];
        const method: CraftingMethod = { kind: "beast", id: beast.id, level: 100 };
        expect(methodPinKey(method)).toBe(`beast:${beast.id}`);
        expect(
            methodPinKey({ kind: "fossils", ids: [], resonator: "unused", logic: "additive" }),
        ).toBe("fossils");
        expect(methodPinKey({ kind: "reveal", preferred: ["unused"] })).toBe("reveal");
        localStorage.setItem(storageKey(), JSON.stringify([methodPinKey(method)]));
        const onChange = vi.fn();
        render(
            <MethodPicker
                engine={engine}
                item={engine.createItem(base, 60)}
                value={{ kind: "currency", id: currency.id }}
                onChange={onChange}
            />,
        );
        await choose(
            "Pinned crafting methods",
            `Beastcraft · ${beast.category}: ${beast.description}`,
        );
        expect(onChange).toHaveBeenCalledWith({ kind: "beast", id: beast.id, level: 60 });
    });
});

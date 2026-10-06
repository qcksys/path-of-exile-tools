// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ModifierLayout } from "~/components/crafting/display-settings";
import { ModBrowser } from "~/components/crafting/mod-browser";
import { CraftingEngine } from "~/lib/crafting-engine";
import { type CraftingItem, craftingCatalogSchema } from "~/schemas/crafting";
import { catalog } from "./crafting-fixtures";

const catalogs = [
    catalog,
    craftingCatalogSchema.parse(
        JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
    ),
];
const ids = (element: HTMLElement) =>
    [...element.querySelectorAll<HTMLElement>("[data-modifier-id]")].map(
        (row) => row.dataset.modifierId!,
    );
const region = (name: string) => screen.getByRole("region", { name });
const search = (value: string) =>
    fireEvent.change(screen.getByLabelText("Search modifiers"), { target: { value } });
const source = (value: string) =>
    fireEvent.change(screen.getByLabelText("Modifier source"), { target: { value } });
const next = (name: string) =>
    fireEvent.click(
        within(screen.getByRole("navigation", { name: `${name} pages` })).getByRole("button", {
            name: "Next",
        }),
    );

function Browser({
    engine,
    item,
    layout,
    onAdd,
}: {
    engine: CraftingEngine;
    item: CraftingItem;
    layout: ModifierLayout;
    onAdd: (id: string, source: string) => void;
}) {
    const [target, setTarget] = useState(() => engine.validateTarget({ groups: [] }));
    const method = {
        kind: "currency" as const,
        id: engine.catalog.crafting.currencies.find(
            (entry) => entry.action === "transmute_to_rare",
        )!.id,
    };
    return (
        <>
            <ModBrowser
                engine={engine}
                item={item}
                method={method}
                target={target}
                onTarget={setTarget}
                onAdd={onAdd}
                layout={layout}
                filterEffect="hide"
            />
            <output aria-label="Requirements">{JSON.stringify(target)}</output>
        </>
    );
}

afterEach(cleanup);

describe.each(catalogs)("$game modifier layouts", (data) => {
    const engine = new CraftingEngine(data);
    const base = Object.entries(data.bases).find(
        ([, base]) => base.item_class === "Body Armour" && base.drop_level === 1,
    )![0];
    const item = engine.createItem(base);
    const pool = engine.pool({ ...item, rarity: "rare" });

    it("paginates each affix independently and retains both positions across layouts", () => {
        const onAdd = vi.fn();
        const view = render(<Browser engine={engine} item={item} layout="columns" onAdd={onAdd} />);
        const prefix = ids(region("Prefixes"));
        const suffix = ids(region("Suffixes"));
        expect(prefix).toHaveLength(30);
        expect(suffix).toHaveLength(30);
        expect(prefix.every((id) => data.mods[id]!.generation_type === "prefix")).toBe(true);
        expect(suffix.every((id) => data.mods[id]!.generation_type === "suffix")).toBe(true);
        next("Prefixes");
        const secondPrefix = ids(region("Prefixes"));
        expect(secondPrefix).not.toEqual(prefix);
        expect(ids(region("Suffixes"))).toEqual(suffix);
        next("Suffixes");
        const secondSuffix = ids(region("Suffixes"));
        expect(secondSuffix).not.toEqual(suffix);
        expect(ids(region("Prefixes"))).toEqual(secondPrefix);
        view.rerender(<Browser engine={engine} item={item} layout="tabs" onAdd={onAdd} />);
        expect(ids(screen.getByRole("tabpanel"))).toEqual(secondPrefix);
        fireEvent.click(screen.getByRole("tab", { name: /^Suffixes/ }));
        expect(ids(screen.getByRole("tabpanel"))).toEqual(secondSuffix);
        view.rerender(<Browser engine={engine} item={item} layout="columns" onAdd={onAdd} />);
        expect(ids(region("Prefixes"))).toEqual(secondPrefix);
        expect(ids(region("Suffixes"))).toEqual(secondSuffix);
    });

    it("supports keyboard tabs, target selection and starting modifiers without resetting search", async () => {
        const onAdd = vi.fn();
        const view = render(<Browser engine={engine} item={item} layout="tabs" onAdd={onAdd} />);
        const prefix = screen.getByRole("tab", { name: /^Prefixes/ });
        act(() => prefix.focus());
        await act(async () => {
            fireEvent.keyDown(prefix, { key: "ArrowRight" });
        });
        const suffix = screen.getByRole("tab", { name: /^Suffixes/ });
        expect(document.activeElement).toBe(suffix);
        expect(suffix.getAttribute("aria-selected")).toBe("true");
        search("ColdResist1");
        const panel = screen.getByRole("tabpanel");
        const id = ids(panel)[0]!;
        expect(data.mods[id]!.generation_type).toBe("suffix");
        fireEvent.click(within(panel).getAllByRole("button", { name: "Require" })[0]!);
        const requirements = screen.getByLabelText("Requirements").textContent;
        expect(JSON.parse(requirements!).groups[0].mods).toEqual([id]);
        view.rerender(<Browser engine={engine} item={item} layout="columns" onAdd={onAdd} />);
        expect(screen.getByLabelText("Search modifiers")).toHaveProperty("value", "ColdResist1");
        expect(screen.getByLabelText("Requirements").textContent).toBe(requirements);
        const row = region("Suffixes").querySelector<HTMLElement>(`[data-modifier-id="${id}"]`)!;
        expect(within(row).getByRole("button", { name: "Remove target" })).toBeDefined();
        fireEvent.click(within(row).getByRole("button", { name: "Add to item" }));
        expect(onAdd).toHaveBeenCalledWith(id, "natural");
        fireEvent.click(within(row).getByRole("button", { name: "Remove target" }));
        expect(JSON.parse(screen.getByLabelText("Requirements").textContent!).groups).toEqual([]);
    });

    it("resets filtered pages, keeps full-pool weights and handles empty sides", () => {
        render(<Browser engine={engine} item={item} layout="columns" onAdd={vi.fn()} />);
        const id = ids(region("Prefixes"))[0]!;
        const record = pool.find((entry) => entry.id === id)!;
        const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
        const percentage = `${((record.weight / total) * 100).toFixed(3)}%`;
        expect(
            region("Prefixes").querySelector(`[data-modifier-id="${id}"]`)!.textContent,
        ).toContain(percentage);
        next("Prefixes");
        next("Suffixes");
        search("IncreasedLife8");
        expect(ids(region("Prefixes"))).toEqual(["IncreasedLife8"]);
        expect(ids(region("Suffixes"))).toEqual([]);
        expect(screen.getByRole("navigation", { name: "Prefixes pages" }).textContent).toContain(
            "1 / 1",
        );
        expect(screen.getByRole("navigation", { name: "Suffixes pages" }).textContent).toContain(
            "1 / 1",
        );
        search("");
        fireEvent.change(screen.getByLabelText("Modifier tag"), { target: { value: "life" } });
        expect(
            [...ids(region("Prefixes")), ...ids(region("Suffixes"))].every((id) =>
                data.mods[id]!.implicit_tags.includes("life"),
            ),
        ).toBe(true);
        search("no-such-modifier");
        expect(ids(region("Modifier pool"))).toEqual([]);
        expect(screen.queryAllByRole("button", { name: "Require" })).toHaveLength(0);
    });

    it("keeps implicit sources in one list under either layout and restores affix tabs", () => {
        const onAdd = vi.fn();
        const view = render(<Browser engine={engine} item={item} layout="tabs" onAdd={onAdd} />);
        fireEvent.click(screen.getByRole("tab", { name: /^Suffixes/ }));
        source("corrupted");
        expect(screen.queryByRole("tablist", { name: "Modifier affixes" })).toBeNull();
        expect(region("Modifier pool").dataset.modifierLayout).toBe("list");
        const expected = new Set(engine.corruptedModifiers(item).map((entry) => entry.id));
        expect(ids(region("Modifier pool")).length).toBeGreaterThan(0);
        expect(ids(region("Modifier pool")).every((id) => expected.has(id))).toBe(true);
        const before = ids(region("Modifier pool"));
        view.rerender(<Browser engine={engine} item={item} layout="columns" onAdd={onAdd} />);
        expect(ids(region("Modifier pool"))).toEqual(before);
        source("natural");
        view.rerender(<Browser engine={engine} item={item} layout="tabs" onAdd={onAdd} />);
        expect(screen.getByRole("tab", { name: /^Suffixes/ }).getAttribute("aria-selected")).toBe(
            "true",
        );
        expect(
            ids(screen.getByRole("tabpanel")).every(
                (id) => data.mods[id]!.generation_type === "suffix",
            ),
        ).toBe(true);
    });

    it("clamps the current side page when a lower item level reduces its pool", () => {
        const onAdd = vi.fn();
        const view = render(<Browser engine={engine} item={item} layout="columns" onAdd={onAdd} />);
        next("Prefixes");
        next("Prefixes");
        next("Suffixes");
        view.rerender(
            <Browser engine={engine} item={{ ...item, level: 1 }} layout="columns" onAdd={onAdd} />,
        );
        const available = new Set(
            engine.pool({ ...item, level: 1, rarity: "rare" }).map((entry) => entry.id),
        );
        expect(ids(region("Modifier pool")).every((id) => available.has(id))).toBe(true);
        expect(screen.getByRole("navigation", { name: "Prefixes pages" }).textContent).toContain(
            "1 / 1",
        );
        expect(screen.getByRole("navigation", { name: "Suffixes pages" }).textContent).toContain(
            "1 / 1",
        );
    });
});

// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { type ComponentProps, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ModBrowser } from "~/components/crafting/mod-browser";
import { CraftingEngine, eldritchTier, seededRandom } from "~/lib/crafting-engine";
import { type CraftingItem, type CraftingMethod, craftingCatalogSchema } from "~/schemas/crafting";
import { catalog } from "./crafting-fixtures";

const catalogs = [
    catalog,
    craftingCatalogSchema.parse(
        JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
    ),
];
type Display = Pick<
    ComponentProps<typeof ModBrowser>,
    "layout" | "filterEffect" | "showTagFilter" | "showWeightPercentages"
>;
function Browser({
    engine,
    item,
    onAdd,
    method,
    ...display
}: Display & {
    engine: CraftingEngine;
    item: CraftingItem;
    method?: CraftingMethod;
    onAdd: (id: string, source: string) => void;
}) {
    const [target, setTarget] = useState(() => engine.validateTarget({ groups: [] }));
    return (
        <>
            <ModBrowser
                {...display}
                engine={engine}
                item={item}
                method={
                    method ?? {
                        kind: "currency",
                        id: engine.catalog.crafting.currencies.find(
                            (entry) => entry.action === "transmute_to_rare",
                        )!.id,
                    }
                }
                target={target}
                onTarget={setTarget}
                onAdd={onAdd}
            />
            <output aria-label="Requirements">{JSON.stringify(target)}</output>
        </>
    );
}
const poolRegion = () => screen.getByRole("region", { name: "Modifier pool" });
const rows = () => [...poolRegion().querySelectorAll<HTMLElement>("[data-modifier-id]")];
const row = (id: string) => rows().find((entry) => entry.dataset.modifierId === id)!;
const ids = () => rows().map((entry) => entry.dataset.modifierId!);
const change = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
const requirements = () => screen.getByLabelText("Requirements").textContent;

afterEach(cleanup);

describe("influence modifier previews", () => {
    const engine = new CraftingEngine(catalog);
    const item = engine.createItem("Metadata/Items/Armours/BodyArmours/BodyStr1");

    it("shows inactive influence weights against the ordinary pool and supports targets without changing the item", () => {
        const before = structuredClone(item);
        const onAdd = vi.fn();
        render(<Browser engine={engine} item={item} onAdd={onAdd} />);
        change("Modifier source", "influence:0");
        const pool = engine.influenceModifiers(item, 0);
        const id = ids()[0]!;
        const entry = pool.find((entry) => entry.id === id)!;
        expect(ids().every((id) => catalog.crafting.modRules[id]?.influence === 0)).toBe(true);
        const share = `Pool ${((entry.weight / pool.reduce((sum, entry) => sum + entry.weight, 0)) * 100).toFixed(3)}%`;
        expect(within(row(id)).getByText(share)).toBeDefined();
        expect(screen.getByText(/Shaper preview/).textContent).toContain("this influence alone");
        change("Search modifiers", id);
        expect(within(row(id)).getByText(share)).toBeDefined();
        fireEvent.click(within(row(id)).getByRole("button", { name: "Require" }));
        expect(JSON.parse(requirements()!).groups[0].mods).toEqual([id]);
        expect(item).toEqual(before);
        fireEvent.click(within(row(id)).getByRole("button", { name: "Add to item" }));
        expect(onAdd).toHaveBeenCalledWith(id, "influence");
    });

    it("updates active denominators and falls back to natural modifiers on unsupported bases and games", () => {
        const props = { engine, item: { ...item, influences: [0, 1] }, onAdd: vi.fn() };
        const view = render(<Browser {...props} />);
        change("Modifier source", "influence:0");
        expect(screen.getByText(/Shaper preview/).textContent).toContain("all active influences");
        const id = ids()[0]!;
        const full = engine.influenceModifiers(props.item, 0);
        const entry = full.find((entry) => entry.id === id)!;
        expect(
            within(row(id)).getByText(
                `Pool ${((entry.weight / full.reduce((sum, entry) => sum + entry.weight, 0)) * 100).toFixed(3)}%`,
            ),
        ).toBeDefined();
        view.rerender(<Browser {...props} showWeightPercentages={false} />);
        expect(within(row(id)).queryByText(/^Pool [\d.]+%$/)).toBeNull();
        const flask = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "LifeFlask",
        )![0];
        view.rerender(<Browser {...props} item={engine.createItem(flask)} />);
        expect(screen.getByLabelText("Modifier source")).toHaveProperty("value", "natural");
        expect(screen.queryByRole("option", { name: "Shaper modifiers" })).toBeNull();
        const other = new CraftingEngine(catalogs[1]!);
        const base = Object.keys(other.catalog.bases)[0]!;
        view.rerender(<Browser {...props} engine={other} item={other.createItem(base)} />);
        expect(screen.getByLabelText("Modifier source")).toHaveProperty("value", "natural");
        expect(screen.queryByRole("option", { name: "Shaper modifiers" })).toBeNull();
    });
});

describe.each(catalogs)("$game modifier filters", (data) => {
    const engine = new CraftingEngine(data);
    const base = Object.entries(data.bases).find(
        ([, entry]) => entry.item_class === "Body Armour" && entry.drop_level === 1,
    )![0];
    const item = engine.createItem(base);
    const pool = engine.pool({ ...item, rarity: "rare" });

    it("shows hypothetical offers by source and preserves them while filtering and choosing targets", () => {
        const before = structuredClone(item);
        const props = { engine, item, onAdd: vi.fn() };
        const view = render(<Browser {...props} />);
        change("Modifier source", "revealed");
        const source = engine.revealSources(item)[0]!;
        expect(screen.getByLabelText("Preview reveal source")).toHaveProperty("value", source.id);
        const preview = engine.revealPreview(item, source.id);
        const id = ids()[0]!;
        const share = `Preview offer ${(preview.probabilities.get(id)! * 100).toFixed(3)}%`;
        expect(within(row(id)).getByText(share)).toBeDefined();
        expect(screen.getByText(/Each affix side is calculated separately/).textContent).toContain(
            "Marks, omens and optional rerolls are excluded",
        );
        change("Search modifiers", id);
        expect(within(row(id)).getByText(share)).toBeDefined();
        fireEvent.click(within(row(id)).getByRole("button", { name: "Require" }));
        expect(JSON.parse(requirements()!).groups[0].mods).toEqual([id]);
        fireEvent.click(within(row(id)).getByRole("button", { name: "Add to item" }));
        expect(props.onAdd).toHaveBeenCalledWith(id, "revealed");
        view.rerender(<Browser {...props} showWeightPercentages={false} />);
        expect(within(row(id)).queryByText(share)).toBeNull();
        expect(screen.getByLabelText("Preview reveal source")).toHaveProperty("value", source.id);
        expect(item).toEqual(before);
    });

    it("uses a selected source as the default, permits an independent preview and falls back when the base becomes incompatible", () => {
        const sources = engine.revealSources(item);
        const method = { kind: "currency" as const, id: sources.at(-1)!.id };
        const props = { engine, item, method, onAdd: vi.fn() };
        const view = render(<Browser {...props} />);
        change("Modifier source", "revealed");
        expect(screen.getByLabelText("Preview reveal source")).toHaveProperty("value", method.id);
        change("Preview reveal source", sources[0]!.id);
        expect(screen.getByLabelText("Preview reveal source")).toHaveProperty(
            "value",
            sources[0]!.id,
        );
        expect(method.id).toBe(sources.at(-1)!.id);
        if (data.game === "poe2") {
            const low = data.crafting.desecration.find(
                (entry) => entry.itemClasses.includes("Body Armour") && entry.maximumItemLevel,
            )!.id;
            view.rerender(<Browser {...props} item={{ ...item, level: 64 }} />);
            change("Preview reveal source", low);
            expect(screen.getByLabelText("Preview reveal source")).toHaveProperty("value", low);
            view.rerender(<Browser {...props} item={{ ...item, level: 65 }} />);
            expect(screen.getByLabelText("Preview reveal source")).toHaveProperty(
                "value",
                method.id,
            );
            expect(
                within(screen.getByLabelText("Preview reveal source")).queryByRole("option", {
                    name: /Gnawed/,
                }),
            ).toBeNull();
        }
        const flask = Object.entries(data.bases).find(
            ([, base]) => base.item_class === "LifeFlask",
        )![0];
        view.rerender(<Browser {...props} item={engine.createItem(flask)} />);
        expect(screen.queryByLabelText("Preview reveal source")).toBeNull();
        expect(rows()).toEqual([]);
        expect(
            screen.getByText("No reveal source is available for this base and item level."),
        ).toBeDefined();
        expect(within(poolRegion()).queryAllByText(/^Preview offer [\d.]+%$/)).toHaveLength(0);
    });

    it("shows offer probabilities for the active hidden affix and retains them through filtering", () => {
        const action = (action: string) => ({
            kind: "currency" as const,
            id: data.crafting.currencies.find((entry) => entry.action === action)!.id,
        });
        const rare = engine.apply(item, action("transmute_to_rare"), seededRandom(3)).item;
        const hidden = engine.apply(
            rare,
            action(
                data.game === "poe1" ? "replace_rare_mod_veiled" : "abyssal_bench_ticket_armour",
            ),
            seededRandom(11),
        ).item;
        const before = structuredClone(hidden);
        const props = { engine, item: hidden, onAdd: vi.fn() };
        const view = render(<Browser {...props} />);
        change("Modifier source", "revealed");
        const probabilities = engine.revealProbabilities(hidden);
        const id = ids()[0]!;
        const entry = engine.revealPool(hidden).find((entry) => entry.id === id)!;
        const share = `Offer ${(probabilities.get(id)! * 100).toFixed(3)}%`;
        expect(within(row(id)).getByText(share)).toBeDefined();
        expect(within(poolRegion()).queryAllByText(/^(Prefix|Suffix|Pool) [\d.]+%$/)).toHaveLength(
            0,
        );
        expect(
            ids().every(
                (id) =>
                    engine.mod(id).generation_type ===
                    engine.mod(hidden.reveal!.mod).generation_type,
            ),
        ).toBe(true);
        fireEvent.click(within(row(id)).getByRole("button", { name: "Require" }));
        const target = requirements();
        change("Search modifiers", id);
        change("Modifier tag", entry.mod.implicit_tags[0] ?? "");
        expect(within(row(id)).getByText(share)).toBeDefined();
        view.rerender(<Browser {...props} showWeightPercentages={false} />);
        expect(within(row(id)).queryByText(share)).toBeNull();
        expect(within(row(id)).getByTitle("Modifier weight").textContent).toBe(
            entry.weight.toLocaleString(),
        );
        expect(requirements()).toBe(target);
        view.rerender(<Browser {...props} showWeightPercentages />);
        expect(within(row(id)).getByText(share)).toBeDefined();
        expect(hidden).toEqual(before);

        const revealed = engine.revealChoices(hidden, seededRandom(15));
        change("Modifier tag", "");
        view.rerender(<Browser {...props} item={revealed} />);
        change("Search modifiers", revealed.reveal!.choices[0]!);
        expect(
            within(row(revealed.reveal!.choices[0]!)).getByText("Current offer 100.000%"),
        ).toBeDefined();
        const absent = engine
            .revealPool(hidden)
            .find((entry) => !revealed.reveal!.choices.includes(entry.id))!;
        change("Search modifiers", absent.id);
        expect(within(row(absent.id)).getByText("Current offer 0.000%")).toBeDefined();
        expect(requirements()).toBe(target);
        view.rerender(<Browser {...props} item={hidden} />);
        expect(
            within(row(absent.id)).getByText(
                `Offer ${(probabilities.get(absent.id)! * 100).toFixed(3)}%`,
            ),
        ).toBeDefined();
        view.rerender(<Browser {...props} item={item} />);
        expect(within(poolRegion()).queryAllByText(/^Offer [\d.]+%$/)).toHaveLength(0);
    });

    it("keeps an active tag visible and removable when the next base has no matching modifier", () => {
        const flaskId = Object.entries(data.bases).find(
            ([, base]) => base.item_class === "LifeFlask",
        )![0];
        const flask = engine.createItem(flaskId);
        const flaskPool = engine.pool({ ...flask, rarity: "magic" });
        const unavailableTag = pool
            .flatMap((entry) => entry.mod.implicit_tags)
            .find((tag) => !flaskPool.some((entry) => entry.mod.implicit_tags.includes(tag)))!;
        expect(unavailableTag).toBeTruthy();
        const props = { engine, item, onAdd: vi.fn(), filterEffect: "hide" as const };
        const view = render(<Browser {...props} />);
        change("Modifier tag", unavailableTag);
        view.rerender(<Browser {...props} item={flask} />);
        expect(screen.getByLabelText("Modifier tag")).toHaveProperty("value", unavailableTag);
        expect(ids()).toEqual([]);
        fireEvent.click(screen.getByRole("button", { name: `Remove ${unavailableTag} filter` }));
        expect(ids().length).toBeGreaterThan(0);
        expect(screen.getByLabelText("Modifier tag")).toHaveProperty("value", "");
    });

    describe.each(["columns", "tabs"] as const)("%s layout", (layout) => {
        it("crosses tag mismatches by default and retains selected targets when hiding", () => {
            const onAdd = vi.fn();
            const props = { engine, item, layout, onAdd };
            const view = render(<Browser {...props} />);
            const original = ids();
            const id = original.find((id) => !data.mods[id]!.implicit_tags.includes("life"))!;
            change("Modifier tag", "life");
            expect(ids()).toEqual(original);
            expect(row(id).dataset.tagMismatch).toBe("true");
            expect(within(row(id)).getByText("Does not match the selected tags.")).toBeDefined();
            expect(row(id).querySelector("p")!.className).toContain("line-through");
            const matching = pool.filter((entry) =>
                entry.mod.implicit_tags.includes("life"),
            ).length;
            expect(poolRegion().textContent).toContain(
                `${matching} matching tiers · ${pool.length} shown`,
            );
            fireEvent.click(within(row(id)).getByRole("button", { name: "Add to item" }));
            expect(onAdd).toHaveBeenCalledWith(id, "natural");
            fireEvent.click(within(row(id)).getByRole("button", { name: "Require" }));
            expect(row(id).dataset.tagMismatch).toBe("true");
            expect(row(id).querySelector("p")!.className).toContain("line-through");
            const target = requirements();
            view.rerender(<Browser {...props} filterEffect="hide" />);
            expect(requirements()).toBe(target);
            expect(ids()).toContain(id);
            expect(
                ids().every(
                    (entry) => entry === id || data.mods[entry]!.implicit_tags.includes("life"),
                ),
            ).toBe(true);
            fireEvent.click(within(row(id)).getByRole("button", { name: "Remove target" }));
            expect(ids()).not.toContain(id);
            expect(JSON.parse(requirements()!).groups).toEqual([]);
        });

        it("retains an active filter when hiding its control and clears it on source changes", () => {
            const props = { engine, item, layout, onAdd: vi.fn(), filterEffect: "hide" as const };
            const view = render(<Browser {...props} />);
            if (layout === "tabs") fireEvent.click(screen.getByRole("tab", { name: /^Suffixes/ }));
            change("Search modifiers", "ColdResist");
            change("Modifier tag", "cold");
            const before = ids();
            expect(before.length).toBeGreaterThan(0);
            view.rerender(<Browser {...props} showTagFilter={false} />);
            expect(screen.queryByLabelText("Modifier tag")).toBeNull();
            expect(screen.getByRole("button", { name: "Remove cold filter" })).toBeDefined();
            expect(ids()).toEqual(before);
            change("Search modifiers", "ColdResist1");
            const searched = ids();
            expect(searched.length).toBeGreaterThan(0);
            view.rerender(<Browser {...props} showTagFilter />);
            expect(screen.getByLabelText("Modifier tag")).toHaveProperty("value", "cold");
            expect(ids()).toEqual(searched);
            view.rerender(<Browser {...props} showTagFilter={false} />);
            change("Search modifiers", "");
            change("Modifier source", "corrupted");
            expect(screen.queryByRole("group", { name: "Active tag filters" })).toBeNull();
            expect(ids().length).toBeGreaterThan(0);
            view.rerender(<Browser {...props} showTagFilter />);
            expect(screen.getByLabelText("Modifier tag")).toHaveProperty("value", "");
        });

        it("uses full source and affix denominators and toggles percentages without changing raw weights", () => {
            const props = { engine, item, layout, onAdd: vi.fn() };
            const view = render(<Browser {...props} />);
            const id = ids()[0]!;
            const entry = pool.find((entry) => entry.id === id)!;
            const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
            const typeTotal = pool
                .filter((entry) => entry.mod.generation_type === "prefix")
                .reduce((sum, entry) => sum + entry.weight, 0);
            const share = `Pool ${((entry.weight / total) * 100).toFixed(3)}%`;
            const typeShare = `Prefix ${((entry.weight / typeTotal) * 100).toFixed(3)}%`;
            expect(within(row(id)).getByText(share)).toBeDefined();
            expect(within(row(id)).getByText(typeShare)).toBeDefined();
            fireEvent.click(within(row(id)).getByRole("button", { name: "Require" }));
            const target = requirements();
            change("Search modifiers", id);
            change("Modifier tag", "life");
            view.rerender(<Browser {...props} filterEffect="hide" />);
            expect(within(row(id)).getByText(share)).toBeDefined();
            expect(within(row(id)).getByText(typeShare)).toBeDefined();
            view.rerender(<Browser {...props} filterEffect="hide" showWeightPercentages={false} />);
            expect(within(row(id)).queryByText(share)).toBeNull();
            expect(within(row(id)).queryByText(typeShare)).toBeNull();
            expect(within(row(id)).getByTitle("Modifier weight").textContent).toBe(
                entry.weight.toLocaleString(),
            );
            expect(requirements()).toBe(target);
            view.rerender(<Browser {...props} filterEffect="hide" showWeightPercentages />);
            expect(within(row(id)).getByText(share)).toBeDefined();
            expect(within(row(id)).getByText(typeShare)).toBeDefined();
        });

        it("combines positive and negative filters and removes them individually without editing the item or targets", () => {
            const before = structuredClone(item);
            const props = { engine, item, layout, onAdd: vi.fn(), filterEffect: "hide" as const };
            const view = render(<Browser {...props} />);
            if (layout === "tabs") fireEvent.click(screen.getByRole("tab", { name: /^Suffixes/ }));
            change("Search modifiers", "ColdResist");
            const original = ids();
            expect(original.length).toBeGreaterThan(0);
            change("Modifier tag", "elemental");
            change("Modifier tag", "cold");
            expect(ids()).toEqual(original);
            expect(screen.getByRole("button", { name: "Remove elemental filter" })).toBeDefined();
            expect(screen.getByRole("button", { name: "Remove cold filter" })).toBeDefined();
            change("Modifier tag", "life");
            expect(ids()).toEqual([]);
            fireEvent.click(screen.getByRole("button", { name: "Remove life filter" }));
            expect(ids()).toEqual(original);
            change("Modifier tag", "!resistance");
            expect(ids()).toEqual([]);
            change("Modifier tag", "resistance");
            expect(
                screen.queryByRole("button", { name: "Remove non-resistance filter" }),
            ).toBeNull();
            expect(ids()).toEqual(original);
            change("Modifier tag", "!cold");
            expect(screen.queryByRole("button", { name: "Remove cold filter" })).toBeNull();
            expect(ids()).toEqual([]);
            view.rerender(<Browser {...props} showTagFilter={false} />);
            fireEvent.click(screen.getByRole("button", { name: "Remove non-cold filter" }));
            expect(ids()).toEqual(original);
            fireEvent.click(screen.getByRole("button", { name: "Clear tag filters" }));
            expect(screen.queryByRole("group", { name: "Active tag filters" })).toBeNull();
            expect(ids()).toEqual(original);
            expect(JSON.parse(requirements()!).groups).toEqual([]);
            expect(props.onAdd).not.toHaveBeenCalled();
            expect(item).toEqual(before);
        });

        it("shows tag-filtered shares without changing full pool shares, search denominators or reveal probabilities", () => {
            const props = { engine, item, layout, onAdd: vi.fn() };
            const view = render(<Browser {...props} />);
            if (layout === "tabs") fireEvent.click(screen.getByRole("tab", { name: /^Suffixes/ }));
            change("Search modifiers", "ColdResist");
            const id = ids()[0]!;
            const entry = pool.find((entry) => entry.id === id)!;
            const fullShare = within(row(id)).getByText(/^Pool [\d.]+%$/).textContent!;
            change("Modifier tag", "cold");
            change("Modifier tag", "!life");
            const matches = pool.filter(
                (entry) =>
                    entry.mod.implicit_tags.includes("cold") &&
                    !entry.mod.implicit_tags.includes("life"),
            );
            const total = matches.reduce((sum, entry) => sum + entry.weight, 0);
            const sideTotal = matches
                .filter((candidate) => candidate.mod.generation_type === entry.mod.generation_type)
                .reduce((sum, entry) => sum + entry.weight, 0);
            const filteredShare = `Filtered pool ${((entry.weight / total) * 100).toFixed(3)}%`;
            const sideShare = `Filtered suffix ${((entry.weight / sideTotal) * 100).toFixed(3)}%`;
            expect(within(row(id)).getByText(filteredShare)).toBeDefined();
            expect(within(row(id)).getByText(sideShare)).toBeDefined();
            change("Search modifiers", id);
            expect(within(row(id)).getByText(filteredShare)).toBeDefined();
            expect(within(row(id)).getByText(fullShare)).toBeDefined();
            change("Modifier tag", "!cold");
            expect(within(row(id)).getByText("Filtered pool 0.000%")).toBeDefined();
            expect(within(row(id)).getByText("Filtered suffix 0.000%")).toBeDefined();
            view.rerender(<Browser {...props} showWeightPercentages={false} />);
            expect(within(row(id)).queryByText(/^Filtered /)).toBeNull();
            expect(within(row(id)).getByTitle("Modifier weight").textContent).toBe(
                entry.weight.toLocaleString(),
            );
            change("Modifier source", "revealed");
            change("Search modifiers", "");
            view.rerender(<Browser {...props} showWeightPercentages />);
            const revealedId = ids()[0]!;
            const offer = within(row(revealedId)).getByText(/^Preview offer /).textContent!;
            change("Modifier tag", "!life");
            expect(within(row(revealedId)).getByText(offer)).toBeDefined();
            expect(within(row(revealedId)).queryByText(/^Filtered /)).toBeNull();
        });

        it("uses only source percentages for implicits and preserves recipe weight labels", () => {
            const props = { engine, item, layout, onAdd: vi.fn() };
            const view = render(<Browser {...props} />);
            change("Modifier source", "corrupted");
            const implicitPool = engine.corruptedModifiers(item);
            const id = ids()[0]!;
            const entry = implicitPool.find((entry) => entry.id === id)!;
            const total = implicitPool.reduce((sum, entry) => sum + entry.weight, 0);
            expect(
                within(row(id)).getByText(`Pool ${((entry.weight / total) * 100).toFixed(3)}%`),
            ).toBeDefined();
            expect(within(row(id)).queryByText(/^(Prefix|Suffix) [\d.]+%$/)).toBeNull();
            change("Modifier source", "essence");
            const weights = rows().map(
                (entry) => within(entry).getByTitle("Modifier weight").textContent,
            );
            expect(weights.length).toBeGreaterThan(0);
            expect(within(poolRegion()).queryAllByText(/^Pool [\d.]+%$/)).toHaveLength(0);
            view.rerender(<Browser {...props} showWeightPercentages={false} />);
            expect(
                rows().map((entry) => within(entry).getByTitle("Modifier weight").textContent),
            ).toEqual(weights);
        });
    });
});

it("matches the reference Cluster tag combinations and filtered shares while retaining excluded targets", () => {
    const engine = new CraftingEngine(catalog);
    const item = {
        ...engine.createItem("Metadata/Items/Jewels/JewelPassiveTreeExpansionLarge"),
        level: 100,
        cluster: { passive: "affliction_attack_damage_", nodes: 8 },
    };
    const props = { engine, item, onAdd: vi.fn() };
    const view = render(<Browser {...props} />);
    const calamitous = "AfflictionNotableCalamitous";
    const fury = "AfflictionNotableFeedtheFury";
    fireEvent.click(within(row(calamitous)).getByRole("button", { name: "Require" }));
    const target = requirements();
    change("Modifier tag", "attack");
    change("Modifier tag", "life");
    expect(row(calamitous).dataset.tagMismatch).toBe("true");
    expect(row(fury).dataset.tagMismatch).toBe("false");
    expect(within(row(calamitous)).getByText("Filtered pool 0.000%")).toBeDefined();
    change("Modifier tag", "!attack");
    expect(row(fury).dataset.tagMismatch).toBe("true");
    view.rerender(<Browser {...props} filterEffect="hide" />);
    expect(row(calamitous)).toBeDefined();
    expect(row(fury)).toBeUndefined();
    expect(poolRegion().textContent).toContain("6 matching tiers · 7 shown");
    expect(requirements()).toBe(target);
    const life = engine
        .pool({ ...item, rarity: "rare" })
        .filter(
            (entry) =>
                entry.mod.implicit_tags.includes("life") &&
                !entry.mod.implicit_tags.includes("attack"),
        );
    expect(life).toHaveLength(6);
    expect(life.reduce((sum, entry) => sum + entry.weight, 0)).toBe(2400);
    for (const entry of life) {
        expect(
            within(row(entry.id)).getByText(
                `Filtered ${entry.mod.generation_type} ${((entry.weight / 1200) * 100).toFixed(3)}%`,
            ),
        ).toBeDefined();
        expect(
            within(row(entry.id)).getByText(
                `Filtered pool ${((entry.weight / 2400) * 100).toFixed(3)}%`,
            ),
        ).toBeDefined();
    }
    expect(within(row(calamitous)).getByTitle("Modifier weight").textContent).toBe("216");
    expect(props.onAdd).not.toHaveBeenCalled();
});

describe("Eldritch modifier percentages", () => {
    it("uses only the matching influence and implicit tier, retaining zero-weight Conflict labels", () => {
        const engine = new CraftingEngine(catalog);
        const item = engine.createItem("Metadata/Items/Armours/BodyArmours/BodyStr1");
        const pool = engine.eldritchModifiers(item);
        const props = { engine, item, onAdd: vi.fn() };
        const view = render(<Browser {...props} />);
        change("Modifier source", "eldritch");
        for (const influence of ["searing_exarch_implicit", "eater_of_worlds_implicit"]) {
            for (const tier of [1, 2, 3, 4, 5, 6]) {
                const eligible = pool.filter(
                    (entry) =>
                        entry.mod.generation_type === influence && eldritchTier(entry.mod) === tier,
                );
                const entry = eligible.find((entry) => entry.weight > 0)!;
                const total = eligible.reduce((sum, entry) => sum + entry.weight, 0);
                const share = `Tier ${((entry.weight / total) * 100).toFixed(3)}%`;
                change("Search modifiers", entry.id);
                expect(within(row(entry.id)).getByText(share)).toBeDefined();
                expect(within(row(entry.id)).queryByText(/^Pool /)).toBeNull();
                change("Modifier tag", entry.mod.implicit_tags[0] ?? "");
                expect(within(row(entry.id)).getByText(share)).toBeDefined();
                const tag = entry.mod.implicit_tags[0];
                if (tag) {
                    const filteredTotal = eligible
                        .filter((candidate) => candidate.mod.implicit_tags.includes(tag))
                        .reduce((sum, entry) => sum + entry.weight, 0);
                    expect(
                        within(row(entry.id)).getByText(
                            `Filtered tier ${((entry.weight / filteredTotal) * 100).toFixed(3)}%`,
                        ),
                    ).toBeDefined();
                    expect(within(row(entry.id)).queryByText(/^Filtered pool /)).toBeNull();
                }
                view.rerender(<Browser {...props} showWeightPercentages={false} />);
                expect(within(row(entry.id)).queryByText(share)).toBeNull();
                expect(within(row(entry.id)).queryByText(/^Filtered /)).toBeNull();
                expect(within(row(entry.id)).getByTitle("Modifier weight").textContent).toBe(
                    entry.weight.toLocaleString(),
                );
                view.rerender(<Browser {...props} showWeightPercentages />);
                expect(within(row(entry.id)).getByText(share)).toBeDefined();
                change("Modifier tag", "");
            }
        }
        for (const tier of [1, 2]) {
            const entry = pool.find((entry) => eldritchTier(entry.mod) === tier && !entry.weight)!;
            expect(entry.weight).toBe(0);
            change("Search modifiers", entry.id);
            expect(within(row(entry.id)).getByTitle("Modifier weight").textContent).toBe(
                "Conflict",
            );
            expect(within(row(entry.id)).queryByText(/^(Tier|Pool) [\d.]+%$/)).toBeNull();
        }
    });
});

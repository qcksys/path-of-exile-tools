// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine } from "~/lib/crafting-engine";
import { CraftingSimulation } from "~/lib/crafting-simulation";
import { craftingProjectSchema } from "~/schemas/crafting";
import { changeControl, expectControlValue } from "./control-helpers";
import { catalog, getCatalog } from "./crafting-fixtures";
import { button, CraftingWorker, mount } from "./crafting-workbench-ui-fixtures";

describe("crafting workbench", () => {
    it.each([
        { game: "poe1", format: "ranged" },
        { game: "poe2", format: "ranged" },
        { game: "poe1", format: "blueprint" },
        { game: "poe2", format: "blueprint" },
    ] as const)("imports $game $format PoB rolls through preview, calculation, history and saves", ({
        game,
        format,
    }) => {
        const data = game === "poe1" ? catalog : getCatalog("poe2");
        const current = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, entry]) => entry.item_class === "Body Armour" && entry.drop_level === 1,
        )![0];
        const divine = data.crafting.currencies.find(
            (entry) => entry.action === "reroll_mod_values",
        )!;
        const maximum = current.mod("IncreasedLife1").stats[0]!.max;
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: data.patch,
            item: current.createItem(base),
            method: { kind: "currency", id: divine.id },
            target: { groups: [], properties: { flatLife: { min: maximum } } },
            steps: [],
            prices: { [divine.id]: 2 },
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const key = `poe-boats:crafting:${game}:${data.patch}`;
        localStorage.setItem(key, JSON.stringify({ ranges: project }));
        mount("calculate", data);
        fireEvent.click(screen.getByText("Save, load, and export"));
        changeControl(screen.getByLabelText("Saved project"), { target: { value: "ranges" } });
        fireEvent.click(button("Load project"));
        fireEvent.click(screen.getByText("Import or export item text"));
        const field = screen.getByRole("textbox", { name: "Item text" });
        const value = game === "poe1" ? 17 : 15;
        const text =
            format === "blueprint"
                ? `Rarity: Rare\nTest\n${data.bases[base]!.name}\nCrafted: true\nPrefix: {range:0.5}IncreasedLife1\nSuffix: None\nItem Level: 86\nImplicits: 0\n{prefix}+${value} to maximum Life`
                : `Rarity: Rare\nTest\n${data.bases[base]!.name}\nItem Level: 86\nImplicits: 0\n{range:0.5}{modGroup:IncreasedLife1}${current.mod("IncreasedLife1").text}`;
        changeControl(field, { target: { value: text } });
        fireEvent.click(button("Preview import"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByRole("region", { name: "Item import preview" }).textContent).toContain(
            `+${value} to maximum Life`,
        );
        fireEvent.click(button("Import selected item"));
        const card = screen.getByRole("region", { name: "Current item" });
        expect(card.textContent).toContain(`+${value} to maximum Life`);
        fireEvent.click(button("Calculate odds"));
        const worker = CraftingWorker.instances[0]!;
        const sent = worker.postMessage.mock.calls[0]![0].project;
        expect(sent.item.mods[0].values).toEqual([value]);
        const simulation = new CraftingSimulation(data, sent, false);
        for (let index = 0; index < 100; index++) simulation.runTrial();
        expect(simulation.result().errors).toEqual({});
        expect(simulation.result().meanCost).toBe(2);
        act(() => worker.onmessage?.({ data: { type: "done", result: simulation.result() } }));
        fireEvent.click(button("Export current item text"));
        expectControlValue(field, expect.stringContaining(`+${value} to maximum Life`));
        expect((field as HTMLTextAreaElement).value).not.toContain("{range:");
        fireEvent.click(button("Save project"));
        expect(
            JSON.parse(localStorage.getItem(key)!)["My crafting project"].item.mods[0].values,
        ).toEqual([value]);
        fireEvent.click(button("Undo"));
        expect(card.textContent).toContain("normal");
        fireEvent.click(button("Redo"));
        expect(card.textContent).toContain(`+${value} to maximum Life`);
        changeControl(screen.getByLabelText("Saved project"), {
            target: { value: "My crafting project" },
        });
        fireEvent.click(button("Load project"));
        changeControl(field, { target: { value: text.replace("{range:0.5}", "{range:1.5}") } });
        fireEvent.click(button("Preview import"));
        expect(screen.getByRole("alert").textContent).toContain("between 0 and 1");
        expect(screen.queryByRole("region", { name: "Item import preview" })).toBeNull();
        expect(card.textContent).toContain(`+${value} to maximum Life`);
        changeControl(field, {
            target: {
                value: text.replace(
                    "Item Level: 86",
                    "Prefix: {range:0.5}UnknownModifier\nItem Level: 86",
                ),
            },
        });
        fireEvent.click(button("Preview import"));
        expect(screen.getByRole("alert").textContent).toContain(
            "does not match an extracted modifier",
        );
        expect(screen.queryByRole("region", { name: "Item import preview" })).toBeNull();
        expect(card.textContent).toContain(`+${value} to maximum Life`);
    });

    it("exports, copies and imports an item through a preview with undo support", async () => {
        mount();
        fireEvent.click(button("Apply craft"));
        fireEvent.click(screen.getByText("Import or export item text"));
        fireEvent.click(button("Export current item text"));
        const field = screen.getByRole("textbox", { name: "Item text" });
        const text = (field as HTMLTextAreaElement).value;
        expect(text).toContain("Rarity: RARE");
        expect(text).toContain("{modGroup:");
        const copy = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
        await act(async () => fireEvent.click(button("Copy item text")));
        expect(copy).toHaveBeenCalledWith(text);
        expect(screen.getByText("Item text copied.")).toBeDefined();
        fireEvent.click(button("Reset"));
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain(
            "normal",
        );
        fireEvent.click(button("Preview import"));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByRole("region", { name: "Item import preview" }).textContent).toContain(
            "rare",
        );
        fireEvent.click(button("Import selected item"));
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain("rare");
        fireEvent.click(button("Undo"));
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain(
            "normal",
        );
    });

    it("exposes ambiguous hybrid matches and rejects unknown modifier text", () => {
        mount();
        fireEvent.click(screen.getByText("Import or export item text"));
        const text = `Rarity: RARE\nTest\nPlate Vest\nItem Level: 86\nImplicits: 0\n+100 to Armour\n+35 to maximum Life`;
        changeControl(screen.getByRole("textbox", { name: "Item text" }), {
            target: { value: text },
        });
        fireEvent.click(button("Preview import"));
        const matches = screen.getByRole("combobox", { name: "Matching item" });
        fireEvent.click(matches);
        const options = within(
            document.getElementById(matches.getAttribute("aria-controls")!)!,
        ).getAllByRole("option");
        expect(options.length).toBeGreaterThan(1);
        const hybrid = options.findIndex((option) => option.textContent?.includes("Crocodile"));
        expect(hybrid).toBeGreaterThanOrEqual(0);
        fireEvent.mouseMove(options[hybrid]!);
        fireEvent.click(options[hybrid]!);
        expect(screen.getByRole("region", { name: "Item import preview" }).textContent).toContain(
            "1/3 prefixes",
        );
        fireEvent.click(button("Import selected item"));
        changeControl(screen.getByRole("textbox", { name: "Item text" }), {
            target: { value: `${text}\nUnknown modifier` },
        });
        fireEvent.click(button("Preview import"));
        expect(screen.getByRole("alert").textContent).toContain("Unknown modifier");
        expect(screen.queryByRole("region", { name: "Item import preview" })).toBeNull();
        expect(screen.getByRole("region", { name: "Current item" }).textContent).toContain(
            "1/3 prefixes",
        );
    });
});

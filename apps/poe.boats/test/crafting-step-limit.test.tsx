// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ProcessEditor } from "~/components/crafting/process-editor";
import { CraftingEngine } from "~/lib/crafting-engine";
import { craftingCatalogSchema, craftingProjectSchema } from "~/schemas/crafting";
import { catalog } from "./crafting-fixtures";

vi.mock("~/components/crafting/target-editor", () => ({
    // biome-ignore lint/style/useNamingConvention: The mock must retain the component export name.
    TargetEditor: () => null,
}));
afterEach(cleanup);

describe.each([
    catalog,
    craftingCatalogSchema.parse(
        JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
    ),
])("$game process step limit", (data) => {
    it("prevents copying a 50-step process and allows copying again after removing a step", () => {
        const engine = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(
            ([, base]) => base.item_class === "Body Armour" && base.drop_level === 1,
        )![0];
        const currency = data.crafting.currencies.find(
            (entry) => entry.action === "transmute_to_rare",
        )!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: data.game,
            patch: data.patch,
            item: engine.createItem(base),
            method: { kind: "currency", id: currency.id },
            target: { groups: [] },
            steps: Array.from({ length: 50 }, (_, index) => ({
                id: `check-${index}`,
                condition: { groups: [] },
            })),
            prices: {},
            seed: 42,
            iterations: 1,
            maxActions: 50,
        });
        function Editor() {
            const [steps, setSteps] = useState(project.steps);
            return (
                <ProcessEditor
                    engine={engine}
                    project={{ ...project, steps }}
                    onChange={setSteps}
                />
            );
        }
        render(<Editor />);
        const buttons = screen.getAllByText("Copy step", { selector: "button" });
        expect(buttons).toHaveLength(50);
        for (const button of buttons) expect(button).toHaveProperty("disabled", true);
        fireEvent.click(screen.getAllByText("Remove step", { selector: "button" })[0]!);
        const available = screen.getAllByText("Copy step", { selector: "button" });
        expect(available).toHaveLength(49);
        expect(available[0]).toHaveProperty("disabled", false);
        fireEvent.click(available[0]!);
        const full = screen.getAllByText("Copy step", { selector: "button" });
        expect(full).toHaveLength(50);
        expect(full[0]).toHaveProperty("disabled", true);
    });
});

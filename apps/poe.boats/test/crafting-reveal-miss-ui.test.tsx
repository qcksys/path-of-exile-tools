// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { MethodPicker } from "../app/components/crafting/method-picker";
import { CraftingEngine } from "../app/lib/crafting-engine";
import { type CraftingMethod, craftingCatalogSchema } from "../app/schemas/crafting";

afterEach(cleanup);
describe.each(["poe1", "poe2"] as const)("%s reveal miss control", (game) => {
    it("edits and restores the explicit fallback preference", () => {
        const catalog = craftingCatalogSchema.parse(
            JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
        );
        const engine = new CraftingEngine(catalog);
        const base = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "Body Armour",
        )![0];
        const item = engine.createItem(base);
        const value: CraftingMethod = { kind: "reveal", preferred: [] };
        const onChange = vi.fn();
        const view = render(
            <MethodPicker engine={engine} item={item} value={value} onChange={onChange} />,
        );
        const control = () =>
            screen.getByRole("checkbox", {
                name: "Keep modifier unrevealed when no preference matches",
            });
        expect(control().getAttribute("aria-checked")).toBe(String(false));
        fireEvent.click(control());
        expect(onChange).toHaveBeenLastCalledWith({ ...value, skipOnMiss: true });
        view.rerender(
            <MethodPicker
                engine={engine}
                item={item}
                value={{ ...value, skipOnMiss: true }}
                onChange={onChange}
            />,
        );
        expect(control().getAttribute("aria-checked")).toBe(String(true));
        expect(screen.getByText(/Offered choices are retained/)).toBeDefined();
        fireEvent.click(control());
        expect(onChange).toHaveBeenLastCalledWith({ ...value, skipOnMiss: false });
    });
});

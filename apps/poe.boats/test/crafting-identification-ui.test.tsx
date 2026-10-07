// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { CraftingWorkbench } from "../app/components/crafting/workbench";
import { craftingCatalogSchema } from "../app/schemas/crafting";
import { changeControl, expectControlValue } from "./control-helpers";
import { chooseStartingItem } from "./starting-item-helper";

class WorkerStub {
    static instances: WorkerStub[] = [];
    onmessage = null;
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor() {
        WorkerStub.instances.push(this);
    }
}
beforeEach(() => {
    localStorage.clear();
    WorkerStub.instances = [];
    vi.stubGlobal("Worker", WorkerStub);
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
    vi.unstubAllGlobals();
});

for (const game of ["poe1", "poe2"] as const) {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const wisdom = catalog.crafting.currencies.find((entry) => entry.action === "identify")!;
    describe(`${game} unidentified starting item`, () => {
        const prepare = (mode: "emulate" | "calculate") => {
            render(
                <MemoryRouter>
                    <CraftingWorkbench catalog={catalog} mode={mode} />
                </MemoryRouter>,
            );
            chooseStartingItem(catalog);
            changeControl(screen.getByLabelText("Rarity"), { target: { value: "rare" } });
            if (game === "poe1")
                changeControl(screen.getByLabelText("Memory strands"), {
                    target: { value: "82" },
                });
            fireEvent.click(screen.getByRole("checkbox", { name: "Unidentified starting item" }));
        };
        it("identifies through the extracted currency and restores the unknown state with undo", () => {
            prepare("emulate");
            const card = within(screen.getByRole("region", { name: "Current item" }));
            expect(card.getByText(/Explicit modifiers are unknown/)).toBeDefined();
            expect(card.queryByText(/0\/3 prefixes/)).toBeNull();
            expect(card.queryByRole("region", { name: "Final item properties" })).toBeNull();
            fireEvent.click(screen.getByRole("button", { name: "Apply craft" }));
            expect(card.queryByText(/Explicit modifiers are unknown/)).toBeNull();
            expect(
                screen
                    .getByRole("checkbox", { name: "Unidentified starting item" })
                    .getAttribute("aria-disabled"),
            ).toBe("true");
            expect(screen.getByText("Emulator spending").closest("details")!.textContent).toContain(
                wisdom.name,
            );
            fireEvent.click(screen.getByRole("button", { name: "Undo" }));
            expect(card.getByText(/Explicit modifiers are unknown/)).toBeDefined();
            fireEvent.click(screen.getByText("Save, load, and export"));
            fireEvent.click(screen.getByRole("button", { name: "Save project" }));
            const saved = JSON.parse(
                localStorage.getItem(`poe-boats:crafting:${game}:${catalog.patch}`)!,
            )["My crafting project"];
            expect(saved.item.unidentified).toBe(true);
            if (game === "poe1") expect(saved.item.memoryStrands).toBe(82);
            expect(saved.method).toEqual({ kind: "currency", id: wisdom.id });
            fireEvent.click(screen.getByRole("button", { name: "Redo" }));
            expect(card.queryByText(/Explicit modifiers are unknown/)).toBeNull();
            if (game === "poe1") expectControlValue(screen.getByLabelText("Memory strands"), "82");
        });
        it("sends the unknown template and Wisdom method to the calculator worker", () => {
            prepare("calculate");
            fireEvent.click(screen.getByText("Item conditions"));
            changeControl(screen.getByLabelText("Required rarity"), {
                target: { value: "rare" },
            });
            fireEvent.click(screen.getByRole("button", { name: "Calculate odds" }));
            expect(
                WorkerStub.instances.at(-1)!.postMessage.mock.calls[0]![0].project,
            ).toMatchObject({
                item: { unidentified: true, rarity: "rare", mods: [] },
                method: { kind: "currency", id: wisdom.id },
                target: { rarity: "rare" },
            });
        });
    });
}

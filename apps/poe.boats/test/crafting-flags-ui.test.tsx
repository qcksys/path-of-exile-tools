// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { CraftingWorkbench } from "../app/components/crafting/workbench";
import { craftingCatalogSchema } from "../app/schemas/crafting";
import { changeControl } from "./control-helpers";
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
    const button = (name: string) => screen.getByRole("button", { name });
    const key = `poe-boats:crafting:${game}:${catalog.patch}`;
    const flag = game === "poe1" ? "Split" : "Sanctified";

    describe(`${game} item flag controls`, () => {
        it("edits starting flags, updates the item, and keeps undo, redo and saved projects consistent", () => {
            render(
                <MemoryRouter>
                    <CraftingWorkbench catalog={catalog} mode="emulate" />
                </MemoryRouter>,
            );
            chooseStartingItem(catalog);
            fireEvent.click(button("Apply craft"));
            const spending = screen.getByText("Emulator spending").closest("details")!.textContent;
            const flags = within(screen.getByRole("group", { name: "Item flags" }));
            const card = within(screen.getByRole("region", { name: "Current item" }));
            const checkbox = (name: string) => flags.getByRole("checkbox", { name });
            expect(
                flags.queryByRole("checkbox", { name: game === "poe1" ? "Sanctified" : "Split" }),
            ).toBeNull();
            fireEvent.click(checkbox("Corrupted"));
            expect(card.getByText("Corrupted")).toBeDefined();
            fireEvent.click(checkbox("Mirrored"));
            expect(checkbox("Corrupted").getAttribute("aria-checked")).toBe(String(false));
            expect(card.getByText("Mirrored")).toBeDefined();
            fireEvent.click(button("Undo"));
            expect(checkbox("Corrupted").getAttribute("aria-checked")).toBe(String(true));
            fireEvent.click(button("Redo"));
            expect(checkbox("Mirrored").getAttribute("aria-checked")).toBe(String(true));
            fireEvent.click(checkbox("Mirrored"));
            fireEvent.click(checkbox(flag));
            expect(card.getByText(flag)).toBeDefined();
            expect(screen.getByText("Emulator spending").closest("details")!.textContent).toBe(
                spending,
            );
            fireEvent.click(screen.getByText("Save, load, and export"));
            fireEvent.click(button("Save project"));
            expect(
                JSON.parse(localStorage.getItem(key)!)["My crafting project"].item[
                    flag.toLowerCase()
                ],
            ).toBe(true);
            fireEvent.click(checkbox(flag));
            changeControl(screen.getByLabelText("Saved project"), {
                target: { value: "My crafting project" },
            });
            fireEvent.click(button("Load project"));
            expect(checkbox(flag).getAttribute("aria-checked")).toBe(String(true));
        });

        it("dispatches flag-only requirements, saves false conditions, and clears them", () => {
            render(
                <MemoryRouter>
                    <CraftingWorkbench catalog={catalog} mode="calculate" />
                </MemoryRouter>,
            );
            chooseStartingItem(catalog);
            fireEvent.click(screen.getByText("Item conditions"));
            const mirroring = within(screen.getByRole("group", { name: "Required mirroring" }));
            fireEvent.click(mirroring.getByRole("button", { name: "Unmirrored" }));
            const specific = within(
                screen.getByRole("group", {
                    name: game === "poe1" ? "Required split state" : "Required Sanctification",
                }),
            );
            fireEvent.click(specific.getByRole("button", { name: flag }));
            fireEvent.click(button("Calculate odds"));
            expect(
                WorkerStub.instances.at(-1)!.postMessage.mock.calls[0]![0].project.target,
            ).toMatchObject({ mirrored: false, [flag.toLowerCase()]: true });
            fireEvent.click(screen.getByText("Save, load, and export"));
            fireEvent.click(button("Save project"));
            expect(
                JSON.parse(localStorage.getItem(key)!)["My crafting project"].target,
            ).toMatchObject({ mirrored: false, [flag.toLowerCase()]: true });
            fireEvent.click(button("Clear item conditions"));
            expect(
                mirroring.getByRole("button", { name: "Any" }).getAttribute("aria-pressed"),
            ).toBe("true");
            fireEvent.click(button("Save project"));
            const saved = JSON.parse(localStorage.getItem(key)!)["My crafting project"].target;
            expect(saved.mirrored).toBeUndefined();
            expect(saved[flag.toLowerCase()]).toBeUndefined();
        });
    });
}

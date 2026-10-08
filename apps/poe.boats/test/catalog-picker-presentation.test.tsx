// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { CatalogPicker } from "~/components/recombinator/catalog-item-editor";

beforeEach(() => {
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

it("keeps the selected item available beyond the first page of choices", () => {
    const options = Array.from({ length: 80 }, (_, index) => ({
        id: String(index),
        label: `Choice ${index}`,
    }));
    render(
        <CatalogPicker
            id="choice"
            label="Choice"
            options={options}
            value={options[79]}
            onSelect={vi.fn()}
        />,
    );
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Choice" }), { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "Choice 79" })).toBeDefined();
});

it("adds current artwork while retaining the selected catalog's historical requirements and implicits", async () => {
    const retained = {
        name: "Test base",
        itemClass: "Body Armour",
        art: "",
        dropLevel: 10,
        requirements: { level: 10, strength: 20, dexterity: 0, intelligence: 0 },
        implicits: ["Retained implicit"],
    };
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
            Response.json({
                retained: {
                    ...retained,
                    art: "https://www.pathofexile.com/image/Art/2DItems/Armours/BodyArmours/BodyStr1.png",
                    dropLevel: 80,
                    implicits: ["Current implicit"],
                },
            }),
        ),
    );
    const option = { id: "retained", label: "Test base · Body Armour", item: retained };
    render(
        <CatalogPicker
            id="base"
            label="Base"
            options={[option]}
            value={option}
            onSelect={vi.fn()}
        />,
    );
    await screen.findByRole("img", { name: "Test base" });
    const details = screen.getByRole("note", { name: "Base details" });
    expect(details.textContent).toContain("Base level 10");
    expect(details.textContent).toContain("Retained implicit");
    expect(details.textContent).not.toContain("Current implicit");
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { RecipeItems } from "~/components/arbitrage/recipe-items";
import { MethodArt } from "~/components/crafting/method-art";
import { CatalogItemArt, ItemArt, ItemName } from "~/components/item-art";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { useItemPresentations } from "~/hooks/use-item-presentations";

vi.mock("~/hooks/use-item-presentations", () => ({ useItemPresentations: vi.fn() }));
const orb = {
    name: "Chaos Orb",
    itemClass: "Currency",
    art: "chaos.png",
    dropLevel: 1,
    requirements: null,
    implicits: [],
};
vi.mocked(useItemPresentations).mockImplementation((game) => ({
    "Metadata/Items/Currency/Chaos": {
        ...orb,
        art: game === "poe2" ? "poe2-chaos.png" : "chaos.png",
    },
    fossil: { ...orb, name: "Jagged Fossil", art: "fossil.png" },
    resonator: { ...orb, name: "Resonator", art: "resonator.png" },
}));
afterEach(cleanup);

it("reserves image space, loads lazily, and recovers when the source changes after failure", () => {
    const { rerender } = render(<ItemArt src="one.png" name="First item" />);
    const image = screen.getByRole("img", { name: "First item" });
    expect(image.getAttribute("loading")).toBe("lazy");
    expect(image.getAttribute("decoding")).toBe("async");
    expect(image.getAttribute("width")).toBe("96");
    fireEvent.error(image);
    expect(screen.queryByRole("img", { name: "First item" })).toBeNull();
    expect(screen.getByLabelText("Artwork unavailable for First item")).toBeTruthy();
    rerender(<ItemArt src="two.png" name="Second item" />);
    expect(screen.getByRole("img", { name: "Second item" }).getAttribute("src")).toBe("two.png");
});

it("keeps a named placeholder without requesting an empty image URL", () => {
    const { container } = render(<CatalogItemArt id="missing" name="Unknown base" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[data-item-art="Unknown base"]')).toBeTruthy();
});

it("preserves accessible item labels and uses the explicitly selected game's art", () => {
    const { container } = render(
        <button type="button">
            <ItemName id="poe2:Metadata/Items/Currency/Chaos" name="Chaos Orb" game="poe2" />
        </button>,
    );
    expect(screen.getByRole("button", { name: "Chaos Orb" })).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("poe2-chaos.png");
});

it("renders name-only recipe thumbnails while retaining quantities and the output", () => {
    const { container } = render(
        <RecipeItems
            recipe={{
                game: "1",
                input: { id: "chaos", name: "Chaos Orb", quantity: 3 },
                output: { id: "jagged", name: "Jagged Fossil", quantity: 1 },
            }}
        />,
    );
    expect(container.textContent).toBe("3 × Chaos Orb → 1 × Jagged Fossil");
    expect(
        [...container.querySelectorAll("img")].map((image) => image.getAttribute("src")),
    ).toEqual(["chaos.png", "fossil.png"]);
});

it("shows all fossil ingredients without assigning item artwork to abstract actions", () => {
    const { container, rerender } = render(
        <MethodArt
            method={{ kind: "fossils", resonator: "resonator", ids: ["fossil"], logic: "additive" }}
            game="poe1"
        />,
    );
    expect(container.querySelectorAll("img")).toHaveLength(2);
    rerender(<MethodArt method={{ kind: "generate", id: "rare" }} game="poe1" />);
    expect(container.querySelectorAll("img")).toHaveLength(0);
});

it("keeps image-bearing select options selectable by keyboard and their original labels", () => {
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    const changed = vi.fn();
    render(
        <FormSelect aria-label="Currency" value="chaos" onValueChange={changed}>
            <FormSelectItem value="chaos">
                <ItemName name="Chaos Orb" />
            </FormSelectItem>
            <FormSelectItem value="fossil">
                <ItemName name="Jagged Fossil" />
            </FormSelectItem>
        </FormSelect>,
    );
    const trigger = screen.getByRole("combobox", { name: "Currency" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const option = within(screen.getByRole("listbox")).getByRole("option", {
        name: "Jagged Fossil",
    });
    fireEvent.mouseMove(option);
    fireEvent.click(option);
    expect(changed).toHaveBeenCalledWith("fossil");
    vi.unstubAllGlobals();
});

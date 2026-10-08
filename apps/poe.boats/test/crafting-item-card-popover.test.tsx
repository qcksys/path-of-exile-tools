// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { ItemCard } from "../app/components/crafting/item-card";
import { ItemCardPopover } from "../app/components/crafting/item-card-popover";
import { baseId, engine } from "./crafting-fixtures";

vi.mock("~/hooks/use-item-presentations", () => ({ useItemPresentations: () => ({}) }));
afterEach(cleanup);
it("keeps derived properties expanded in static item cards", () => {
    render(<ItemCard engine={engine} item={engine.createItem(baseId, 86)} />);
    expect(screen.getByText("Item properties").closest("details")!.open).toBe(true);
});
it("pins an item when its preview is clicked", () => {
    render(
        <ItemCardPopover engine={engine} item={engine.createItem(baseId, 86)} label="Click shield">
            Preview item
        </ItemCardPopover>,
    );
    const trigger = screen.getByRole("button", { name: "Preview Click shield" });
    fireEvent.focus(trigger);
    fireEvent.click(trigger);
    expect(
        screen.getByRole("button", { name: "Unpin item card" }).getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole("region", { name: "Click shield" })).toBeDefined();
    expect(screen.getByText("Item properties").closest("details")!.open).toBe(false);
});
it("opens on keyboard focus, lazily creates a shared item card, pins and explicitly closes it", () => {
    const item = vi.fn(() => engine.createItem(baseId, 86));
    render(
        <ItemCardPopover engine={engine} item={item} label="Test shield">
            Preview item
        </ItemCardPopover>,
    );
    expect(item).not.toHaveBeenCalled();
    fireEvent.focus(screen.getByRole("button", { name: "Preview Test shield" }));
    expect(screen.getByRole("region", { name: "Test shield" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Pin item card" }));
    expect(
        screen.getByRole("button", { name: "Unpin item card" }).getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole("region", { name: "Test shield" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Close item card" }));
    expect(screen.queryByRole("region", { name: "Test shield" })).toBeNull();
});

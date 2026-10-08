// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
it("opens on keyboard focus and restores focus after closing without reopening the card", async () => {
    const item = vi.fn(() => engine.createItem(baseId, 86));
    render(
        <ItemCardPopover engine={engine} item={item} label="Test shield">
            Preview item
        </ItemCardPopover>,
    );
    expect(item).not.toHaveBeenCalled();
    const trigger = screen.getByRole("button", { name: "Preview Test shield" });
    act(() => trigger.focus());
    expect(screen.getByRole("region", { name: "Test shield" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Pin item card" }));
    expect(
        screen.getByRole("button", { name: "Unpin item card" }).getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole("region", { name: "Test shield" })).toBeDefined();
    const close = screen.getByRole("button", { name: "Close item card" });
    act(() => close.focus());
    fireEvent.click(close);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Test shield" })).toBeNull());
    act(() => {
        trigger.blur();
        trigger.focus();
    });
    expect(screen.getByRole("region", { name: "Test shield" })).toBeDefined();
});

it("keeps focus on another control when an unpinned preview is dismissed", async () => {
    render(
        <>
            <ItemCardPopover
                engine={engine}
                item={engine.createItem(baseId, 86)}
                label="Unpinned item"
            >
                Preview item
            </ItemCardPopover>
            <button type="button">Other control</button>
        </>,
    );
    act(() => screen.getByRole("button", { name: "Preview Unpinned item" }).focus());
    const other = screen.getByRole("button", { name: "Other control" });
    act(() => other.focus());
    await waitFor(() => expect(screen.queryByRole("region", { name: "Unpinned item" })).toBeNull());
    expect(document.activeElement).toBe(other);
});

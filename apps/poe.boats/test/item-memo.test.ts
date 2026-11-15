import { expect, it, vi } from "vite-plus/test";
import type { Item } from "../../../packages/poe-api-client/src/types";
import { memoizeByItem } from "../../../packages/poe-stash-ingest/src/shared/item-memo";

const item = (overrides: Partial<Item> = {}) =>
    ({
        id: "item-1",
        baseType: "Necrotic Armour",
        typeLine: "Necrotic Armour",
        frameType: 2,
        explicitMods: ["+100 to maximum Life"],
        inventoryId: "Stash1",
        x: 0,
        y: 0,
        note: "~price 1 chaos",
        ...overrides,
    }) as Item;

it("reuses a result for an item re-sent with only its tab position, inventory or note changed", () => {
    const fn = vi.fn((value: Item) => value.explicitMods?.length ?? 0);
    const memo = memoizeByItem(fn, 10);
    expect(memo(item())).toBe(1);
    expect(memo(item({ inventoryId: "Stash7", x: 4, y: 2, note: "~price 2 chaos" }))).toBe(1);
    expect(fn).toHaveBeenCalledOnce();
});

it("computes again when anything else about the item changed", () => {
    const fn = vi.fn((value: Item) => value.explicitMods?.length ?? 0);
    const memo = memoizeByItem(fn, 10);
    memo(item());
    expect(memo(item({ explicitMods: ["+100 to maximum Life", "+40% to Fire Resistance"] }))).toBe(
        2,
    );
    expect(fn).toHaveBeenCalledTimes(2);
});

it("keeps only the most recently used results", () => {
    const fn = vi.fn((value: Item) => value.id);
    const memo = memoizeByItem(fn, 2);
    memo(item({ id: "a" }));
    memo(item({ id: "b" }));
    memo(item({ id: "a" }));
    memo(item({ id: "c" }));
    expect(fn).toHaveBeenCalledTimes(3);
    // "b" was the least recently used when "c" arrived.
    memo(item({ id: "a" }));
    memo(item({ id: "b" }));
    expect(fn.mock.calls.map(([value]) => value.id)).toEqual(["a", "b", "c", "b"]);
});

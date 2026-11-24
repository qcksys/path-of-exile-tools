import { expect, it } from "vite-plus/test";
import { marketCategory } from "~/lib/market-categories.server";
import type { Item } from "../../../packages/poe-api-client/src/types";
import { shouldCapture } from "../../../packages/poe-stash-ingest/src/shared/capture";
import { itemKey } from "../../../packages/poe-stash-ingest/src/shared/item-key";
import { extractModSignature } from "../../../packages/poe-stash-ingest/src/shared/mod-extractors";
import poe1Categories from "../public/game-data/market-categories-poe1.json";

// Shaped like a public stash Cosmic Reliquary Key in a merchant tab (Covens, 2026-11-23).
function fragment(baseType: string): Item {
    return {
        id: "fragment",
        verified: false,
        w: 1,
        h: 1,
        icon: "https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvTWFwcy9TaGFwZXJGb2lsIiwidyI6MSwiaCI6MSwic2NhbGUiOjF9XQ/71325272ad/ShaperFoil.png",
        league: "Covens",
        name: "",
        typeLine: baseType,
        baseType,
        rarity: "Normal",
        ilvl: 87,
        identified: true,
        note: "~b/o 750 chaos",
        descrText: `Travel to the ${baseType.replace(/ Key$/, "")} by using this item in a personal Map Device. Can only be used once.`,
        frameType: 0,
        frameTypeId: "Normal",
    };
}

it("captures every Reliquary Key as a Fragments market keyed by its base type", () => {
    const keys = Object.entries(poe1Categories)
        .filter(([name]) => name.endsWith(" Reliquary Key"))
        .map(([name, category]) => ({ name, category }));
    expect(keys.map(({ name }) => name)).toContain("Cosmic Reliquary Key");
    for (const { name, category } of keys) {
        const item = fragment(name);
        expect(shouldCapture(item)).toBe(true);
        expect(itemKey(item)).toBe(name);
        expect(extractModSignature(item)).toBeNull();
        expect(category).toBe("fragments");
        expect(marketCategory("pc", name)).toBe("fragments");
    }
});

it("keeps the Voidborn Reliquary Key, which comes with a Currency frame and no rarity", () => {
    const { rarity: _rarity, ...normal } = fragment("Voidborn Reliquary Key");
    const voidborn: Item = { ...normal, frameType: 5, frameTypeId: "Currency" };
    expect(shouldCapture(voidborn)).toBe(true);
    expect(itemKey(voidborn)).toBe("Voidborn Reliquary Key");
});

it("still leaves out other Normal fragments", () => {
    expect(shouldCapture(fragment("Sacrifice at Midnight"))).toBe(false);
});

// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve upstream field names.
import { expect, it } from "vite-plus/test";
import type { Item } from "../../../packages/poe-api-client/src/types";
import {
    fingerprintComparison,
    sampleFingerprints,
    selectedStashHash,
} from "../../../packages/poe-stash-ingest/src/ps/replay-fingerprint";

const item: Item = {
    verified: true,
    w: 2,
    h: 2,
    icon: "https://example.invalid/icon",
    id: "item",
    name: "Example",
    baseType: "Leather Belt",
    typeLine: "Leather Belt",
    identified: true,
    frameType: 3,
    ilvl: 85,
    note: "~price 10 divine",
    explicitMods: ["+20 to Strength", "+30 to Dexterity"],
};
const stash = {
    id: "stash",
    public: true,
    accountName: "seller",
    league: "Standard",
    stashType: "PremiumStash",
    stash: "~price 1 divine",
    items: [item],
};

it("ignores added fields, presentation, item order and equivalent legacy modifier shapes", () => {
    const original = { ...stash, items: [item, { ...item, id: "other" }] };
    const changed = {
        ...original,
        lastCharacterName: "different",
        newField: "ignored",
        items: original.items.toReversed().map((value) => ({
            ...value,
            icon: "https://example.invalid/new-icon",
            x: 12,
            rarity: "Unique" as const,
            itemLevel: 85,
            explicitMods: [
                { description: "+30 to Dexterity", flags: { crafted: false } },
                { description: "+20 to Strength" },
            ],
        })),
    };
    expect(selectedStashHash(changed)).toBe(selectedStashHash(original));
    expect(
        sampleFingerprints({ next_change_id: "a", stashes: [changed] }).stashes[0]!.fullHash,
    ).not.toBe(
        sampleFingerprints({ next_change_id: "a", stashes: [original] }).stashes[0]!.fullHash,
    );
});

it.each([
    { note: "~price 20 divine" },
    { id: "replacement" },
    { stackSize: 2 },
    { explicitMods: ["+21 to Strength", "+30 to Dexterity"] },
    {
        explicitMods: [
            { description: "+20 to Strength", flags: { fractured: true } },
            "+30 to Dexterity",
        ],
    },
])("detects changed selected listing fields: %j", (patch) => {
    expect(selectedStashHash({ ...stash, items: [{ ...item, ...patch }] })).not.toBe(
        selectedStashHash(stash),
    );
});

it("matches original versions across changed page boundaries without letting a later version hide an earlier match", () => {
    const second = { ...stash, id: "second" };
    const comparison = fingerprintComparison(
        sampleFingerprints({ next_change_id: "old", stashes: [stash, second] }),
    );
    comparison.add({ next_change_id: "new", stashes: [stash, { ...stash, id: "extra" }] });
    expect(comparison.result()).toMatchObject({
        fullMatched: 1,
        selectedMatched: 1,
        missing: 1,
        extraStashes: 1,
    });
    comparison.add({ next_change_id: "next", stashes: [second, { ...stash, items: [] }] });
    expect(comparison.result()).toEqual({
        expected: 2,
        fullMatched: 2,
        selectedMatched: 2,
        selectedChanged: 0,
        missing: 0,
        extraStashes: 1,
    });
});

it("distinguishes missing stashes from changed selected fields", () => {
    const comparison = fingerprintComparison(
        sampleFingerprints({
            next_change_id: "old",
            stashes: [stash, { ...stash, id: "missing" }],
        }),
    );
    comparison.add({ next_change_id: "next", stashes: [{ ...stash, items: [] }] });
    expect(comparison.result()).toMatchObject({
        fullMatched: 0,
        selectedMatched: 0,
        selectedChanged: 1,
        missing: 1,
    });
});

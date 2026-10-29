import { expect, it } from "vite-plus/test";
import type { Item, ItemProperty } from "../../../packages/poe-api-client/src/types";
import { shouldCapture } from "../../../packages/poe-stash-ingest/src/shared/capture";
import { itemKey } from "../../../packages/poe-stash-ingest/src/shared/item-key";
import {
    extractModSignature,
    signatureValue,
} from "../../../packages/poe-stash-ingest/src/shared/mod-extractors";

const property = (name: string, ...values: string[]): ItemProperty => ({
    name,
    values: values.map((value) => [value, 0]),
    displayMode: 0,
});
const requires = (level: number, job: string) =>
    property("Requires {1} (Level {0})", String(level), job);

// Synthetic API fixtures, shaped like public stash Heist items.
function heistItem(baseType: string, properties: ItemProperty[], overrides: Partial<Item> = {}) {
    return {
        id: baseType,
        verified: true,
        w: 1,
        h: 1,
        icon: "https://web.poecdn.com/gen/image/Art/2DItems/Currency/Heist/Contract.png",
        name: "",
        typeLine: baseType,
        baseType,
        rarity: "Normal",
        frameType: 0,
        identified: true,
        ilvl: 83,
        properties,
        note: "~price 1 chaos",
        ...overrides,
    } satisfies Item;
}
const contract = (areaLevel: string, ...extra: ItemProperty[]) =>
    heistItem("Contract: Bunker", [
        property("Client", "Nishem"),
        property("Heist Target: {0} ({1})", "Tusked Hominid Skull", "Moderate Value"),
        property("Area Level", areaLevel),
        ...extra,
    ]);
const blueprint = (wings: string, enchantMods?: string[], areaLevel = "83") =>
    heistItem(
        "Blueprint: Bunker",
        [
            property("Area Level", areaLevel),
            property("Wings Revealed", wings),
            property("Escape Routes Revealed", "1/6"),
            requires(4, "Lockpicking"),
            requires(3, "Demolition"),
        ],
        enchantMods ? { enchantMods } : {},
    );

it("splits area level 83 contracts by the job they require, whatever its level", () => {
    const item = contract("83", requires(2, "Trap Disarmament"));
    expect(shouldCapture(item)).toBe(true);
    expect(itemKey(item)).toBe("Contract: Bunker");
    const signature = extractModSignature(item);
    expect(signature).toEqual({ kind: "heist", job: "Trap Disarmament" });
    expect(signatureValue(signature)).toBe("Trap Disarmament");
    expect(
        signatureValue(extractModSignature(contract("83", requires(5, "Trap Disarmament")))),
    ).toBe("Trap Disarmament");
});

it("keys every blueprint as Blueprint, whatever its location", () => {
    expect(itemKey(blueprint("1/3"))).toBe("Blueprint");
    expect(itemKey({ ...blueprint("4/4"), baseType: "Blueprint: Tunnels" })).toBe("Blueprint");
});

it("captures unidentified blueprints in the same market by wings revealed and enchants", () => {
    const enchant = "Heist Targets are always Thieves' Trinkets";
    const unidentified = { ...blueprint("4/4", [enchant]), identified: false };
    expect(shouldCapture(unidentified)).toBe(true);
    expect(itemKey(unidentified, "Blueprint.png")).toBe("Blueprint");
    expect(signatureValue(extractModSignature(unidentified))).toBe(
        signatureValue(extractModSignature(blueprint("4/4", [enchant]))),
    );
});

it("splits blueprints by wings revealed and each enchant", () => {
    expect(signatureValue(extractModSignature(blueprint("1/3")))).toBe("1/3 wings");
    expect(signatureValue(extractModSignature(blueprint("4/4")))).toBe("4/4 wings");
    expect(
        signatureValue(
            extractModSignature(blueprint("1/4", ["Heist Targets are always Thieves' Trinkets"])),
        ),
    ).toBe("1/4 wings · Heist Targets are always Thieves' Trinkets");
});

it("leaves lower area levels, partly revealed blueprints, corrupted and unique contracts uncaptured", () => {
    expect(shouldCapture(contract("81", requires(2, "Agility")))).toBe(false);
    expect(shouldCapture({ ...contract("83", requires(2, "Agility")), corrupted: true })).toBe(
        false,
    );
    expect(shouldCapture({ ...blueprint("4/4"), corrupted: true })).toBe(false);
    expect(shouldCapture({ ...contract("83", requires(2, "Agility")), identified: false })).toBe(
        false,
    );
    expect(shouldCapture(blueprint("1/3", undefined, "75"))).toBe(false);
    expect(shouldCapture(blueprint("2/3"))).toBe(false);
    expect(shouldCapture(blueprint("3/4"))).toBe(false);
    expect(
        extractModSignature({
            ...contract("83", requires(2, "Agility")),
            rarity: "Unique",
            frameType: 3,
            name: "Faustus' Contract",
        }),
    ).toBeNull();
});

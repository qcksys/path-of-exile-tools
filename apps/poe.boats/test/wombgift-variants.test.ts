import { expect, it } from "vite-plus/test";
import type { Item } from "../../../packages/poe-api-client/src/types";
import { shouldCapture } from "../../../packages/poe-stash-ingest/src/shared/capture";
import { itemKey } from "../../../packages/poe-stash-ingest/src/shared/item-key";
import {
    extractModSignature,
    signatureValue,
} from "../../../packages/poe-stash-ingest/src/shared/mod-extractors";

// Synthetic API fixture, shaped like a public stash Wombgift.
function wombgift(ilvl: number | undefined, baseType = "Provisioning Wombgift"): Item {
    return {
        id: "wombgift",
        verified: true,
        w: 1,
        h: 1,
        icon: "https://web.poecdn.com/gen/image/Art/2DItems/Currency/Chayula/BreachFruit1.png",
        name: "",
        typeLine: baseType,
        baseType,
        identified: true,
        ilvl,
        frameType: 5,
        explicitMods: ["Can grow into an Armour or Jewellery item on the Genesis Tree"],
        note: "~price 1 chaos",
    };
}

it.each([
    [1, "Item level 1–67"],
    [67, "Item level 1–67"],
    [68, "Item level 68–74"],
    [74, "Item level 68–74"],
    [75, "Item level 75–82"],
    [82, "Item level 75–82"],
    [83, "Item level 83"],
    [84, "Item level 84+"],
    [86, "Item level 84+"],
])("puts an item level %i Wombgift in the %s market", (ilvl, value) => {
    const item = wombgift(ilvl);
    expect(shouldCapture(item)).toBe(true);
    expect(itemKey(item)).toBe("Provisioning Wombgift");
    const signature = extractModSignature(item);
    expect(signature).toEqual({ kind: "wombgift", level: value });
    expect(signatureValue(signature)).toBe(value);
});

it("splits every Wombgift type", () => {
    for (const type of ["Ancient", "Lavish", "Mysterious", "Provisioning"]) {
        expect(signatureValue(extractModSignature(wombgift(83, `${type} Wombgift`)))).toBe(
            "Item level 83",
        );
    }
});

it("leaves a Wombgift without an item level unsplit", () => {
    expect(extractModSignature(wombgift(undefined))).toBeNull();
});

import { expect, it } from "vite-plus/test";
import type { Item } from "../../../packages/poe-api-client/src/types";
import { shouldCapture } from "../../../packages/poe-stash-ingest/src/shared/capture";
import { itemKey } from "../../../packages/poe-stash-ingest/src/shared/item-key";
import {
    extractModSignature,
    signatureValue,
} from "../../../packages/poe-stash-ingest/src/shared/mod-extractors";

// Synthetic API fixture, shaped like a public stash Scrying Orb.
function scryingOrb(mapArea?: string): Item {
    return {
        id: "scrying",
        verified: true,
        w: 1,
        h: 1,
        icon: "https://web.poecdn.com/gen/image/Art/2DItems/Currency/ScryingOrb.png",
        name: "",
        typeLine: "Scrying Orb",
        baseType: "Scrying Orb",
        identified: true,
        frameType: 5,
        properties: mapArea
            ? [{ name: "Map Area", values: [[mapArea, 0]], displayMode: 0, type: 105 }]
            : [],
        explicitMods: ["[Scrying|Scries] a Map on your Atlas"],
        note: "~price 1 chaos",
    };
}

it("splits Scrying Orbs into one market per map area", () => {
    const orb = scryingOrb("Forking River");
    expect(shouldCapture(orb)).toBe(true);
    expect(itemKey(orb)).toBe("Scrying Orb");
    const signature = extractModSignature(orb);
    expect(signature).toEqual({ kind: "scrying-orb", map: "Forking River" });
    expect(signatureValue(signature)).toBe("Forking River");
    expect(signatureValue(extractModSignature(scryingOrb("Chateau")))).toBe("Chateau");
});

it("leaves a Scrying Orb without a map area unsplit", () => {
    expect(extractModSignature(scryingOrb())).toBeNull();
});

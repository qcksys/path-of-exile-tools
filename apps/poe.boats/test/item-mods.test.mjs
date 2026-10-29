import { describe, expect, it } from "vite-plus/test";
import {
    extractModSignature,
    signatureValue,
} from "../../../packages/poe-stash-ingest/src/shared/mod-extractors/index.ts";

describe("upstream modifier formats", () => {
    it.each([
        ["Watcher's Eye", "10% increased Movement Speed while affected by Grace"],
        [
            "Forbidden Flame",
            "Allocates Profane Bloom if you have the matching modifier on Forbidden Flesh",
        ],
        [
            "Impossible Escape",
            "Passive Skills in Radius of Iron Reflexes can be Allocated\nwithout being connected to your tree",
        ],
        ["Forbidden Shako", "Socketed Gems are Supported by Level 35 Ice Bite"],
    ])("groups object and legacy string modifiers identically for %s", (name, description) => {
        const item = { name, frameType: 3, identified: true };
        const legacy = extractModSignature({ ...item, explicitMods: [description] });
        expect(legacy).not.toBeNull();
        expect(
            extractModSignature({
                ...item,
                explicitMods: [{ description, flags: { mutated: true } }],
            }),
        ).toEqual(legacy);
    });
});

describe("Foulborn uniques", () => {
    const foulborn = {
        name: "Foulborn Hand of Thought and Motion",
        baseType: "Blue Pearl Amulet",
        frameType: 3,
        identified: true,
        mutated: true,
    };

    it("splits markets by mutated modifier and ignores its roll", () => {
        const low = extractModSignature({
            ...foulborn,
            explicitMods: [
                "Adds 1 to 30 Lightning Damage",
                { description: "+1 to Level of Socketed Gems", flags: { mutated: true } },
            ],
        });
        const high = extractModSignature({
            ...foulborn,
            explicitMods: [
                "Adds 2 to 40 Lightning Damage",
                { description: "+2 to Level of Socketed Gems", flags: { mutated: true } },
            ],
        });
        const other = extractModSignature({
            ...foulborn,
            explicitMods: [{ description: "12% increased Attack Speed", flags: { mutated: true } }],
        });
        expect(low).toEqual({ kind: "foulborn", mods: ["+# to Level of Socketed Gems"] });
        expect(high).toEqual(low);
        expect(signatureValue(other)).toBe("#% increased Attack Speed");
    });

    it("reads the legacy mutatedMods field", () => {
        expect(
            extractModSignature({
                ...foulborn,
                explicitMods: ["Adds 1 to 30 Lightning Damage"],
                mutatedMods: ["+1 to Level of Socketed Gems"],
            }),
        ).toEqual({ kind: "foulborn", mods: ["+# to Level of Socketed Gems"] });
    });

    it("keeps the value within the summary column and ignores unmutated uniques", () => {
        const long = extractModSignature({ ...foulborn, mutatedMods: ["x".repeat(300)] });
        expect(signatureValue(long)).toMatch(/^[0-9a-f]{64}$/);
        expect(
            extractModSignature({
                ...foulborn,
                name: "Hand of Thought and Motion",
                mutated: undefined,
                explicitMods: ["+1 to Level of Socketed Gems"],
            }),
        ).toBeNull();
    });
});

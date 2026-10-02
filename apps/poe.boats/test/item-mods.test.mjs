import { describe, expect, it } from "vite-plus/test";
import { extractModSignature } from "../../../packages/poe-stash-ingest/src/shared/mod-extractors/index.ts";

describe("upstream modifier formats", () => {
    it.each([
        ["Watcher's Eye", "10% increased Movement Speed while affected by Grace"],
        [
            "Forbidden Flame",
            "Allocates Profane Bloom if you have the matching modifier on Forbidden Flesh",
        ],
        [
            "Impossible Escape",
            "Passives in Radius of Iron Reflexes can be Allocated without being connected to your tree",
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

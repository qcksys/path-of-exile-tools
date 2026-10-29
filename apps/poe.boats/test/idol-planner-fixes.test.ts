import { describe, expect, it } from "vite-plus/test";
import { getSlotScarabs, SCARABS } from "~/data/scarab-data";
import { buildShareUrl, sharePath } from "~/lib/share";

describe("map device scarabs", () => {
    it("skips empty slots and scarab ids that are no longer in the data", () => {
        const known = SCARABS[0]!;
        const scarabs = getSlotScarabs(
            [known.id, null, "not_a_real_scarab", null, null].map((scarabId, slotIndex) => ({
                slotIndex,
                scarabId,
            })),
        );
        expect(scarabs).toEqual([known]);
    });
});

describe("idol planner share links", () => {
    it("routes imported share links to the planner's share page", () => {
        expect(sharePath("q3_vqWmngf")).toBe("/1/idol-planner/share/q3_vqWmngf");
        expect(buildShareUrl("https://poe.boats/1/idol-planner", "q3_vqWmngf")).toBe(
            "https://poe.boats/1/idol-planner/share/q3_vqWmngf",
        );
    });
});

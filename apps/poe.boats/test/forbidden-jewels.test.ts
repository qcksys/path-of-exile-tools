import { describe, expect, it } from "vite-plus/test";
import ascendancyNotables from "~/data/ascendancy-notables-poe1.json";
import {
    ascendancyOfNotable,
    forbiddenJewelClasses,
    forbiddenJewelGroup,
} from "~/lib/forbidden-jewels";

function jewel(name: string, notable: string, overrides: { corrupted?: boolean } = {}) {
    return {
        name,
        identified: Boolean(notable),
        corrupted: overrides.corrupted ?? false,
        signatureKind: notable ? "forbidden-jewel" : "",
        signatureValue: notable,
    };
}

describe("ascendancy notables", () => {
    it("names each notable's class and ascendancy, including the Ascendant's options", () => {
        expect(ascendancyOfNotable("Pious Path")).toEqual({
            className: "Templar",
            ascendancy: "Inquisitor",
        });
        // The Ascendant takes one option named after another ascendancy.
        expect(ascendancyOfNotable("Deadeye")).toEqual({
            className: "Scion",
            ascendancy: "Ascendant",
        });
        expect(ascendancyOfNotable("Lesson of the Seasons")?.ascendancy).toBe("Warden");
        expect(ascendancyOfNotable("Nine Lives")).toBeUndefined();
        expect(ascendancyOfNotable("toString")).toBeUndefined();
    });

    it("maps every notable to an ascendancy of a class", () => {
        const ascendancies = new Set(Object.values(ascendancyNotables.classes).flat());
        for (const ascendancy of Object.values(ascendancyNotables.notables))
            expect(ascendancies).toContain(ascendancy);
    });

    it("groups Forbidden jewel variants by class and ascendancy", () => {
        expect(
            forbiddenJewelGroup({ signatureKind: "forbidden-jewel", signatureValue: "Pious Path" }),
        ).toBe("Templar · Inquisitor");
        expect(
            forbiddenJewelGroup({ signatureKind: "forbidden-jewel", signatureValue: "Nine Lives" }),
        ).toBe("Other notables");
        expect(forbiddenJewelGroup({ signatureKind: "", signatureValue: "" })).toBeUndefined();
    });
});

describe("forbiddenJewelClasses", () => {
    it("pairs Flame and Flesh by notable and corruption, in passive tree order", () => {
        const flame = jewel("Forbidden Flame", "Pious Path");
        const flesh = jewel("Forbidden Flesh", "Pious Path");
        const corrupted = jewel("Forbidden Flesh", "Pious Path", { corrupted: true });
        const witch = jewel("Forbidden Flame", "Shaper of Flames");
        const legacy = jewel("Forbidden Flame", "Nine Lives");
        const unidentified = jewel("Forbidden Flesh", "");
        expect(
            forbiddenJewelClasses([
                flesh,
                unidentified,
                legacy,
                corrupted,
                flame,
                witch,
                jewel("Watcher's Eye", ""),
            ]),
        ).toEqual([
            {
                className: "Witch",
                ascendancies: [
                    {
                        ascendancy: "Elementalist",
                        pairs: [{ notable: "Shaper of Flames", corrupted: false, flame: witch }],
                    },
                ],
            },
            {
                className: "Templar",
                ascendancies: [
                    {
                        ascendancy: "Inquisitor",
                        pairs: [
                            { notable: "Pious Path", corrupted: false, flame, flesh },
                            { notable: "Pious Path", corrupted: true, flesh: corrupted },
                        ],
                    },
                ],
            },
            {
                className: "Other",
                ascendancies: [
                    {
                        ascendancy: "Other notables",
                        pairs: [{ notable: "Nine Lives", corrupted: false, flame: legacy }],
                    },
                ],
            },
            {
                className: "Unidentified",
                ascendancies: [
                    {
                        ascendancy: "Unidentified",
                        pairs: [{ notable: "Unidentified", corrupted: false, flesh: unidentified }],
                    },
                ],
            },
        ]);
    });
});

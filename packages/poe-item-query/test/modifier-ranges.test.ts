import { expect, it } from "vite-plus/test";
import { scaledModifierTexts } from "../src/modifier-ranges.ts";

it("scales integer stats before decimal translation and leaves non-scalable values unchanged", () => {
    const data = {
        statDescriptions: [
            {
                ids: ["regen", "gem"],
                rules: [
                    {
                        conditions: ["#", "#"],
                        text: "Regenerate {0} Life per second\n+{1} to Level of Gems",
                        handlers: ["per_minute_to_per_second", "1"],
                    },
                ],
            },
        ],
        statLookups: {},
    };
    const definition = {
        descriptions: [0],
        stats: [
            { id: "regen", min: 101, max: 149, scalable: true },
            { id: "gem", min: 1, max: 1, scalable: false },
        ],
    };
    expect(scaledModifierTexts(data, definition, 20)).toEqual([
        "Regenerate (2-3) Life per second\n1 to Level of Gems",
    ]);
});

it("partitions internal rule changes and preserves singular, plural and zero alternatives", () => {
    const data = {
        statDescriptions: [
            {
                ids: ["uses"],
                rules: [
                    { conditions: ["1"], text: "Has {0} Use", handlers: [] },
                    { conditions: ["3"], text: "Special three uses", handlers: [] },
                    { conditions: ["#"], text: "Has {0} Uses", handlers: [] },
                ],
            },
        ],
        statLookups: {},
    };
    const definition = {
        descriptions: [0],
        stats: [{ id: "uses", min: 0, max: 5, scalable: true }],
    };
    expect(new Set(scaledModifierTexts(data, definition, 0))).toEqual(
        new Set(["", "Has 1 Use", "Has 2 Uses", "Special three uses", "Has (4-5) Uses"]),
    );
});

it("enumerates categorical lookups instead of inferring numeric text from their endpoints", () => {
    const data = {
        statDescriptions: [
            {
                ids: ["lure"],
                rules: [
                    {
                        conditions: ["#"],
                        text: "Attracts {0}",
                        handlers: ["lures", "1"],
                    },
                ],
            },
        ],
        statLookups: { lures: { "1": "Fish", "2": "Crabs", "3": "Eels" } },
    };
    const definition = {
        descriptions: [0],
        stats: [{ id: "lure", min: 1, max: 3, scalable: false }],
    };
    expect(new Set(scaledModifierTexts(data, definition, 20))).toEqual(
        new Set(["Attracts Fish", "Attracts Crabs", "Attracts Eels"]),
    );
    definition.stats[0]!.max = 4;
    expect(scaledModifierTexts(data, definition, 20)).toBeNull();
});

it("bounds reversed numeric handlers and refuses excessive or unknown translation rules", () => {
    const data = {
        statDescriptions: [
            {
                ids: ["chance"],
                rules: [
                    {
                        conditions: ["#"],
                        text: "{0}% chance",
                        handlers: ["invert_chance", "1"],
                    },
                ],
            },
        ],
        statLookups: {},
    };
    const definition = {
        descriptions: [0],
        stats: [{ id: "chance", min: 20, max: 40, scalable: true }],
    };
    expect(scaledModifierTexts(data, definition, 20)).toEqual(["(52-76)% chance"]);
    data.statDescriptions[0]!.rules[0]!.conditions = ["future-condition"];
    expect(scaledModifierTexts(data, definition, 20)).toBeNull();
});

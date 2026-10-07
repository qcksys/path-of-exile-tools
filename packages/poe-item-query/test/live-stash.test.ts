import { readFileSync } from "node:fs";
import { expect, it } from "vite-plus/test";
import { apiItemSchema, itemQuerySchema, matchItem, normalizeApiItem } from "../src/index.ts";

const fixture = JSON.parse(
    readFileSync(new URL("./fixtures/poe1-public-stash-2026-10-07.json", import.meta.url), "utf8"),
);
const items = apiItemSchema.array().parse(fixture.items);

it("retains observed catalyst properties and native magnitude context without inserting absent quality", () => {
    const data = JSON.parse(
        readFileSync(
            new URL("./fixtures/poe1-public-stash-quality-2026-10-07.json", import.meta.url),
            "utf8",
        ),
    );
    const records = data.items.map((entry: { propertiesPresent: boolean; item: unknown }) => {
        const record = normalizeApiItem("poe1", "stash", entry.item);
        expect(Object.hasOwn(record.item, "properties")).toBe(entry.propertiesPresent);
        return record;
    });
    expect(records[1].item.properties).toEqual([
        {
            name: "Quality (Life and Mana Modifiers)",
            values: [["+20%", 1]],
            displayMode: 0,
            type: 6,
        },
    ]);
    expect(records[3].item.properties).toEqual([
        { name: "Quality (Prefix Modifiers)", values: [["+20%", 1]], displayMode: 0, type: 6 },
    ]);
    expect(records[3].item.implicitMods).toContainEqual({
        description: "50% increased Prefix Modifier magnitudes",
    });
    expect(records[3].facts).toMatchObject({ prefixes: 4, suffixes: 1, modifiersComplete: false });
});

it("retains observed affix counts and fracture flags without inventing modifier identities", () => {
    for (const item of items) {
        const record = normalizeApiItem("poe1", "stash", item);
        expect(record.item).toEqual(item);
        expect(record.facts.prefixes).toBe(item.extended!.prefixes);
        expect(record.facts.suffixes).toBe(item.extended!.suffixes);
        expect(record.facts.modifiersComplete).toBe(false);
        expect(record.facts.modifiers).toEqual([]);
        expect(
            matchItem(
                record,
                itemQuerySchema.parse({
                    game: "poe1",
                    groups: [
                        {
                            type: "and",
                            filters: [{ kind: "flag", field: "fractured", value: true }],
                        },
                    ],
                }),
            ),
        ).toBe("match");
        expect(
            matchItem(
                record,
                itemQuerySchema.parse({
                    game: "poe1",
                    groups: [
                        {
                            type: "and",
                            filters: [{ kind: "mod", fractured: true, tier: { min: 1, max: 2 } }],
                        },
                    ],
                }),
            ),
        ).toBe("unknown");
    }
});

it("does not count displayed rows as affixes or impose ordinary limits on special bases", () => {
    const helmet = items.find((item) => item.baseType === "Conqueror's Helmet")!;
    expect(helmet.explicitMods).toHaveLength(7);
    expect(normalizeApiItem("poe1", "stash", helmet).facts).toMatchObject({
        prefixes: 2,
        suffixes: 3,
    });
    const ring = items.find((item) => item.baseType === "Helical Ring")!;
    expect(normalizeApiItem("poe1", "stash", ring).facts).toMatchObject({
        prefixes: 1,
        suffixes: 4,
    });
});

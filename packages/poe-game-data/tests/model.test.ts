import { expect, it } from "vite-plus/test";
import { baseSchema, modPool, modSchema, propertiesSchema } from "../src/model.ts";
import { parseVersion } from "../src/versions.ts";

const base = baseSchema.parse({
    domain: "item",
    drop_level: 1,
    implicits: [],
    inventory_height: 1,
    inventory_width: 1,
    item_class: "Belt",
    name: "Belt",
    properties: {},
    release_state: "released",
    tags: ["belt", "default"],
    visual_identity: { id: "Belt", dds_file: "belt.dds" },
});
const mod = modSchema.parse({
    adds_tags: [],
    domain: "item",
    generation_type: "prefix",
    generation_weights: [],
    grants_effects: [],
    groups: ["Life"],
    implicit_tags: [],
    is_essence_only: false,
    name: "Healthy",
    required_level: 1,
    maximum_level: 100,
    spawn_weights: [{ tag: "default", weight: 1000 }],
    stats: [],
    text: "Life",
    type: "Life",
});

it("retains reload milliseconds, distinguishes absent properties and rejects invalid values", () => {
    expect(propertiesSchema.parse({}).reload_time).toBeNull();
    expect(propertiesSchema.parse({ reload_time: 750 }).reload_time).toBe(750);
    expect(propertiesSchema.parse({ reload_time: 0 }).reload_time).toBe(0);
    for (const value of [-1, 1.5, "750"])
        expect(propertiesSchema.safeParse({ reload_time: value }).success).toBe(false);
});

it("applies the first matching weight, including a zero exclusion", () => {
    const excluded = {
        ...mod,
        spawn_weights: [
            { tag: "belt", weight: 0 },
            { tag: "default", weight: 1000 },
        ],
    };
    expect(modPool(base, { excluded }, 20)).toEqual([]);
    expect(
        modPool(
            base,
            { life: { ...mod, generation_weights: [{ tag: "default", weight: 50 }] } },
            20,
        )[0]?.effective_weight,
    ).toBe(500);
});

it("uses existing modifiers' added tags and exclusion groups", () => {
    const existing = { ...mod, groups: ["Existing"], adds_tags: ["special"] };
    const candidate = { ...mod, spawn_weights: [{ tag: "special", weight: 30 }] };
    expect(
        modPool(
            base,
            { existing, candidate, blocked: { ...candidate, groups: ["Existing"] } },
            20,
            ["existing"],
        ).map((row) => row.id),
    ).toEqual(["candidate"]);
    expect(() => modPool(base, { existing }, 20, ["existing", "existing"])).toThrow("unique");
    expect(modPool(base, { candidate: { ...candidate, maximum_level: 10 } }, 20, [])).toEqual([]);
});

it("handles fragmented discovery data and rejects another game's CDN", () => {
    const url = "https://patch.poecdn.com/3.29.3.3/";
    const header = Buffer.alloc(35);
    header[0] = 2;
    header.writeUInt16BE(url.length, 33);
    const bytes = Buffer.concat([header, Buffer.from(url, "utf16le")]);
    for (let size = 0; size < bytes.length; size++)
        expect(parseVersion("poe1", bytes.subarray(0, size))).toBeNull();
    expect(parseVersion("poe1", bytes)).toBe("3.29.3.3");
    expect(() => parseVersion("poe2", bytes)).toThrow("CDN");
});

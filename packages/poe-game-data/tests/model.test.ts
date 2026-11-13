import { expect, it } from "vite-plus/test";
import {
    baseSchema,
    dataPackageManifestSchema,
    modPool,
    modSchema,
    packageVersionForBuild,
    propertiesSchema,
} from "../src/model.ts";
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

function handshake(...urls: string[]) {
    const header = Buffer.alloc(33);
    header[0] = 2;
    return Buffer.concat([
        header,
        ...urls.flatMap((url) => {
            const length = Buffer.alloc(2);
            length.writeUInt16BE(url.length);
            return [length, Buffer.from(url, "utf16le")];
        }),
    ]);
}

it("handles fragmented discovery data and rejects another game's CDN", () => {
    const bytes = handshake("https://patch.poecdn.com/3.29.3.3/");
    for (let size = 0; size < bytes.length; size++)
        expect(parseVersion("poe1", bytes.subarray(0, size))).toBeNull();
    expect(parseVersion("poe1", bytes)).toBe("3.29.3.3");
    expect(() => parseVersion("poe2", bytes)).toThrow("CDN");
});

it("accepts PoE 2's 0.x and 4.x builds and rejects builds numbered for the other game", () => {
    const url = "https://patch-poe2.poecdn.com/0.5.5.8/";
    expect(parseVersion("poe2", handshake(url, url))).toBe("0.5.5.8");
    expect(parseVersion("poe2", handshake("https://patch-poe2.poecdn.com/4.5.5.4/"))).toBe(
        "4.5.5.4",
    );
    expect(() =>
        parseVersion("poe2", handshake("https://patch-poe2.poecdn.com/3.29.3.6/")),
    ).toThrow("Invalid patch version: 3.29.3.6");
    expect(() => parseVersion("poe1", handshake("https://patch.poecdn.com/0.5.5.8/"))).toThrow(
        "Invalid patch version: 0.5.5.8",
    );
});

it("packages PoE 2's 0.x and 4.x builds and rejects builds numbered for the other game", () => {
    const hash = "0".repeat(64);
    const packages = (game: "poe1" | "poe2", build: string) =>
        dataPackageManifestSchema.safeParse({
            format: 1,
            game,
            version: packageVersionForBuild(build),
            client_build: build,
            source_manifest_sha256: hash,
            dat_schema_sha256: hash,
            extractor_sha256: hash,
            zod_schema_sha256: hash,
            weight_provenance:
                "client-extracted; PoE 2 values are not Craft of Exile empirical weights",
            files: {
                "data/mods.json": {
                    sha256: hash,
                    bytes: 1,
                    schema: "json-schema/mods.schema.json",
                },
            },
        }).success;
    expect(packages("poe2", "0.5.5.8")).toBe(true);
    expect(packages("poe2", "4.5.5.4")).toBe(true);
    expect(packages("poe1", "3.29.3.6")).toBe(true);
    expect(packages("poe2", "3.29.3.6")).toBe(false);
    expect(packages("poe1", "0.5.5.8")).toBe(false);
    expect(packages("poe1", "4.5.5.4")).toBe(false);
});

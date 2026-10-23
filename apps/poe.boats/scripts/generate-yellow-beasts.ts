import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Tables } from "../../../packages/poe-game-data/src/tables.ts";

const directory = process.argv[2];
if (!directory) throw new Error("Provide the directory containing schema.json and raw/Data.");
const hashes = {
    BestiaryCapturableMonsters: "a9a2b8286a1f18cf812eea3a40a31b187e748bfb869857f4d8f296fdf14b0514",
    MonsterVarieties: "f7ec9be9fe85c795f64a40549bb936930004ea0a40f3ef55d27716f292669684",
    BestiaryRecipeComponent: "1fce42d31749cd9d6b5bb5c27920bbeb70c7228a987391d3bbc3ee33ae33936d",
    BestiaryFamilies: "237e0a72cfef873e6ff1b5e0f8c0ba338c4190ee7cd49abc147a5f36d5771843",
    Rarity: "b142dc765a1ea8e51c780d623683b607627fd10b81ed44c62d7e1c3c904cd5aa",
};
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const schema = await readFile(join(directory, "schema.json"));
if (hash(schema) !== "bc20b89453d307ae2782f4aac9bf3899a28fe448a82f02d60d96499b2b921d03")
    throw new Error("Review the changed DAT schema before interpreting unnamed columns.");
const tables = new Tables(
    "poe1",
    {
        async get(path) {
            const bytes = await readFile(join(directory, "raw", path));
            const name = path.replace(/^Data\//, "").replace(/\.datc64$/, "");
            if (hash(bytes) !== hashes[name as keyof typeof hashes])
                throw new Error(
                    `Review changed game-data classification before generating ${name}.`,
                );
            return bytes;
        },
    },
    JSON.parse(schema.toString()),
);
await tables.load(Object.keys(hashes));
const anyRare = tables.rows("BestiaryRecipeComponent").find((row) => row.id() === "AnyRare");
if (
    anyRare?.ref("BestiaryFamiliesKey")?.id() !== "AnyCreature" ||
    anyRare.ref("BeastRarity")?.id() !== "Rare"
)
    throw new Error("The generic rare-beast recipe has changed.");
const specific = new Set(
    tables.rows("BestiaryRecipeComponent").flatMap((row) => {
        const monster = row.ref("BestiaryCapturableMonstersKey")?.ref("MonsterVarietiesKey");
        return monster ? [monster.string("Name")] : [];
    }),
);
const rows = tables.rows("BestiaryCapturableMonsters");
const active = rows.filter((row) => !row.boolean("IsDisabled"));
const excluded = new Set(specific);
for (const row of active) {
    if (row.unnamedBoolean(3) || row.unnamedBoolean(8))
        excluded.add(row.ref("MonsterVarietiesKey")!.string("Name"));
}
const names = [
    ...new Set(
        active.flatMap((row) => {
            const name = row.ref("MonsterVarietiesKey")!.string("Name");
            if (excluded.has(name)) return [];
            // This unnamed column corroborates the reviewed partition; it is not the classification source.
            if (!row.unnamedBoolean(12) || row.string("Icon") || row.string("IconSmall"))
                throw new Error(`Unreviewed generic creature: ${name}`);
            return [name];
        }),
    ),
].sort();
if (names.length !== 169)
    throw new Error(`Review the changed generic creature census: ${names.length}.`);
const detailsIds = names.map((name) =>
    name
        .toLowerCase()
        .replaceAll("'", "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
);
if (new Set(detailsIds).size !== names.length) throw new Error("Ambiguous price-feed identity.");
const data = {
    game: "poe1",
    build: "3.29.3.3",
    schemaSha256: hash(schema),
    tables: hashes,
    classification:
        "Active generic AnyCreature/Rare species; named recipe, legendary, unique and disabled-only identities excluded. Unnamed columns 3/8 are cross-checked against named recipe identities; column 12 is corroborating evidence only.",
    names,
    excludedNames: [...new Set(rows.map((row) => row.ref("MonsterVarietiesKey")!.string("Name")))]
        .filter((name) => !names.includes(name))
        .sort(),
};
await writeFile(
    "app/lib/crafting-yellow-beasts.generated.json",
    `${JSON.stringify(data, null, 2)}\n`,
);
console.log(JSON.stringify({ names: names.length, excludedNames: data.excludedNames.length }));

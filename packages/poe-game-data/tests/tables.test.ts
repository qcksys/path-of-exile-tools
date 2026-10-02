import { expect, it } from "vite-plus/test";
import { Tables } from "../src/tables.ts";

function table(values: number[]) {
    const bytes = Buffer.alloc(4 + values.length * 8 + 8);
    bytes.writeUInt32LE(values.length);
    for (const [index, value] of values.entries())
        bytes.writeBigUInt64LE(BigInt(value), 4 + index * 8);
    bytes.fill(0xbb, bytes.length - 8);
    return bytes;
}

it.each([
    "poe1",
    "poe2",
] as const)("decodes %s tables and validates foreign references", async (game) => {
    const paths: string[] = [];
    const schema = {
        version: 8,
        tables: [
            {
                name: "Targets",
                validFor: 3,
                columns: [
                    { name: "Id", type: "i64", array: false, interval: false, references: null },
                ],
            },
            {
                name: "Links",
                validFor: 3,
                columns: [
                    {
                        name: "Target",
                        type: "row",
                        array: false,
                        interval: false,
                        references: { table: "Targets" },
                    },
                ],
            },
        ],
    };
    const tables = new Tables(
        game,
        {
            get: async (path) => {
                paths.push(path);
                return path.includes("Targets") ? table([42]) : table([0, 7]);
            },
        },
        schema,
    );
    await tables.load(["Targets", "Links"]);
    expect(paths[0]).toBe(`Data/${game === "poe2" ? "Balance/" : ""}Targets.datc64`);
    expect(tables.rows("Links")[0]?.ref("Target")?.number("Id")).toBe(42);
    expect(() => tables.rows("Links")[1]?.ref("Target")).toThrow("unresolved Targets");
    schema.tables[0]!.columns[0]!.type = "i32";
    await expect(
        new Tables(game, { get: async () => table([42]) }, schema).load(["Targets"]),
    ).rejects.toThrow("schema row size");
});

it("rejects unsupported schemas and malformed DAT files", async () => {
    const source = { get: async () => Buffer.alloc(10) };
    expect(() => new Tables("poe1", source, { version: 9, tables: [] })).toThrow(
        "Unsupported DAT schema",
    );
    const tables = new Tables("poe1", source, {
        version: 8,
        tables: [{ name: "Broken", validFor: 1, columns: [] }],
    });
    await expect(tables.load(["Broken"])).rejects.toThrow("Invalid file size");
});

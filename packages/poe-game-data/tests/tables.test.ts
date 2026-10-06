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

it("reads unnamed boolean columns by index and rejects changed schema contracts", async () => {
    const bytes = Buffer.alloc(4 + 2 * 9 + 8);
    bytes.writeUInt32LE(2);
    bytes.writeBigUInt64LE(42n, 4);
    bytes.writeUInt8(1, 12);
    bytes.writeBigUInt64LE(99n, 13);
    bytes.fill(0xbb, bytes.length - 8);
    const columns = [
        { name: "Id", type: "u64", array: false, interval: false, references: null },
        { name: null, type: "bool", array: false, interval: false, references: null },
    ];
    const load = async () => {
        const tables = new Tables(
            "poe2",
            { get: async () => bytes },
            {
                version: 8,
                tables: [{ name: "Conversions", validFor: 2, columns }],
            },
        );
        await tables.load(["Conversions"]);
        return tables.rows("Conversions");
    };
    const rows = await load();
    expect(rows.map((row) => row.unnamedBoolean(1))).toEqual([true, false]);
    expect(rows[1]!.number("Id")).toBe(99);
    expect(() => rows[0]!.unnamedBoolean(0)).toThrow("not an unnamed scalar boolean");
    expect(() => rows[0]!.unnamedBoolean(2)).toThrow("not an unnamed scalar boolean");
    columns[1]!.name = "NamedFlag";
    const named = await load();
    expect(named[0]!.boolean("NamedFlag")).toBe(true);
    expect(() => named[0]!.unnamedBoolean(1)).toThrow("not an unnamed scalar boolean");
    columns[1]!.name = null;
    columns[1]!.type = "u8";
    const changed = await load();
    expect(() => changed[0]!.unnamedBoolean(1)).toThrow("not an unnamed scalar boolean");
});

it("reads unnamed i32 columns and rejects named or retyped socket-count fields", async () => {
    const bytes = Buffer.alloc(4 + 2 * 12 + 8);
    bytes.writeUInt32LE(2);
    bytes.writeBigUInt64LE(42n, 4);
    bytes.writeInt32LE(1, 12);
    bytes.writeBigUInt64LE(99n, 16);
    bytes.writeInt32LE(3, 24);
    bytes.fill(0xbb, bytes.length - 8);
    const columns = [
        { name: "Id", type: "u64", array: false, interval: false, references: null },
        { name: null, type: "i32", array: false, interval: false, references: null },
    ];
    const load = async () => {
        const tables = new Tables(
            "poe2",
            { get: async () => bytes },
            {
                version: 8,
                tables: [{ name: "BaseItemTypes", validFor: 2, columns }],
            },
        );
        await tables.load(["BaseItemTypes"]);
        return tables.rows("BaseItemTypes");
    };
    const rows = await load();
    expect(rows.map((row) => row.unnamedInt32(1))).toEqual([1, 3]);
    expect(rows[1]!.number("Id")).toBe(99);
    expect(() => rows[0]!.unnamedInt32(0)).toThrow("not an unnamed scalar i32");
    expect(() => rows[0]!.unnamedInt32(2)).toThrow("not an unnamed scalar i32");
    columns[1]!.name = "Sockets";
    const named = await load();
    expect(named[0]!.number("Sockets")).toBe(1);
    expect(() => named[0]!.unnamedInt32(1)).toThrow("not an unnamed scalar i32");
    columns[1]!.name = null;
    columns[1]!.type = "f32";
    const changed = await load();
    expect(() => changed[0]!.unnamedInt32(1)).toThrow("not an unnamed scalar i32");
});

it("reads unnamed foreign keys without replacing their stored values with row positions", async () => {
    const bytes = Buffer.alloc(4 + 3 * 16 + 8);
    bytes.writeUInt32LE(3);
    bytes.writeBigUInt64LE(85n, 4);
    bytes.writeBigUInt64LE(1n, 20);
    bytes.writeBigUInt64LE(0xfefefefefefefefen, 36);
    bytes.fill(0xbb, bytes.length - 8);
    const columns = [
        {
            name: null as string | null,
            type: "foreignrow",
            array: false,
            interval: false,
            references: null,
        },
    ];
    const load = async () => {
        const tables = new Tables(
            "poe1",
            { get: async () => bytes },
            {
                version: 8,
                tables: [{ name: "Levels", validFor: 1, columns }],
            },
        );
        await tables.load(["Levels"]);
        return tables.rows("Levels");
    };
    const rows = await load();
    expect(rows.map((row) => row.unnamedForeignKey(0))).toEqual([85, 1, null]);
    expect(() => rows[0]!.unnamedForeignKey(1)).toThrow("not an unnamed scalar foreign key");
    columns[0]!.name = "Level";
    const named = await load();
    expect(named[0]!.number("Level")).toBe(85);
    expect(() => named[0]!.unnamedForeignKey(0)).toThrow("not an unnamed scalar foreign key");
});

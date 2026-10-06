import type { Header } from "pathofexile-dat/dat.js";
import { z } from "zod";
import type { Game } from "./config.ts";
import { getFieldReader, getHeaderLength, readDatFile } from "./dat-reader.ts";
import type { AssetSource } from "./source.ts";

export const columnSchema = z.object({
    name: z.string().nullable(),
    type: z.string(),
    array: z.boolean(),
    interval: z.boolean(),
    references: z.object({ table: z.string(), column: z.string().optional() }).nullable(),
});
export const datSchema = z.object({
    version: z.number().int(),
    tables: z.array(
        z.object({ name: z.string(), validFor: z.number().int(), columns: z.array(columnSchema) }),
    ),
});
type Column = z.infer<typeof columnSchema>;
type Schema = z.infer<typeof datSchema>;

function headerType(column: Column): Header["type"] {
    const type: Header["type"] = { array: column.array, interval: column.interval };
    if (/^[ui](8|16|32|64)$/.test(column.type))
        type.integer = { unsigned: column.type[0] === "u", size: Number(column.type.slice(1)) / 8 };
    else if (column.type === "enumrow") type.integer = { unsigned: false, size: 4 };
    else if (column.type === "f32" || column.type === "f64")
        type.decimal = { size: Number(column.type.slice(1)) / 8 };
    else if (column.type === "string") type.string = {};
    else if (column.type === "bool") type.boolean = {};
    else if (column.type === "row" || column.type === "foreignrow")
        type.key = { foreign: column.type === "foreignrow" };
    else if (column.type !== "array" || !column.array || column.name)
        throw new Error(`Unsupported schema type: ${column.type}`);
    return type;
}

export class Row {
    constructor(
        readonly table: Table,
        readonly index: number,
    ) {}
    has(name: string) {
        return this.table.columns.has(name);
    }
    value(name: string): unknown {
        const column = this.table.columns.get(name);
        if (!column) throw new Error(`${this.table.name}: missing column ${name}`);
        return column.read(this.index);
    }
    string(name: string) {
        return z.string().parse(this.value(name));
    }
    number(name: string) {
        return z.number().finite().parse(this.value(name));
    }
    boolean(name: string) {
        return z.boolean().parse(this.value(name));
    }
    unnamedBoolean(index: number) {
        const read = this.table.unnamedBooleans.get(index);
        if (!read)
            throw new Error(`${this.table.name}: column ${index} is not an unnamed scalar boolean`);
        return z.boolean().parse(read(this.index));
    }
    unnamedInt32(index: number) {
        const read = this.table.unnamedInt32s.get(index);
        if (!read)
            throw new Error(`${this.table.name}: column ${index} is not an unnamed scalar i32`);
        return z.number().int().parse(read(this.index));
    }
    unnamedForeignKey(index: number) {
        const read = this.table.unnamedForeignKeys.get(index);
        if (!read)
            throw new Error(
                `${this.table.name}: column ${index} is not an unnamed scalar foreign key`,
            );
        return z.number().int().nonnegative().nullable().parse(read(this.index));
    }
    numbers(name: string) {
        return z.array(z.number().finite()).parse(this.value(name));
    }
    strings(name: string) {
        return z.array(z.string()).parse(this.value(name));
    }
    ref(name: string): Row | null {
        return this.table.resolve(name, this.value(name));
    }
    refs(name: string): Row[] {
        return z
            .array(z.unknown())
            .parse(this.value(name))
            .map((value) => {
                const row = this.table.resolve(name, value);
                if (!row) throw new Error(`${this.table.name}.${name}: null array reference`);
                return row;
            });
    }
    id() {
        return this.string("Id");
    }
}

export class Table {
    columns = new Map<string, { schema: Column; read: (index: number) => unknown }>();
    readonly unnamedBooleans = new Map<number, (index: number) => unknown>();
    readonly unnamedInt32s = new Map<number, (index: number) => unknown>();
    readonly unnamedForeignKeys = new Map<number, (index: number) => unknown>();
    rows: Row[];
    constructor(
        readonly name: string,
        bytes: Uint8Array,
        columns: Column[],
        private tables: Tables,
    ) {
        const dat = readDatFile(".datc64", bytes);
        let offset = 0;
        for (const [index, column] of columns.entries()) {
            const header = { offset, type: headerType(column) };
            offset += getHeaderLength(header, dat);
            if (column.name) {
                if (this.columns.has(column.name))
                    throw new Error(`${name}: duplicate schema column ${column.name}`);
                this.columns.set(column.name, {
                    schema: column,
                    read: getFieldReader(header, dat),
                });
            } else if (column.type === "bool" && !column.array && !column.interval) {
                this.unnamedBooleans.set(index, getFieldReader(header, dat));
            } else if (column.type === "i32" && !column.array && !column.interval) {
                this.unnamedInt32s.set(index, getFieldReader(header, dat));
            } else if (column.type === "foreignrow" && !column.array && !column.interval) {
                this.unnamedForeignKeys.set(index, getFieldReader(header, dat));
            }
        }
        if (dat.rowCount && offset !== dat.rowLength)
            throw new Error(
                `${name}: schema row size ${offset} differs from client row size ${dat.rowLength}`,
            );
        this.rows = Array.from({ length: dat.rowCount }, (_, index) => new Row(this, index));
    }
    resolve(name: string, value: unknown): Row | null {
        if (value === null) return null;
        const relation = this.columns.get(name)?.schema.references;
        if (!relation) throw new Error(`${this.name}.${name}: missing relation schema`);
        const table = this.tables.get(relation.table);
        const row = relation.column
            ? table.rows.find((candidate) => candidate.value(relation.column ?? "Id") === value)
            : table.rows[z.number().int().nonnegative().parse(value)];
        if (!row)
            throw new Error(
                `${this.name}.${name}: unresolved ${relation.table} reference ${value}`,
            );
        return row;
    }
}

export class Tables {
    private loaded = new Map<string, Table>();
    readonly schema: Schema;
    constructor(
        readonly game: Game,
        private source: AssetSource,
        schema: unknown,
    ) {
        this.schema = datSchema.parse(schema);
        if (![7, 8].includes(this.schema.version))
            throw new Error(`Unsupported DAT schema version: ${this.schema.version}`);
    }
    async load(names: string[]): Promise<void> {
        for (const name of names) {
            if (this.loaded.has(name)) continue;
            const definition = this.schema.tables.find(
                (table) => table.name === name && table.validFor & (this.game === "poe1" ? 1 : 2),
            );
            if (!definition) throw new Error(`Missing ${this.game} schema for ${name}`);
            const bytes = await this.source.get(
                `Data/${this.game === "poe2" ? "Balance/" : ""}${name}.datc64`,
            );
            this.loaded.set(name, new Table(name, bytes, definition.columns, this));
        }
    }
    get(name: string): Table {
        const table = this.loaded.get(name);
        if (!table) throw new Error(`Table must be loaded before resolving references: ${name}`);
        return table;
    }
    rows(name: string): Row[] {
        return this.get(name).rows;
    }
}

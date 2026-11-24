import { existsSync } from "node:fs";
import { DuckDBInstance } from "@duckdb/node-api";

export interface CompactOptions {
    memoryLimit?: string;
    threads?: string;
}

export interface CompactResult {
    sourceStorage: string;
    targetStorage: string;
    tables: { name: string; rows: number }[];
}

/**
 * Copies the database at `source` into a new file at `target`, in the storage format of the
 * running DuckDB, and checks that every table holds the same rows, indexes and keys. The new file
 * holds only live rows, and DuckDB 2.0's format lets checkpoints compact tables with indexes.
 * Nothing else may have `source` open.
 */
export async function compactDatabase(
    source: string,
    target: string,
    opts: CompactOptions = {},
): Promise<CompactResult> {
    if (existsSync(target)) throw new Error(`${target} already exists.`);
    const instance = await DuckDBInstance.create(":memory:", {
        // biome-ignore lint/style/useNamingConvention: DuckDB configuration key.
        memory_limit: opts.memoryLimit ?? "4GB",
        threads: opts.threads ?? "4",
        // biome-ignore lint/style/useNamingConvention: DuckDB configuration key.
        temp_directory: `${target}.tmp`,
        // Row order carries no meaning here, and keeping it costs memory on big copies.
        // biome-ignore lint/style/useNamingConvention: DuckDB configuration key.
        preserve_insertion_order: "false",
    });
    const conn = await instance.connect();
    const rows = async <T>(sql: string) =>
        (await conn.runAndReadAll(sql)).getRowObjectsJson() as T[];
    const quote = (path: string) => `'${path.replaceAll("'", "''")}'`;
    try {
        await conn.run(`ATTACH ${quote(source)} AS src (READ_ONLY)`);
        await conn.run(`ATTACH ${quote(target)} AS fresh`);
        await conn.run("COPY FROM DATABASE src TO fresh");

        const storage = async (database: string) => {
            const [row] = await rows<{ version: string }>(
                `SELECT tags['storage_version'] AS version FROM duckdb_databases() WHERE database_name = '${database}'`,
            );
            return String(row?.version);
        };
        const schema = async (database: string) =>
            JSON.stringify(
                await rows(`SELECT
                    (SELECT list(table_name ORDER BY table_name) FROM duckdb_tables()
                        WHERE database_name = '${database}') AS tables,
                    (SELECT list(table_name || '.' || index_name ORDER BY 1) FROM duckdb_indexes()
                        WHERE database_name = '${database}') AS indexes,
                    (SELECT list(table_name || ':' || constraint_text ORDER BY 1) FROM duckdb_constraints()
                        WHERE database_name = '${database}' AND constraint_type IN ('PRIMARY KEY', 'UNIQUE')) AS keys`),
            );
        if ((await schema("src")) !== (await schema("fresh")))
            throw new Error("The copy's tables, indexes or keys differ from the source's.");

        const tables: CompactResult["tables"] = [];
        for (const { name } of await rows<{ name: string }>(
            "SELECT table_name AS name FROM duckdb_tables() WHERE database_name = 'src' ORDER BY 1",
        )) {
            // A sum of row hashes compares contents without holding either table in memory.
            const [summary] = await rows<{ a: string; b: string; n: string; m: string }>(
                `SELECT (SELECT sum(hash(t))::VARCHAR FROM src.main."${name}" t) AS a,
                    (SELECT sum(hash(t))::VARCHAR FROM fresh.main."${name}" t) AS b,
                    (SELECT count(*)::VARCHAR FROM src.main."${name}") AS n,
                    (SELECT count(*)::VARCHAR FROM fresh.main."${name}") AS m`,
            );
            if (summary?.a !== summary?.b || summary?.n !== summary?.m)
                throw new Error(
                    `${name} differs: ${summary?.n} rows in the source, ${summary?.m} in the copy.`,
                );
            tables.push({ name, rows: Number(summary?.n) });
        }
        const result = {
            sourceStorage: await storage("src"),
            targetStorage: await storage("fresh"),
            tables,
        };
        await conn.run("DETACH fresh");
        return result;
    } finally {
        conn.closeSync();
        instance.closeSync();
    }
}

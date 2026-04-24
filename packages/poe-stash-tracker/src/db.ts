import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "#src/schema.ts";

export function openDb(path = "./data.db") {
    const sqlite = new Database(path);
    sqlite.pragma("journal_mode = WAL");
    return drizzle({ client: sqlite, schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof openDb>;

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

export function openDb(path = "./data.db") {
    const sqlite = new Database(path);
    sqlite.pragma("journal_mode = WAL");
    return drizzle({ client: sqlite });
}

export type Db = ReturnType<typeof openDb>;

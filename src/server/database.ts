import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import * as schema from "./schema.js";
import { log } from "./config.js";
export function openDatabase(dataDir: string) {
  mkdirSync(join(dataDir, "database"), { recursive: true, mode: 0o700 });
  const path = join(dataDir, "database", "tracker.sqlite");
  const sqlite = new Database(path);
  chmodSync(path, 0o600);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = FULL");
  const db = drizzle(sqlite, { schema });
  try {
    migrate(db, { migrationsFolder: "./migrations" });
    log("info", "migration.success");
  } catch {
    sqlite.close();
    log("error", "migration.failed");
    throw new Error(
      "Database migration failed; data preserved. Check migration compatibility.",
    );
  }
  return { db, sqlite };
}
export type Store = ReturnType<typeof openDatabase>;

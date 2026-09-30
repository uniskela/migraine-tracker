import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import * as schema from "./schema.js";
import { log } from "./config.js";
import { toClock } from "../shared/sleep.js";
/** Convert sleep times that earlier versions stored as full timestamps to local HH:mm, deriving hours from the exact interval; a no-op once converted. */
export function upgradeSleepClockTimes(sqlite: Database.Database) {
  const rows = sqlite
    .prepare(
      `SELECT se.id, se.bedtime, se.wakeTime, se.hours, us.value AS settings
       FROM sleep_entries se LEFT JOIN user_settings us ON us.userId = se.userId
       WHERE se.bedtime LIKE '____-__-__T%' OR se.wakeTime LIKE '____-__-__T%'`,
    )
    .all() as {
    id: string;
    bedtime: string | null;
    wakeTime: string | null;
    hours: number | null;
    settings: string | null;
  }[];
  if (!rows.length) return 0;
  const update = sqlite.prepare(
    "UPDATE sleep_entries SET bedtime = ?, wakeTime = ?, hours = ? WHERE id = ?",
  );
  sqlite.transaction(() => {
    for (const row of rows) {
      let zone = "UTC";
      try {
        zone = JSON.parse(row.settings ?? "{}").timezone || zone;
      } catch {
        /* Unreadable settings fall back to UTC clock times. */
      }
      const exact =
        row.bedtime && row.wakeTime
          ? (Date.parse(row.wakeTime) - Date.parse(row.bedtime)) / 3600000
          : NaN;
      update.run(
        toClock(row.bedtime, zone),
        toClock(row.wakeTime, zone),
        exact > 0 && exact <= 24 ? Math.round(exact * 60) / 60 : row.hours,
        row.id,
      );
    }
  })();
  return rows.length;
}
/** Open the persistent SQLite store, enable integrity settings and apply versioned migrations. */
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
    const converted = upgradeSleepClockTimes(sqlite);
    if (converted) log("info", "migration.sleep_clock_times");
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

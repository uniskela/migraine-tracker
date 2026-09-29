import "dotenv/config";
import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  readdirSync,
  statSync,
  mkdtempSync,
  chmodSync,
} from "node:fs";
import { join, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import * as tar from "tar";
import { log } from "./config.js";
/** Hash file contents with SHA-256 for backup archive and database integrity checks. */
const digest = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
/** Reject databases with integrity errors, broken foreign keys or missing tracker tables. */
function verifyDatabase(path: string) {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    if (
      db.pragma("integrity_check", { simple: true }) !== "ok" ||
      (db.pragma("foreign_key_check") as unknown[]).length
    )
      throw new Error("Database integrity check failed");
    for (const table of [
      "users",
      "migraine_episodes",
      "medications",
      "__drizzle_migrations",
    ])
      if (
        !db
          .prepare("SELECT name FROM sqlite_master WHERE type = ? AND name = ?")
          .get("table", table)
      )
        throw new Error("Not a tracker database");
  } finally {
    db.close();
  }
}
/** Select expired archive names while always preserving the newest successful backup. */
export function retentionCandidates(
  files: { name: string; modified: number }[],
  days: number,
  now = Date.now(),
) {
  if (days <= 0 || !files.length) return [];
  const sorted = [...files].sort((a, b) => b.modified - a.modified);
  return sorted
    .slice(1)
    .filter((f) => f.modified < now - days * 86400000)
    .map((f) => f.name);
}
/** Create and verify an online SQLite snapshot, publish its archive atomically and apply retention. */
export async function backup(dataDir: string, retention = 30) {
  const dir = join(dataDir, "backups");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const staging = mkdtempSync(join(dir, ".backup-"));
  const filename = `migraine-tracker-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.tar.gz`;
  const target = join(dir, filename);
  try {
    const db = new Database(join(dataDir, "database", "tracker.sqlite"), {
      fileMustExist: true,
    });
    try {
      await db.backup(join(staging, "tracker.sqlite"));
    } finally {
      db.close();
    }
    verifyDatabase(join(staging, "tracker.sqlite"));
    writeFileSync(
      join(staging, "manifest.json"),
      JSON.stringify({
        format: 1,
        application: "personal-health-tracker",
        createdAt: new Date().toISOString(),
        databaseSha256: digest(join(staging, "tracker.sqlite")),
        contents: ["tracker.sqlite"],
        note: "Account settings are in the database. Deployment .env must be backed up separately using encrypted storage. No uploaded files exist in v1.",
      }),
      { mode: 0o600 },
    );
    await tar.c(
      { gzip: true, file: `${target}.partial`, cwd: staging, portable: true },
      ["manifest.json", "tracker.sqlite"],
    );
    chmodSync(`${target}.partial`, 0o600);
    renameSync(`${target}.partial`, target);
    const recordsDb = new Database(join(dataDir, "database", "tracker.sqlite"));
    try {
      recordsDb
        .prepare(
          "INSERT INTO backup_records (id, completedAt, filename, sha256) VALUES (?, ?, ?, ?)",
        )
        .run(randomUUID(), new Date().toISOString(), filename, digest(target));
    } finally {
      recordsDb.close();
    }
    const files = readdirSync(dir)
      .filter((n) => /^migraine-tracker-.*\.tar\.gz$/.test(n))
      .map((name) => ({ name, modified: statSync(join(dir, name)).mtimeMs }));
    for (const name of retentionCandidates(files, retention))
      rmSync(join(dir, name));
    log("info", "backup.success");
    return target;
  } catch (e) {
    rmSync(`${target}.partial`, { force: true });
    log("error", "backup.failed");
    throw e;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
/** Validate an archive before replacement, preserve current data and revoke restored sessions; requires stopped writers. */
export async function restore(
  dataDir: string,
  archive: string,
  confirmedStopped = false,
) {
  if (!confirmedStopped)
    throw new Error(
      "Stop the application before restore and pass --confirm-stopped",
    );
  if (!existsSync(archive) || statSync(archive).size > 2 * 1024 ** 3)
    throw new Error("Archive missing or larger than 2 GiB");
  const staging = mkdtempSync(join(tmpdir(), "tracker-restore-"));
  try {
    const names: string[] = [];
    let expanded = 0;
    let invalidMember = false;
    await tar.t({
      file: archive,
      onReadEntry: (entry) => {
        expanded += entry.size;
        if (
          !["manifest.json", "tracker.sqlite"].includes(entry.path) ||
          entry.type !== "File" ||
          names.includes(entry.path) ||
          expanded > 2 * 1024 ** 3
        )
          invalidMember = true;
        names.push(entry.path);
      },
    });
    if (invalidMember) throw new Error("Unexpected archive member");
    if (names.length !== 2) throw new Error("Incomplete backup");
    await tar.x({
      file: archive,
      cwd: staging,
      strict: true,
      noChmod: true,
      noMtime: true,
    });
    const manifest = JSON.parse(
      readFileSync(join(staging, "manifest.json"), "utf8"),
    );
    if (
      manifest.format !== 1 ||
      typeof manifest.createdAt !== "string" ||
      !Number.isFinite(Date.parse(manifest.createdAt)) ||
      manifest.application !== "personal-health-tracker" ||
      manifest.databaseSha256 !== digest(join(staging, "tracker.sqlite"))
    )
      throw new Error("Backup checksum or format invalid");
    verifyDatabase(join(staging, "tracker.sqlite"));
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const databaseDir = join(dataDir, "database");
    let safety: string | null = null;
    if (existsSync(join(databaseDir, "tracker.sqlite")))
      safety = await backup(dataDir, 0);
    // Stage on the target filesystem, then rename. Preserve the whole former database directory, including WAL.
    const replacement = mkdtempSync(join(dataDir, ".restore-"));
    writeFileSync(
      join(replacement, "tracker.sqlite"),
      readFileSync(join(staging, "tracker.sqlite")),
      { mode: 0o600 },
    );
    const restored = new Database(join(replacement, "tracker.sqlite"));
    // Never resurrect sessions or pending OIDC state from an old backup.
    try {
      restored.exec("DELETE FROM sessions; DELETE FROM oidc_states;");
      restored
        .prepare(
          "INSERT INTO backup_records (id, completedAt, filename, sha256) VALUES (?, ?, ?, ?)",
        )
        .run(
          randomUUID(),
          manifest.createdAt,
          basename(archive),
          digest(archive),
        );
    } finally {
      restored.close();
    }
    verifyDatabase(join(replacement, "tracker.sqlite"));
    const preserved = join(dataDir, `database-before-restore-${Date.now()}`);
    if (existsSync(databaseDir)) renameSync(databaseDir, preserved);
    try {
      renameSync(replacement, databaseDir);
    } catch (e) {
      if (existsSync(preserved)) renameSync(preserved, databaseDir);
      throw e;
    }
    log("info", "restore.success");
    return { safety, preserved: existsSync(preserved) ? preserved : null };
  } catch (e) {
    log("error", "restore.failed");
    throw e;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const dataDir = resolve(process.env.DATA_DIR || "./app-data");
  const command = process.argv[2];
  try {
    if (command === "backup") {
      const days = Number(process.env.BACKUP_RETENTION_DAYS || 30);
      if (!Number.isInteger(days) || days < 0)
        throw new Error("Invalid retention");
      console.log(`Backup complete: ${basename(await backup(dataDir, days))}`);
    } else if (command === "restore" && process.argv[3]) {
      await restore(
        dataDir,
        resolve(process.argv[3]),
        process.argv.includes("--confirm-stopped"),
      );
      console.log(
        "Restore complete. Integrity verified. Previous data preserved. Restart the application and sign in again.",
      );
    } else
      throw new Error(
        "Usage: operations.js backup | restore ARCHIVE --confirm-stopped",
      );
  } catch (e) {
    console.error(e instanceof Error ? e.message : "Operation failed");
    process.exitCode = 1;
  }
}

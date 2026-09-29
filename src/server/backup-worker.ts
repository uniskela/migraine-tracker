import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { backup } from "./operations.js";
import { log } from "./config.js";

const statusPath = "/tmp/backup-worker-status.json";
const deadlineGraceMs = 30 * 60000;
export type WorkerStatus = {
  result: "running" | "success" | "failed";
  nextRunAt: number;
};

/** Return the next future 03:00 UTC backup time, including across month/year boundaries. */
export function nextBackupAt(now: number): number {
  const next = new Date(now);
  next.setUTCHours(3, 0, 0, 0);
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime();
}

/** Fail health on unsuccessful attempts, invalid status or a missed scheduled run. */
export function backupWorkerHealthy(
  status: unknown,
  now = Date.now(),
): boolean {
  if (!status || typeof status !== "object") return false;
  const record = status as Partial<WorkerStatus>;
  return (
    record.result === "success" &&
    typeof record.nextRunAt === "number" &&
    Number.isFinite(record.nextRunAt) &&
    now <= record.nextRunAt + deadlineGraceMs
  );
}

/** Publish only operational status atomically; never include paths, records or credentials. */
function publishStatus(status: WorkerStatus) {
  writeFileSync(`${statusPath}.partial`, JSON.stringify(status), {
    mode: 0o600,
  });
  renameSync(`${statusPath}.partial`, statusPath);
}

/** Run a backup immediately, then daily; retain failures in health until a successful retry. */
async function runWorker() {
  const dataDir = resolve(process.env.DATA_DIR || "/app-data");
  const retention = Number(process.env.BACKUP_RETENTION_DAYS || 30);
  if (!Number.isInteger(retention) || retention < 0)
    throw new Error("Invalid backup retention");
  const stop = new AbortController();
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.on(signal, () => stop.abort());
  while (!stop.signal.aborted) {
    publishStatus({ result: "running", nextRunAt: Date.now() });
    let result: WorkerStatus["result"] = "success";
    try {
      await backup(dataDir, retention);
    } catch {
      result = "failed";
    }
    const nextRunAt = nextBackupAt(Date.now());
    publishStatus({ result, nextRunAt });
    if (stop.signal.aborted) break;
    try {
      await delay(nextRunAt - Date.now(), undefined, { signal: stop.signal });
    } catch (error) {
      if (!stop.signal.aborted) throw error;
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv[2] === "health") {
    try {
      process.exitCode = backupWorkerHealthy(
        JSON.parse(readFileSync(statusPath, "utf8")),
      )
        ? 0
        : 1;
    } catch {
      process.exitCode = 1;
    }
  } else {
    try {
      await runWorker();
    } catch {
      log("error", "backup.worker.failed");
      process.exitCode = 1;
    }
  }
}

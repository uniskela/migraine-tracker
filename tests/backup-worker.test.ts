import { expect, it } from "vitest";
import { backupWorkerHealthy, nextBackupAt } from "../src/server/backup-worker";

it("schedules the next future 03:00 UTC across year boundaries", () => {
  expect(
    new Date(nextBackupAt(Date.parse("2026-12-31T02:59:00Z"))).toISOString(),
  ).toBe("2026-12-31T03:00:00.000Z");
  expect(
    new Date(nextBackupAt(Date.parse("2026-12-31T03:00:00Z"))).toISOString(),
  ).toBe("2027-01-01T03:00:00.000Z");
});
it("marks failed, missing, invalid and overdue backups unhealthy", () => {
  const now = Date.parse("2026-09-29T04:00:00Z");
  const nextRunAt = nextBackupAt(now);
  expect(backupWorkerHealthy({ result: "success", nextRunAt }, now)).toBe(true);
  expect(backupWorkerHealthy({ result: "failed", nextRunAt }, now)).toBe(false);
  expect(backupWorkerHealthy({ result: "running", nextRunAt }, now)).toBe(
    false,
  );
  expect(backupWorkerHealthy(null, now)).toBe(false);
  expect(
    backupWorkerHealthy({ result: "success", nextRunAt: "tomorrow" }, now),
  ).toBe(false);
  expect(backupWorkerHealthy({ result: "success", nextRunAt: NaN }, now)).toBe(
    false,
  );
  expect(
    backupWorkerHealthy(
      { result: "success", nextRunAt },
      nextRunAt + 31 * 60000,
    ),
  ).toBe(false);
});

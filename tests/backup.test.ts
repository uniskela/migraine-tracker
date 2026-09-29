import { expect, it } from "vitest";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import * as tar from "tar";
import { openDatabase } from "../src/server/database";
import { backup, restore } from "../src/server/operations";
import * as s from "../src/server/schema";
import { saveEpisode } from "../src/server/repository";
import { episodeSchema } from "../src/shared/validation";
it("backs up a live WAL database, restores real records, preserves current data and revokes sessions", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tracker-backup-"));
  const store = openDatabase(dir);
  const userId = randomUUID();
  store.db
    .insert(s.users)
    .values({
      id: userId,
      username: "backup-owner",
      passwordHash: "test-hash",
      createdAt: new Date().toISOString(),
    })
    .run();
  store.db
    .insert(s.sessions)
    .values({
      tokenHash: "old-session",
      userId,
      csrf: "old-csrf",
      expiresAt: Date.now() + 100000,
    })
    .run();
  const entry = saveEpisode(
    store,
    userId,
    episodeSchema.parse({
      startedAt: "2026-01-01T10:00:00Z",
      endedAt: "2026-01-01T12:00:00Z",
      severity: 7,
      symptoms: ["Nausea"],
      factors: ["Poor sleep"],
      notes: "Original backup fixture",
      impact: 4,
      sleep: { hours: 5 },
    }),
  );
  const archive = await backup(dir, 30);
  expect(existsSync(archive)).toBe(true);
  saveEpisode(
    store,
    userId,
    { ...entry, notes: "Change after backup" },
    entry.id,
  );
  store.sqlite.close();
  try {
    await expect(restore(dir, archive)).rejects.toThrow("Stop the application");
    const result = await restore(dir, archive, true);
    expect(result.safety).toBeTruthy();
    expect(existsSync(result.preserved!)).toBe(true);
    const restored = new Database(join(dir, "database", "tracker.sqlite"));
    expect(
      restored.prepare("SELECT notes, severity FROM migraine_episodes").get(),
    ).toEqual({ notes: "Original backup fixture", severity: 7 });
    expect(restored.prepare("SELECT name FROM episode_symptoms").get()).toEqual(
      { name: "Nausea" },
    );
    expect(restored.prepare("SELECT hours FROM sleep_entries").get()).toEqual({
      hours: 5,
    });
    expect(
      restored.prepare("SELECT count(*) AS n FROM sessions").get(),
    ).toEqual({ n: 0 });
    expect(restored.pragma("integrity_check", { simple: true })).toBe("ok");
    restored.close();
    const preserved = new Database(join(result.preserved!, "tracker.sqlite"));
    expect(
      preserved.prepare("SELECT notes FROM migraine_episodes").get(),
    ).toEqual({ notes: "Change after backup" });
    preserved.close();
    const bad = join(dir, "bad.tar.gz");
    writeFileSync(bad, "invalid archive");
    await expect(restore(dir, bad, true)).rejects.toThrow();
    const evilDir = join(dir, "unsafe");
    mkdirSync(evilDir);
    writeFileSync(join(evilDir, "manifest.json"), "{}");
    symlinkSync("/etc/passwd", join(evilDir, "tracker.sqlite"));
    const evil = join(dir, "unsafe.tar.gz");
    await tar.c({ cwd: evilDir, file: evil, gzip: true }, [
      "manifest.json",
      "tracker.sqlite",
    ]);
    await expect(restore(dir, evil, true)).rejects.toThrow(
      "Unexpected archive member",
    );
    const intact = new Database(join(dir, "database", "tracker.sqlite"));
    expect(intact.prepare("SELECT notes FROM migraine_episodes").get()).toEqual(
      { notes: "Original backup fixture" },
    );
    intact.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

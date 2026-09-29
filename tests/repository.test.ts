import { expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase } from "../src/server/database";
import {
  accountData,
  listEpisodes,
  saveEpisode,
} from "../src/server/repository";
import {
  episodeSchema,
  medicationSchema,
  settingsSchema,
} from "../src/shared/validation";
import * as s from "../src/server/schema";

it("scopes episode relationships and schedules to their owner with bounded query counts", () => {
  const dir = mkdtempSync(join(tmpdir(), "tracker-repository-"));
  const store = openDatabase(dir);
  try {
    for (const userId of ["owner", "other"]) {
      store.db
        .insert(s.users)
        .values({
          id: userId,
          username: userId,
          createdAt: new Date().toISOString(),
        })
        .run();
      store.db
        .insert(s.settings)
        .values({
          userId,
          value: settingsSchema.parse({ timezone: "Australia/Sydney" }),
        })
        .run();
      store.db
        .insert(s.medications)
        .values({
          ...medicationSchema.parse({ name: userId, category: "preventive" }),
          id: userId,
          userId,
        })
        .run();
      store.db
        .insert(s.schedules)
        .values({
          id: userId,
          medicationId: userId,
          units: "mg",
          frequency: "Recorded schedule",
        })
        .run();
      saveEpisode(
        store,
        userId,
        episodeSchema.parse({
          startedAt: "2026-09-01T01:00:00Z",
          endedAt: "2026-09-01T02:00:00Z",
          symptoms: [userId],
          factors: [userId],
          impact: userId === "owner" ? 2 : 4,
          sleep: { hours: userId === "owner" ? 7 : 5 },
        }),
      );
    }
    saveEpisode(
      store,
      "owner",
      episodeSchema.parse({
        startedAt: "2026-09-02T01:00:00Z",
        endedAt: "2026-09-02T02:00:00Z",
      }),
    );
    const prepare = vi.spyOn(store.sqlite, "prepare");
    const data = accountData(store, "owner");
    const baselineQueries = prepare.mock.calls.length;
    expect(data.episodes).toHaveLength(2);
    expect(data.episodes[0]).toMatchObject({
      symptoms: [],
      factors: [],
      impact: null,
      sleep: null,
    });
    expect(data.episodes[1]).toMatchObject({
      symptoms: ["owner"],
      factors: ["owner"],
      impact: 2,
      sleep: { hours: 7 },
    });
    expect(data.schedules.map((row) => row.id)).toEqual(["owner"]);
    for (let i = 0; i < 20; i++)
      store.db
        .insert(s.schedules)
        .values({
          id: `schedule-${i}`,
          medicationId: "owner",
          units: "mg",
          frequency: "Recorded schedule",
        })
        .run();
    prepare.mockClear();
    expect(accountData(store, "owner").schedules).toHaveLength(21);
    expect(prepare.mock.calls.length).toBe(baselineQueries);
    expect(listEpisodes(store, "unknown")).toEqual([]);
    prepare.mockRestore();
  } finally {
    store.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

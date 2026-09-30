import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, upgradeSleepClockTimes } from "../src/server/database";
import {
  formatHours,
  normalizeSleep,
  sleepHours,
  toClock,
  wakeDateBefore,
} from "../src/shared/sleep";
import { sleepSchema } from "../src/shared/validation";
describe("sleep clock times", () => {
  it("calculates hours across midnight and within one day", () => {
    expect(sleepHours("23:30", "07:00")).toBe(7.5);
    expect(sleepHours("01:15", "06:45")).toBe(5.5);
    expect(sleepHours("22:00", "22:00")).toBeNull();
    expect(sleepHours(null, "07:00")).toBeNull();
    expect(sleepHours("23:00", null)).toBeNull();
    expect(sleepHours("25:00", "07:00")).toBeNull();
  });
  it("accounts for daylight-saving nights when the wake date is known", () => {
    // Sydney clocks moved forward at 02:00 on 4 October 2026.
    expect(sleepHours("22:00", "07:00", "2026-10-04", "Australia/Sydney")).toBe(
      8,
    );
    // Sydney clocks moved back at 03:00 on 5 April 2026.
    expect(sleepHours("22:00", "07:00", "2026-04-05", "Australia/Sydney")).toBe(
      10,
    );
    expect(sleepHours("22:00", "07:00", "2026-06-01", "Australia/Sydney")).toBe(
      9,
    );
  });
  it("converts legacy timestamps to local clock times", () => {
    expect(toClock("2026-09-20T12:30:00.000Z", "Australia/Sydney")).toBe(
      "22:30",
    );
    expect(toClock("06:45", "Australia/Sydney")).toBe("06:45");
    expect(toClock(null, "UTC")).toBeNull();
  });
  it("finds the waking before an episode", () => {
    const zone = "Australia/Sydney";
    // 10:00 local on 21 September.
    const start = "2026-09-21T00:00:00Z";
    expect(wakeDateBefore(start, "07:00", zone)).toBe("2026-09-21");
    expect(wakeDateBefore(start, "11:00", zone)).toBe("2026-09-20");
  });
  it("derives hours from times, keeps estimates without times and drops empty records", () => {
    const base = sleepSchema.parse({});
    expect(normalizeSleep(base, "UTC")).toBeNull();
    expect(
      normalizeSleep(
        { ...base, bedtime: "23:00", wakeTime: "06:00", hours: 3 },
        "UTC",
      )?.hours,
    ).toBe(7);
    expect(
      normalizeSleep({ ...base, bedtime: "23:00", hours: 6.5 }, "UTC")?.hours,
    ).toBe(6.5);
    expect(normalizeSleep({ ...base, quality: 2 }, "UTC")?.quality).toBe(2);
  });
  it("formats durations compactly", () => {
    expect(formatHours(7.5)).toBe("7h 30m");
    expect(formatHours(8)).toBe("8h");
    expect(formatHours(0.25)).toBe("15m");
  });
  it("rejects malformed times but accepts legacy timestamps", () => {
    expect(sleepSchema.safeParse({ bedtime: "7pm" }).success).toBe(false);
    expect(sleepSchema.safeParse({ bedtime: "19:00" }).success).toBe(true);
    expect(
      sleepSchema.safeParse({ bedtime: "2026-09-20T12:30:00Z" }).success,
    ).toBe(true);
  });
});
describe("database upgrade", () => {
  it("converts stored timestamps once and derives exact hours", () => {
    const dir = mkdtempSync(join(tmpdir(), "tracker-sleep-"));
    const store = openDatabase(dir);
    try {
      const { sqlite } = store;
      sqlite
        .prepare(
          "INSERT INTO users (id, username, createdAt) VALUES ('u1', 'owner', '2026-01-01')",
        )
        .run();
      sqlite
        .prepare("INSERT INTO user_settings (userId, value) VALUES ('u1', ?)")
        .run(JSON.stringify({ timezone: "Australia/Sydney" }));
      const insert = sqlite.prepare(
        "INSERT INTO sleep_entries (id, userId, day, bedtime, wakeTime, hours, unusual, wokeDuringNight) VALUES (?, 'u1', '2026-09-21', ?, ?, ?, 0, 0)",
      );
      insert.run(
        "legacy",
        "2026-09-20T12:30:00.000Z",
        "2026-09-20T20:00:00.000Z",
        5,
      );
      insert.run("estimate", null, null, 6);
      expect(upgradeSleepClockTimes(sqlite)).toBe(1);
      expect(upgradeSleepClockTimes(sqlite)).toBe(0);
      const rows = sqlite
        .prepare(
          "SELECT id, bedtime, wakeTime, hours FROM sleep_entries ORDER BY id",
        )
        .all();
      expect(rows).toEqual([
        { id: "estimate", bedtime: null, wakeTime: null, hours: 6 },
        { id: "legacy", bedtime: "22:30", wakeTime: "06:00", hours: 7.5 },
      ]);
    } finally {
      store.sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

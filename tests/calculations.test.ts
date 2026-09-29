import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  episodeSchema,
  medicationSchema,
  settingsSchema,
} from "../src/shared/validation";
import {
  change,
  comparison,
  episodeDays,
  periodDays,
  previousPeriod,
  summary,
} from "../src/shared/stats";
import { retentionCandidates } from "../src/server/operations";
import { csv } from "../src/server/reports";
const episode = (input: Record<string, unknown>) => ({
  ...episodeSchema.parse(input),
  id: randomUUID(),
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});
describe("calendar and duration calculations", () => {
  it("counts every local day crossed and deduplicates overlapping days", () => {
    const e = episode({
      startedAt: "2026-01-01T12:00:00Z",
      endedAt: "2026-01-01T15:00:00Z",
      severity: 6,
      impact: 3,
    });
    expect(episodeDays(e, "Australia/Sydney")).toEqual([
      "2026-01-01",
      "2026-01-02",
    ]);
    const s = summary(
      [e, { ...e, id: randomUUID() }],
      [],
      [],
      { from: "2026-01-01", to: "2026-01-02" },
      "Australia/Sydney",
    );
    expect(s.migraineDays).toBe(2);
    expect(s.impactedDays).toBe(2);
    expect(s.episodes).toBe(2);
  });
  it("handles daylight saving without treating a local day as 24 hours", () => {
    const e = episode({
      startedAt: "2026-04-04T13:00:00Z",
      endedAt: "2026-04-05T14:00:00Z",
    });
    const s = summary(
      [e],
      [],
      [],
      { from: "2026-04-05", to: "2026-04-05" },
      "Australia/Sydney",
    );
    expect(s.migraineDays).toBe(1);
    expect(s.totalHours).toBe(25);
    expect(s.averageDuration).toBe(25);
  });
  it("clips boundary episodes and excludes partial/ongoing episodes from duration average", () => {
    const e = episode({
      startedAt: "2026-01-01T23:00:00Z",
      endedAt: "2026-01-02T03:00:00Z",
    });
    const s = summary(
      [e],
      [],
      [],
      { from: "2026-01-02", to: "2026-01-02" },
      "UTC",
    );
    expect(s.totalHours).toBe(3);
    expect(s.averageDuration).toBeNull();
    expect(s.averageSeverity).toBeNull();
  });
  it("does not count a midnight end against the following day", () => {
    const e = episode({
      startedAt: "2026-01-01T23:00:00Z",
      endedAt: "2026-01-02T00:00:00Z",
    });
    expect(episodeDays(e, "UTC")).toEqual(["2026-01-01"]);
  });
  it("handles leap years and equivalent previous periods", () => {
    expect(periodDays({ from: "2024-02-01", to: "2024-02-29" })).toBe(29);
    expect(previousPeriod({ from: "2026-01-01", to: "2026-01-30" })).toEqual({
      from: "2025-12-02",
      to: "2025-12-31",
    });
    expect(change(8, 12)).toBeCloseTo(-33.333);
    expect(change(2, 0)).toBeNull();
  });
  it("normalizes medication comparison exposure and separates acute/preventive doses", () => {
    const med = {
      ...medicationSchema.parse({ name: "Example", category: "acute" }),
      id: randomUUID(),
    };
    const e = episode({
      startedAt: "2026-01-03T00:00:00Z",
      endedAt: "2026-01-03T02:00:00Z",
      severity: 4,
    });
    const c = comparison(
      [e],
      [],
      [med],
      { from: "2026-01-01", to: "2026-01-10" },
      { from: "2026-02-01", to: "2026-02-20" },
      "UTC",
    );
    expect(c.before.migraineDaysPer30).toBe(3);
    expect(c.before.migraineHoursPer30).toBe(6);
    expect(c.after.averageSeverity).toBeNull();
  });
});
describe("validation and export safety", () => {
  it("rejects reversed dates, invalid scores, unknown timezones and future starts", () => {
    expect(
      episodeSchema.safeParse({
        startedAt: "2026-01-02T00:00:00Z",
        endedAt: "2026-01-01T00:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      episodeSchema.safeParse({
        startedAt: "2026-01-01T00:00:00Z",
        severity: 11,
      }).success,
    ).toBe(false);
    expect(
      episodeSchema.safeParse({ startedAt: "2099-01-01T00:00:00Z" }).success,
    ).toBe(false);
    expect(settingsSchema.safeParse({ timezone: "Unknown/Zone" }).success).toBe(
      false,
    );
  });
  it("escapes quotes and neutralizes spreadsheet formula injection", () => {
    const output = csv([["=HYPERLINK(1)", "a,b", 'a"b', "  @SUM(1)"]]);
    expect(output).toContain("'=HYPERLINK(1)");
    expect(output).toContain('"a,b"');
    expect(output).toContain('a""b');
    expect(output).toContain("'  @SUM(1)");
  });
  it("never removes newest backup even if all backups are old", () => {
    expect(
      retentionCandidates(
        [
          { name: "old", modified: 0 },
          { name: "newest", modified: 1 },
        ],
        1,
        999999999,
      ),
    ).toEqual(["old"]);
    expect(
      retentionCandidates([{ name: "old", modified: 0 }], 1, 999999999),
    ).toEqual([]);
    expect(retentionCandidates([{ name: "old", modified: 0 }], 0)).toEqual([]);
  });
});

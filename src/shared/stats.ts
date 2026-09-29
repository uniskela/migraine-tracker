import { DateTime } from "luxon";
import type { Dose, Episode, Medication } from "./validation.js";
export type Period = { from: string; to: string };
/** Convert inclusive local calendar dates into a half-open UTC millisecond interval. */
export function bounds(period: Period, zone: string) {
  return {
    start: DateTime.fromISO(period.from, { zone }).startOf("day").toMillis(),
    end: DateTime.fromISO(period.to, { zone })
      .plus({ days: 1 })
      .startOf("day")
      .toMillis(),
  };
}
/** Count inclusive calendar days independently of daylight-saving transitions. */
export function periodDays(period: Period) {
  return (
    Math.round(
      DateTime.fromISO(period.to, { zone: "UTC" }).diff(
        DateTime.fromISO(period.from, { zone: "UTC" }),
        "days",
      ).days,
    ) + 1
  );
}
/** Return the immediately preceding period with the same number of calendar days. */
export function previousPeriod(period: Period): Period {
  const end = DateTime.fromISO(period.from).minus({ days: 1 });
  return {
    from: end.minus({ days: periodDays(period) - 1 }).toISODate()!,
    to: end.toISODate()!,
  };
}
/** List local dates touched by an episode, clipped to the period and excluding an end at midnight. */
export function episodeDays(
  episode: Episode,
  zone: string,
  period?: Period,
  now = Date.now(),
): string[] {
  const b = period ? bounds(period, zone) : { start: -Infinity, end: Infinity };
  const start = Math.max(Date.parse(episode.startedAt), b.start);
  const end = Math.min(
    episode.endedAt ? Date.parse(episode.endedAt) : now,
    b.end,
  );
  if (
    end < start ||
    start >= b.end ||
    end < b.start ||
    (end === b.start && Date.parse(episode.startedAt) < b.start)
  )
    return [];
  const days: string[] = [];
  const last = DateTime.fromMillis(Math.max(start, end - 1), { zone }).startOf(
    "day",
  );
  for (
    let day = DateTime.fromMillis(start, { zone }).startOf("day");
    day <= last && days.length < 10000;
    day = day.plus({ days: 1 })
  )
    days.push(day.toISODate()!);
  return days;
}
/** Test episode overlap with local date bounds; ongoing episodes extend through now. */
export function inPeriod(
  episode: Episode,
  period: Period,
  zone: string,
  now = Date.now(),
) {
  const { start, end } = bounds(period, zone);
  return (
    Date.parse(episode.startedAt) < end &&
    (episode.endedAt
      ? Date.parse(episode.endedAt) > start ||
        Date.parse(episode.startedAt) === start
      : now >= start)
  );
}
/** Return the arithmetic mean, or null when no observations were recorded. */
const average = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
/** Aggregate recorded episodes and acute doses; clip hours to the period and average only wholly completed durations. */
export function summary(
  episodes: Episode[],
  doses: Dose[],
  medications: Medication[],
  period: Period,
  zone: string,
  now = Date.now(),
) {
  const b = bounds(period, zone);
  const selected = episodes.filter((e) => inPeriod(e, period, zone, now));
  const acute = new Set(
    medications.filter((m) => m.category === "acute").map((m) => m.id),
  );
  const taken = doses.filter(
    (d) =>
      acute.has(d.medicationId) &&
      Date.parse(d.takenAt) >= b.start &&
      Date.parse(d.takenAt) < b.end,
  );
  const hours = selected.map(
    (e) =>
      Math.max(
        0,
        Math.min(e.endedAt ? Date.parse(e.endedAt) : now, b.end) -
          Math.max(Date.parse(e.startedAt), b.start),
      ) / 3600000,
  );
  const completed = selected.filter(
    (e) =>
      e.endedAt &&
      Date.parse(e.startedAt) >= b.start &&
      Date.parse(e.endedAt) <= b.end,
  );
  return {
    migraineDays: new Set(
      selected.flatMap((e) => episodeDays(e, zone, period, now)),
    ).size,
    episodes: selected.length,
    averageSeverity: average(
      selected.flatMap((e) => (e.severity === null ? [] : [e.severity])),
    ),
    severityRecorded: selected.filter((e) => e.severity !== null).length,
    averageDuration: average(
      completed.map(
        (e) => (Date.parse(e.endedAt!) - Date.parse(e.startedAt)) / 3600000,
      ),
    ),
    completedEpisodes: completed.length,
    totalHours: hours.reduce((a, b) => a + b, 0),
    impactedDays: new Set(
      selected
        .filter((e) => e.impact !== null && e.impact >= 3)
        .flatMap((e) => episodeDays(e, zone, period, now)),
    ).size,
    averageImpact: average(
      selected.flatMap((e) => (e.impact === null ? [] : [e.impact])),
    ),
    acuteDays: new Set(
      taken.map((d) => DateTime.fromISO(d.takenAt).setZone(zone).toISODate()),
    ).size,
    acuteDoses: taken.length,
    ongoing: selected.filter((e) => !e.endedAt).length,
    periodDays: periodDays(period),
  };
}
export type Summary = ReturnType<typeof summary>;
/** Calculate percentage change, returning null when the prior value is zero. */
export function change(current: number, previous: number) {
  return previous === 0 ? null : ((current - previous) / previous) * 100;
}
/** Count each symptom or associated factor once per episode and sort by frequency. */
export function frequencies(
  episodes: Episode[],
  field: "symptoms" | "factors",
) {
  const counts = new Map<string, number>();
  for (const episode of episodes)
    for (const name of new Set(episode[field]))
      counts.set(name, (counts.get(name) || 0) + 1);
  return [...counts]
    .map(([name, count]) => ({
      name,
      count,
      percentage: episodes.length ? (count / episodes.length) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}
/** Compare observed periods with day and hour counts normalized to 30 calendar days. */
export function comparison(
  episodes: Episode[],
  doses: Dose[],
  medications: Medication[],
  before: Period,
  after: Period,
  zone: string,
) {
  /** Normalize count metrics for unequal period lengths without inferring medication effects. */
  const normalize = (s: Summary) => ({
    ...s,
    migraineDaysPer30: (s.migraineDays / s.periodDays) * 30,
    migraineHoursPer30: (s.totalHours / s.periodDays) * 30,
    impactDaysPer30: (s.impactedDays / s.periodDays) * 30,
    acuteDaysPer30: (s.acuteDays / s.periodDays) * 30,
  });
  return {
    before: normalize(summary(episodes, doses, medications, before, zone)),
    after: normalize(summary(episodes, doses, medications, after, zone)),
  };
}
/** Format elapsed time in minutes and hours, using now for an ongoing episode. */
export function duration(start: string, end: string | null, now = Date.now()) {
  const mins = Math.max(
    0,
    Math.floor(((end ? Date.parse(end) : now) - Date.parse(start)) / 60000),
  );
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

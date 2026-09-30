import { DateTime } from "luxon";
/** A wall-clock time such as 23:30, without a date. */
export const clockPattern = /^([01]\d|2[0-3]):[0-5]\d$/;
export type SleepRecord = {
  bedtime: string | null;
  wakeTime: string | null;
  hours: number | null;
  quality: number | null;
  unusual: boolean;
  wokeDuringNight: boolean;
};
export const emptySleep: SleepRecord = {
  bedtime: null,
  wakeTime: null,
  hours: null,
  quality: null,
  unusual: false,
  wokeDuringNight: false,
};
export const sleepQualities = [
  "Very poor",
  "Poor",
  "Okay",
  "Good",
  "Very good",
] as const;
/** Calculate hours slept from bedtime to the next wake time, crossing midnight when needed; a wake date and timezone account for daylight-saving nights. */
export function sleepHours(
  bedtime: string | null,
  wakeTime: string | null,
  wakeDate?: string,
  zone?: string,
): number | null {
  if (
    !bedtime ||
    !wakeTime ||
    !clockPattern.test(bedtime) ||
    !clockPattern.test(wakeTime) ||
    bedtime === wakeTime
  )
    return null;
  if (wakeDate && zone) {
    const wake = DateTime.fromISO(`${wakeDate}T${wakeTime}`, { zone });
    let bed = DateTime.fromISO(`${wakeDate}T${bedtime}`, { zone });
    if (bed >= wake) bed = bed.minus({ days: 1 });
    if (wake.isValid && bed.isValid)
      return Math.round(wake.diff(bed, "minutes").minutes) / 60;
  }
  const minutes = (clock: string) =>
    Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
  return ((minutes(wakeTime) - minutes(bedtime) + 1440) % 1440) / 60;
}
/** Convert a stored clock time, or a legacy full timestamp, to local HH:mm. */
export function toClock(value: string | null, zone: string): string | null {
  if (!value) return null;
  if (clockPattern.test(value)) return value;
  const time = DateTime.fromISO(value, { setZone: true });
  return time.isValid ? time.setZone(zone).toFormat("HH:mm") : null;
}
/** Local date of the waking before an episode: the start date, or the day before when the wake time is later in the day than the start. */
export function wakeDateBefore(
  startedAt: string,
  wakeTime: string,
  zone: string,
) {
  const start = DateTime.fromISO(startedAt).setZone(zone);
  return (
    wakeTime > start.toFormat("HH:mm") ? start.minus({ days: 1 }) : start
  ).toISODate()!;
}
/** Store clock times, derive hours whenever both times exist and drop sleep records with nothing recorded. */
export function normalizeSleep(
  sleep: SleepRecord | null,
  zone: string,
  wakeDate?: string | ((wakeTime: string) => string),
): SleepRecord | null {
  if (!sleep) return null;
  const bedtime = toClock(sleep.bedtime, zone);
  const wakeTime = toClock(sleep.wakeTime, zone);
  const date =
    typeof wakeDate === "function" && wakeTime ? wakeDate(wakeTime) : wakeDate;
  const calculated = sleepHours(
    bedtime,
    wakeTime,
    typeof date === "string" ? date : undefined,
    zone,
  );
  const result = {
    ...sleep,
    bedtime,
    wakeTime,
    hours: calculated ?? sleep.hours,
  };
  return result.bedtime === null &&
    result.wakeTime === null &&
    result.hours === null &&
    result.quality === null &&
    !result.unusual &&
    !result.wokeDuringNight
    ? null
    : result;
}
/** Format fractional hours as a compact duration, such as 7h 30m. */
export function formatHours(hours: number) {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60),
    m = total % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}

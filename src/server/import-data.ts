import "dotenv/config";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { openDatabase, type Store } from "./database.js";
import * as s from "./schema.js";
import { saveEpisode } from "./repository.js";
import { normalizeSleep } from "../shared/sleep.js";
import {
  dailySchema,
  doseSchema,
  effectSchema,
  episodeSchema,
  medicationSchema,
  settingsSchema,
  weightSchema,
} from "../shared/validation.js";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const id = z.object({ id: z.uuid() });
const schema = z.object({
  format: z.literal("migraine-tracker"),
  version: z.literal(1),
  settings: settingsSchema,
  episodes: z.array(z.intersection(id, episodeSchema)).max(100000),
  medications: z.array(z.intersection(id, medicationSchema)).max(10000),
  doses: z.array(z.intersection(id, doseSchema)).max(100000),
  effects: z.array(z.intersection(id, effectSchema)).max(100000),
  weights: z.array(z.intersection(id, weightSchema)).max(100000),
  daily: z.array(z.intersection(id, dailySchema)).max(100000),
  schedules: z
    .array(
      z.object({
        id: z.uuid(),
        medicationId: z.uuid(),
        startDate: z.string().nullable(),
        endDate: z.string().nullable(),
        dose: z.number().nullable(),
        units: z.string().max(30),
        frequency: z.string().max(120),
      }),
    )
    .default([]),
});
/** Validate and atomically import into an empty owner journal while preserving authentication records. */
export function importData(store: Store, raw: unknown) {
  const data = schema.parse(raw);
  const user = store.db.select().from(s.users).get();
  if (!user) throw new Error("Finish account setup before importing.");
  for (const table of [
    s.episodes,
    s.medications,
    s.doses,
    s.effects,
    s.weights,
    s.daily,
  ])
    if (store.db.select().from(table).get())
      throw new Error(
        "Import requires an empty journal; existing records will never be overwritten.",
      );
  const meds = new Set(data.medications.map((m) => m.id)),
    episodes = new Set(data.episodes.map((e) => e.id));
  if (
    data.doses.some(
      (d) =>
        !meds.has(d.medicationId) ||
        (d.episodeId && !episodes.has(d.episodeId)),
    ) ||
    data.effects.some((e) => !meds.has(e.medicationId)) ||
    data.schedules.some((e) => !meds.has(e.medicationId))
  )
    throw new Error("Export contains broken references.");
  store.db.transaction((tx) => {
    tx.update(s.settings)
      .set({ value: data.settings })
      .where(eq(s.settings.userId, user.id))
      .run();
    for (const m of data.medications)
      tx.insert(s.medications)
        .values({ ...m, userId: user.id })
        .run();
    for (const e of data.episodes) saveEpisode(store, user.id, e, e.id);
    for (const d of data.doses)
      tx.insert(s.doses)
        .values({ ...d, userId: user.id })
        .run();
    for (const e of data.effects)
      tx.insert(s.effects)
        .values({ ...e, userId: user.id })
        .run();
    for (const w of data.weights)
      tx.insert(s.weights)
        .values({ ...w, userId: user.id })
        .run();
    for (const row of data.daily) {
      const { sleep: _sleep, ...day } = row;
      const sleep = normalizeSleep(row.sleep, data.settings.timezone, row.date);
      tx.insert(s.daily)
        .values({ ...day, userId: user.id })
        .run();
      if (sleep)
        tx.insert(s.sleep)
          .values({
            ...sleep,
            id: randomUUID(),
            userId: user.id,
            day: row.date,
          })
          .run();
    }
    for (const schedule of data.schedules)
      tx.insert(s.schedules).values(schedule).run();
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (!process.argv[2]) {
    console.error("Usage: import-data.js FILE.json (empty journal only)");
    process.exit(1);
  }
  const store = openDatabase(resolve(process.env.DATA_DIR || "./app-data"));
  try {
    importData(store, JSON.parse(readFileSync(process.argv[2], "utf8")));
    console.log("Import completed and references validated.");
  } catch {
    console.error(
      "Import failed. Ensure a valid version 1 full JSON export and an empty initialized journal. No partial import was retained.",
    );
    process.exitCode = 1;
  } finally {
    store.sqlite.close();
  }
}

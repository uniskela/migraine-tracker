import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Store } from "./database.js";
import * as s from "./schema.js";
import type { Episode, EpisodeInput } from "../shared/validation.js";
export function listEpisodes(store: Store, userId: string): Episode[] {
  const rows = store.db
    .select()
    .from(s.episodes)
    .where(eq(s.episodes.userId, userId))
    .all();
  const ids = new Set(rows.map((e) => e.id));
  const symptoms = store.db
    .select()
    .from(s.episodeSymptoms)
    .all()
    .filter((v) => ids.has(v.episodeId));
  const factors = store.db
    .select()
    .from(s.episodeFactors)
    .all()
    .filter((v) => ids.has(v.episodeId));
  const impacts = store.db
    .select()
    .from(s.impacts)
    .all()
    .filter((v) => ids.has(v.episodeId));
  const sleep = store.db
    .select()
    .from(s.sleep)
    .where(eq(s.sleep.userId, userId))
    .all();
  return rows
    .map(({ userId: _userId, ...e }) => {
      const impact = impacts.find((i) => i.episodeId === e.id);
      const rest = sleep.find((i) => i.episodeId === e.id);
      return {
        ...e,
        side: e.side as Episode["side"],
        symptoms: symptoms
          .filter((v) => v.episodeId === e.id)
          .map((v) => v.name),
        factors: factors.filter((v) => v.episodeId === e.id).map((v) => v.name),
        impact: impact?.score ?? null,
        disruptions: impact?.disruptions ?? [],
        sleep: rest
          ? {
              bedtime: rest.bedtime,
              wakeTime: rest.wakeTime,
              hours: rest.hours,
              quality: rest.quality,
              unusual: rest.unusual,
              wokeDuringNight: rest.wokeDuringNight,
            }
          : null,
      };
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
export function saveEpisode(
  store: Store,
  userId: string,
  input: EpisodeInput,
  id: string = randomUUID(),
) {
  const { symptoms, factors, impact, disruptions, sleep, ...values } = input;
  const now = new Date().toISOString();
  store.db.transaction((tx) => {
    const existing = tx
      .select()
      .from(s.episodes)
      .where(eq(s.episodes.id, id))
      .get();
    if (existing && existing.userId !== userId)
      throw new Error("Ownership violation");
    if (existing)
      tx.update(s.episodes)
        .set({ ...values, updatedAt: now })
        .where(and(eq(s.episodes.id, id), eq(s.episodes.userId, userId)))
        .run();
    else
      tx.insert(s.episodes)
        .values({ ...values, id, userId, createdAt: now, updatedAt: now })
        .run();
    tx.delete(s.episodeSymptoms)
      .where(eq(s.episodeSymptoms.episodeId, id))
      .run();
    tx.delete(s.episodeFactors).where(eq(s.episodeFactors.episodeId, id)).run();
    for (const name of symptoms) {
      tx.insert(s.symptoms).values({ name }).onConflictDoNothing().run();
      tx.insert(s.episodeSymptoms).values({ episodeId: id, name }).run();
    }
    for (const name of factors) {
      tx.insert(s.factors).values({ name }).onConflictDoNothing().run();
      tx.insert(s.episodeFactors).values({ episodeId: id, name }).run();
    }
    tx.insert(s.impacts)
      .values({ episodeId: id, score: impact, disruptions })
      .onConflictDoUpdate({
        target: s.impacts.episodeId,
        set: { score: impact, disruptions },
      })
      .run();
    tx.delete(s.sleep).where(eq(s.sleep.episodeId, id)).run();
    if (sleep)
      tx.insert(s.sleep)
        .values({ ...sleep, id: randomUUID(), userId, episodeId: id })
        .run();
  });
  return listEpisodes(store, userId).find((e) => e.id === id)!;
}
export function accountData(store: Store, userId: string) {
  const { db } = store;
  const rests = db
    .select()
    .from(s.sleep)
    .where(eq(s.sleep.userId, userId))
    .all();
  return {
    episodes: listEpisodes(store, userId),
    medications: db
      .select()
      .from(s.medications)
      .where(eq(s.medications.userId, userId))
      .all()
      .map(({ userId: _, ...v }) => v),
    doses: db
      .select()
      .from(s.doses)
      .where(eq(s.doses.userId, userId))
      .all()
      .map(({ userId: _, ...v }) => v),
    effects: db
      .select()
      .from(s.effects)
      .where(eq(s.effects.userId, userId))
      .all()
      .map(({ userId: _, ...v }) => v),
    weights: db
      .select()
      .from(s.weights)
      .where(eq(s.weights.userId, userId))
      .all()
      .map(({ userId: _, ...v }) => v),
    daily: db
      .select()
      .from(s.daily)
      .where(eq(s.daily.userId, userId))
      .all()
      .map(({ userId: _, ...v }) => {
        const rest = rests.find((r) => r.day === v.date && !r.episodeId);
        return {
          ...v,
          sleep: rest
            ? {
                bedtime: rest.bedtime,
                wakeTime: rest.wakeTime,
                hours: rest.hours,
                quality: rest.quality,
                unusual: rest.unusual,
                wokeDuringNight: rest.wokeDuringNight,
              }
            : null,
        };
      }),
    schedules: db
      .select()
      .from(s.schedules)
      .all()
      .filter((v) =>
        db
          .select()
          .from(s.medications)
          .where(
            and(
              eq(s.medications.id, v.medicationId),
              eq(s.medications.userId, userId),
            ),
          )
          .get(),
      ),
    settings: db
      .select()
      .from(s.settings)
      .where(eq(s.settings.userId, userId))
      .get()!.value,
  };
}
export type AccountData = ReturnType<typeof accountData>;

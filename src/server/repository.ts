import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Store } from "./database.js";
import * as s from "./schema.js";
import type { Episode, EpisodeInput } from "../shared/validation.js";
/** Load one account’s episodes with their symptoms, factors, impact and sleep records. */
export function listEpisodes(store: Store, userId: string): Episode[] {
  const rows = store.db
    .select()
    .from(s.episodes)
    .where(eq(s.episodes.userId, userId))
    .all();
  const symptoms = store.db
    .select({
      episodeId: s.episodeSymptoms.episodeId,
      name: s.episodeSymptoms.name,
    })
    .from(s.episodeSymptoms)
    .innerJoin(s.episodes, eq(s.episodeSymptoms.episodeId, s.episodes.id))
    .where(eq(s.episodes.userId, userId))
    .all();
  const factors = store.db
    .select({
      episodeId: s.episodeFactors.episodeId,
      name: s.episodeFactors.name,
    })
    .from(s.episodeFactors)
    .innerJoin(s.episodes, eq(s.episodeFactors.episodeId, s.episodes.id))
    .where(eq(s.episodes.userId, userId))
    .all();
  const impacts = store.db
    .select({ impact: s.impacts })
    .from(s.impacts)
    .innerJoin(s.episodes, eq(s.impacts.episodeId, s.episodes.id))
    .where(eq(s.episodes.userId, userId))
    .all();
  const sleep = store.db
    .select()
    .from(s.sleep)
    .where(eq(s.sleep.userId, userId))
    .all();
  const symptomsByEpisode = new Map<string, string[]>();
  const factorsByEpisode = new Map<string, string[]>();
  for (const row of symptoms) {
    const names = symptomsByEpisode.get(row.episodeId) ?? [];
    names.push(row.name);
    symptomsByEpisode.set(row.episodeId, names);
  }
  for (const row of factors) {
    const names = factorsByEpisode.get(row.episodeId) ?? [];
    names.push(row.name);
    factorsByEpisode.set(row.episodeId, names);
  }
  const impactsByEpisode = new Map(
    impacts.map(({ impact }) => [impact.episodeId, impact]),
  );
  const sleepByEpisode = new Map(
    sleep.filter((r) => r.episodeId).map((r) => [r.episodeId, r]),
  );
  return rows
    .map(({ userId: _userId, ...e }) => {
      const impact = impactsByEpisode.get(e.id);
      const rest = sleepByEpisode.get(e.id);
      return {
        ...e,
        side: e.side as Episode["side"],
        symptoms: symptomsByEpisode.get(e.id) ?? [],
        factors: factorsByEpisode.get(e.id) ?? [],
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
/** Persist a validated episode and replace its related records in one transaction. */
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
/** Collect account-owned journal data and settings without exporting authentication credentials. */
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
      .select({ schedule: s.schedules })
      .from(s.schedules)
      .innerJoin(s.medications, eq(s.medications.id, s.schedules.medicationId))
      .where(eq(s.medications.userId, userId))
      .all()
      .map(({ schedule }) => schedule),
    settings: db
      .select()
      .from(s.settings)
      .where(eq(s.settings.userId, userId))
      .get()!.value,
  };
}
export type AccountData = ReturnType<typeof accountData>;

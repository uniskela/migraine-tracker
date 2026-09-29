import { randomUUID } from "node:crypto";
import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { DateTime } from "luxon";
import * as s from "./schema.js";
import type { Config } from "./config.js";
import type { Store } from "./database.js";
import { accountData, listEpisodes, saveEpisode } from "./repository.js";
import {
  dailySchema,
  doseSchema,
  effectSchema,
  episodeSchema,
  medicationSchema,
  periodSchema,
  settingsSchema,
  weightSchema,
} from "../shared/validation.js";
import {
  comparison,
  episodeDays,
  frequencies,
  inPeriod,
  previousPeriod,
  summary,
} from "../shared/stats.js";
import {
  episodeCsv,
  exportZip,
  pdfReport,
  portableExport,
  reportData,
} from "./reports.js";
export function apiRoutes(store: Store, config: Config) {
  const router = Router();
  const { db } = store;
  router.get("/data", (_req, res) =>
    res.json(accountData(store, res.locals.userId)),
  );
  router.post("/episodes", (req, res) => {
    const input = episodeSchema.parse(req.body);
    if (
      !input.endedAt &&
      listEpisodes(store, res.locals.userId).some((e) => !e.endedAt)
    ) {
      res
        .status(409)
        .json({
          error:
            "A migraine is already active. Update or end that episode first.",
        });
      return;
    }
    res.status(201).json(saveEpisode(store, res.locals.userId, input));
  });
  router.put("/episodes/:id", (req, res) => {
    const existing = listEpisodes(store, res.locals.userId).find(
      (e) => e.id === req.params.id,
    );
    if (!existing) {
      res.sendStatus(404);
      return;
    }
    const input = episodeSchema.parse(req.body);
    if (
      !input.endedAt &&
      listEpisodes(store, res.locals.userId).some(
        (e) => e.id !== existing.id && !e.endedAt,
      )
    ) {
      res.status(409).json({ error: "Another migraine is already active." });
      return;
    }
    res.json(saveEpisode(store, res.locals.userId, input, existing.id));
  });
  router.post("/episodes/:id/end", (req, res) => {
    const existing = listEpisodes(store, res.locals.userId).find(
      (e) => e.id === req.params.id,
    );
    if (!existing) {
      res.sendStatus(404);
      return;
    }
    if (existing.endedAt) {
      res.json(existing);
      return;
    }
    const input = episodeSchema.parse({
      ...existing,
      endedAt: new Date().toISOString(),
    });
    res.json(saveEpisode(store, res.locals.userId, input, existing.id));
  });
  router.delete("/episodes/:id", (req, res) => {
    const result = db
      .delete(s.episodes)
      .where(
        and(
          eq(s.episodes.id, String(req.params.id)),
          eq(s.episodes.userId, res.locals.userId),
        ),
      )
      .run();
    res.status(result.changes ? 200 : 404).json({ ok: !!result.changes });
  });
  router.post("/medications", (req, res) => {
    const input = medicationSchema.parse(req.body);
    const id = randomUUID();
    db.transaction((tx) => {
      tx.insert(s.medications)
        .values({ ...input, id, userId: res.locals.userId })
        .run();
      tx.insert(s.schedules)
        .values({
          id: randomUUID(),
          medicationId: id,
          dose: input.dose,
          units: input.units,
          frequency: input.frequency,
          startDate: input.startDate,
          endDate: input.endDate,
        })
        .run();
    });
    res.status(201).json({ ...input, id });
  });
  router.put("/medications/:id", (req, res) => {
    const input = medicationSchema.parse(req.body),
      id = String(req.params.id);
    const med = db
      .select()
      .from(s.medications)
      .where(
        and(
          eq(s.medications.id, id),
          eq(s.medications.userId, res.locals.userId),
        ),
      )
      .get();
    if (!med) {
      res.sendStatus(404);
      return;
    }
    db.transaction((tx) => {
      tx.update(s.medications).set(input).where(eq(s.medications.id, id)).run();
      if (
        ["dose", "units", "frequency", "startDate", "endDate"].some(
          (k) => med[k as keyof typeof med] !== input[k as keyof typeof input],
        )
      )
        tx.insert(s.schedules)
          .values({
            id: randomUUID(),
            medicationId: id,
            dose: input.dose,
            units: input.units,
            frequency: input.frequency,
            startDate: input.startDate,
            endDate: input.endDate,
          })
          .run();
    });
    res.json({ ...input, id });
  });
  router.post("/doses", (req, res) => {
    const input = doseSchema.parse(req.body);
    const med = db
      .select()
      .from(s.medications)
      .where(
        and(
          eq(s.medications.id, input.medicationId),
          eq(s.medications.userId, res.locals.userId),
        ),
      )
      .get();
    const episode = input.episodeId
      ? db
          .select()
          .from(s.episodes)
          .where(
            and(
              eq(s.episodes.id, input.episodeId),
              eq(s.episodes.userId, res.locals.userId),
            ),
          )
          .get()
      : null;
    if (!med || (input.episodeId && !episode)) {
      res.status(404).json({ error: "Medication or episode not found." });
      return;
    }
    const id = randomUUID();
    db.insert(s.doses)
      .values({ ...input, id, userId: res.locals.userId })
      .run();
    res.status(201).json({ ...input, id });
  });
  router.patch("/doses/:id", (req, res) => {
    const input = z
      .object({
        effectiveness: z.enum(["None", "Some", "Good", "Complete"]).nullable(),
        notes: z.string().max(5000).optional(),
      })
      .parse(req.body);
    const result = db
      .update(s.doses)
      .set(input)
      .where(
        and(
          eq(s.doses.id, String(req.params.id)),
          eq(s.doses.userId, res.locals.userId),
        ),
      )
      .run();
    res.status(result.changes ? 200 : 404).json({ ok: !!result.changes });
  });
  router.delete("/doses/:id", (req, res) => {
    const result = db
      .delete(s.doses)
      .where(
        and(
          eq(s.doses.id, String(req.params.id)),
          eq(s.doses.userId, res.locals.userId),
        ),
      )
      .run();
    res.status(result.changes ? 200 : 404).json({ ok: !!result.changes });
  });
  router.post("/effects", (req, res) => {
    const input = effectSchema.parse(req.body);
    if (
      !db
        .select()
        .from(s.medications)
        .where(
          and(
            eq(s.medications.id, input.medicationId),
            eq(s.medications.userId, res.locals.userId),
            eq(s.medications.category, "preventive"),
          ),
        )
        .get()
    ) {
      res.status(404).json({ error: "Preventive medication not found." });
      return;
    }
    const id = randomUUID();
    db.insert(s.effects)
      .values({ ...input, id, userId: res.locals.userId })
      .run();
    res.status(201).json({ ...input, id });
  });
  router.delete("/effects/:id", (req, res) => {
    const result = db
      .delete(s.effects)
      .where(
        and(
          eq(s.effects.id, String(req.params.id)),
          eq(s.effects.userId, res.locals.userId),
        ),
      )
      .run();
    res.status(result.changes ? 200 : 404).json({ ok: !!result.changes });
  });
  router.post("/weights", (req, res) => {
    const input = weightSchema.parse(req.body),
      id = randomUUID();
    db.insert(s.weights)
      .values({ ...input, id, userId: res.locals.userId })
      .run();
    res.status(201).json({ ...input, id });
  });
  router.delete("/weights/:id", (req, res) => {
    const result = db
      .delete(s.weights)
      .where(
        and(
          eq(s.weights.id, String(req.params.id)),
          eq(s.weights.userId, res.locals.userId),
        ),
      )
      .run();
    res.status(result.changes ? 200 : 404).json({ ok: !!result.changes });
  });
  router.put("/daily", (req, res) => {
    const input = dailySchema.parse(req.body);
    const { sleep, ...values } = input;
    const userId = res.locals.userId;
    db.transaction((tx) => {
      tx.insert(s.daily)
        .values({ ...values, userId, id: randomUUID() })
        .onConflictDoUpdate({
          target: [s.daily.userId, s.daily.date],
          set: values,
        })
        .run();
      tx.delete(s.sleep)
        .where(and(eq(s.sleep.userId, userId), eq(s.sleep.day, input.date)))
        .run();
      if (sleep)
        tx.insert(s.sleep)
          .values({ ...sleep, userId, id: randomUUID(), day: input.date })
          .run();
    });
    res.json({ ok: true });
  });
  router.put("/settings", (req, res) => {
    const input = settingsSchema.parse(req.body);
    db.update(s.settings)
      .set({ value: input })
      .where(eq(s.settings.userId, res.locals.userId))
      .run();
    res.json(input);
  });
  router.get("/backup-status", (_req, res) => {
    const latest = db
      .select()
      .from(s.backups)
      .orderBy(desc(s.backups.completedAt))
      .get();
    res.json({ lastSuccessful: latest?.completedAt || null });
  });
  router.get("/trends", (req, res) => {
    const period = periodSchema.parse(req.query);
    const data = accountData(store, res.locals.userId);
    const zone = data.settings.timezone;
    const selected = data.episodes.filter((e) => inPeriod(e, period, zone));
    const migraineDays = new Set(
      data.episodes.flatMap((e) => episodeDays(e, zone, period)),
    );
    const recorded = data.daily.filter(
      (d) => d.date >= period.from && d.date <= period.to,
    );
    const migraineContext = recorded.filter((d) => migraineDays.has(d.date));
    const nonMigraineContext = recorded.filter(
      (d) => !migraineDays.has(d.date),
    );
    const names = new Set(recorded.flatMap((d) => d.factors));
    res.json({
      current: summary(
        data.episodes,
        data.doses,
        data.medications,
        period,
        zone,
      ),
      previous: summary(
        data.episodes,
        data.doses,
        data.medications,
        previousPeriod(period),
        zone,
      ),
      symptoms: frequencies(selected, "symptoms"),
      factors: frequencies(selected, "factors"),
      context: {
        migraineDays: migraineContext.length,
        nonMigraineDays: nonMigraineContext.length,
        sufficient:
          migraineContext.length >= 7 && nonMigraineContext.length >= 7,
        factors: [...names].map((name) => ({
          name,
          migrainePercentage: migraineContext.length
            ? (migraineContext.filter((d) => d.factors.includes(name)).length /
                migraineContext.length) *
              100
            : null,
          nonMigrainePercentage: nonMigraineContext.length
            ? (nonMigraineContext.filter((d) => d.factors.includes(name))
                .length /
                nonMigraineContext.length) *
              100
            : null,
        })),
      },
    });
  });
  router.get("/comparison", (req, res) => {
    const before = periodSchema.parse({
      from: req.query.beforeFrom,
      to: req.query.beforeTo,
    });
    const after = periodSchema.parse({
      from: req.query.afterFrom,
      to: req.query.afterTo,
    });
    const data = accountData(store, res.locals.userId);
    const medication = data.medications.find(
      (m) => m.id === req.query.medicationId && m.category === "preventive",
    );
    if (!medication || !medication.startDate) {
      res
        .status(400)
        .json({ error: "Select a preventive medication with a start date." });
      return;
    }
    const today = DateTime.now().setZone(data.settings.timezone).toISODate()!;
    if (
      before.to >= medication.startDate ||
      after.from < medication.startDate ||
      before.to >= after.from ||
      after.to > today ||
      (medication.endDate && after.to > medication.endDate)
    ) {
      res
        .status(400)
        .json({
          error:
            "Before must end before medication started. After must be during the medication period and end no later than today.",
        });
      return;
    }
    res.json(
      comparison(
        data.episodes,
        data.doses,
        data.medications,
        before,
        after,
        data.settings.timezone,
      ),
    );
  });
  router.get("/export/:format", (req, res) => {
    const data = accountData(store, res.locals.userId);
    if (req.params.format === "json")
      res.attachment("migraine-data.json").json(portableExport(data));
    else if (req.params.format === "csv")
      res
        .type("csv")
        .attachment("migraine-episodes.csv")
        .send(episodeCsv(data));
    else if (req.params.format === "zip") exportZip(data, res);
    else res.sendStatus(404);
  });
  router.post("/report/:format", (req, res) => {
    const input = z
      .object({
        from: z.string(),
        to: z.string(),
        note: z.string().max(5000).default(""),
      })
      .parse(req.body);
    const period = periodSchema.parse(input);
    const data = accountData(store, res.locals.userId);
    if (req.params.format === "pdf")
      pdfReport(data, period, input.note, config.APP_NAME, res);
    else if (req.params.format === "csv")
      res
        .type("csv")
        .attachment("migraine-report.csv")
        .send(episodeCsv(data, period));
    else if (req.params.format === "json")
      res
        .attachment("migraine-report.json")
        .json(reportData(data, period, input.note));
    else res.sendStatus(404);
  });
  return router;
}

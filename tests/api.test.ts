import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/server/app";
import { openDatabase, type Store } from "../src/server/database";
import { readConfig } from "../src/server/config";
import { importData } from "../src/server/import-data";
import { accountData } from "../src/server/repository";
import * as s from "../src/server/schema";
const origin = "http://localhost:3000",
  secret = "integration-secret-32-characters-long";
let dir: string,
  store: Store,
  app: ReturnType<typeof createApp>,
  agent: ReturnType<typeof request.agent>,
  csrf: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "tracker-api-"));
  store = openDatabase(dir);
  app = createApp(
    store,
    readConfig({
      NODE_ENV: "test",
      SETUP_SECRET: secret,
      APP_ORIGIN: origin,
      COOKIE_SECURE: "false",
      DATA_DIR: dir,
    }),
  );
  agent = request.agent(app);
  const res = await agent
    .post("/api/auth/setup")
    .set("Origin", origin)
    .send({
      username: "owner",
      password: "private-test-password",
      setupSecret: secret,
      timezone: "Australia/Sydney",
    });
  expect(res.status).toBe(201);
  csrf = res.body.csrf;
});
afterEach(() => {
  store.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});
const post = (path: string, body: unknown) =>
  agent
    .post(`/api${path}`)
    .set("Origin", origin)
    .set("X-CSRF-Token", csrf)
    .send(body as object);
describe("authentication and security", () => {
  it("closes setup and protects records, CSRF and cross-origin writes", async () => {
    expect((await request(app).get("/api/data")).status).toBe(401);
    expect((await post("/auth/setup", {})).status).toBe(404);
    expect(
      (await agent.post("/api/episodes").set("Origin", origin).send({})).status,
    ).toBe(403);
    expect(
      (
        await agent
          .post("/api/episodes")
          .set("Origin", "https://evil.example")
          .set("X-CSRF-Token", csrf)
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (await agent.post("/api/episodes").set("X-CSRF-Token", csrf).send({}))
        .status,
    ).toBe(403);
    const health = await request(app).get("/api/health");
    expect(health.body).toEqual({ status: "ok", database: "ok" });
    expect(health.headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(health.headers["cache-control"]).toBe("no-store");
  });
  it("logs out, rejects wrong password, signs in with hashed sessions and locks repeated failures", async () => {
    await post("/auth/logout", {});
    expect((await agent.get("/api/data")).status).toBe(401);
    for (let i = 0; i < 5; i++)
      expect(
        (
          await agent
            .post("/api/auth/login")
            .set("Origin", origin)
            .send({ username: "owner", password: "wrong" })
        ).status,
      ).toBe(401);
    expect(
      (
        await agent
          .post("/api/auth/login")
          .set("Origin", origin)
          .send({ username: "owner", password: "private-test-password" })
      ).status,
    ).toBe(429);
    store.db.delete(s.loginAttempts).run();
    const res = await agent
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ username: "owner", password: "private-test-password" });
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(res.headers["set-cookie"][0]).toContain("SameSite=Lax");
    expect(store.db.select().from(s.users).get()?.passwordHash).toMatch(
      /^\$argon2id\$/,
    );
    const token = res.headers["set-cookie"][0].split(";")[0].split("=")[1];
    expect(store.db.select().from(s.sessions).get()?.tokenHash).not.toBe(token);
  });
  it("rejects resource access to another owner", async () => {
    const other = randomUUID();
    store.db
      .insert(s.users)
      .values({
        id: other,
        username: "second",
        createdAt: new Date().toISOString(),
      })
      .run();
    const id = randomUUID();
    store.db
      .insert(s.medications)
      .values({
        id,
        userId: other,
        name: "Other",
        category: "acute",
        units: "mg",
        frequency: "",
        active: true,
        notes: "",
      })
      .run();
    expect(
      (
        await post("/doses", {
          medicationId: id,
          dose: 1,
          units: "mg",
          takenAt: new Date().toISOString(),
        })
      ).status,
    ).toBe(404);
    expect((await agent.get("/api/data")).body.medications).toEqual([]);
  });
});
describe("journal workflows", () => {
  it("starts, updates and ends an episode; records medication; exports reports and trends", async () => {
    const created = await post("/episodes", {
      startedAt: "2026-09-20T03:00:00Z",
    });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect(
      (await post("/episodes", { startedAt: "2026-09-20T04:00:00Z" })).status,
    ).toBe(409);
    const updated = await agent
      .put(`/api/episodes/${id}`)
      .set("Origin", origin)
      .set("X-CSRF-Token", csrf)
      .send({
        ...created.body,
        severity: 6,
        symptoms: ["Nausea", "Light sensitivity"],
        factors: ["Poor sleep"],
        impact: 3,
        sleep: { hours: 5, quality: 2 },
      });
    expect(updated.status).toBe(200);
    expect(updated.body.symptoms).toContain("Nausea");
    const med = await post("/medications", {
      name: "Example acute",
      category: "acute",
    });
    expect(med.status).toBe(201);
    const dose = await post("/doses", {
      medicationId: med.body.id,
      episodeId: id,
      dose: 1,
      units: "tablet",
      takenAt: "2026-09-20T03:30:00Z",
    });
    expect(dose.status).toBe(201);
    expect(
      (
        await agent
          .patch(`/api/doses/${dose.body.id}`)
          .set("Origin", origin)
          .set("X-CSRF-Token", csrf)
          .send({ effectiveness: "Good" })
      ).status,
    ).toBe(200);
    const end = await post(`/episodes/${id}/end`, {});
    expect(end.status).toBe(200);
    expect(end.body.endedAt).toBeTruthy();
    expect((await post(`/episodes/${id}/end`, {})).body.endedAt).toBe(
      end.body.endedAt,
    );
    const trend = await agent.get("/api/trends?from=2026-09-01&to=2026-09-28");
    expect(trend.body.current.episodes).toBe(1);
    expect(trend.body.current.averageSeverity).toBe(6);
    expect(trend.body.current.acuteDoses).toBe(1);
    expect(trend.body.context.sufficient).toBe(false);
    const json = await agent.get("/api/export/json");
    expect(json.body.format).toBe("migraine-tracker");
    expect(json.body.episodes).toHaveLength(1);
    expect(JSON.stringify(json.body)).not.toContain("passwordHash");
    expect(JSON.stringify(json.body)).not.toContain("tokenHash");
    const csv = await agent.get("/api/export/csv");
    expect(csv.text).toContain("Light sensitivity");
    const zip = await agent.get("/api/export/zip");
    expect(zip.status).toBe(200);
    expect(zip.headers["content-type"]).toMatch(/zip/);
    const pdf = await post("/report/pdf", {
      from: "2026-09-01",
      to: "2026-09-28",
      note: "Discuss impact",
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toMatch(/pdf/);
    expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
    const report = await post("/report/json", {
      from: "2026-09-01",
      to: "2026-09-28",
      note: "Discuss impact",
    });
    expect(report.body.note).toBe("Discuss impact");
  });
  it("records side effects, sleep, check-ins, settings and weight", async () => {
    const m = await post("/medications", {
      name: "Example preventive",
      category: "preventive",
      startDate: "2026-08-01",
      dose: 0.5,
    });
    expect(
      (
        await post("/effects", {
          medicationId: m.body.id,
          name: "Morning grogginess",
          severity: 2,
          date: "2026-09-20",
        })
      ).status,
    ).toBe(201);
    expect(
      (await post("/weights", { date: "2026-09-20", value: 70, units: "kg" }))
        .status,
    ).toBe(201);
    expect(
      (
        await agent
          .put("/api/daily")
          .set("Origin", origin)
          .set("X-CSRF-Token", csrf)
          .send({
            date: "2026-09-20",
            factors: ["Stress"],
            sleep: { hours: 7, quality: 4 },
          })
      ).status,
    ).toBe(200);
    const data = (await agent.get("/api/data")).body;
    expect(data.daily[0].sleep.hours).toBe(7);
    expect(data.effects).toHaveLength(1);
    expect(data.weights).toHaveLength(1);
    const comp = await agent.get(
      `/api/comparison?medicationId=${m.body.id}&beforeFrom=2026-07-01&beforeTo=2026-07-31&afterFrom=2026-08-01&afterTo=2026-08-31`,
    );
    expect(comp.status).toBe(200);
    expect(comp.body.before.periodDays).toBe(31);
    expect(
      (
        await agent.get(
          `/api/comparison?medicationId=${m.body.id}&beforeFrom=2026-08-01&beforeTo=2026-08-31&afterFrom=2026-08-01&afterTo=2026-08-31`,
        )
      ).status,
    ).toBe(400);
  });
  it("round-trips a portable JSON export into an empty account and refuses overwrite", async () => {
    await post("/episodes", {
      startedAt: "2026-09-20T03:00:00Z",
      endedAt: "2026-09-20T04:00:00Z",
      notes: "Portable fixture",
    });
    const exported = (await agent.get("/api/export/json")).body;
    expect(() => importData(store, exported)).toThrow("empty journal");
    const target = mkdtempSync(join(tmpdir(), "tracker-import-"));
    const destination = openDatabase(target);
    try {
      const id = randomUUID();
      destination.db
        .insert(s.users)
        .values({
          id,
          username: "newowner",
          createdAt: new Date().toISOString(),
        })
        .run();
      destination.db
        .insert(s.settings)
        .values({ userId: id, value: exported.settings })
        .run();
      importData(destination, exported);
      expect(accountData(destination, id).episodes[0].notes).toBe(
        "Portable fixture",
      );
    } finally {
      destination.sqlite.close();
      rmSync(target, { recursive: true, force: true });
    }
  });
});
